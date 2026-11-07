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
- Missing evidence, or several independent discrepancies on one invoice (for example amount and quantity both off), forces `escalate` with `low` confidence.
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

All data is synthetic and generated deterministically (`python -m app.seed`): 42 invoices, of which 10 are flagged (an exact duplicate, a stale invoice and 8 seeded anomalies covering amount, quantity, vendor-name, date and missing-receipt cases, including one where a receiving note explains an overcharge without authorizing it) and 32 are not (including one within-tolerance invoice that checks the rules do not over-flag, and the original of the duplicate).

## Evaluation (measured, with caveats)

`python -m app.evaluation.run` runs 17 flagged cases (+2 that must stay clean) through three modes: rules only, rules + agent with the guardrails switched off, and rules + agent + guardrails. Full tables: [docs/eval-results.md](docs/eval-results.md). Run on Vultr Serverless Inference (`deepseek-v4.1-flash-1017`), temperature 0, one run per mode.

| Mode (17 flagged cases) | Acceptable | Unsafe | Key finding stated* | Median latency | Median tokens |
|---|---:|---:|---:|---:|---:|
| Rules only | 17/17 | 0 | 2/6 | - | - |
| Agent, no guardrails | 16/17 | 0 | 6/6 | 8.6 s | ~8.0k |
| Agent + guardrails | 17/17 | 0 | 6/6 | 11.2 s | ~8.2k |

*Of 6 cases labelled with a key point a reviewer needs (for example "no approved amendment is on file"), how many outputs state it.

What this does and does not show:
- **Safety is not the differentiator here.** No mode approved an unauthorized case, including the prompt-injection case (a receiving note telling the reviewer to approve). Rules-only reaches 17/17 only because it escalates everything, which is safe but gives the reviewer nothing. The labels accept several defensible answers, so "acceptable" cannot separate the modes well.
- **The agent's value is in what it tells the reviewer** (the missing authorization, the partial-receipt totals, the specific follow-up action), not in a better accept/reject choice. The key-point count is partly satisfied by the backend-built facts, which both agent modes use, so it overstates the model's own contribution.
- **The guardrails never had to override the model on this model.** In the guarded run, zero overrides and zero rejected submissions fired. The one difference (INV-72901: `reject` unguarded, `escalate` guarded) is a single run at temperature 0 and may be run-to-run variance, not proof. Earlier manual testing showed the weaker free OpenRouter fallback model was less cautious on contradictory evidence, which is why the guardrails exist; a run on that model could not be completed because its free-tier daily rate limit was exhausted.
- **Small and partly in-sample.** The 10 dev cases are what the prompts were built against; only the 7 holdout cases were labelled before any model ran. Labels are the author's judgement. n is too small for statistical claims.
- **Cost:** token counts are measured; no dollar figure is given because the per-token price is not recorded here.

## Run locally

```bash
cp .env.example .env        # add Vultr / OpenRouter keys and Basic Auth credentials
docker compose up --build
curl http://localhost:8000/api/health
```

Tests: `cd backend && pip install -r requirements.txt && pytest` (35 tests; the agent tests use a scripted fake LLM, so no network or keys are needed).

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
