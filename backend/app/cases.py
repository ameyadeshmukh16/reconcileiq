"""Case persistence, enforced status transitions and the audit trail.

Every status change and its audit event are written in ONE transaction.
"""
import json
import sqlite3
import uuid
from datetime import datetime, timezone

from .models import Case, CaseDetail, Evidence, RunSummary, TimelineEvent

# Allowed transitions. Only `awaiting_review` can be decided; decided cases are final.
TRANSITIONS = {
    "received": {"investigating", "awaiting_review"},   # rule-flagged cases skip the agent
    "investigating": {"awaiting_review"},
    "awaiting_review": {"approved", "dismissed"},
    "approved": set(),
    "dismissed": set(),
}


class TransitionError(Exception):
    """Illegal status change or invalid decision input."""


class NotFoundError(Exception):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def add_event(conn, case_id: str, actor: str, type_: str, summary: str, detail=None, ts: str | None = None) -> None:
    """Append an audit event. Caller owns the transaction."""
    conn.execute(
        "INSERT INTO audit_events (case_id, ts, actor, type, summary, detail) VALUES (?,?,?,?,?,?)",
        (case_id, ts or now(), actor, type_, summary, json.dumps(detail) if detail is not None else None))


def create_case(conn, *, invoice_id: str, run_id: str, anomaly_type: str, detection_method: str,
                severity: str, recommendation: str = "escalate", suggested_action: str = "") -> str:
    """Insert a case in `received` state. Caller owns the transaction."""
    case_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO cases (case_id, invoice_id, run_id, anomaly_type, detection_method, severity,
                              recommendation, suggested_action, flagged_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (case_id, invoice_id, run_id, anomaly_type, detection_method, severity,
         recommendation, suggested_action, now()))
    return case_id


def transition(conn, case_id: str, new_status: str, actor: str, summary: str, detail=None,
               fields: dict | None = None) -> None:
    """Move a case to `new_status` (validated) and log it atomically.

    `fields` are extra case columns to update in the same transaction (e.g. agent findings).
    """
    conn.execute("BEGIN IMMEDIATE") if not conn.in_transaction else None
    try:
        row = conn.execute("SELECT status FROM cases WHERE case_id=?", (case_id,)).fetchone()
        if row is None:
            raise NotFoundError(case_id)
        if new_status not in TRANSITIONS[row["status"]]:
            raise TransitionError(f"Cannot move case from '{row['status']}' to '{new_status}'")
        sets = {"status": new_status, **(fields or {})}
        conn.execute(f"UPDATE cases SET {', '.join(f'{k}=?' for k in sets)} WHERE case_id=?",
                     [*sets.values(), case_id])
        add_event(conn, case_id, actor, "status_change", summary,
                  {"from": row["status"], "to": new_status, **(detail or {})})
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def decide(conn, case_id: str, decision: str, actor: str, reason: str, declared_reviewer: str | None = None) -> Case:
    """Human decision: approve or dismiss a case that is awaiting review.

    `actor` is the AUTHENTICATED identity (set by the server, never the client). `declared_reviewer` is
    the name the reviewer typed; it is recorded but labelled self-declared because it is not verified.
    """
    if decision not in ("approved", "dismissed"):
        raise TransitionError("decision must be 'approved' or 'dismissed'")
    if not actor.strip() or not reason.strip():
        raise TransitionError("actor and reason are required")
    ts = now()
    conn.execute("BEGIN IMMEDIATE") if not conn.in_transaction else None
    try:
        row = conn.execute("SELECT status, recommendation, confidence FROM cases WHERE case_id=?", (case_id,)).fetchone()
        if row is None:
            raise NotFoundError(case_id)
        if decision not in TRANSITIONS[row["status"]]:
            raise TransitionError(f"Case is '{row['status']}'; only cases awaiting review can be decided")
        declared = (declared_reviewer or "").strip()
        who = f"{actor.strip()} (declared reviewer: {declared})" if declared else actor.strip()
        conn.execute("UPDATE cases SET status=?, resolved_at=?, resolved_by=?, resolution_reason=? WHERE case_id=?",
                     (decision, ts, who, reason.strip(), case_id))
        add_event(conn, case_id, "human", "decision",
                  f"{'Approved' if decision == 'approved' else 'Dismissed'} by {who}",
                  {"decision": decision, "meaning": ("accepted agent recommendation" if decision == "approved"
                                                    else "overrode agent recommendation and closed"),
                   "agent_recommendation": row["recommendation"], "agent_confidence": row["confidence"],
                   "authenticated_user": actor.strip(),
                   "declared_reviewer": declared or None, "reason": reason.strip()}, ts=ts)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return get_case(conn, case_id)


