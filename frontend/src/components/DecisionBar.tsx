import React, { useState } from "react";
import { Case } from "../types";
import { CheckCircle2, XCircle, ShieldCheck, AlertCircle, Loader2, Lock } from "lucide-react";
import { resolveCase } from "../api";
import { useToast } from "./Toast";

interface DecisionBarProps {
  caseData: Case;
  onCaseResolved: (updatedCase: Case) => void;
}

export const DecisionBar: React.FC<DecisionBarProps> = ({ caseData, onCaseResolved }) => {
  const [actorName, setActorName] = useState("");
  const [reason, setReason] = useState("");
  const [isReasonFocused, setIsReasonFocused] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  const isAwaitingReview = caseData.status === "awaiting_review";

  const handleDecision = async (decision: "approved" | "dismissed") => {
    setErrorMsg("");
    if (!actorName.trim()) {
      setErrorMsg("Your name is required.");
      return;
    }
    if (!reason.trim()) {
      setErrorMsg("Justification reason is required.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await resolveCase(caseData.case_id, {
        decision,
        reason: reason.trim(),
        actor: actorName.trim(),
      });
      setSubmitting(false);
      addToast(
        decision === "approved"
          ? `Recommendation accepted for ${caseData.invoice_number}.`
          : `Case ${caseData.invoice_number} dismissed.`,
        "success",
        "Decision Recorded"
      );
      onCaseResolved(updated);
    } catch (err: any) {
      setSubmitting(false);
      addToast(err.message || "Failed to record decision", "error", "Error");
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#FFFFFF] border-t border-[#D1D5DB] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] h-16 min-h-[64px] max-h-16 flex items-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-3 text-xs">
        {/* Read-Only State (Already resolved) */}
        {!isAwaitingReview ? (
          <div className="flex items-center justify-between w-full gap-3">
            <div className="flex items-center gap-2 text-xs truncate">
              {caseData.status === "approved" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-[#0D5C58] bg-[#CCFBF1] shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-[#0D5C58]" />
                  Recommendation Accepted
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-gray-700 bg-gray-200 shrink-0">
                  <XCircle className="w-3 h-3 text-gray-600" />
                  Case Dismissed
                </span>
              )}
              <span className="text-gray-400">·</span>
              <span className="font-semibold text-gray-800 shrink-0">{caseData.resolved_by || "Auditor"}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500 italic truncate max-w-md">"{caseData.resolution_reason}"</span>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 text-[11px] text-gray-400 font-mono">
              <Lock className="w-3 h-3" />
              <span>Resolved {caseData.resolved_at ? new Date(caseData.resolved_at).toLocaleDateString() : ""}</span>
            </div>
          </div>
        ) : (
          /* Active Review Form - Single slim row */
          <div className="flex items-center justify-between w-full gap-3">
            {/* Left: Governance note as short label */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
              <ShieldCheck className="w-4 h-4 text-[#0D5C58]" />
              <span className="font-medium">Every agent case requires human approval</span>
            </div>

            {/* Middle inputs: Actor name (small) + One-line reason that expands upward when focused */}
            <div className="flex items-center gap-2 flex-1 max-w-xl min-w-0">
              <input
                type="text"
                value={actorName}
                onChange={(e) => {
                  setActorName(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                placeholder="Your name"
                className={`w-32 sm:w-36 px-2.5 py-1.5 text-xs bg-white border rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#0D5C58] shrink-0 ${
                  errorMsg && !actorName ? "border-red-500" : "border-[#D1D5DB]"
                }`}
              />

              {/* One-line reason input with upward expanding popover */}
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  onFocus={() => setIsReasonFocused(true)}
                  placeholder="Decision rationale (required)..."
                  className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded text-gray-900 truncate focus:outline-none focus:ring-1 focus:ring-[#0D5C58] ${
                    errorMsg && !reason ? "border-red-500" : "border-[#D1D5DB]"
                  }`}
                />

                {/* Upward expanding textarea when focused */}
                {isReasonFocused && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-[#D1D5DB] rounded-md shadow-lg p-3 z-50 animate-in fade-in slide-in-from-bottom-2"
                  >
                    <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1.5 font-medium">
                      <span>Audit Justification Note</span>
                      <button
                        type="button"
                        onClick={() => setIsReasonFocused(false)}
                        className="text-xs text-[#0D5C58] hover:underline font-semibold"
                      >
                        Done
                      </button>
                    </div>
                    <textarea
                      autoFocus
                      rows={3}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        if (errorMsg) setErrorMsg("");
                      }}
                      placeholder="Detail contractual terms, verification docket, or variance justification..."
                      className="w-full p-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#0D5C58]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Error badge if validation fails */}
            {errorMsg && (
              <span className="hidden lg:inline text-[11px] text-red-600 shrink-0 font-medium">
                {errorMsg}
              </span>
            )}

            {/* Right: The two buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDecision("dismissed")}
                disabled={submitting}
                className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Dismiss case</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleDecision("approved")}
                disabled={submitting}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0D5C58] hover:bg-[#0A4D48] active:bg-[#083D39] rounded transition-colors disabled:opacity-50 whitespace-nowrap shadow-2xs"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Accept recommendation</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
