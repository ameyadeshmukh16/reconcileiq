# Decisions & Gaps Log

Gaps found in the v3 architecture doc while setting up the repo. Resolve at the noted point.

| # | Gap | Proposed resolution | When |
|---|---|---|---|
| 1 | Basic Auth over plain HTTP sends credentials in cleartext; DuckDNS gives no TLS | Caddy in Docker Compose with automatic Let's Encrypt | Deployment (hr 0–1.5) |
| 2 | Doc doesn't say where the AI Studio UI is hosted | Serve built frontend and `/api` from the same origin via Caddy (avoids CORS, makes native Basic Auth dialog work) | Deployment / UI wiring |
| 3 | `severity` used in filters/run summary but absent from Case schema | Add `severity` to Case (already in `models.py`) or drop the filter | Before UI mocks (hr 1.5) |
| 4 | `run_id` not on Case although runs have summaries | Add `run_id` to Case (already in `models.py`) | Before UI mocks |
| 5 | Status path for rule-flagged and clean cases unspecified | Rule-flagged → straight to `awaiting_review` (templated action, human still decides); clean cases recorded, not surfaced for review | Rule engine (hr 3.5) |
| 6 | Vultr tool-calling spike timing: build table says hr 4.5–5, cut-order/risks say 3.5–4 | Treat the build table as authoritative | n/a |
| 7 | Pipeline re-runs could duplicate cases | Make runs idempotent per invoice | Rule engine / API |

## Resolved during implementation

| # | Resolution |
|---|---|
| 5 | Implemented: rule-flagged (exact duplicate only) -> `awaiting_review` with templated action; ambiguous cases -> `received` until the agent runs; clean invoices create no case. A duplicate number with a *different* amount is ambiguous, so it goes to the agent. |
| 7 | Implemented: unique index `cases.invoice_id`; a re-run skips invoices that already have a case, so it never duplicates or resets a reviewed case. |
| 8 | `RunSummary` counts are live over all cases (not frozen per run) so decisions show up immediately. |
| 9 | `Case` gained `investigation_model` (spec says provider *and* model are recorded) plus optional `recommendation_rationale`, `finding_facts`, `finding_interpretation` used by the UI. |
| 10 | Rule-engine "today" is the fixed `AS_OF_DATE` (2026-11-06) so the synthetic dataset's stale-invoice results are deterministic. |

| 11 | Reviewer identity: the recorded actor is the **authenticated** Basic Auth user; the typed name is stored as a self-declared reviewer name and labelled as such. |
| 12 | Verified facts are built by the backend from retrieved records; the model's own text is interpretation only and is never displayed as verified. |
| 13 | Investigation contract: `submit_finding` is rejected until the invoice, PO, goods receipt, policy and (for amount/quantity cases) PO-approvals lookups have run. Retrieval tools are bound to the case's own invoice and PO. |
| 14 | Authorization is a backend rule: `approve` is overridden to `escalate`/low when the invoice overbills beyond tolerance with no recorded PO amendment that covers it, or bills more units than were received. A receiving note or vendor statement explains a difference but never authorizes it. |
| 15 | A crashed investigation fails safe: the case moves to `awaiting_review` as `escalate`/low with an audit event naming only the error class. Configuration/auth errors stop the batch and leave cases pending instead. |
| 16 | Reviewer actions keep the API/DB values `approved`/`dismissed` but mean **Accept recommendation** (agree with the agent's recommended next step) and **Override and close** (disagree). Neither executes a payment or ERP action. The decision audit event records the agent's recommendation and confidence at the time, so accept-vs-override is auditable. |
| 17 | Run summaries stay live counts over the whole case queue (one case per invoice); per-run scoping and a durable run-state machine were considered and rejected as unneeded for a single-VM demo. |
