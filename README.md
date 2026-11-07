# ReconcileIQ

**Evidence-driven AP exception investigation. The agent recommends, a human decides.**

Built for the Vultr Agent Rush hackathon, Challenge 2: Finance & Accounting / Procurement.

**Live demo:** https://agent-solo-vultr.duckdns.org (reads are public; approving, dismissing or re-running asks for the reviewer login)

## The problem

Accounts-payable teams match every vendor invoice against a purchase order (PO) and a goods receipt (GRN) before paying. Most invoices match. The exceptions (duplicates, amount or quantity gaps, vendor-name differences, stale dates, missing receipts) are investigated by hand: pull three documents, compare them, work out what happened, write down why a payment was held or released. It is slow, and the reasoning rarely gets recorded.

## What ReconcileIQ does

1. **Rule engine** (deterministic, pandas) checks every invoice against its PO and GRN and flags exceptions. Clear-cut cases, such as an exact duplicate, go straight to review with a templated action.
2. **Investigation agent** (LLM with tool calling) takes the ambiguous cases. It pulls the invoice, PO and goods receipt, checks policy, calculates differences, then submits a structured finding: facts, interpretation, recommendation (`approve`, `request_vendor_clarification`, `escalate`, `reject`) and confidence.
3. **Audit trail** records every rule check, tool call, status change and decision as an insert-only event (enforced by SQLite triggers).
4. **Human review dashboard**: a reviewer sees the evidence side by side with the agent's reasoning and approves or dismisses with a recorded reason. **Nothing is executed or paid by the system.**

## Guardrails (enforced in code, not just in the prompt)

- Evidence values are filled in from the records the agent actually retrieved. The model only names which fields matter, so it cannot invent numbers. Any number in its prose that is not in the retrieved data is logged as `unverified_numbers`.
- `requires_human_approval` is always true, and every investigated case ends in `awaiting_review`.
- Missing or contradictory evidence forces `escalate` with `low` confidence.
- A vendor-name mismatch can never be auto-rejected or approved; it becomes a clarification request.
- If the agent produces no valid finding, the case is escalated rather than guessed.
- Status transitions are validated, and the case update and its audit event commit in one transaction.
- Write endpoints use HTTP Basic Auth and fail closed (503) if credentials are not configured.

## Architecture

```
Browser ──HTTPS──> Caddy (Let's Encrypt, static React UI)
                     │  /api/*
                     v
                  FastAPI ── SQLite (cases, audit_events, synthetic AP data)
                     │
          rules (pandas) ──> agent loop ──> Vultr Serverless Inference
                                   │            (primary, OpenAI-compatible)
                                   └── transient errors only ──> OpenRouter (fallback)
```

**Where Vultr is used**
- **Compute:** one Vultr cloud VM (Ubuntu 24.04) runs Docker Compose: the `api` container and Caddy.
- **Inference:** the agent runs on **Vultr Serverless Inference** (model `deepseek-v4.1-flash-1017`) through its OpenAI-compatible API, with tool calling for the investigation loop. Every case records the provider and model that produced its finding.
- **Fallback policy:** OpenRouter is used only for transient failures (timeouts, connection errors, 408/429/5xx). Authentication or configuration errors fail loudly instead of silently switching providers.

**Stack:** FastAPI, SQLite, pandas, pydantic, Docker Compose, Caddy, React + Vite + Tailwind (UI prototyped in Google AI Studio).

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | liveness |
| `POST /api/runs` | Basic | run rules, then investigate flagged cases in the background |
| `GET /api/runs/latest`, `/api/runs/{id}` | none | run summary with live counts and `in_progress` |
| `GET /api/cases?status=&severity=&anomaly_type=` | none | list cases |
| `GET /api/cases/{id}` | none | case with evidence, finding and audit timeline |
| `PATCH /api/cases/{id}` | Basic | approve or dismiss with reason and actor (409 if already decided) |

Runs are idempotent: one case per invoice, so re-running never duplicates work.

## Demo data

All data is synthetic and generated deterministically (`python -m app.seed`): 42 invoices, with 9 seeded anomalies (amount, quantity, vendor-name, stale-date and missing-receipt cases, plus a contradictory-evidence case), one exact duplicate and 30 clean invoices. A within-tolerance invoice checks that the rules do not over-flag.

## Run locally

```bash
cp .env.example .env        # add Vultr / OpenRouter keys and Basic Auth credentials
docker compose up --build
curl http://localhost:8000/api/health
```

Tests: `cd backend && pip install -r requirements.txt && pytest` (30 tests; the agent tests use a scripted fake LLM, so no network or keys are needed).

## Deploy to a Vultr VM

1. Point a DuckDNS name at the VM's public IPv4.
2. On the VM (Ubuntu 24.04): `git clone https://github.com/ameyadeshmukh16/reconcileiq.git && cd reconcileiq && sudo bash scripts/vm-setup.sh`
3. `cp .env.example .env`, then set `PUBLIC_HOST` to the DuckDNS name, the inference keys and the Basic Auth credentials.
4. `./scripts/deploy.sh`, then check `https://<name>.duckdns.org/api/health`.

If the certificate fails, check that ports 80/443 are open in both ufw and the Vultr firewall group.

## Layout

- `backend/`: FastAPI app, rule engine, investigation agent, tests
- `data/`: synthetic AP dataset
- `frontend/`: React UI. `cd frontend && npm install && npm run build`, then commit `dist/` (served by Caddy; the VM needs no Node)
- `docs/`: architecture ([architecture.md](docs/architecture.md)) and decisions ([decisions.md](docs/decisions.md))

## Limitations

- Synthetic data and single-line-item invoices only; no ERP integration.
- Reads are public by design for the demo; only writes are authenticated, with one shared reviewer login.
- The fallback model is a free-tier model and may be rate limited.
- Recommendations are advisory. Payment execution is deliberately out of scope.
