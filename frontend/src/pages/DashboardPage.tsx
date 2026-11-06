import React, { useState, useEffect, useCallback } from "react";
import { Case, RunSummary } from "../types";
import { getCases, getRunSummary, INITIAL_RUN_ID } from "../api";
import { RunSummaryStrip, StatTileFilter } from "../components/RunSummaryStrip";
import { CaseTable } from "../components/CaseTable";
import { AlertTriangle } from "lucide-react";

interface DashboardPageProps {
  latestSummary: RunSummary | null;
  onRunUpdated: (summary: RunSummary) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  latestSummary,
  onRunUpdated,
}) => {
  const [cases, setCases] = useState<Case[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(latestSummary);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(!latestSummary);
  const [error, setError] = useState<string | null>(null);

  // Active filter driven by clicking stat tiles or table controls (default: awaiting_review)
  const [activeTile, setActiveTile] = useState<StatTileFilter>("awaiting_review");
  const [statusFilter, setStatusFilter] = useState("awaiting_review");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [anomalyFilter, setAnomalyFilter] = useState("all");

  const loadData = useCallback(async () => {
    setError(null);
    setLoadingCases(true);
    try {
      const casesData = await getCases({
        status: statusFilter,
        severity: severityFilter,
        anomaly_type: anomalyFilter,
      });
      setCases(casesData);

      if (!latestSummary) {
        setLoadingSummary(true);
        const summaryData = await getRunSummary(INITIAL_RUN_ID);
        setSummary(summaryData);
        onRunUpdated(summaryData);
        setLoadingSummary(false);
      } else {
        setSummary(latestSummary);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load accounts payable exceptions");
    } finally {
      setLoadingCases(false);
      setLoadingSummary(false);
    }
  }, [statusFilter, severityFilter, anomalyFilter, latestSummary, onRunUpdated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (latestSummary) {
      setSummary(latestSummary);
      loadData();
    }
  }, [latestSummary]);

  // Handle tile clicks: filters table and highlights active tile
  const handleSelectTile = (tile: StatTileFilter) => {
    setActiveTile(tile);
    switch (tile) {
      case "all":
        setStatusFilter("all");
        setSeverityFilter("all");
        break;
      case "awaiting_review":
        setStatusFilter("awaiting_review");
        setSeverityFilter("all");
        break;
      case "high_severity":
        setStatusFilter("all");
        setSeverityFilter("high");
        break;
      case "approved":
        setStatusFilter("approved");
        setSeverityFilter("all");
        break;
      case "dismissed":
        setStatusFilter("dismissed");
        setSeverityFilter("all");
        break;
    }
  };

  const handleSeverityChange = (sev: string) => {
    setSeverityFilter(sev);
    if (sev === "high" && statusFilter === "all") {
      setActiveTile("high_severity");
    } else if (sev === "all" && statusFilter === "all") {
      setActiveTile("all");
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Error notification if any */}
      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-md text-xs text-[#991B1B] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="underline font-semibold hover:text-[#7F1D1D] text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Shorter Stat Tiles with run info on right */}
      <RunSummaryStrip
        summary={summary}
        loading={loadingSummary}
        activeFilter={activeTile}
        onSelectFilter={handleSelectTile}
      />

      {/* Simplified Case Table with compact single-row filters */}
      <CaseTable
        cases={cases}
        loading={loadingCases}
        selectedSeverity={severityFilter}
        onSelectSeverity={handleSeverityChange}
        selectedAnomalyType={anomalyFilter}
        onSelectAnomalyType={setAnomalyFilter}
      />
    </div>
  );
};
