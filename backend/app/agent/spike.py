"""Manual end-to-end check against the REAL inference providers.

    python -m app.agent.spike INV-55102 [--provider vultr|openrouter] [--db path]

Loads ../.env (keys are never printed), builds a throwaway DB, runs the rule engine, then
investigates the given invoice's case and prints the outcome and audit timeline.
"""
import os
import sys
import tempfile
from pathlib import Path


def _load_env():
    env = Path(__file__).resolve().parents[3] / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()

from .. import cases, pipeline  # noqa: E402  (must import after env is loaded)
from . import investigator      # noqa: E402


def main(argv):
    invoice = argv[1] if len(argv) > 1 and not argv[1].startswith("--") else "INV-55102"
    order = ("vultr", "openrouter")
    if "--provider" in argv:
        order = (argv[argv.index("--provider") + 1],)
    db_path = argv[argv.index("--db") + 1] if "--db" in argv else os.path.join(tempfile.mkdtemp(), "spike.db")

    conn = pipeline.bootstrap(db_path)
    pipeline.run_pipeline(conn)
    case = next(c for c in cases.list_cases(conn) if c.invoice_number == invoice and c.status == "received")
    print(f"Investigating {invoice} ({case.anomaly_type}) via {order} ...")
    out = investigator.investigate(conn, case.case_id, order)

    print(f"\nstatus={out.status} provider={out.investigation_provider} model={out.investigation_model}")
    print(f"recommendation={out.recommendation} confidence={out.confidence} human_approval={out.requires_human_approval}")
    print(f"rationale: {out.recommendation_rationale}\n\n{out.finding}\n\nsuggested_action:\n{out.suggested_action}")
    print("\nevidence:", [(e.source, e.field, e.value) for e in out.evidence])
    print("\ntimeline:")
    for e in cases.get_timeline(conn, case.case_id):
        extra = {k: v for k, v in (e.detail or {}).items() if k in ("dropped_evidence_refs", "guardrail_adjustments", "unverified_numbers")}
        print(f"  [{e.actor}/{e.type}] {e.summary}" + (f"  {extra}" if any(extra.values()) else ""))


if __name__ == "__main__":
    main(sys.argv)
