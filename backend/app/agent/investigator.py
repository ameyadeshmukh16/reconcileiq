"""Tool-calling investigation agent.

The model retrieves records through tools and submits a structured finding via `submit_finding`.
Guardrails are enforced HERE in code, not only in the prompt:
  * evidence values AND the "verified facts" are built by the backend from retrieved records and
    deterministic calculations; the model's own prose is interpretation only
  * submit_finding is rejected until the required retrieval/calculation steps have run (see _required_steps)
  * requires_human_approval is always True; the case always ends in `awaiting_review`
  * missing evidence forces escalate + low confidence; vendor mismatches are never 'reject'
  * provider fallback only on transient errors (see llm.py)
"""
import json
import re

from pydantic import BaseModel, ValidationError

from .. import cases
from . import data_access as da
from . import llm

MAX_STEPS = 14

SYSTEM_PROMPT = """You are an accounts-payable exception investigator. A deterministic rule engine flagged an invoice. \
Investigate it using the tools, then call submit_finding exactly once.

Hard rules:
- Retrieve the invoice, its purchase order and its goods receipt with the tools before concluding. Call check_policy for the relevant topic. For an amount or quantity discrepancy also call calculate_difference and get_po_approvals (a goods-receipt note can explain a difference but never authorizes it; only an approved PO amendment does). submit_finding is rejected until these steps are done.
- Use calculate_difference for ANY arithmetic you cite. Never calculate financial values yourself and never invent numbers, documents, references or evidence.
- The system builds the verified-facts section itself from the records you retrieve. Your job is the INTERPRETATION: a hedged reading of what the records mean, what remains unknown, and what is missing (for example, no approved amendment on file).
- If evidence is missing (tool returns found=false) or documents contradict each other, recommend 'escalate' with low confidence. Do not guess.
- A vendor-name mismatch is a data-quality question: recommend 'request_vendor_clarification' or 'escalate'. NEVER allege or conclude fraud or impersonation.
- Absence of a record is never evidence of fraud.
- You only RECOMMEND. A human always makes the final decision; you cannot approve, pay or send anything.
- recommendation is one of: approve, request_vendor_clarification, escalate, reject. confidence is low, medium or high (an indicator, not a probability).
- suggested_action is a short drafted follow-up message/instruction for a human to send; it is never sent automatically.
- In evidence_refs name only fields that appeared in tool results (source: invoice|purchase_order|goods_receipt, field = exact key)."""

TOOLS = [
    {"type": "function", "function": {
        "name": "get_invoice", "description": "Look up invoice record(s) by invoice number. Returns every invoice with that number.",
        "parameters": {"type": "object", "properties": {"invoice_number": {"type": "string"}}, "required": ["invoice_number"]}}},
    {"type": "function", "function": {
        "name": "get_po", "description": "Look up a purchase order by PO number.",
        "parameters": {"type": "object", "properties": {"po_number": {"type": "string"}}, "required": ["po_number"]}}},
    {"type": "function", "function": {
        "name": "get_goods_receipt", "description": "Look up goods receipt(s) for a PO number. found=false means no receipt on file.",
        "parameters": {"type": "object", "properties": {"po_number": {"type": "string"}}, "required": ["po_number"]}}},
    {"type": "function", "function": {
        "name": "get_po_approvals", "description": "Approved amendments to a PO (the only evidence of commercial authorization for a price or quantity above the PO). found=false means none on file.",
        "parameters": {"type": "object", "properties": {"po_number": {"type": "string"}}, "required": ["po_number"]}}},
    {"type": "function", "function": {
        "name": "check_policy", "description": "Get the tolerance policy for a topic.",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string", "enum": sorted(da.POLICIES)}}, "required": ["topic"]}}},
    {"type": "function", "function": {
        "name": "calculate_difference", "description": "Authoritative arithmetic: a - b and the difference as a percent of b.",
        "parameters": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]}}},
    {"type": "function", "function": {
        "name": "submit_finding", "description": "Submit the final structured finding. Call once, last.",
        "parameters": {"type": "object", "properties": {
            "recommendation": {"type": "string", "enum": ["approve", "request_vendor_clarification", "escalate", "reject"]},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "recommendation_rationale": {"type": "string", "description": "One sentence specific to this case."},
            "verified_facts": {"type": "array", "items": {"type": "string"}, "description": "Optional scratch observations. NOT displayed as verified; the system builds the verified facts itself."},
            "interpretation": {"type": "string", "description": "One or two hedged sentences."},
            "suggested_action": {"type": "string"},
            "evidence_refs": {"type": "array", "items": {"type": "object", "properties": {
                "source": {"type": "string", "enum": ["invoice", "purchase_order", "goods_receipt"]},
                "field": {"type": "string"}}, "required": ["source", "field"]}}},
            "required": ["recommendation", "confidence", "recommendation_rationale",
                         "interpretation", "suggested_action", "evidence_refs"]}}},
]


