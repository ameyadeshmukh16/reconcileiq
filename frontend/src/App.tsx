import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { ToastProvider } from "./components/Toast";
import { DashboardPage } from "./pages/DashboardPage";
import { CaseDetailPage } from "./pages/CaseDetailPage";
import { RunSummary } from "./types";

export default function App() {
  const [currentHash, setCurrentHash] = useState<string>(() => window.location.hash || "#/");
  const [latestSummary, setLatestSummary] = useState<RunSummary | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || "#/");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Parse hash route: '#/' or '#/case/<case_id>'
  let pageContent = <DashboardPage latestSummary={latestSummary} onRunUpdated={setLatestSummary} />;

  if (currentHash.startsWith("#/case/")) {
    const caseId = currentHash.replace("#/case/", "").trim();
    if (caseId) {
      pageContent = <CaseDetailPage caseId={caseId} />;
    }
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F8F8F6] text-[#14181B] flex flex-col antialiased selection:bg-[#0D5C58]/15 selection:text-[#0D5C58]">
        {/* Navigation header */}
        <Header
          currentPath={currentHash}
          onRunTriggered={(summary) => {
            setLatestSummary(summary);
          }}
        />

        {/* Main Workspace Viewport */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {pageContent}
        </main>

        {/* Minimal quiet footer */}
        <footer className="border-t border-[#E5E7EB] bg-[#FFFFFF] py-3 text-xs text-gray-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-[11px] text-gray-400">
            <span className="font-medium text-gray-600">ReconcileIQ</span>
            <span>Agent recommends, humans decide</span>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}
