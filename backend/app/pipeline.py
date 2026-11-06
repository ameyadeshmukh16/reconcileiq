"""Pipeline run: rule engine over the dataset -> cases + audit events.

Idempotent per invoice: an invoice that already has a case is skipped, so re-running
never duplicates a case or resets one a human has already reviewed.
"""
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import cases, config, db, rules
from .models import RunSummary

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def run_pipeline(conn) -> RunSummary:
    frames = {t: db.read_frame(conn, t) for t in db.DATA_TABLES}
    results = rules.evaluate(frames["invoices"], frames["purchase_orders"],
                             frames["goods_receipts"], frames["vendors"])
    existing = {r[0] for r in conn.execute("SELECT invoice_id FROM cases")}
    run_id = f"run-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:4]}"
    clean = sum(r.classification == "clean" for r in results)
    flagged = [r for r in results if r.classification != "clean" and r.invoice_id not in existing]

    with conn:  # single transaction: run row + every new case + its audit events
        conn.execute("INSERT INTO runs (run_id, started_at, invoices_evaluated, clean_count, new_cases) VALUES (?,?,?,?,?)",
                     (run_id, cases.now(), len(results), clean, len(flagged)))
        for r in flagged:
            method = "rule_engine" if r.classification == "rule_flagged" else "agent_investigation"
            case_id = cases.create_case(
                conn, invoice_id=r.invoice_id, run_id=run_id, anomaly_type=r.anomaly_type,
                detection_method=method, severity=r.severity, recommendation=r.recommendation,
                suggested_action=r.suggested_action)
            for issue in r.issues:
                cases.add_event(conn, case_id, "rule_engine", "rule_check", issue["summary"],
                                {"rule": issue["type"], **issue["detail"]})
            if r.classification == "rule_flagged":
                # Unambiguous: templated action, no LLM. A human still decides.
                conn.execute("UPDATE cases SET status='awaiting_review', confidence='high', "
                             "finding=?, recommendation_rationale=? WHERE case_id=?",
                             (r.summary, "Exact duplicate detected by deterministic rule.", case_id))
                cases.add_event(conn, case_id, "rule_engine", "status_change",
                                "Rule-flagged; templated action drafted, awaiting human review",
                                {"from": "received", "to": "awaiting_review"})
    return cases.run_summary(conn, run_id)


def bootstrap(db_path: str | None = None, data_dir: str | Path | None = None):
    """Create schema, load CSVs if needed. Returns an open connection."""
    conn = db.connect(db_path)
    db.init_db(conn)
    db.load_dataset(conn, data_dir or DEFAULT_DATA_DIR)
    return conn


if __name__ == "__main__":
    conn = bootstrap(sys.argv[1] if len(sys.argv) > 1 else None)
    print(json.dumps(run_pipeline(conn).model_dump(), indent=2))