class Ref(BaseModel):
    source: str
    field: str


class Finding(BaseModel):
    recommendation: str
    confidence: str
    recommendation_rationale: str
    verified_facts: list[str] = []          # model scratch notes; never shown as verified
    interpretation: str
    suggested_action: str
    evidence_refs: list[Ref] = []


def _run_tool(conn, name: str, args: dict) -> dict:
    try:
        if name == "get_invoice":
            return da.get_invoice(conn, str(args["invoice_number"]))
        if name == "get_po":
            return da.get_po(conn, str(args["po_number"]))
        if name == "get_goods_receipt":
            return da.get_goods_receipt(conn, str(args["po_number"]))
        if name == "get_po_approvals":
            return da.get_po_approvals(conn, str(args["po_number"]))
        if name == "check_policy":
            return da.check_policy(str(args["topic"]))
        if name == "calculate_difference":
            return da.calculate_difference(float(args["a"]), float(args["b"]))
        return {"error": f"unknown tool '{name}'"}
    except (KeyError, TypeError, ValueError) as exc:
        return {"error": f"bad arguments: {exc!r}"}


def _fmt_args(args: dict) -> str:
    return ", ".join(f"{k}={v!r}" for k, v in args.items())


def _collect_evidence(retrieved: dict) -> dict[tuple[str, str], object]:
    """(source, field) -> value, drawn ONLY from tool results actually returned."""
    out: dict[tuple[str, str], object] = {}
    for tool, source, key in (("get_invoice", "invoice", "invoices"), ("get_goods_receipt", "goods_receipt", "receipts")):
        res = retrieved.get(tool)
        if res and res.get("found"):
            rows = res[key]
            for k, v in rows[-1].items():                  # latest invoice / receipt
                out[(source, k)] = v
            if tool == "get_goods_receipt":
                out[(source, "total_quantity_received")] = res["total_quantity_received"]
    po = retrieved.get("get_po")
    if po and po.get("found"):
        out.update({("purchase_order", k): v for k, v in po.items() if k != "found"})
    return out


def _required_steps(anomaly_type: str, retrieved: dict) -> set[str]:
    """Backend-enforced investigation contract: tools that must have run before a finding is accepted."""
    req = {"get_invoice", "check_policy"}
    inv = retrieved.get("get_invoice")
    if inv is None:
        return req | {"get_po", "get_goods_receipt"}      # PO number unknown until the invoice is read
    if inv.get("found") and any(r.get("po_number") for r in inv["invoices"]):
        req |= {"get_po", "get_goods_receipt"}
        if anomaly_type in ("amount_mismatch", "quantity_mismatch"):
            req |= {"get_po_approvals", "calculate_difference"}
    return req


def _fmt(n) -> str:
    return f"{n:,.2f}" if isinstance(n, (int, float)) else str(n)


def build_facts(retrieved: dict) -> list[str]:
    """Verified facts: derived ONLY from retrieved records and deterministic calculations, never from model text."""
    facts: list[str] = []
    inv = retrieved.get("get_invoice") or {}
    invoices = inv.get("invoices", []) if inv.get("found") else []
    for r in invoices:
        facts.append(f"Invoice {r['invoice_number']} ({r['invoice_id']}): vendor '{r['vendor_name']}' ({r['vendor_id']}), "
                     f"PO {r['po_number']}, dated {r['invoice_date']}, quantity {_fmt(r['quantity'])}, amount {_fmt(r['amount'])}.")
    if not invoices:
        facts.append("No invoice record was retrieved.")
    po = retrieved.get("get_po")
    if po is not None:
        if po.get("found"):
            facts.append(f"Purchase order {po['po_number']}: vendor '{po['vendor_name']}' ({po['vendor_id']}), "
                         f"dated {po['po_date']}, quantity {_fmt(po['quantity'])}, amount {_fmt(po['amount'])}.")
        else:
            facts.append(f"No purchase order {po['po_number']} is on file.")
    grn = retrieved.get("get_goods_receipt")
    if grn is not None:
        if grn.get("found"):
            for g in grn["receipts"]:
                note = f" Receiving note (text, not an approval): '{g['notes']}'." if g.get("notes") else ""
                facts.append(f"Goods receipt {g['grn_number']} on {g['receipt_date']}: {_fmt(g['quantity_received'])} units received.{note}")
            if len(grn["receipts"]) > 1:
                facts.append(f"Total received across {len(grn['receipts'])} receipts: {_fmt(grn['total_quantity_received'])} units.")
        else:
            facts.append(f"No goods receipt is on file for PO {grn['po_number']}.")
    # deterministic comparisons computed by the backend
    if invoices and po and po.get("found"):
        d = da.calculate_difference(invoices[-1]["amount"], po["amount"])
        if d["difference"]:
            word = "above" if d["difference"] > 0 else "below"
            facts.append(f"Invoice amount is {_fmt(abs(d['difference']))} ({d['percent_of_b']}%) {word} the PO amount; "
                         f"amount tolerance is {da.POLICIES['amount']['tolerance_pct']}%.")
    if invoices and grn and grn.get("found"):
        d = da.calculate_difference(invoices[-1]["quantity"], grn["total_quantity_received"])
        if d["difference"]:
            word = "more" if d["difference"] > 0 else "fewer"
            facts.append(f"Invoice bills {_fmt(abs(d['difference']))} {word} units than were received "
                         f"(quantity tolerance is {da.POLICIES['quantity']['tolerance_units']} units).")
    ap = retrieved.get("get_po_approvals")
    if ap is not None:
        if ap.get("found"):
            for a in ap["amendments"]:
                facts.append(f"PO amendment {a['amendment_id']} approved by {a['approved_by']} on {a['approved_on']}.")
        else:
            facts.append(f"No approved amendment is on file for PO {ap['po_number']}.")
    return facts


