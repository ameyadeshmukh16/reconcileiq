from typing import Any, Literal, Optional

from pydantic import BaseModel

AnomalyType = Literal[
    "duplicate_invoice", "amount_mismatch", "vendor_name_mismatch",
    "date_anomaly", "quantity_mismatch", "missing_evidence", "clean",
]
Status = Literal["received", "investigating", "awaiting_review", "approved", "dismissed"]
Recommendation = Literal["approve", "request_vendor_clarification", "escalate", "reject"]


class Evidence(BaseModel):
    source: Literal["invoice", "purchase_order", "goods_receipt"]
    field: str
    value: Any


class Case(BaseModel):
    case_id: str
    invoice_number: str
    vendor_name: str
    po_number: Optional[str] = None
    invoice_amount: float
    po_amount: Optional[float] = None
    quantity_billed: Optional[float] = None
    quantity_received: Optional[float] = None
    invoice_date: str
    po_date: Optional[str] = None
    anomaly_type: AnomalyType
    detection_method: Literal["rule_engine", "agent_investigation"]
    investigation_provider: Literal["vultr", "openrouter", "none"] = "none"
    evidence: list[Evidence] = []
    finding: str = ""
    confidence: Literal["low", "medium", "high"] = "low"
    recommendation: Recommendation = "escalate"
    requires_human_approval: bool = True
    suggested_action: str = ""
    status: Status = "received"
    flagged_at: str
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None
    resolution_reason: Optional[str] = None
    # Added per docs/decisions.md (gaps in v3 spec)
    run_id: Optional[str] = None
    severity: Optional[Literal["low", "medium", "high"]] = None


class RunSummary(BaseModel):
    run_id: str
    started_at: str
    total_cases: int
    by_status: dict[str, int] = {}
    by_severity: dict[str, int] = {}
