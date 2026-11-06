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
    investigation_model: Optional[str] = None
    evidence: list[Evidence] = []
    finding: str = ""
    confidence: Literal["low", "medium", "high"] = "low"
    recommendation: Recommendation = "escalate"
    requires_human_approval: bool = True
    suggested_action: str = ""
    # Optional structured finding fields used by the UI
    recommendation_rationale: Optional[str] = None
    finding_facts: list[str] = []
    finding_interpretation: Optional[str] = None
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
    in_progress: bool = False   # agent investigation still running for this run's cases


class TimelineEvent(BaseModel):
    ts: str
    actor: Literal["rule_engine", "agent", "human"]
    type: Literal["rule_check", "tool_call", "status_change", "decision"]
    summary: str
    detail: Any = None


class CaseDetail(BaseModel):
    case: Case
    timeline: list[TimelineEvent]