_NUM = re.compile(r"\d[\d,]*\.?\d*")


def _unverified_numbers(facts: list[str], tool_results: list[dict]) -> list[str]:
    """Numbers in the model's facts that never appeared in any tool result (informational guard)."""
    seen: set[float] = set()

    def walk(x):
        if isinstance(x, bool):
            return
        if isinstance(x, (int, float)):
            seen.add(round(abs(float(x)), 2))
        elif isinstance(x, str):
            seen.update(round(float(m.replace(",", "").rstrip(".")), 2) for m in _NUM.findall(x)
                        if m.replace(",", "").rstrip(".").replace(".", "", 1).isdigit())
        elif isinstance(x, dict):
            [walk(v) for v in x.values()]
        elif isinstance(x, list):
            [walk(v) for v in x]

    walk(tool_results)
    bad = []
    for f in facts:
        for m in _NUM.findall(f):
            s = m.replace(",", "").rstrip(".")
            if s.replace(".", "", 1).isdigit() and round(float(s), 2) not in seen:
                bad.append(m)
    return sorted(set(bad))


def _apply_guardrails(f: Finding, anomaly_type: str, evidence_missing: bool,
                      contradictory: bool = False) -> tuple[Finding, list[str]]:
    notes = []
    if f.recommendation not in ("approve", "request_vendor_clarification", "escalate", "reject"):
        f.recommendation = "escalate"; notes.append("invalid recommendation -> escalate")
    if f.confidence not in ("low", "medium", "high"):
        f.confidence = "low"; notes.append("invalid confidence -> low")
    if anomaly_type == "missing_evidence" or evidence_missing:
        if f.recommendation != "escalate" or f.confidence != "low":
            notes.append("missing evidence: forced escalate/low")
        f.recommendation, f.confidence = "escalate", "low"
    if contradictory and (f.recommendation != "escalate" or f.confidence != "low"):
        f.recommendation, f.confidence = "escalate", "low"
        notes.append("contradictory evidence (amount and quantity both mismatch): forced escalate/low")
    if anomaly_type == "vendor_name_mismatch" and f.recommendation in ("reject", "approve"):
        f.recommendation = "request_vendor_clarification"
        notes.append("vendor mismatch: never auto-resolved -> request_vendor_clarification")
    return f, notes


