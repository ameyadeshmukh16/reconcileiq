import {
  Case,
  CaseDetailResponse,
  RunSummary,
  TimelineEvent,
  Status,
  Severity,
  AnomalyType,
} from "./types";
import {
  INITIAL_RUN_SUMMARY,
  INITIAL_RUN_ID,
  MOCK_CASES,
  MOCK_TIMELINES,
} from "./mockData";

export { INITIAL_RUN_ID, INITIAL_RUN_SUMMARY };

// Tech constraint: A single api.ts module with a USE_MOCKS constant (default true).
// When true, return the mock data with a ~300ms delay. When false, call the real endpoints.
// The component code must not change when flipping the flag.
export const USE_MOCKS = true;

// Toast callback for 401 authentication required notification
type AuthToastCallback = (message: string) => void;
let authToastHandler: AuthToastCallback | null = null;

export function registerAuthToastHandler(callback: AuthToastCallback) {
  authToastHandler = callback;
}

function notifyAuthRequired() {
  if (authToastHandler) {
    authToastHandler("Authentication required");
  } else {
    console.warn("Authentication required (HTTP 401)");
  }
}

// In-memory / LocalStorage cache for mock data persistence so reviews persist
const STORAGE_KEY_CASES = "reconcileiq_cases_v2";
const STORAGE_KEY_RUN = "reconcileiq_run_summary_v2";
const STORAGE_KEY_TIMELINES = "reconcileiq_timelines_v2";

function loadMockCases(): Case[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CASES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read cached cases", e);
  }
  return [...MOCK_CASES];
}

function saveMockCases(cases: Case[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(cases));
  } catch (e) {
    console.error("Failed to save cases to local cache", e);
  }
}

function loadMockRunSummary(): RunSummary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RUN);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read cached run summary", e);
  }
  return { ...INITIAL_RUN_SUMMARY };
}

function saveMockRunSummary(summary: RunSummary) {
  try {
    localStorage.setItem(STORAGE_KEY_RUN, JSON.stringify(summary));
  } catch (e) {
    console.error("Failed to save run summary to local cache", e);
  }
}

function loadMockTimelines(): Record<string, TimelineEvent[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TIMELINES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read cached timelines", e);
  }
  return JSON.parse(JSON.stringify(MOCK_TIMELINES));
}

function saveMockTimelines(timelines: Record<string, TimelineEvent[]>) {
  try {
    localStorage.setItem(STORAGE_KEY_TIMELINES, JSON.stringify(timelines));
  } catch (e) {
    console.error("Failed to save timelines to local cache", e);
  }
}

export function resetMockData() {
  localStorage.removeItem(STORAGE_KEY_CASES);
  localStorage.removeItem(STORAGE_KEY_RUN);
  localStorage.removeItem(STORAGE_KEY_TIMELINES);
}

// Helper for ~300ms simulated network latency
const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

// Custom fetch wrapper with HTTP 401 Basic Auth handling and single retry
async function fetchWithAuthRetry(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let response = await fetch(url, options);

  if (response.status === 401) {
    notifyAuthRequired();
    // Retry once (native browser auth may supply credentials on second try)
    response = await fetch(url, options);
  }

  return response;
}

/**
 * POST /api/runs -> RunSummary (starts a pipeline run)
 */
export async function startReconciliationRun(): Promise<RunSummary> {
  if (USE_MOCKS) {
    await delay(600);
    const cases = loadMockCases();
    const newRunId = `run-${new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 12)}`;
    
    // Recalculate tallies
    const by_status: Record<string, number> = {};
    const by_severity: Record<string, number> = {};

    cases.forEach((c) => {
      by_status[c.status] = (by_status[c.status] || 0) + 1;
      if (c.severity) {
        by_severity[c.severity] = (by_severity[c.severity] || 0) + 1;
      }
    });

    const summary: RunSummary = {
      run_id: newRunId,
      started_at: new Date().toISOString(),
      total_cases: cases.length,
      by_status,
      by_severity,
    };

    saveMockRunSummary(summary);
    return summary;
  }

  const res = await fetchWithAuthRetry("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to start run: ${res.statusText}`);
  }
  return res.json();
}

/**
 * GET /api/runs/{run_id} -> RunSummary
 */
