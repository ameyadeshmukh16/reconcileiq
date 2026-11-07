"""Agent tests with a scripted fake LLM: guardrails and provider-fallback rules, no network."""
import json
from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError, AuthenticationError, InternalServerError

from app import cases, pipeline
from app.agent import investigator, llm


@pytest.fixture()
def conn(tmp_path):
    c = pipeline.bootstrap(str(tmp_path / "a.db"))
    pipeline.run_pipeline(c)
    yield c
    c.close()


def call(name, **args):
    return SimpleNamespace(id=f"c_{name}", function=SimpleNamespace(name=name, arguments=json.dumps(args)))


def msg(*calls):
    return SimpleNamespace(content=None, tool_calls=list(calls))


def script(monkeypatch, replies, provider="vultr", model="fake-model"):
    it = iter(replies)
    monkeypatch.setattr(llm, "chat", lambda messages, tools, order=(): (next(it), provider, model))


def finding(**over):
    base = dict(recommendation="approve", confidence="high", recommendation_rationale="r",
                verified_facts=["Invoice amount is 21600.00"], interpretation="i", suggested_action="a",
                evidence_refs=[{"source": "invoice", "field": "amount"}])
    base.update(over)
    return call("submit_finding", **base)


def steps(number, po, numeric=False):
    """The retrieval steps the backend requires before it accepts a finding."""
    out = [msg(call("get_invoice", invoice_number=number)), msg(call("get_po", po_number=po)),
           msg(call("get_goods_receipt", po_number=po)), msg(call("check_policy", topic="amount"))]
    if numeric:
        out += [msg(call("get_po_approvals", po_number=po)), msg(call("calculate_difference", a=2, b=1))]
    return out


def case_for(conn, number):
    return next(c for c in cases.list_cases(conn) if c.invoice_number == number)


def test_missing_evidence_forces_escalate_low(conn, monkeypatch):
    c = case_for(conn, "INV-33981")
    script(monkeypatch, steps("INV-33981", "PO-77519") + [msg(finding(recommendation="approve", confidence="high"))])
    out = investigator.investigate(conn, c.case_id)
    assert (out.recommendation, out.confidence) == ("escalate", "low")
    assert out.status == "awaiting_review" and out.requires_human_approval is True
    guard = cases.get_timeline(conn, c.case_id)[-1].detail["guardrail_adjustments"]
    assert any("missing evidence" in g for g in guard)


def test_multiple_discrepancies_force_escalate_low(conn, monkeypatch):
    c = case_for(conn, "INV-55102")
    script(monkeypatch, steps("INV-55102", "PO-77620", True)
           + [msg(finding(recommendation="request_vendor_clarification", confidence="medium"))])
    out = investigator.investigate(conn, c.case_id)
    assert (out.recommendation, out.confidence) == ("escalate", "low")


def test_vendor_mismatch_never_rejected(conn, monkeypatch):
    c = case_for(conn, "INV-61208")
    script(monkeypatch, steps("INV-61208", "PO-77340") + [msg(finding(recommendation="reject"))])
    assert investigator.investigate(conn, c.case_id).recommendation == "request_vendor_clarification"


def test_invented_evidence_is_dropped_and_logged(conn, monkeypatch):
    c = case_for(conn, "INV-88204")
    script(monkeypatch, steps("INV-88204", "PO-77194", True)
           + [msg(finding(evidence_refs=[{"source": "invoice", "field": "amount"},
                                         {"source": "goods_receipt", "field": "made_up_field"}]))])
    out = investigator.investigate(conn, c.case_id)
    assert [(e.field, e.value) for e in out.evidence] == [("amount", 10450.0)]   # value comes from the record
    assert cases.get_timeline(conn, c.case_id)[-1].detail["dropped_evidence_refs"] == ["goods_receipt.made_up_field"]


def test_tool_calls_are_audited_with_real_results(conn, monkeypatch):
    c = case_for(conn, "INV-88204")
    script(monkeypatch, steps("INV-88204", "PO-77194", True) + [msg(finding())])
    investigator.investigate(conn, c.case_id)
    ev = next(e for e in cases.get_timeline(conn, c.case_id) if e.detail and e.detail.get("tool") == "get_po")
    assert ev.detail["result"]["amount"] == 10000 and ev.detail["provider"] == "vultr"


def test_no_valid_finding_escalates_instead_of_guessing(conn, monkeypatch):
    c = case_for(conn, "INV-88204")
    plain = SimpleNamespace(content="I think it is fine", tool_calls=None)
    script(monkeypatch, [plain, plain])
    out = investigator.investigate(conn, c.case_id)
    assert (out.status, out.recommendation, out.confidence) == ("awaiting_review", "escalate", "low")


