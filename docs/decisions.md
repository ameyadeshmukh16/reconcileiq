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
