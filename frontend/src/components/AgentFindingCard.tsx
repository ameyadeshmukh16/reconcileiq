import React, { useState } from "react";
import { Recommendation } from "../types";
import { Bot, Copy, Check, Cpu } from "lucide-react";
import { useToast } from "./Toast";

interface AgentFindingCardProps {
  finding: string;
  findingFacts?: string[];
  findingInterpretation?: string;
  confidence: "low" | "medium" | "high";
  recommendation: Recommendation;
  recommendationRationale?: string;
  investigationProvider: "vultr" | "openrouter" | "none";
  investigationModel: string | null;
  detectionMethod: "rule_engine" | "agent_investigation";
  suggestedAction: string;
}

export const AgentFindingCard: React.FC<AgentFindingCardProps> = ({
  finding,
  findingFacts,
  findingInterpretation,
  confidence,
  recommendation,
  recommendationRationale,
  investigationProvider,
  investigationModel,
  detectionMethod,
  suggestedAction,
}) => {
  const [copied, setCopied] = useState(false);
  const { addToast } = useToast();

  const handleCopyAction = () => {
    navigator.clipboard.writeText(suggestedAction);
    setCopied(true);
    addToast("Suggested action draft copied to clipboard.", "info");
    setTimeout(() => setCopied(false), 2000);
  };

  const providerModelTag =
    investigationProvider === "none"
      ? "Rule engine"
      : `${investigationProvider} / ${investigationModel || "default"}`;

  const getRecommendationBadge = () => {
    switch (recommendation) {
      case "approve":
        return {
          title: "RECOMMENDS APPROVAL",
          color: "text-[#0D5C58] bg-[#E6F4F2] border-[#99F6E4]",
        };
      case "request_vendor_clarification":
        return {
          title: "RECOMMENDS VENDOR CLARIFICATION",
          color: "text-[#B45309] bg-[#FFFBEB] border-[#FDE68A]",
        };
      case "escalate":
        return {
          title: "RECOMMENDS ESCALATION",
          color: "text-[#991B1B] bg-[#FEF2F2] border-[#FECACA]",
        };
      case "reject":
        return {
          title: "RECOMMENDS REJECTION",
          color: "text-[#DC2626] bg-[#FEF2F2] border-[#FCA5A5]",
        };
    }
  };

  const recMeta = getRecommendationBadge();

  // Parse facts and interpretation if not supplied as arrays
  const parsedFacts =
    findingFacts ||
    (finding.includes("VERIFIED FACTS:")
      ? finding
          .split("INTERPRETATION:")[0]
          .replace("VERIFIED FACTS:", "")
          .trim()
          .split("\n")
          .filter((line) => line.trim().startsWith("•"))
          .map((line) => line.replace(/^•\s*/, ""))
      : [finding]);

  const parsedInterpretation =
    findingInterpretation ||
    (finding.includes("INTERPRETATION:")
      ? finding.split("INTERPRETATION:")[1].trim()
      : finding);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Top bar */}
      <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#FAFBFB] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#0D5C58]" />
          <h2 className="text-sm font-bold text-gray-900 tracking-tight">AI Agent Investigation Details</h2>
        </div>

        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-gray-500" />
          <span>{providerModelTag}</span>
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Recommendation & Specific Case Rationale */}
        <div className="p-4 rounded-md border border-[#E5E7EB] bg-[#FCFCFB] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
              Agent Recommendation
            </span>
            <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold border ${recMeta.color}`}>
              {recMeta.title}
            </div>
          </div>
          {/* One-sentence rationale specific to the case */}
          <p className="text-xs text-gray-700 leading-relaxed font-medium">
            {recommendationRationale || "Recommended resolution determined from document verification and AP policy."}
          </p>
        </div>

        {/* Restructured Finding: Verified facts */}
        <div>
          <span className="text-[11px] uppercase font-bold text-gray-700 tracking-wider block mb-2">
            Verified Facts
          </span>
          <div className="p-3.5 bg-[#FAFBFB] rounded-md border border-[#E5E7EB] space-y-1.5 text-xs text-gray-800">
            {parsedFacts.map((fact, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-[#0D5C58] font-bold text-sm leading-none mt-0.5">•</span>
                <span className="leading-relaxed">{fact}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Restructured Finding: Interpretation (Explicitly hedged, no fraud alleged) */}
        <div>
          <span className="text-[11px] uppercase font-bold text-gray-700 tracking-wider block mb-1.5">
            Interpretation
          </span>
          <div className="p-3.5 bg-white rounded-md border border-[#E5E7EB] text-xs text-gray-800 leading-relaxed italic">
            {parsedInterpretation}
          </div>
        </div>

        {/* Drafted Suggested Action Block */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase font-semibold text-gray-500 tracking-wider">
                Drafted Suggested Action
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-[11px] text-gray-400">
                Drafted only. Not sent.
              </span>
            </div>

            <button
              onClick={handleCopyAction}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded shadow-2xs transition-colors"
              title="Copy text of drafted action"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#0D5C58]" />
                  <span className="text-[#0D5C58] font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gray-500" />
                  <span>Copy draft</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-3 bg-[#FFFFFF] border border-[#D1D5DB] rounded-md text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto selection:bg-[#0D5C58]/20">
            {suggestedAction}
          </pre>
        </div>
      </div>
    </div>
  );
};
