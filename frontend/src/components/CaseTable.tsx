import React, { useState, useMemo } from "react";
import { Case, Status, Severity, AnomalyType, Recommendation } from "../types";
import { Search, ChevronRight, X, FileQuestion } from "lucide-react";

interface CaseTableProps {
  cases: Case[];
  loading: boolean;
  selectedSeverity: string;
  onSelectSeverity: (severity: string) => void;
  selectedAnomalyType: string;
  onSelectAnomalyType: (type: string) => void;
}

export const CaseTable: React.FC<CaseTableProps> = ({
  cases,
  loading,
  selectedSeverity,
  onSelectSeverity,
  selectedAnomalyType,
  onSelectAnomalyType,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Sort awaiting_review + high severity to the top
  const filteredCases = useMemo(() => {
    let result = [...cases];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.invoice_number.toLowerCase().includes(q) ||
          c.vendor_name.toLowerCase().includes(q) ||
          (c.po_number && c.po_number.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      const getPriority = (c: Case) => {
        if (c.status === "awaiting_review" && c.severity === "high") return 4;
        if (c.status === "awaiting_review") return 3;
        if (c.severity === "high") return 2;
        if (c.status === "investigating") return 1;
        return 0;
      };

      const diff = getPriority(b) - getPriority(a);
      if (diff !== 0) return diff;

      return new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime();
    });

    return result;
  }, [cases, searchQuery]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(val);
  };

  const getAnomalyLabel = (type: AnomalyType): string => {
    switch (type) {
      case "duplicate_invoice":
        return "Duplicate Invoice";
      case "amount_mismatch":
        return "Amount Mismatch";
      case "vendor_name_mismatch":
        return "Vendor Typo";
      case "date_anomaly":
        return "Date Anomaly";
      case "quantity_mismatch":
        return "Quantity Mismatch";
      case "missing_evidence":
        return "Missing Evidence";
      default:
        return type;
    }
  };

  const getRecommendationLabel = (rec: Recommendation): string => {
    switch (rec) {
      case "approve":
        return "Approve";
      case "request_vendor_clarification":
        return "Clarify with vendor";
      case "escalate":
        return "Escalate";
      case "reject":
        return "Reject / Credit";
      default:
        return rec;
    }
  };

  const getStatusPill = (status: Status) => {
    switch (status) {
      case "awaiting_review":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#92400E] whitespace-nowrap">
            Awaiting review
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#CCFBF1] text-[#0D5C58] whitespace-nowrap">
            Accepted
          </span>
        );
      case "dismissed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 whitespace-nowrap">
            Overridden
          </span>
        );
      case "investigating":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 whitespace-nowrap">
            Investigating
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 whitespace-nowrap">
            {status}
          </span>
        );
    }
  };

  const renderSeverity = (sev: "low" | "medium" | "high" | null) => {
    if (!sev) return <span className="text-gray-400 text-xs">—</span>;
    const dotColor =
      sev === "high"
        ? "bg-[#DC2626]"
        : sev === "medium"
        ? "bg-[#D97706]"
        : "bg-[#9CA3AF]";
    const label = sev === "high" ? "High" : sev === "medium" ? "Med" : "Low";

    return (
      <span className="inline-flex items-center text-xs text-gray-700 font-medium">
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${dotColor}`} />
        {label}
      </span>
    );
  };

  const hasActiveFilters =
    selectedSeverity !== "all" ||
    selectedAnomalyType !== "all" ||
    searchQuery.trim().length > 0;

  const resetFilters = () => {
    onSelectSeverity("all");
    onSelectAnomalyType("all");
    setSearchQuery("");
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden flex flex-col">
      {/* Search and severity / anomaly filters on ONE compact row */}
      <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-[#FAFBFB] flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Compact search input */}
          <div className="relative w-64 max-w-xs">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice or vendor..."
              className="w-full pl-8 pr-7 py-1 text-xs bg-white border border-[#D1D5DB] rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0D5C58] focus:border-[#0D5C58]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Severity filter dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-gray-500 text-[11px]">Severity:</span>
            <select
              value={selectedSeverity}
              onChange={(e) => onSelectSeverity(e.target.value)}
              className="bg-white border border-[#D1D5DB] rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0D5C58]"
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Anomaly type filter dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-gray-500 text-[11px]">Anomaly:</span>
            <select
              value={selectedAnomalyType}
              onChange={(e) => onSelectAnomalyType(e.target.value)}
              className="bg-white border border-[#D1D5DB] rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#0D5C58]"
            >
              <option value="all">All</option>
              <option value="duplicate_invoice">Duplicate Invoice</option>
              <option value="amount_mismatch">Amount Mismatch</option>
              <option value="vendor_name_mismatch">Vendor Typo</option>
              <option value="date_anomaly">Date Anomaly</option>
              <option value="quantity_mismatch">Quantity Mismatch</option>
              <option value="missing_evidence">Missing Evidence</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-gray-500 hover:text-gray-900 font-medium shrink-0"
          >
            Reset
          </button>
        )}
      </div>

      {/* Table view: Exact widths 30%, 12%, 18%, 18%, 10%, 12% */}
      <div className="w-full">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-[#FAFBFB] border-b border-[#E5E7EB] text-[11px] font-semibold text-gray-500 select-none">
              <th className="py-2.5 px-4 w-[30%]">Invoice</th>
              <th className="py-2.5 px-4 w-[12%] text-right">Amount</th>
              <th className="py-2.5 px-4 w-[18%]">Anomaly</th>
              <th className="py-2.5 px-4 w-[18%]">Recommendation</th>
              <th className="py-2.5 px-4 w-[10%]">Severity</th>
              <th className="py-2.5 px-3 w-[12%]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB] text-xs">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse h-14 min-h-[56px] border-l-[3px] border-l-transparent">
                  <td className="py-3.5 px-4"><div className="h-4 bg-gray-200 rounded w-28 mb-1.5"></div><div className="h-3 bg-gray-100 rounded w-36"></div></td>
                  <td className="py-3.5 px-4"><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></td>
                  <td className="py-3.5 px-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                  <td className="py-3.5 px-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                  <td className="py-3.5 px-4"><div className="h-4 bg-gray-200 rounded w-12"></div></td>
                  <td className="py-3.5 px-3"><div className="h-5 bg-gray-200 rounded-full w-20"></div></td>
                </tr>
              ))
            ) : filteredCases.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <FileQuestion className="w-7 h-7 text-gray-400" />
                    <p className="font-medium text-gray-700">No matching exceptions</p>
                    <p className="text-xs text-gray-400">
                      Try adjusting your severity or anomaly filter.
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={resetFilters}
                        className="mt-1 text-xs text-[#0D5C58] hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredCases.map((item) => {
                const isUrgentReview = item.status === "awaiting_review" && item.severity === "high";

                return (
                  <tr
                    key={item.case_id}
                    onClick={() => {
                      window.location.hash = `#/case/${item.case_id}`;
                    }}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        window.location.hash = `#/case/${item.case_id}`;
                      }
                    }}
                    className={`hover:bg-[#E6F4F2]/50 cursor-pointer transition-colors group focus-visible:outline-none focus-visible:bg-[#F3F4F6] h-14 min-h-[56px] ${
                      isUrgentReview
                        ? "border-l-[3px] border-l-[#0D5C58]"
                        : "border-l-[3px] border-l-transparent"
                    }`}
                  >
                    {/* Column 1: Invoice (30%) - number in mono with vendor name beneath, one cell */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-mono font-medium text-gray-900 group-hover:text-[#0D5C58] transition-colors leading-tight truncate">
                          {item.invoice_number}
                        </span>
                        <span className="text-xs text-gray-500 truncate leading-tight mt-1">
                          {item.vendor_name}
                        </span>
                      </div>
                    </td>

                    {/* Column 2: Amount (12% right-aligned) */}
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-mono tabular-nums font-medium text-gray-900">
                        {formatCurrency(item.invoice_amount)}
                      </span>
                    </td>

                    {/* Column 3: Anomaly (18%) - neutral grey text tag, no colour fill */}
                    <td className="py-3.5 px-4">
                      <span className="text-xs text-gray-600 font-normal truncate block">
                        {getAnomalyLabel(item.anomaly_type)}
                      </span>
                    </td>

                    {/* Column 4: Recommendation (18%) - plain text, no colour */}
                    <td className="py-3.5 px-4">
                      <span className="text-xs text-gray-700 font-normal truncate block">
                        {getRecommendationLabel(item.recommendation)}
                      </span>
                    </td>

                    {/* Column 5: Severity (10%) - text label High / Med / Low with subtle dot */}
                    <td className="py-3.5 px-4">
                      {renderSeverity(item.severity)}
                    </td>

                    {/* Column 6: Status (12%) - small pill + chevron on the far right */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center justify-between gap-1">
                        {getStatusPill(item.status)}
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#0D5C58] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Thin bottom bar */}
      <div className="px-4 py-2 border-t border-[#E5E7EB] bg-[#FAFBFB] flex items-center justify-between text-[11px] text-gray-400">
        <span>
          {filteredCases.length} exception{filteredCases.length === 1 ? "" : "s"} shown
        </span>
        <span className="font-mono">Select row to investigate</span>
      </div>
    </div>
  );
};