export async function getRunSummary(runId: string): Promise<RunSummary> {
  if (USE_MOCKS) {
    await delay(250);
    const summary = loadMockRunSummary();
    if (summary.run_id === runId) {
      return summary;
    }
    return { ...summary, run_id: runId };
  }

  const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch run summary: ${res.statusText}`);
  }
  return res.json();
}

/**
 * GET /api/cases?status=&severity=&anomaly_type= -> Case[]
 */
export async function getCases(filters?: {
  status?: string;
  severity?: string;
  anomaly_type?: string;
}): Promise<Case[]> {
  if (USE_MOCKS) {
    await delay(300);
    let cases = loadMockCases();

    if (filters) {
      if (filters.status && filters.status !== "all") {
        cases = cases.filter((c) => c.status === filters.status);
      }
      if (filters.severity && filters.severity !== "all") {
        cases = cases.filter((c) => c.severity === filters.severity);
      }
      if (filters.anomaly_type && filters.anomaly_type !== "all") {
        cases = cases.filter((c) => c.anomaly_type === filters.anomaly_type);
      }
    }

    // Default sort: awaiting_review first, then severity (high > medium > low), then date
    const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    cases.sort((a, b) => {
      if (a.status === "awaiting_review" && b.status !== "awaiting_review") return -1;
      if (b.status === "awaiting_review" && a.status !== "awaiting_review") return 1;

      const aSev = a.severity ? severityRank[a.severity] || 0 : 0;
      const bSev = b.severity ? severityRank[b.severity] || 0 : 0;
      if (bSev !== aSev) return bSev - aSev;

      return new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime();
    });

    return cases;
  }

  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.severity && filters.severity !== "all") params.set("severity", filters.severity);
  if (filters?.anomaly_type && filters.anomaly_type !== "all")
    params.set("anomaly_type", filters.anomaly_type);

  const url = `/api/cases${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch cases: ${res.statusText}`);
  }
  return res.json();
}

/**
 * GET /api/cases/{case_id} -> { case: Case, timeline: TimelineEvent[] }
 */
export async function getCaseDetail(caseId: string): Promise<CaseDetailResponse> {
  if (USE_MOCKS) {
    await delay(300);
    const cases = loadMockCases();
    const found = cases.find((c) => c.case_id === caseId);
    if (!found) {
      throw new Error(`Case not found: ${caseId}`);
    }
    const timelines = loadMockTimelines();
    const timeline = timelines[caseId] || [
      {
        ts: found.flagged_at,
        actor: found.detection_method,
        type: "rule_check",
        summary: `Anomaly flagged: ${found.anomaly_type}`,
        detail: { invoice: found.invoice_number, amount: found.invoice_amount },
      },
    ];

    return {
      case: found,
      timeline,
    };
  }

  const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch case detail: ${res.statusText}`);
  }
  return res.json();
}

/**
 * PATCH /api/cases/{case_id} body { decision: "approved"|"dismissed", reason: string, actor: string } -> Case
 */
export async function resolveCase(
  caseId: string,
  payload: { decision: "approved" | "dismissed"; reason: string; actor: string }
): Promise<Case> {
  if (USE_MOCKS) {
    await delay(350);
    const cases = loadMockCases();
    const index = cases.findIndex((c) => c.case_id === caseId);
    if (index === -1) {
      throw new Error(`Case ${caseId} not found`);
    }

    const now = new Date().toISOString();
    const updatedCase: Case = {
      ...cases[index],
      status: payload.decision,
      resolved_at: now,
      resolved_by: payload.actor,
      resolution_reason: payload.reason,
    };

    cases[index] = updatedCase;
    saveMockCases(cases);

    // Update timelines
    const timelines = loadMockTimelines();
    const caseTimeline = timelines[caseId] ? [...timelines[caseId]] : [];
    caseTimeline.push({
      ts: now,
      actor: "human",
      type: "decision",
      summary: `Human Auditor ${payload.decision === "approved" ? "Approved" : "Dismissed"} Exception (${payload.actor})`,
      detail: {
        decision: payload.decision,
        actor: payload.actor,
        reason: payload.reason,
      },
    });
    timelines[caseId] = caseTimeline;
    saveMockTimelines(timelines);

    // Update RunSummary
    const summary = loadMockRunSummary();
    const by_status: Record<string, number> = {};
    cases.forEach((c) => {
      by_status[c.status] = (by_status[c.status] || 0) + 1;
    });
    summary.by_status = by_status;
    saveMockRunSummary(summary);

    return updatedCase;
  }

  const res = await fetchWithAuthRetry(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Failed to resolve case: ${res.statusText}`);
  }
  return res.json();
}
