"""Evaluation harness: rules-only vs agent WITHOUT guardrails vs agent WITH guardrails.

    python -m app.evaluation.run            # needs real provider keys in ../.env (see app/agent/spike.py)

Writes docs/eval-results.md and docs/eval-results.json. Nothing here is hardcoded: every number is
computed from the runs. Single run per mode at temperature 0; small n; labels are the author's judgement.
"""
import json
import os
import re
import statistics
import sys
import tempfile
from pathlib import Path

from ..agent import spike  # noqa: F401,E402  (loads ../.env FIRST so config sees the keys; never prints them)
from .. import cases, db, pipeline, rules
from ..agent import investigator
from .dataset import LABELS, add_holdout

DOCS = Path(__file__).resolve().parents[3] / "docs"


def build_db():
    conn = pipeline.bootstrap(os.path.join(tempfile.mkdtemp(), "eval.db"))
    add_holdout(conn)
    return conn


def _texts(c):
    """(model-authored text, backend-built facts). Scored separately so backend facts never count as model insight."""
    model = " ".join(filter(None, [c.finding_interpretation, c.recommendation_rationale, c.suggested_action])).lower()
    return model, " ".join(c.finding_facts).lower()


def run_rules_only():
    conn = build_db()
    frames = {t: db.read_frame(conn, t) for t in db.DATA_TABLES}
    inv = frames["invoices"].set_index("invoice_id")["invoice_number"].to_dict()
    out = {}
    for r in rules.evaluate(frames["invoices"], frames["purchase_orders"], frames["goods_receipts"], frames["vendors"]):
        n = inv[r.invoice_id]
        if n in LABELS:
            out[n] = dict(flagged=r.classification != "clean", rec=r.recommendation if r.classification != "clean" else None,
                          conf=None, text="", facts=(r.summary + " " + r.suggested_action).lower(), metrics={}, adj=[], rejected=[])
    return out


def run_agent(guardrails: bool, order=("vultr", "openrouter")):
    conn = build_db()
    pipeline.run_pipeline(conn)
    by_inv = {c.invoice_number: c for c in cases.list_cases(conn)}
    out = {}
    for n in LABELS:
        c = by_inv.get(n)
        if c is None:
            out[n] = dict(flagged=False, rec=None, conf=None, text="", facts="", metrics={}, adj=[], rejected=[])
            continue
        if c.status == "received":
            print(f"  [{'guarded' if guardrails else 'unguarded'}] {n} ...", flush=True)
            try:
                investigator.investigate(conn, c.case_id, order=order, guardrails=guardrails)
            except Exception as exc:  # noqa: BLE001  (e.g. free-tier rate limit): record, do not hide
                print(f"    FAILED {n}: {exc!r}"[:200], flush=True)
                out[n] = dict(flagged=True, rec="error", conf=None, text="", facts="", metrics={}, adj=[], rejected=[])
                continue
        c = cases.get_case(conn, c.case_id)
        last = cases.get_timeline(conn, c.case_id)[-1].detail or {}
        mtext, ftext = _texts(c)
        out[n] = dict(flagged=True, rec=c.recommendation, conf=c.confidence, text=mtext, facts=ftext,
                      metrics=last.get("metrics", {}), adj=last.get("guardrail_adjustments") or [],
                      rejected=last.get("rejected_submissions_missing_steps") or [],
                      provider=c.investigation_provider)
    return out


def score(results: dict, subset: str | None):
    rows = {n: r for n, r in results.items() if subset in (None, LABELS[n]["set"])}
    flagged = {n: r for n, r in rows.items() if LABELS[n].get("expect_case", True)}
    clean = {n: r for n, r in rows.items() if not LABELS[n].get("expect_case", True)}
    ok = sum(r["rec"] in LABELS[n]["ok"] for n, r in flagged.items())
    unsafe = [n for n, r in flagged.items() if r["rec"] in LABELS[n]["unsafe"]]
    hc_wrong = [n for n, r in flagged.items() if r["conf"] == "high" and r["rec"] not in LABELS[n]["ok"]]
    ment = {n: r for n, r in flagged.items() if LABELS[n].get("mention")}
    hit = sum(any(re.search(p, r["text"]) for p in LABELS[n]["mention"]) for n, r in ment.items())       # model-authored
    fct = {n: r for n, r in flagged.items() if LABELS[n].get("fact")}
    fhit = sum(any(re.search(p, r["facts"]) for p in LABELS[n]["fact"]) for n, r in fct.items())         # backend-built
    lat = [r["metrics"]["elapsed_s"] for r in flagged.values() if r["metrics"]]
    tok = [r["metrics"]["prompt_tokens"] + r["metrics"]["completion_tokens"] for r in flagged.values() if r["metrics"]]
    return dict(
        n=len(flagged), acceptable=ok, unsafe=unsafe, high_conf_wrong=hc_wrong,
        mention_hit=hit, mention_n=len(ment), fact_hit=fhit, fact_n=len(fct),
        errors=sum(r["rec"] == "error" for r in flagged.values()),
        false_positive_cases=[n for n, r in clean.items() if r["flagged"]], clean_n=len(clean),
        guardrail_interventions=sum(len(r["adj"]) for r in flagged.values()),
        contract_rejections=sum(len(r["rejected"]) for r in flagged.values()),
        median_latency_s=round(statistics.median(lat), 1) if lat else None,
        median_tokens=int(statistics.median(tok)) if tok else None,
        total_tokens=sum(tok) if tok else None)


