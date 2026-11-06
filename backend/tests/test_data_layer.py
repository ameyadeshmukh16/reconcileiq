import sqlite3

import pytest

from app import cases, db, pipeline
from app.agent import data_access as da


@pytest.fixture()
def conn(tmp_path):
    c = pipeline.bootstrap(str(tmp_path / "t.db"))
    yield c
    c.close()


def test_dataset_loaded(conn):
    assert conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0] == 42
    assert not db.load_dataset(conn, pipeline.DEFAULT_DATA_DIR)  # second load is a no-op


def test_seeded_anomalies_classified(conn):
    pipeline.run_pipeline(conn)
    got = {c.invoice_number: c for c in cases.list_cases(conn)}
    assert len(got) == 10
    expect = {
        "INV-2026-9041": ("duplicate_invoice", "rule_engine", "awaiting_review"),
        "INV-88204": ("amount_mismatch", "agent_investigation", "received"),
        "INV-61208": ("vendor_name_mismatch", "agent_investigation", "received"),
        "INV-43019": ("date_anomaly", "agent_investigation", "received"),
        "INV-72901": ("quantity_mismatch", "agent_investigation", "received"),
        "INV-33981": ("missing_evidence", "agent_investigation", "received"),
        "INV-55102": ("amount_mismatch", "agent_investigation", "received"),
        "INV-19042": ("amount_mismatch", "agent_investigation", "received"),
        "INV-80912": ("date_anomaly", "agent_investigation", "received"),
        "INV-10077": ("date_anomaly", "agent_investigation", "received"),
    }
    for inv, (anomaly, method, status) in expect.items():
        c = got[inv]
        assert (c.anomaly_type, c.detection_method, c.status) == (anomaly, method, status), inv
        assert c.requires_human_approval


def test_clean_and_within_tolerance_not_cased(conn):
    pipeline.run_pipeline(conn)
    numbers = {c.invoice_number for c in cases.list_cases(conn)}
    assert "INV-20999" not in numbers          # 1% over PO, inside the 2% tolerance
    assert not any(n.startswith("INV-2000") for n in numbers)


def test_contradictory_case_is_high_severity(conn):
    pipeline.run_pipeline(conn)
    c = next(c for c in cases.list_cases(conn) if c.invoice_number == "INV-55102")
    assert c.severity == "high" and c.quantity_received == 120 and c.po_amount == 20000


def test_missing_grn_has_null_quantity_received(conn):
    pipeline.run_pipeline(conn)
    c = next(c for c in cases.list_cases(conn) if c.invoice_number == "INV-33981")
    assert c.quantity_received is None


def test_rerun_is_idempotent_and_preserves_decisions(conn):
    s1 = pipeline.run_pipeline(conn)
    dup = next(c for c in cases.list_cases(conn) if c.detection_method == "rule_engine")
    cases.decide(conn, dup.case_id, "approved", "tester", "ok")
    events_before = conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]
    s2 = pipeline.run_pipeline(conn)
    assert s1.total_cases == s2.total_cases == 10
    assert cases.get_case(conn, dup.case_id).status == "approved"          # not reset
    assert conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0] == events_before
    assert conn.execute("SELECT new_cases FROM runs ORDER BY rowid DESC LIMIT 1").fetchone()[0] == 0


def test_transitions_enforced(conn):
    pipeline.run_pipeline(conn)
    received = next(c for c in cases.list_cases(conn, status="received"))
    with pytest.raises(cases.TransitionError):           # cannot decide before review
        cases.decide(conn, received.case_id, "approved", "a", "r")
    dup = next(c for c in cases.list_cases(conn, status="awaiting_review"))
    with pytest.raises(cases.TransitionError):           # reason + actor required
        cases.decide(conn, dup.case_id, "approved", "a", "  ")
    cases.decide(conn, dup.case_id, "dismissed", "a", "valid reason")
    with pytest.raises(cases.TransitionError):           # cannot re-decide
        cases.decide(conn, dup.case_id, "approved", "b", "again")
    with pytest.raises(cases.NotFoundError):
        cases.decide(conn, "nope", "approved", "a", "r")


def test_decision_is_atomic_with_audit_event(conn):
    pipeline.run_pipeline(conn)
    dup = next(c for c in cases.list_cases(conn, status="awaiting_review"))
    n = conn.execute("SELECT COUNT(*) FROM audit_events WHERE case_id=?", (dup.case_id,)).fetchone()[0]
    out = cases.decide(conn, dup.case_id, "approved", "alice", "confirmed duplicate")
    assert out.resolved_by == "alice" and out.resolution_reason == "confirmed duplicate"
    tl = cases.get_timeline(conn, dup.case_id)
    assert len(tl) == n + 1 and tl[-1].type == "decision" and tl[-1].actor == "human"


def test_failed_transition_writes_nothing(conn):
    pipeline.run_pipeline(conn)
    received = next(c for c in cases.list_cases(conn, status="received"))
    before = conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]
    with pytest.raises(cases.TransitionError):
        cases.transition(conn, received.case_id, "approved", "agent", "illegal")
    assert conn.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0] == before
    assert cases.get_case(conn, received.case_id).status == "received"


def test_audit_log_is_insert_only(conn):
    pipeline.run_pipeline(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE audit_events SET summary='x'")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("DELETE FROM audit_events")


def test_agent_data_access(conn):
    assert da.get_po(conn, "PO-77620")["amount"] == 20000
    assert da.get_goods_receipt(conn, "PO-77620")["total_quantity_received"] == 120
    assert da.get_goods_receipt(conn, "PO-77519") == {"found": False, "po_number": "PO-77519"}
    assert da.get_invoice(conn, "INV-2026-9041")["count"] == 2
    assert da.calculate_difference(21600, 20000) == {"a": 21600, "b": 20000, "difference": 1600.0, "percent_of_b": 8.0}
    assert da.check_policy("amount")["tolerance_pct"] == 2.0
    assert da.check_policy("bogus")["found"] is False


def test_run_summary_counts_live(conn):
    s = pipeline.run_pipeline(conn)
    assert s.total_cases == 10 and s.by_status == {"awaiting_review": 1, "received": 9}
    assert s.by_severity["high"] >= 3
