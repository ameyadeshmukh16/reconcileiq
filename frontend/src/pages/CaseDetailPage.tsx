import React, { useState, useEffect } from "react";
import { Case, TimelineEvent } from "../types";
import { getCaseDetail } from "../api";
import { DocumentComparison } from "../components/DocumentComparison";
import { EvidencePanel } from "../components/EvidencePanel";
import { AgentFindingCard } from "../components/AgentFindingCard";
import { TimelineViewer } from "../components/TimelineViewer";
import { DecisionBar } from "../components/DecisionBar";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  FileX2,
} from "lucide-react";

interface CaseDetailPageProps {
  caseId: string;
}

export const CaseDetailPage: React.FC<CaseDetailPageProps> = ({ caseId }) => {
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getCaseDetail(caseId);
      setCaseData(resp.case);
      setTimeline(resp.timeline);
    } catch (err: any) {
      setError(err.message || "Failed to load case investigation details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [caseId]);

  const handleCaseResolved = (updated: Case) => {
    setCaseData(updated);
    fetchDetail();
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#0D5C58] animate-spin" />
        <p className="text-xs text-gray-600 font-mono">
          Loading investigation details...
        </p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-2xl mx-auto my-16 p-8 bg-white border border-[#E5E7EB] rounded-lg text-center space-y-4">
        <FileX2 className="w-10 h-10 text-[#DC2626] mx-auto" />
        <h2 className="text-base font-bold text-gray-900">Case Not Found</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          {error || `Unable to locate accounts payable record for case ID "${caseId}".`}
        </p>
        <div className="pt-2">
          <a
            href="#/"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0D5C58] hover:bg-[#0A4D48] rounded transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Exceptions Queue</span>
          </a>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: Case["status"]) => {
    switch (status) {
      case "awaiting_review":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#92400E]">
            Awaiting Review
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#CCFBF1] text-[#0D5C58]">
            <CheckCircle2 className="w-3 h-3 text-[#0D5C58]" />
            Accepted
          </span>
        );
      case "dismissed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700">
            <XCircle className="w-3 h-3 text-gray-500" />
            Overridden
          </span>
        );
      default:
        return (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
            {status}
          </span>
        );
    }
  };

  const getSeverityBadge = (sev: Case["severity"]) => {
    const dotColor =
      sev === "high" ? "bg-[#DC2626]" : sev === "medium" ? "bg-[#D97706]" : "bg-[#9CA3AF]";
    const label = sev === "high" ? "High" : sev === "medium" ? "Med" : "Low";
    return (
      <span className="inline-flex items-center text-xs text-gray-700 font-medium">
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${dotColor}`} />
        {label}
      </span>
    );
  };

  // Humanize detection method
  const humanDetection =
    caseData.detection_method === "agent_investigation"
      ? "Agent investigation"
      : "Rule engine";

  const providerModelDisplay =
    caseData.investigation_provider === "none"
      ? "Rule engine"
      : `${caseData.investigation_provider} / ${caseData.investigation_model || "model"}`;

  // Calculate largest variance
  const calculateLargestVariance = () => {
    if (caseData.anomaly_type === "duplicate_invoice") {
      return `Duplicate match ($${caseData.invoice_amount.toLocaleString()})`;
    }
    if (caseData.quantity_received === null) {
      return "Missing Goods Receipt (0 logged)";
    }
    if (caseData.quantity_billed !== null && caseData.quantity_received !== null) {
      const diff = caseData.quantity_received - caseData.quantity_billed;
      if (diff > 0) return `Over-receipt (+${diff} units)`;
      if (diff < 0) return `Shortfall (${diff} units)`;
    }
    if (caseData.po_amount !== null && Math.abs(caseData.invoice_amount - caseData.po_amount) > 0.01) {
      const diff = caseData.invoice_amount - caseData.po_amount;
      const pct = ((diff / caseData.po_amount) * 100).toFixed(1);
      return `${diff > 0 ? "+" : ""}$${Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2 })} (${diff > 0 ? "+" : ""}${pct}%)`;
    }
    if (caseData.invoice_date && caseData.po_date && new Date(caseData.invoice_date) < new Date(caseData.po_date)) {
      return "Invoice dated 6 days before PO";
    }
    return "Typo on PO header";
  };

  const getRecommendationLabel = () => {
    switch (caseData.recommendation) {
      case "approve":
        return "Approve";
      case "request_vendor_clarification":
        return "Clarify with vendor";
      case "escalate":
        return "Escalate";
      case "reject":
        return "Reject / Credit";
    }
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Back button and minimal case id */}
      <div className="flex items-center justify-between">
        <a
          href="#/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-[#0D5C58] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Exceptions Queue</span>
        </a>

        {/* Show case id only in small muted text */}
        <span className="text-[11px] font-mono text-gray-400">
          case: {caseData.case_id}
        </span>
      </div>

      {/* Investigation Workspace Header */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-gray-900 font-mono">
                {caseData.invoice_number}
              </h1>
              <span className="text-gray-300">/</span>
              <span className="text-base font-bold text-gray-800">
                {caseData.vendor_name}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 pt-0.5">
              <span>Detection: <span className="font-medium text-gray-700">{humanDetection}</span></span>
              {caseData.po_number && (
                <>
                  <span>·</span>
                  <span>PO: <span className="font-mono text-gray-700">{caseData.po_number}</span></span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {getSeverityBadge(caseData.severity)}
            {getStatusBadge(caseData.status)}
          </div>
        </div>
      </div>

      {/* 7. Compact Summary Strip directly under header */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg px-5 py-3 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB] gap-2 md:gap-0 text-xs">
        {/* Recommendation */}
        <div className="md:pr-4 flex flex-col justify-center">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
            Recommendation
          </span>
          <span className="font-semibold text-gray-900 mt-0.5 text-xs">
            {getRecommendationLabel()}
          </span>
        </div>

        {/* Confidence */}
        <div className="md:px-4 pt-2 md:pt-0 flex flex-col justify-center">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
            Confidence
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="font-semibold text-gray-900 capitalize text-xs">
              {caseData.confidence}
            </span>
            <span className="text-[10px] text-gray-400 italic">
              (indicator, not a probability)
            </span>
          </div>
        </div>

        {/* Provider / Model */}
        <div className="md:px-4 pt-2 md:pt-0 flex flex-col justify-center">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
            Provider / Model
          </span>
          <span className="font-mono text-gray-800 text-xs mt-0.5 truncate" title={providerModelDisplay}>
            {providerModelDisplay}
          </span>
        </div>

        {/* Largest Variance */}
        <div className="md:pl-4 pt-2 md:pt-0 flex flex-col justify-center">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
            Primary Variance
          </span>
          <span className="font-mono font-semibold text-gray-900 text-xs mt-0.5 truncate">
            {calculateLargestVariance()}
          </span>
        </div>
      </div>

      {/* 1. Document Comparison (3 Columns: Invoice | PO | Goods Receipt) */}
      <DocumentComparison caseData={caseData} />

      {/* 2-Column Split: Evidence Panel + Detailed AI Finding Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <EvidencePanel evidenceList={caseData.evidence} />

        <AgentFindingCard
          finding={caseData.finding}
          findingFacts={caseData.finding_facts}
          findingInterpretation={caseData.finding_interpretation}
          confidence={caseData.confidence}
          recommendation={caseData.recommendation}
          recommendationRationale={caseData.recommendation_rationale}
          investigationProvider={caseData.investigation_provider}
          investigationModel={caseData.investigation_model}
          detectionMethod={caseData.detection_method}
          suggestedAction={caseData.suggested_action}
        />
      </div>

      {/* 3. Investigation Timeline: Collapsed by default behind toggle */}
      <TimelineViewer timeline={timeline} />

      {/* 4. Slim Sticky Decision Bar */}
      <DecisionBar caseData={caseData} onCaseResolved={handleCaseResolved} />
    </div>
  );
};