def render(res: dict, modes: dict, meta: str = "") -> str:
    L = ["# Evaluation results", "", meta, "",
         "Generated by `python -m app.evaluation.run`. Every figure below is computed from the runs; nothing is hardcoded.", "",
         "**Read this honestly.** Small synthetic set, one run per mode at temperature 0, labels written by the project author. "
         "The *dev* cases are the ones the prompts and guardrails were developed against, so they flatter the system; "
         "the *holdout* cases were labelled before any model saw them. 'Acceptable' means a recommendation a careful AP reviewer could "
         "defend; 'unsafe' means a real error (for example approving an unauthorized overcharge). Rules-only escalates every ambiguous "
         "case and rejects exact duplicates, so it scores well on safety by doing no investigation; the interesting columns are the "
         "content-coverage and unsafe/high-confidence-wrong counts.", ""]
    for subset, title in ((None, "All cases"), ("dev", "Dev set"), ("holdout", "Holdout set")):
        L += [f"## {title}", "",
              "| Mode | Flagged cases | Acceptable | Unsafe | High-confidence wrong | Backend facts cover key point | Model text addresses key point | Failed calls | Guardrail overrides | Contract rejections | Median latency (s) | Median tokens |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
        for key, name in modes.items():
            s = score(res[key], subset)
            L.append(f"| {name} | {s['n']} | {s['acceptable']}/{s['n']} | {len(s['unsafe'])} {s['unsafe'] or ''} | "
                     f"{len(s['high_conf_wrong'])} {s['high_conf_wrong'] or ''} | {s['fact_hit']}/{s['fact_n']} | {s['mention_hit']}/{s['mention_n']} | {s['errors']} | "
                     f"{s['guardrail_interventions'] if key == 'guarded' else '-'} | "
                     f"{s['contract_rejections'] if key == 'guarded' else '-'} | {s['median_latency_s'] or '-'} | {s['median_tokens'] or '-'} |")
        fp = {k: score(res[k], subset)["false_positive_cases"] for k in modes}
        L += ["", f"Must-stay-clean invoices wrongly flagged: {fp}", ""]
    L += ["## Per case", "",
          "| Invoice | Set | Scenario | Acceptable | Unsafe | Rules-only | Unguarded | Guarded |", "|---|---|---|---|---|---|---|---|"]
    def cell(r):
        return "clean" if not r["flagged"] else f"{r['rec']}" + (f"/{r['conf']}" if r["conf"] else "")
    for n, lab in LABELS.items():
        L.append(f"| {n} | {lab['set']} | {lab['kind']} | {', '.join(sorted(lab.get('ok', []))) or 'no case'} | "
                 f"{', '.join(sorted(lab.get('unsafe', []))) or '-'} | {cell(res['rules'][n])} | {cell(res['unguarded'][n])} | {cell(res['guarded'][n])} |")
    tot = {k: score(res[k], None)["total_tokens"] for k in ("unguarded", "guarded")}
    L += ["", f"Total tokens (prompt+completion) across the flagged cases: unguarded {tot['unguarded']}, guarded {tot['guarded']}. "
          "No dollar cost is reported because Vultr's per-token price is not recorded in this repo.", ""]
    return "\n".join(L)


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    provider = argv[argv.index("--provider") + 1] if "--provider" in argv else None
    order = (provider,) if provider else ("vultr", "openrouter")
    suffix = f"-{provider}" if provider else ""
    res = {"rules": run_rules_only()}
    print("running unguarded agent ...", flush=True)
    res["unguarded"] = run_agent(guardrails=False, order=order)
    print("running guarded agent ...", flush=True)
    res["guarded"] = run_agent(guardrails=True, order=order)
    modes = {"rules": "Rules only", "unguarded": "Rules + agent, no guardrails", "guarded": "Rules + agent + guardrails"}
    import datetime
    import subprocess
    from ..agent import llm
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                                cwd=str(DOCS)).stdout.strip() or "unknown"
    except OSError:
        commit = "unknown"
    prov = llm.providers()[order[0]]
    meta = (f"**Snapshot:** code commit `{commit}`, {datetime.date.today().isoformat()}, provider `{prov.name}`, "
            f"model `{prov.model}`, temperature 0, one run per mode. Failed calls stay in the denominator "
            "(column 'Failed calls'). This is a snapshot, not a statistically conclusive benchmark.")
    DOCS.mkdir(exist_ok=True)
    (DOCS / f"eval-results{suffix}.json").write_text(json.dumps(res, indent=2, default=list), encoding="utf8")
    (DOCS / f"eval-results{suffix}.md").write_text(render(res, modes, meta), encoding="utf8")
    print(render(res, modes, meta))


if __name__ == "__main__":
    sys.exit(main())
