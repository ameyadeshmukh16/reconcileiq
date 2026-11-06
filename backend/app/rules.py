"""Deterministic three-way-match rule engine (pandas). No LLM involved.

Every invoice/PO/GRN has exactly one line item, so header-level == line-level.
Classification:
  clean               - passes every check
  rule_flagged        - unambiguous (exact duplicate); templated action, no agent
  needs_investigation - anything ambiguous; handed to the investigation agent
"""
import difflib
import re
from dataclasses import dataclass, field
from datetime import date

import pandas as pd

from . import config

# Priority when several issues fire on one invoice: the first is the primary anomaly.
PRIORITY = ["duplicate_invoice", "missing_evidence", "vendor_name_mismatch",
            "date_anomaly", "amount_mismatch", "quantity_mismatch"]
SEV_RANK = {"low": 1, "medium": 2, "high": 3}


@dataclass
class RuleResult:
    invoice_id: str
    classification: str                      # clean | rule_flagged | needs_investigation
    anomaly_type: str = "clean"
    severity: str | None = None
    issues: list[dict] = field(default_factory=list)   # [{type, severity, summary, detail}]
    recommendation: str = "escalate"
    suggested_action: str = ""
    summary: str = ""


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def _pct(diff: float, base: float) -> float:
    return abs(diff) / base * 100 if base else 0.0


def build_frame(invoices: pd.DataFrame, pos: pd.DataFrame, grns: pd.DataFrame,
                vendors: pd.DataFrame) -> pd.DataFrame:
    """One row per invoice with its PO, master vendor and (aggregated) GRN attached."""
    inv = invoices.sort_values(["invoice_date", "invoice_id"]).copy()
    inv["is_dup_of_earlier"] = inv.duplicated(["vendor_id", "invoice_number"], keep="first")
    first = inv.drop_duplicates(["vendor_id", "invoice_number"], keep="first")
    first = first.set_index(["vendor_id", "invoice_number"])
    keys = list(zip(inv.vendor_id, inv.invoice_number, inv.is_dup_of_earlier))
    inv["orig_amount"] = [first.loc[(v, n), "amount"] if d else None for v, n, d in keys]
    inv["orig_invoice_id"] = [first.loc[(v, n), "invoice_id"] if d else None for v, n, d in keys]
    po = pos.rename(columns={"vendor_id": "po_vendor_id", "quantity": "po_quantity", "amount": "po_amount"})
    vend = vendors.rename(columns={"vendor_id": "po_vendor_id", "name": "master_vendor_name"})
    g = (grns.groupby("po_number")
         .agg(grn_number=("grn_number", "first"), receipt_date=("receipt_date", "first"),
              quantity_received=("quantity_received", "sum"), grn_notes=("notes", "first"))
         .reset_index())
    df = (inv.merge(po, on="po_number", how="left")
             .merge(vend, on="po_vendor_id", how="left")
             .merge(g, on="po_number", how="left"))
    return df.sort_values("invoice_id").reset_index(drop=True)


def _issue(t, sev, summary, **detail):
    return {"type": t, "severity": sev, "summary": summary, "detail": detail}


def _pct_sev(pct):
    return "high" if pct > config.HIGH_SEVERITY_PCT else "medium"