def investigate(conn, case_id: str, order: tuple[str, ...] = ("vultr", "openrouter")) -> cases.Case:
    case = cases.get_case(conn, case_id)
    if case.status == "received":
        cases.transition(conn, case_id, "investigating", "agent", "Agent investigation started")
    elif case.status != "investigating":
        raise cases.TransitionError(f"Case is '{case.status}', not investigable")

    rule_notes = [e.summary for e in cases.get_timeline(conn, case_id) if e.type == "rule_check"]
    messages = [{"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content":
                    f"Invoice {case.invoice_number} was flagged as '{case.anomaly_type}' by the rule engine.\n"
                    f"Rule findings: {'; '.join(rule_notes) or 'none recorded'}\n"
                    "Investigate and submit your finding."}]
    retrieved: dict[str, dict] = {}
    called: set[str] = set()
    rejected: list[list[str]] = []
    results: list[dict] = []
    finding, provider, model, nudged = None, "none", None, False

    for _ in range(MAX_STEPS):
        msg, provider, model = llm.chat(messages, TOOLS, order)
        calls = msg.tool_calls or []
        if not calls:
            if nudged:
                break
            nudged = True
            messages += [{"role": "assistant", "content": msg.content or ""},
                         {"role": "user", "content": "Call submit_finding now with your structured finding."}]
            continue
        messages.append({"role": "assistant", "content": msg.content or None, "tool_calls": [
            {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}}
            for c in calls]})
        for c in calls:
            try:
                args = json.loads(c.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            if c.function.name == "submit_finding":
                missing = sorted(_required_steps(case.anomaly_type, retrieved) - called)
                if missing:
                    rejected.append(missing)
                    out = {"error": "finding NOT accepted: required steps not done yet. Call these tools first: "
                                    + ", ".join(missing)}
                else:
                    try:
                        finding = Finding(**args)
                        out = {"accepted": True}
                    except (ValidationError, TypeError) as exc:
                        out = {"error": f"invalid finding: {exc}"}
            else:
                out = _run_tool(conn, c.function.name, args)
                if "error" not in out:
                    called.add(c.function.name)
                    retrieved[c.function.name] = out
                results.append(out)
                with conn:
                    cases.add_event(conn, case_id, "agent", "tool_call",
                                    f"Executed tool: {c.function.name}({_fmt_args(args)})",
                                    {"tool": c.function.name, "arguments": args, "result": out,
                                     "provider": provider, "model": model})
            messages.append({"role": "tool", "tool_call_id": c.id, "content": json.dumps(out)})
        if finding:
            break

    if finding is None:
        cases.transition(
            conn, case_id, "awaiting_review", "agent",
            "Investigation incomplete; escalated for manual review",
            {"reason": "agent produced no valid finding", "provider": provider, "model": model,
             "rejected_submissions_missing_steps": rejected},
            fields={"recommendation": "escalate", "confidence": "low", "investigation_provider": provider,
                    "investigation_model": model,
                    "finding": "Automated investigation did not produce a valid finding; manual review required.",
                    "recommendation_rationale": "Agent did not complete; escalating rather than guessing."})
        return cases.get_case(conn, case_id)

    evidence_pool = _collect_evidence(retrieved)
    evidence, dropped = [], []
    for ref in finding.evidence_refs:
        key = (ref.source, ref.field)
        if key in evidence_pool:
            evidence.append({"source": ref.source, "field": ref.field, "value": evidence_pool[key]})
        else:
            dropped.append(f"{ref.source}.{ref.field}")
    evidence_missing = any(r and not r.get("found", True) for k, r in retrieved.items()
                           if k in ("get_po", "get_goods_receipt", "get_invoice"))
    rule_types = {(e.detail or {}).get("rule") for e in cases.get_timeline(conn, case_id) if e.type == "rule_check"}
    contradictory = {"amount_mismatch", "quantity_mismatch"} <= rule_types
    finding, notes = _apply_guardrails(finding, case.anomaly_type, evidence_missing, contradictory)
    bad_numbers = _unverified_numbers(
        finding.verified_facts + [finding.interpretation, finding.recommendation_rationale], results)
    facts = build_facts(retrieved)

    text = ("Verified facts:\n" + "\n".join(f"- {x}" for x in facts)
            + f"\n\nInterpretation: {finding.interpretation}")
    cases.transition(
        conn, case_id, "awaiting_review", "agent",
        f"Agent recommends '{finding.recommendation}' ({finding.confidence} confidence); awaiting human review",
        {"recommendation": finding.recommendation, "confidence": finding.confidence, "provider": provider,
         "model": model, "dropped_evidence_refs": dropped, "guardrail_adjustments": notes,
         "unverified_numbers": bad_numbers, "model_scratch_observations": finding.verified_facts,
         "rejected_submissions_missing_steps": rejected},
        fields={"recommendation": finding.recommendation, "confidence": finding.confidence,
                "recommendation_rationale": finding.recommendation_rationale, "finding": text,
                "finding_facts": json.dumps(facts), "finding_interpretation": finding.interpretation,
                "suggested_action": finding.suggested_action, "evidence": json.dumps(evidence),
                "investigation_provider": provider, "investigation_model": model,
                "requires_human_approval": 1})
    return cases.get_case(conn, case_id)


def investigate_pending(conn, order: tuple[str, ...] = ("vultr", "openrouter")) -> list[str]:
    """Investigate every case still awaiting the agent. Returns the case ids processed."""
    ids = [r[0] for r in conn.execute(
        "SELECT case_id FROM cases WHERE status IN ('received','investigating') ORDER BY flagged_at")]
    for cid in ids:
        investigate(conn, cid, order)
    return ids