# ---------- reads ----------

_CASE_SQL = """
SELECT c.*, i.invoice_number, i.vendor_name, i.po_number, i.amount AS invoice_amount,
       i.quantity AS quantity_billed, i.invoice_date,
       p.amount AS po_amount, p.po_date, g.quantity_received
FROM cases c
JOIN invoices i ON i.invoice_id = c.invoice_id
LEFT JOIN purchase_orders p ON p.po_number = i.po_number
LEFT JOIN (SELECT po_number, SUM(quantity_received) AS quantity_received
           FROM goods_receipts GROUP BY po_number) g ON g.po_number = i.po_number
"""

_SEV_ORDER = "CASE c.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END"


def _to_case(row: sqlite3.Row) -> Case:
    d = dict(row)
    d["evidence"] = [Evidence(**e) for e in json.loads(d["evidence"])]
    d["finding_facts"] = json.loads(d["finding_facts"])
    d["requires_human_approval"] = bool(d["requires_human_approval"])
    return Case(**{k: v for k, v in d.items() if k in Case.model_fields})


def get_case(conn, case_id: str) -> Case:
    row = conn.execute(_CASE_SQL + " WHERE c.case_id=?", (case_id,)).fetchone()
    if row is None:
        raise NotFoundError(case_id)
    return _to_case(row)


def list_cases(conn, status=None, severity=None, anomaly_type=None) -> list[Case]:
    where, args = [], []
    for col, val in (("c.status", status), ("c.severity", severity), ("c.anomaly_type", anomaly_type)):
        if val and val != "all":
            where.append(f"{col}=?")
            args.append(val)
    sql = _CASE_SQL + (" WHERE " + " AND ".join(where) if where else "")
    sql += (f" ORDER BY (c.status='awaiting_review') DESC, {_SEV_ORDER}, c.flagged_at DESC")
    return [_to_case(r) for r in conn.execute(sql, args).fetchall()]


def get_timeline(conn, case_id: str) -> list[TimelineEvent]:
    rows = conn.execute("SELECT * FROM audit_events WHERE case_id=? ORDER BY event_id", (case_id,)).fetchall()
    return [TimelineEvent(ts=r["ts"], actor=r["actor"], type=r["type"], summary=r["summary"],
                          detail=json.loads(r["detail"]) if r["detail"] else None) for r in rows]


def get_case_detail(conn, case_id: str) -> CaseDetail:
    return CaseDetail(case=get_case(conn, case_id), timeline=get_timeline(conn, case_id))


def run_summary(conn, run_id: str) -> RunSummary:
    """Run metadata plus LIVE counts over all cases (so decisions show up immediately)."""
    run = conn.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
    if run is None:
        raise NotFoundError(run_id)
    by_status = {r[0]: r[1] for r in conn.execute("SELECT status, COUNT(*) FROM cases GROUP BY status")}
    by_sev = {r[0]: r[1] for r in conn.execute("SELECT severity, COUNT(*) FROM cases GROUP BY severity")}
    return RunSummary(run_id=run_id, started_at=run["started_at"], total_cases=sum(by_status.values()),
                      by_status=by_status, by_severity=by_sev)


def latest_run_id(conn) -> str | None:
    row = conn.execute("SELECT run_id FROM runs ORDER BY started_at DESC, rowid DESC LIMIT 1").fetchone()
    return row["run_id"] if row else None