def evaluate_row(r: pd.Series, as_of: date) -> RuleResult:
    issues: list[dict] = []
    has_po = pd.notna(r.get("po_amount"))
    has_grn = pd.notna(r.get("quantity_received"))

    # 1. Duplicate invoice (same vendor + invoice number as an earlier invoice)
    exact_dup = bool(r.is_dup_of_earlier) and float(r.amount) == float(r.orig_amount)
    if r.is_dup_of_earlier:
        issues.append(_issue(
            "duplicate_invoice", "high",
            f"Invoice number {r.invoice_number} already submitted by this vendor"
            + ("" if exact_dup else " with a DIFFERENT amount"),
            original_invoice_id=r.orig_invoice_id, original_amount=float(r.orig_amount),
            this_amount=float(r.amount), exact=exact_dup))

    # 2. Missing evidence
    missing = [n for n, ok in (("purchase_order", has_po), ("goods_receipt", has_grn)) if not ok]
    if missing:
        issues.append(_issue(
            "missing_evidence", "high",
            "No " + " or ".join(m.replace("_", " ") for m in missing) + " on file", missing=missing))

    # 3. Vendor name
    if has_po:
        ratio = difflib.SequenceMatcher(None, _norm(r.vendor_name), _norm(r.master_vendor_name)).ratio()
        if _norm(r.vendor_name) != _norm(r.master_vendor_name) or r.vendor_id != r.po_vendor_id:
            issues.append(_issue(
                "vendor_name_mismatch", "medium",
                f"Invoice vendor '{r.vendor_name}' differs from PO vendor '{r.master_vendor_name}'",
                invoice_vendor=r.vendor_name, po_vendor=r.master_vendor_name,
                similarity=round(ratio, 3), near_match=ratio >= config.VENDOR_NEAR_MATCH_RATIO))

    # 4. Dates
    inv_d = date.fromisoformat(r.invoice_date)
    if has_po:
        po_d = date.fromisoformat(r.po_date)
        if inv_d < po_d:
            gap = (po_d - inv_d).days
            issues.append(_issue(
                "date_anomaly", "low" if gap <= 3 else "medium" if gap <= 14 else "high",
                f"Invoice dated {gap} day(s) before the PO",
                invoice_date=r.invoice_date, po_date=r.po_date, days_before_po=gap))
    age = (as_of - inv_d).days
    if age > config.STALE_INVOICE_DAYS:
        issues.append(_issue(
            "date_anomaly", "medium", f"Stale invoice: {age} days old (> {config.STALE_INVOICE_DAYS})",
            invoice_date=r.invoice_date, age_days=age))

    # 5. Amount vs PO
    if has_po:
        diff = float(r.amount) - float(r.po_amount)
        pct = _pct(diff, float(r.po_amount))
        if pct > config.AMOUNT_TOLERANCE_PCT:
            issues.append(_issue(
                "amount_mismatch", _pct_sev(pct),
                f"Invoice amount differs from PO by {diff:+,.2f} ({pct:.1f}% > {config.AMOUNT_TOLERANCE_PCT}% tolerance)",
                invoice_total=float(r.amount), po_total=float(r.po_amount),
                variance_dollars=round(diff, 2), variance_percentage=round(pct, 2),
                tolerance_cap=config.AMOUNT_TOLERANCE_PCT))

    # 6. Quantity billed vs received
    if has_grn:
        qdiff = float(r.quantity) - float(r.quantity_received)
        if abs(qdiff) > config.QUANTITY_TOLERANCE_UNITS:
            qpct = _pct(qdiff, float(r.quantity))
            issues.append(_issue(
                "quantity_mismatch", _pct_sev(qpct),
                f"Billed {r.quantity:g} but received {r.quantity_received:g} ({-qdiff:+g} units)",
                quantity_billed=float(r.quantity), quantity_received=float(r.quantity_received),
                variance_units=-qdiff, variance_percentage=round(qpct, 2)))

    if not issues:
        return RuleResult(r.invoice_id, "clean", summary="Passed all three-way match checks")

    primary = min(issues, key=lambda i: PRIORITY.index(i["type"]))
    severity = max((i["severity"] for i in issues), key=SEV_RANK.get)
    types = {i["type"] for i in issues}
    if {"amount_mismatch", "quantity_mismatch"} <= types:      # contradictory evidence across documents
        severity = "high"
    summary = "; ".join(i["summary"] for i in issues)

    if exact_dup:
        return RuleResult(
            r.invoice_id, "rule_flagged", "duplicate_invoice", "high", issues,
            recommendation="reject",
            suggested_action=(f"Reject {r.invoice_number} as an exact duplicate of {r.orig_invoice_id} "
                              f"(same vendor, number and amount ${float(r.amount):,.2f}). "
                              f"Do not pay; notify {r.vendor_name} that the invoice was received twice."),
            summary=summary)
    return RuleResult(r.invoice_id, "needs_investigation", primary["type"], severity, issues, summary=summary)


def evaluate(invoices, pos, grns, vendors, as_of: date | None = None) -> list[RuleResult]:
    as_of = as_of or (date.fromisoformat(config.AS_OF_DATE) if config.AS_OF_DATE else date.today())
    df = build_frame(invoices, pos, grns, vendors)
    return [evaluate_row(r, as_of) for _, r in df.iterrows()]
