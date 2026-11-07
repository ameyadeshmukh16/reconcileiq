"""Read-only data access + deterministic calculators the investigation agent's tools call.

The agent never computes authoritative financial values itself: every number it cites comes
from these functions. Each returns plain JSON-serialisable dicts (or {"found": False, ...}
when a record does not exist, so "missing evidence" is an explicit, honest result).
"""
from .. import config


def _row(conn, sql, args):
    r = conn.execute(sql, args).fetchone()
    return dict(r) if r else None


def get_invoice(conn, invoice_number: str) -> dict:
    rows = [dict(r) for r in conn.execute(
        "SELECT invoice_id, invoice_number, vendor_id, vendor_name, po_number, invoice_date, quantity, amount "
        "FROM invoices WHERE invoice_number=? ORDER BY invoice_date, invoice_id", (invoice_number,))]
    if not rows:
        return {"found": False, "invoice_number": invoice_number}
    return {"found": True, "invoices": rows, "count": len(rows)}


def get_po(conn, po_number: str) -> dict:
    r = _row(conn, "SELECT p.po_number, p.vendor_id, v.name AS vendor_name, p.po_date, p.quantity, p.amount "
                   "FROM purchase_orders p JOIN vendors v ON v.vendor_id=p.vendor_id WHERE p.po_number=?",
             (po_number,))
    return {"found": True, **r} if r else {"found": False, "po_number": po_number}


def get_goods_receipt(conn, po_number: str) -> dict:
    rows = [dict(r) for r in conn.execute(
        "SELECT grn_number, po_number, receipt_date, quantity_received, notes "
        "FROM goods_receipts WHERE po_number=? ORDER BY receipt_date", (po_number,))]
    if not rows:
        return {"found": False, "po_number": po_number}
    return {"found": True, "receipts": rows, "total_quantity_received": sum(r["quantity_received"] for r in rows)}


def get_po_approvals(conn, po_number: str) -> dict:
    """Approved amendments to a PO. Authoritative source for commercial authorization: a goods-receipt
    note may EXPLAIN a price or quantity, but it is not an approval."""
    rows = [dict(r) for r in conn.execute(
        "SELECT amendment_id, po_number, approved_by, approved_on, new_quantity, new_amount, note "
        "FROM po_amendments WHERE po_number=? ORDER BY approved_on", (po_number,))]
    return {"found": True, "amendments": rows} if rows else {"found": False, "po_number": po_number}


POLICIES = {
    "amount": {"policy": "Invoice vs PO amount", "tolerance_pct": config.AMOUNT_TOLERANCE_PCT,
               "rule": f"Invoices within {config.AMOUNT_TOLERANCE_PCT}% of the PO amount are acceptable."},
    "quantity": {"policy": "Billed vs received quantity", "tolerance_units": config.QUANTITY_TOLERANCE_UNITS,
                 "rule": f"Billed quantity must equal received quantity (tolerance {config.QUANTITY_TOLERANCE_UNITS} units)."},
    "date": {"policy": "Invoice dating", "stale_days": config.STALE_INVOICE_DAYS,
             "rule": f"Invoices must not predate their PO and must be under {config.STALE_INVOICE_DAYS} days old."},
    "vendor": {"policy": "Vendor identity", "near_match_ratio": config.VENDOR_NEAR_MATCH_RATIO,
               "rule": "Invoice vendor must match the PO vendor. A near-match is a data-quality question, "
                       "never proof of fraud; request clarification rather than conclude."},
    "duplicate": {"policy": "Duplicate invoices", "rule": "A vendor may not submit the same invoice number twice."},
    "authorization": {"policy": "Commercial authorization",
                      "rule": "A price or quantity above the PO needs an approved PO amendment. A goods-receipt note or "
                              "vendor statement can explain a difference but never authorizes it."},
    "evidence": {"policy": "Missing evidence", "rule": "Without a PO or goods receipt the match cannot be "
                                                      "completed; escalate, never guess or presume fraud."},
}


def check_policy(topic: str) -> dict:
    p = POLICIES.get(topic)
    return {"found": True, "topic": topic, **p} if p else {"found": False, "topic": topic, "available": sorted(POLICIES)}


def calculate_difference(a: float, b: float) -> dict:
    """Authoritative arithmetic: a - b, and that difference as a percentage of b."""
    diff = round(a - b, 2)
    return {"a": a, "b": b, "difference": diff,
            "percent_of_b": round(abs(diff) / b * 100, 2) if b else None}
