"""SQLite schema, connection helper and CSV dataset loader."""
import sqlite3
from pathlib import Path

import pandas as pd

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS vendors (vendor_id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchase_orders (
    po_number TEXT PRIMARY KEY, vendor_id TEXT NOT NULL REFERENCES vendors(vendor_id),
    po_date TEXT NOT NULL, quantity REAL NOT NULL, amount REAL NOT NULL);
CREATE TABLE IF NOT EXISTS goods_receipts (
    grn_number TEXT PRIMARY KEY, po_number TEXT NOT NULL REFERENCES purchase_orders(po_number),
    receipt_date TEXT NOT NULL, quantity_received REAL NOT NULL, notes TEXT);
CREATE TABLE IF NOT EXISTS invoices (
    invoice_id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, vendor_id TEXT NOT NULL,
    vendor_name TEXT NOT NULL, po_number TEXT, invoice_date TEXT NOT NULL,
    quantity REAL NOT NULL, amount REAL NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY, started_at TEXT NOT NULL,
    invoices_evaluated INTEGER NOT NULL, clean_count INTEGER NOT NULL, new_cases INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cases (
    case_id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(invoice_id),
    run_id TEXT REFERENCES runs(run_id),
    anomaly_type TEXT NOT NULL, detection_method TEXT NOT NULL, severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    investigation_provider TEXT NOT NULL DEFAULT 'none', investigation_model TEXT,
    evidence TEXT NOT NULL DEFAULT '[]', finding TEXT NOT NULL DEFAULT '',
    finding_facts TEXT NOT NULL DEFAULT '[]', finding_interpretation TEXT,
    recommendation_rationale TEXT,
    confidence TEXT NOT NULL DEFAULT 'low', recommendation TEXT NOT NULL DEFAULT 'escalate',
    requires_human_approval INTEGER NOT NULL DEFAULT 1, suggested_action TEXT NOT NULL DEFAULT '',
    flagged_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT, resolution_reason TEXT);
CREATE TABLE IF NOT EXISTS audit_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL REFERENCES cases(case_id),
    ts TEXT NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is insert-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is insert-only'); END;
"""

DATA_TABLES = ["vendors", "purchase_orders", "goods_receipts", "invoices"]


def connect(path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def load_dataset(conn: sqlite3.Connection, data_dir: str | Path) -> bool:
    """Load the CSVs once. Returns False (and does nothing) if data is already loaded."""
    if conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]:
        return False
    data_dir = Path(data_dir)
    with conn:
        for table in DATA_TABLES:
            pd.read_csv(data_dir / f"{table}.csv").to_sql(table, conn, if_exists="append", index=False)
    return True


def read_frame(conn: sqlite3.Connection, table: str) -> pd.DataFrame:
    return pd.read_sql_query(f"SELECT * FROM {table}", conn)
