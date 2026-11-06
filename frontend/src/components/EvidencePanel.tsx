import React from "react";
import { Evidence } from "../types";
import { FileText, FileCheck, Package, Layers } from "lucide-react";

interface EvidencePanelProps {
  evidenceList: Evidence[];
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ evidenceList }) => {
  // Group evidence by source
  const grouped = evidenceList.reduce((acc, item) => {
    if (!acc[item.source]) acc[item.source] = [];
    acc[item.source].push(item);
    return acc;
  }, {} as Record<string, Evidence[]>);

  const getSourceMeta = (source: string) => {
    switch (source) {
      case "invoice":
        return {
          title: "Invoice Documentation",
          icon: <FileText className="w-3.5 h-3.5 text-[#0D5C58]" />,
          border: "border-l-2 border-l-[#0D5C58]",
        };
      case "purchase_order":
        return {
          title: "Purchase Order Records",
          icon: <FileCheck className="w-3.5 h-3.5 text-[#1E40AF]" />,
          border: "border-l-2 border-l-[#1E40AF]",
        };
      case "goods_receipt":
        return {
          title: "Goods Receipt & Warehouse Manifest",
          icon: <Package className="w-3.5 h-3.5 text-[#B45309]" />,
          border: "border-l-2 border-l-[#B45309]",
        };
      default:
        return {
          title: source,
          icon: <Layers className="w-3.5 h-3.5 text-gray-500" />,
          border: "border-l-2 border-l-gray-400",
        };
    }
  };

  const renderValue = (val: any) => {
    if (val === null || val === undefined) {
      return <span className="text-gray-400 italic">null / absent</span>;
    }
    if (typeof val === "object") {
      if (Array.isArray(val)) {
        return (
          <div className="space-y-1">
            {val.map((item, idx) => (
              <div
                key={idx}
                className="text-[11px] font-mono bg-white p-1.5 rounded border border-[#E5E7EB] text-gray-800"
              >
                {typeof item === "object" ? JSON.stringify(item) : String(item)}
              </div>
            ))}
          </div>
        );
      }
      return (
        <pre className="text-[11px] font-mono bg-white p-2 rounded border border-[#E5E7EB] text-gray-800 overflow-x-auto">
          {JSON.stringify(val, null, 2)}
        </pre>
      );
    }
    return (
      <span className="font-mono text-gray-800 text-xs break-words">{String(val)}</span>
    );
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#FAFBFB] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-gray-600" />
          <h2 className="text-sm font-bold text-gray-900 tracking-tight">Audit Evidence Trail</h2>
        </div>
        <span className="text-xs text-gray-500 font-mono">
          {evidenceList.length} evidentiary facts compiled
        </span>
      </div>

      <div className="p-5 space-y-6">
        {Object.entries(grouped).map(([source, items]) => {
          const meta = getSourceMeta(source);
          return (
            <div key={source} className="border border-[#E5E7EB] rounded-md overflow-hidden bg-[#FAFBFB]">
              <div className="px-3.5 py-2 border-b border-[#E5E7EB] bg-white flex items-center gap-2">
                {meta.icon}
                <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  {meta.title}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-[11px] text-gray-500 font-mono">
                  {items.length} field{items.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="divide-y divide-[#E5E7EB]">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2 items-start text-xs">
                    <div className="md:col-span-1">
                      <span className="font-mono text-[11px] font-medium text-gray-600 block">
                        {item.field}
                      </span>
                    </div>
                    <div className="md:col-span-2">
                      {renderValue(item.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
