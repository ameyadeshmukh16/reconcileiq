export type AnomalyType =
  | "duplicate_invoice"
  | "amount_mismatch"
  | "vendor_name_mismatch"
  | "date_anomaly"
  | "quantity_mismatch"
  | "missing_evidence"
  | "clean";

export type Severity = "low" | "medium" | "high";

export type Status =
  | "received"
  | "investigating"
  | "awaiting_review"
  | "approved"
  | "dismissed";

export type Recommendation =
  | "approve"
  | "request_vendor_clarification"
  | "escalate"
  | "reject";

export interface Evidence {
  source: "invoice" | "purchase_order" | "goods_receipt";
  field: string;
  value: any;
}

export interface Case {
  case_id: string;
  invoice_number: string;
  vendor_name: string;
  po_number: string | null;
  invoice_amount: number;
  po_amount: number | null;
  quantity_billed: number | null;
  quantity_received: number | null;
  invoice_date: string;
  po_date: string | null;
  anomaly_type: AnomalyType;
  detection_method: "rule_engine" | "agent_investigation";
  investigation_provider: "vultr" | "openrouter" | "none";
  investigation_model: string | null;
  recommendation_rationale?: string;
  finding_facts?: string[];
  finding_interpretation?: string;
  evidence: Evidence[];
  finding: string;
  confidence: "low" | "medium" | "high";
  recommendation: Recommendation;
  requires_human_approval: boolean;
  suggested_action: string;
  status: Status;
  flagged_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_reason: string | null;
  run_id: string | null;
  severity: "low" | "medium" | "high" | null;
}

export interface RunSummary {
  run_id: string;
  started_at: string;
  total_cases: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  in_progress?: boolean;
}

export interface TimelineEvent {
  ts: string;
  actor: "rule_engine" | "agent" | "human";
  type: "rule_check" | "tool_call" | "status_change" | "decision";
  summary: string;
  detail?: any;
}

export interface CaseDetailResponse {
  case: Case;
  timeline: TimelineEvent[];
}
