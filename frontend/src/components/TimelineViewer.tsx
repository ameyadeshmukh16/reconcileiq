import React, { useState } from "react";
import { TimelineEvent } from "../types";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Bot,
  User,
  Sliders,
} from "lucide-react";

interface TimelineViewerProps {
  timeline: TimelineEvent[];
}

export const TimelineViewer: React.FC<TimelineViewerProps> = ({ timeline }) => {
  // Collapsed by default as requested
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});

  const toggleExpand = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const getActorLabel = (actor: TimelineEvent["actor"]) => {
    switch (actor) {
      case "agent":
        return "Agent";
      case "human":
        return "Human";
      case "rule_engine":
        return "Rule engine";
    }
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Collapsible Header toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3 bg-[#FAFBFB] hover:bg-gray-50 flex items-center justify-between text-xs transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0D5C58]"
      >
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          <span>
            {isOpen ? "Hide investigation timeline" : `Show investigation timeline (${timeline.length} events)`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 font-mono text-[11px]">
          <span>{isOpen ? "Collapse" : "Expand"}</span>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded: One compact line per event with expandable JSON detail */}
      {isOpen && (
        <div className="p-4 border-t border-[#E5E7EB] divide-y divide-[#F3F4F6] text-xs">
          {timeline.map((evt, idx) => {
            const isDetailOpen = !!expandedIndices[idx];
            const hasDetail = evt.detail !== undefined && evt.detail !== null;
            const timeStr = new Date(evt.ts).toLocaleTimeString("en-US", {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            return (
              <div key={idx} className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
                {/* One compact line per event */}
                <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-[11px] text-gray-400 shrink-0">
                      {timeStr}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium font-mono bg-gray-100 text-gray-600 border border-gray-200 shrink-0">
                      {getActorLabel(evt.actor)}
                    </span>
                    <span className="text-gray-800 truncate">
                      {evt.summary}
                    </span>
                  </div>

                  {hasDetail && (
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(idx, e)}
                      className="text-[11px] font-mono text-[#0D5C58] hover:underline shrink-0 flex items-center gap-0.5"
                    >
                      <span>{isDetailOpen ? "hide payload" : "view payload"}</span>
                      {isDetailOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  )}
                </div>

                {/* Expandable JSON detail */}
                {hasDetail && isDetailOpen && (
                  <pre className="p-3 bg-[#1F2428] text-[#F3F4F6] rounded text-[11px] font-mono overflow-x-auto leading-relaxed border border-[#374151] mt-1">
                    {JSON.stringify(evt.detail, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
