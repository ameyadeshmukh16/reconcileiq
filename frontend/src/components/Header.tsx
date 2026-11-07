import React, { useState, useEffect, useRef } from "react";
import { Play, Loader2 } from "lucide-react";
import { startReconciliationRun } from "../api";
import { useToast } from "./Toast";
import { RunSummary } from "../types";

interface HeaderProps {
  onRunTriggered: (summary: RunSummary) => void;
  currentPath?: string;
  running?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRunTriggered, currentPath, running = false }) => {
  const [isRunning, setIsRunning] = useState(false);
  const { addToast } = useToast();
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      addToast("All flagged invoices investigated; cases are awaiting human review", "success", "Investigation Complete");
    }
    wasRunning.current = running;
  }, [running, addToast]);

  const isCasePage = currentPath?.startsWith("#/case/");

  const handleRunReconciliation = async () => {
    if (isRunning) return;
    setIsRunning(true);
    addToast("Initiating AP reconciliation pipeline...", "info", "Pipeline Started");
    try {
      const summary = await startReconciliationRun();
      setIsRunning(false);
      addToast(
        `Rules checked: ${summary.total_cases} cases. ${summary.in_progress ? "Agent investigation running in the background." : "Nothing new to investigate."}`,
        "info",
        "Reconciliation Started"
      );
      onRunTriggered(summary);
    } catch (err: any) {
      setIsRunning(false);
      addToast(err.message || "Failed to execute pipeline run", "error", "Execution Failure");
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF] border-b border-[#E5E7EB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Only Logo and Product Name */}
        <a
          href="#/"
          className="flex items-center gap-2.5 group text-decoration-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D5C58]"
          title="ReconcileIQ"
        >
          <div className="w-6 h-6 rounded bg-[#0D5C58] flex items-center justify-center text-white font-bold text-xs tracking-wider">
            IQ
          </div>
          <span className="text-base font-bold tracking-tight text-[#111827] group-hover:text-[#0D5C58] transition-colors whitespace-nowrap">
            ReconcileIQ
          </span>
        </a>

        {/* "Run reconciliation" button shown only on dashboard, removed from case page */}
        {!isCasePage ? (
          <button
            onClick={handleRunReconciliation}
            disabled={isRunning || running}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-[#0D5C58] hover:bg-[#0A4D48] active:bg-[#083D39] disabled:opacity-70 disabled:cursor-not-allowed rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D5C58]"
          >
            {isRunning || running ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{running ? "Investigating..." : "Running..."}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run reconciliation</span>
              </>
            )}
          </button>
        ) : null}
      </div>
    </header>
  );
};
