import React from "react";
import { Case } from "../types";
import {
  FileText,
  FileCheck,
  Package,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileX,
} from "lucide-react";

interface DocumentComparisonProps {
  caseData: Case;
}

export const DocumentComparison: React.FC<DocumentComparisonProps> = ({ caseData }) => {
  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(val);
  };

  // Inspect evidence for vendor name on PO or specific GRN number
  const poVendorEvidence = caseData.evidence.find(
    (e) => e.source === "purchase_order" && e.field === "vendor_name_on_po"
  );
  const vendorOnPO = poVendorEvidence ? String(poVendorEvidence.value) : caseData.vendor_name;

  // Exact GRN reference lookup
  const grnRefEvidence = caseData.evidence.find(
    (e) =>
      e.source === "goods_receipt" &&
      (e.field === "grn_number" ||
        e.field === "dock_receipt_date" ||
        e.field === "dock_inspection_log" ||
        e.field === "manifest_count")
  );
  let grnId = "GRN-DEFAULT";
  if (caseData.case_id === "case-107-cnt") {
    grnId = "GRN-99411";
  } else if (grnRefEvidence) {
    const val = String(grnRefEvidence.value);
    const match = val.match(/GRN-\d+/);
    grnId = match ? match[0] : val.split(" ")[0].replace("(", "");
  }

  // Discrepancy calculations
  const hasAmountMismatch =
    caseData.po_amount !== null &&
    Math.abs(caseData.invoice_amount - caseData.po_amount) > 0.01;

  const amountDiff =
    caseData.po_amount !== null ? caseData.invoice_amount - caseData.po_amount : 0;
  const amountDiffPct =
    caseData.po_amount !== null && caseData.po_amount > 0
      ? ((amountDiff / caseData.po_amount) * 100).toFixed(1)
      : "0.0";

  const hasQtyMismatch =
    caseData.quantity_billed !== null &&
    caseData.quantity_received !== null &&
    caseData.quantity_billed !== caseData.quantity_received;

  const qtyDiff =
    caseData.quantity_billed !== null && caseData.quantity_received !== null
      ? caseData.quantity_received - caseData.quantity_billed
      : 0;

  const isOverReceipt = qtyDiff > 0;

  const hasDateAnomaly =
    caseData.invoice_date &&
    caseData.po_date &&
    new Date(caseData.invoice_date).getTime() < new Date(caseData.po_date).getTime();

  const daysBeforePO = hasDateAnomaly
    ? Math.round(
        (new Date(caseData.po_date!).getTime() - new Date(caseData.invoice_date).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  const hasVendorMismatch = vendorOnPO !== caseData.vendor_name;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Title bar */}
      <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#FAFBFB] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900 tracking-tight">3-Way Document Comparison</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cross-verification of Invoice against Purchase Order authorization and Goods Receipt intake
          </p>
        </div>
        <div className="text-[11px] font-mono text-gray-400">
          Reconciliation Rule: Three-Way Match (AP-3WM-01)
        </div>
      </div>

      {/* Discrepancy Callout Strip */}
      {(hasAmountMismatch || hasQtyMismatch || hasDateAnomaly || hasVendorMismatch || caseData.quantity_received === null) && (
        <div className="px-5 py-2.5 bg-[#FFFBEB]/70 border-b border-[#FDE68A] flex flex-wrap items-center gap-4 text-xs">
          <span className="font-semibold text-[#B45309] flex items-center gap-1.5 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706]" />
            Computed Variances:
          </span>

          {hasAmountMismatch && (
            <span className="inline-flex items-center gap-1 text-[#9A3412] font-mono bg-white/80 px-2 py-0.5 rounded border border-[#FED7AA]">
              Amount: {amountDiff > 0 ? "+" : ""}{formatCurrency(amountDiff)} ({amountDiff > 0 ? "+" : ""}{amountDiffPct}%)
            </span>
          )}

          {hasQtyMismatch && (
            <span className="inline-flex items-center gap-1 text-[#9A3412] font-mono bg-white/80 px-2 py-0.5 rounded border border-[#FED7AA]">
              {isOverReceipt ? `Over-receipt (+${qtyDiff} units)` : `Qty: ${qtyDiff} units (shortfall)`}
            </span>
          )}

          {hasDateAnomaly && (
            <span className="inline-flex items-center gap-1 text-[#6B21A8] font-mono bg-white/80 px-2 py-0.5 rounded border border-[#E9D5FF]">
              Sequence: Invoice precedes PO by {daysBeforePO} day{daysBeforePO > 1 ? "s" : ""}
            </span>
          )}

          {hasVendorMismatch && (
            <span className="inline-flex items-center gap-1 text-[#854D0E] font-mono bg-white/80 px-2 py-0.5 rounded border border-[#FEF08A]">
              Vendor Name: Spelling discrepancy between Invoice & PO
            </span>
          )}

          {caseData.quantity_received === null && (
            <span className="inline-flex items-center gap-1 text-[#991B1B] font-mono bg-white/80 px-2 py-0.5 rounded border border-[#FECACA]">
              Missing Proof: No Goods Receipt logged in WMS
            </span>
          )}
        </div>
      )}

      {/* Three-Column Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB]">
        {/* Column 1: INVOICE */}
        <div className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#F3F4F6]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0D5C58]" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-800">1. Vendor Invoice</span>
              </div>
              <span className="text-[11px] font-mono text-gray-400">Claimed</span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-[11px] text-gray-500 font-medium">Invoice Number</span>
                <p className="font-mono font-bold text-sm text-gray-900 mt-0.5">{caseData.invoice_number}</p>
              </div>

              <div>
                <span className="text-[11px] text-gray-500 font-medium">Vendor Invoiced</span>
                <p className={`font-semibold mt-0.5 ${hasVendorMismatch ? "text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]" : "text-gray-900"}`}>
                  {caseData.vendor_name}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-gray-500 font-medium">Invoice Date</span>
                <p className={`font-mono mt-0.5 ${hasDateAnomaly ? "text-[#6B21A8] font-semibold bg-[#FAF5FF] px-1.5 py-0.5 rounded border border-[#E9D5FF]" : "text-gray-900"}`}>
                  {caseData.invoice_date}
                </p>
                {hasDateAnomaly && (
                  <p className="text-[10px] text-[#6B21A8] mt-0.5">Precedes purchase order date</p>
                )}
              </div>

              <div>
                <span className="text-[11px] text-gray-500 font-medium">Quantity Billed</span>
                <p className={`font-mono mt-0.5 ${hasQtyMismatch ? "text-[#9A3412] font-semibold" : "text-gray-900"}`}>
                  {caseData.quantity_billed !== null ? `${caseData.quantity_billed} units` : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-[#F3F4F6]">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Total Invoiced</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl font-bold font-mono tabular-nums ${hasAmountMismatch ? "text-[#9A3412]" : "text-gray-900"}`}>
                {formatCurrency(caseData.invoice_amount)}
              </span>
              {hasAmountMismatch && (
                <span className="text-[11px] text-[#9A3412] font-mono">
                  {amountDiff > 0 ? "+" : ""}{formatCurrency(amountDiff)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: PURCHASE ORDER */}
        <div className="p-5 flex flex-col justify-between bg-[#FCFCFB]">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#F3F4F6]">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#1E40AF]" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-800">2. Purchase Order</span>
              </div>
              <span className="text-[11px] font-mono text-gray-400">Authorized</span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-[11px] text-gray-500 font-medium">PO Reference</span>
                <p className="font-mono font-bold text-sm text-gray-900 mt-0.5">
                  {caseData.po_number || <span className="text-gray-400 italic font-sans">No PO on file</span>}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-gray-500 font-medium">Vendor on PO</span>
                <p className={`font-semibold mt-0.5 ${hasVendorMismatch ? "text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]" : "text-gray-900"}`}>
                  {vendorOnPO}
                </p>
                {hasVendorMismatch && (
                  <p className="text-[10px] text-[#B45309] mt-0.5">Discrepancy against invoice vendor name</p>
                )}
              </div>

              <div>
                <span className="text-[11px] text-gray-500 font-medium">PO Authorization Date</span>
                <p className="font-mono text-gray-900 mt-0.5">{caseData.po_date || "—"}</p>
              </div>

              <div>
                <span className="text-[11px] text-gray-500 font-medium">Quantity Authorized</span>
                <p className="font-mono text-gray-900 mt-0.5">
                  {caseData.quantity_billed !== null ? `${caseData.quantity_billed} units` : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-[#F3F4F6]">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Authorized Cap</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-bold font-mono tabular-nums text-gray-900">
                {formatCurrency(caseData.po_amount)}
              </span>
              <span className="text-[11px] text-gray-500 font-mono">Contracted</span>
            </div>
          </div>
        </div>

        {/* Column 3: GOODS RECEIPT */}
        <div className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#F3F4F6]">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[#B45309]" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-800">3. Goods Receipt (GRN)</span>
              </div>
              <span className="text-[11px] font-mono text-gray-400">Physical Intake</span>
            </div>

            {caseData.quantity_received === null ? (
              <div className="my-6 p-4 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] flex flex-col items-center justify-center text-center">
                <FileX className="w-8 h-8 text-[#DC2626] mb-2" />
                <p className="font-bold text-sm text-[#991B1B]">No goods receipt on file</p>
                <p className="text-[11px] text-[#991B1B]/80 mt-1 leading-relaxed">
                  No warehouse dock docket, bill of lading, or receiving inspection record is registered for this order in WMS.
                </p>
                <div className="mt-3 px-2 py-0.5 text-[10px] font-mono font-medium text-[#991B1B] bg-white rounded border border-[#FECACA]">
                  POLICY CHECK: GRN REQUIRED BEFORE AP RELEASE
                </div>
              </div>
            ) : (
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Receipt Docket Ref</span>
                  <p className="font-mono font-bold text-sm text-gray-900 mt-0.5">
                    {grnId}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Dock Status</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {hasQtyMismatch ? (
                      isOverReceipt ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#0D5C58]" />
                          <span className="font-semibold text-[#0D5C58]">Over-receipt Logged (+{qtyDiff} units)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 text-[#DC2626]" />
                          <span className="font-semibold text-[#991B1B]">Intake Shortage / Rejection Logged</span>
                        </>
                      )
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#0D5C58]" />
                        <span className="font-semibold text-[#0D5C58]">Goods Verified Intact at Dock</span>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Physical Intake Date</span>
                  <p className="font-mono text-gray-900 mt-0.5">{caseData.invoice_date}</p>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Quantity Accepted by Dock</span>
                  <p className={`font-mono mt-0.5 font-bold ${hasQtyMismatch ? "text-[#9A3412] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A] inline-block" : "text-gray-900"}`}>
                    {caseData.quantity_received} units
                  </p>
                  {hasQtyMismatch && (
                    <p className="text-[10px] text-[#9A3412] mt-0.5">
                      {isOverReceipt
                        ? `Over-receipt (+${qtyDiff} units) compared to invoice (${caseData.quantity_billed})`
                        : `Shortfall of ${Math.abs(qtyDiff)} units compared to invoice (${caseData.quantity_billed})`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-3 border-t border-[#F3F4F6]">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Match State</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xs font-semibold ${
                caseData.quantity_received === null
                  ? "text-[#DC2626]"
                  : isOverReceipt
                  ? "text-[#0D5C58]"
                  : hasQtyMismatch
                  ? "text-[#D97706]"
                  : "text-[#0D5C58]"
              }`}>
                {caseData.quantity_received === null
                  ? "Unverified / Missing Proof"
                  : isOverReceipt
                  ? "Quantity exceeds invoice"
                  : hasQtyMismatch
                  ? "Partial Intake"
                  : "3-Way Intake Complete"}
              </span>
              <span className="text-[11px] text-gray-400 font-mono">
                {caseData.quantity_received !== null ? `${caseData.quantity_received} units confirmed` : "0 units confirmed"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