def test_rule_flagged_case_not_investigable(conn):
    dup = next(c for c in cases.list_cases(conn) if c.detection_method == "rule_engine")
    with pytest.raises(cases.TransitionError):
        investigator.investigate(conn, dup.case_id)


# ---------- provider fallback policy ----------

def _prov(monkeypatch, behaviours):
    class FakeClient:
        def __init__(self, name):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=lambda **kw: behaviours[name]()))
    ps = {n: llm.Provider(n, "http://x", "k", f"{n}-model") for n in ("vultr", "openrouter")}
    for p in ps.values():
        monkeypatch.setattr(p, "client", (lambda n=p.name: FakeClient(n)), raising=False)
    monkeypatch.setattr(llm, "providers", lambda: ps)


def _ok(text):
    return lambda: SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text, tool_calls=None))])


REQ = httpx.Request("POST", "http://x")


def test_transient_error_falls_back(monkeypatch):
    def boom():
        raise APIConnectionError(request=REQ)
    _prov(monkeypatch, {"vultr": boom, "openrouter": _ok("hi")})
    m, provider, model = llm.chat([], [])
    assert (provider, model, m.content) == ("openrouter", "openrouter-model", "hi")


def test_5xx_falls_back(monkeypatch):
    def boom():
        raise InternalServerError("x", response=httpx.Response(503, request=REQ), body=None)
    _prov(monkeypatch, {"vultr": boom, "openrouter": _ok("hi")})
    assert llm.chat([], [])[1] == "openrouter"


def test_auth_error_fails_loudly_without_fallback(monkeypatch):
    def bad_key():
        raise AuthenticationError("bad key", response=httpx.Response(401, request=REQ), body=None)
    _prov(monkeypatch, {"vultr": bad_key, "openrouter": _ok("should not be used")})
    with pytest.raises(AuthenticationError):
        llm.chat([], [])


def test_unconfigured_primary_fails_loudly(monkeypatch):
    ps = {"vultr": llm.Provider("vultr", "", "", ""), "openrouter": llm.Provider("openrouter", "u", "k", "m")}
    monkeypatch.setattr(llm, "providers", lambda: ps)
    with pytest.raises(llm.ConfigError):
        llm.chat([], [])


# ---------- evidence integrity and the enforced investigation contract ----------

def test_finding_rejected_until_required_steps_done(conn, monkeypatch):
    c = case_for(conn, "INV-88204")                       # amount_mismatch: needs approvals + calculation too
    script(monkeypatch, [msg(call("get_invoice", invoice_number="INV-88204")), msg(finding())]
           + steps("INV-88204", "PO-77194", True)[1:] + [msg(finding(recommendation="escalate", confidence="medium"))])
    out = investigator.investigate(conn, c.case_id)
    assert out.recommendation == "escalate" and out.confidence == "medium"       # accepted only after the steps
    detail = cases.get_timeline(conn, c.case_id)[-1].detail
    assert detail["rejected_submissions_missing_steps"]                          # first attempt was refused
    assert "get_po" in detail["rejected_submissions_missing_steps"][0]


def test_agent_that_never_completes_the_steps_escalates(conn, monkeypatch):
    c = case_for(conn, "INV-88204")
    script(monkeypatch, [msg(finding())] * 14)
    out = investigator.investigate(conn, c.case_id)
    assert (out.status, out.recommendation, out.confidence) == ("awaiting_review", "escalate", "low")
    assert cases.get_timeline(conn, c.case_id)[-1].detail["rejected_submissions_missing_steps"]


def test_verified_facts_come_from_records_not_model_text(conn, monkeypatch):
    c = case_for(conn, "INV-55102")
    lie = "The vendor has an approved amendment for 999999.00 signed by the CFO"
    script(monkeypatch, steps("INV-55102", "PO-77620", True) + [msg(finding(verified_facts=[lie]))])
    out = investigator.investigate(conn, c.case_id)
    assert lie not in out.finding and all(lie not in f for f in out.finding_facts)    # model text never shown as verified
    facts = " ".join(out.finding_facts)
    assert "No approved amendment is on file for PO PO-77620" in facts
    assert "1,600.00" in facts and "8.0%" in facts                                      # backend-computed difference
    assert "special bulk tier" in facts and "not an approval" in facts                 # note shown, labelled as non-approval
    assert cases.get_timeline(conn, c.case_id)[-1].detail["model_scratch_observations"] == [lie]


