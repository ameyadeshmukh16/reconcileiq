import React from "react";
import { RunSummary } from "../types";

export type StatTileFilter = "all" | "awaiting_review" | "high_severity" | "approved" | "dismissed";

interface RunSummaryStripProps {
  summary: RunSummary | null;
  loading: boolean;
  activeFilter: StatTileFilter;
  onSelectFilter: (filter: StatTileFilter) => void;
}

export const RunSummaryStrip: React.FC<RunSummaryStripProps> = ({
  summary,
  loading,
  activeFilter,
  onSelectFilter,
}) => {
  if (loading) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-3 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="h-12 bg-gray-100 rounded"></div>
          <div className="h-12 bg-gray-100 rounded"></div>
          <div className="h-12 bg-gray-100 rounded"></div>
          <div className="h-12 bg-gray-100 rounded"></div>
          <div className="h-12 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const awaitingReview = summary.by_status?.awaiting_review ?? 0;
  const approved = summary.by_status?.approved ?? 0;
  const dismissed = summary.by_status?.dismissed ?? 0;
  const highSeverity = summary.by_severity?.high ?? 0;

  const formattedDate = summary.started_at
    ? new Date(summary.started_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const tiles: { key: StatTileFilter; label: string; count: number; isPrimary?: boolean }[] = [
    { key: "awaiting_review", label: "Awaiting Review", count: awaitingReview, isPrimary: true },
    { key: "all", label: "Total Cases", count: summary.total_cases },
    { key: "high_severity", label: "High Severity", count: highSeverity },
    { key: "approved", label: "Approved", count: approved },
    { key: "dismissed", label: "Dismissed", count: dismissed },
  ];

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
      {/* Top micro-bar: run id and time as small muted text on the right (no SUMMARY METRICS label) */}
      <div className="px-4 py-1.5 border-b border-[#E5E7EB] bg-[#FAFBFB] flex items-center justify-end text-xs">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-gray-400">
          <span>{summary.run_id}</span>
          <span>·</span>
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* 5 Stat tiles with identical height and aligned baselines */}
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E7EB]">
        {tiles.map((tile) => {
          const isActive = activeFilter === tile.key;

          if (tile.isPrimary) {
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() => onSelectFilter(tile.key)}
                className={`h-[68px] flex flex-col justify-between p-3 text-left transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0D5C58] ${
                  isActive
                    ? "bg-[#E6F4F2] border-b-2 border-b-[#0D5C58]"
                    : "bg-[#E6F4F2]/40 hover:bg-[#E6F4F2]/70"
                }`}
              >
                <div className="flex items-baseline justify-between leading-none">
                  <span className="text-2xl font-bold font-mono tabular-nums leading-none text-[#0D5C58]">
                    {tile.count}
                  </span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D5C58]" title="Active filter" />
                  )}
                </div>
                <span className="text-xs font-semibold text-[#0D5C58] block truncate leading-none">
                  {tile.label}
                </span>
              </button>
            );
          }

          // Other tiles stay neutral
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onSelectFilter(tile.key)}
              className={`h-[68px] flex flex-col justify-between p-3 text-left transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0D5C58] ${
                isActive
                  ? "bg-[#EFEFEF] text-gray-900 border-b-2 border-b-gray-400"
                  : "bg-white hover:bg-[#F9FAFB] text-gray-800"
              }`}
            >
              <div className="flex items-baseline justify-between leading-none">
                <span className="text-xl font-bold font-mono tabular-nums leading-none text-gray-900">
                  {tile.count}
                </span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-600" title="Active filter" />
                )}
              </div>
              <span className="text-xs text-gray-500 block truncate leading-none font-medium">
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