def test_po_approvals_tool_reports_absence_and_presence(conn):
    from app.agent import data_access as da
    assert da.get_po_approvals(conn, "PO-77620") == {"found": False, "po_number": "PO-77620"}
    conn.execute("INSERT INTO po_amendments VALUES ('AM-1','PO-77620','buyer.jones','2026-11-01',NULL,21600,'bulk tier')")
    got = da.get_po_approvals(conn, "PO-77620")
    assert got["found"] and got["amendments"][0]["approved_by"] == "buyer.jones"


# ---------- authorization guardrail: explanation is not authorization ----------

def _approve_after_steps(conn, monkeypatch, number, po, numeric=True):
    c = case_for(conn, number)
    script(monkeypatch, steps(number, po, numeric) + [msg(finding(recommendation="approve", confidence="high"))])
    return c, investigator.investigate(conn, c.case_id)


def test_agent_following_injected_approve_is_overridden(conn, monkeypatch):
    c, out = _approve_after_steps(conn, monkeypatch, "INV-88204", "PO-77194")      # 4.5% over PO, no amendment
    assert (out.recommendation, out.confidence) == ("escalate", "low")
    notes = cases.get_timeline(conn, c.case_id)[-1].detail["guardrail_adjustments"]
    assert any("unauthorized overbilling" in n for n in notes)


def test_amendment_on_another_po_does_not_authorize(conn, monkeypatch):
    conn.execute("INSERT INTO po_amendments VALUES ('AM-X','PO-77620','buyer','2026-11-01',NULL,99999,'other PO')")
    _, out = _approve_after_steps(conn, monkeypatch, "INV-88204", "PO-77194")
    assert out.recommendation == "escalate"
    assert "No approved amendment is on file for PO PO-77194" in " ".join(out.finding_facts)


def test_amendment_that_is_too_small_does_not_authorize(conn, monkeypatch):
    conn.execute("INSERT INTO po_amendments VALUES ('AM-S','PO-77194','buyer','2026-11-01',NULL,10200,'partial')")
    _, out = _approve_after_steps(conn, monkeypatch, "INV-88204", "PO-77194")
    assert out.recommendation == "escalate"
    assert "does NOT cover the invoice amount" in " ".join(out.finding_facts)


def test_covering_amendment_lets_approve_stand(conn, monkeypatch):
    conn.execute("INSERT INTO po_amendments VALUES ('AM-OK','PO-77194','buyer.jones','2026-11-01',250,10450,'approved increase')")
    c, out = _approve_after_steps(conn, monkeypatch, "INV-88204", "PO-77194")
    assert (out.recommendation, out.confidence) == ("approve", "high")
    assert "covers the invoice amount" in " ".join(out.finding_facts)
    assert not cases.get_timeline(conn, c.case_id)[-1].detail["guardrail_adjustments"]


def test_no_amendment_can_justify_billing_unreceived_goods(conn, monkeypatch):
    conn.execute("INSERT INTO po_amendments VALUES ('AM-Q','PO-77488','buyer','2026-11-01',500,38500,'qty')")
    _, out = _approve_after_steps(conn, monkeypatch, "INV-72901", "PO-77488")        # billed 500, received 460
    assert out.recommendation == "escalate"


# ---------- retrieval is bound to the case ----------

def test_requests_for_other_invoices_or_pos_are_refused(conn, monkeypatch):
    c = case_for(conn, "INV-88204")
    foreign = [msg(call("get_invoice", invoice_number="INV-55102")), msg(call("get_po", po_number="PO-77620")),
               msg(call("get_goods_receipt", po_number="PO-77620")), msg(call("get_po_approvals", po_number="PO-77620"))]
    script(monkeypatch, foreign + steps("INV-88204", "PO-77194", True) + [msg(finding(recommendation="escalate"))])
    out = investigator.investigate(conn, c.case_id)
    facts = " ".join(out.finding_facts)
    assert "INV-55102" not in facts and "PO-77620" not in facts and "special bulk tier" not in facts
    detail = cases.get_timeline(conn, c.case_id)[-1].detail
    assert len(detail["out_of_scope_requests"]) == 4
    assert out.recommendation == "escalate"


def test_calculator_operands_do_not_change_backend_facts(conn, monkeypatch):
    c = case_for(conn, "INV-88204")
    script(monkeypatch, [msg(call("calculate_difference", a=1, b=1))] + steps("INV-88204", "PO-77194", True)
           + [msg(finding(recommendation="escalate"))])
    out = investigator.investigate(conn, c.case_id)
    assert "450.00 (4.5%) above the PO amount" in " ".join(out.finding_facts)
