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
- `approve` is overridden to `escalate` when the invoice overbills beyond tolerance with no recorded PO amendment that covers it, or bills more units than were received. A receiving note explains a difference; it never authorizes it.
- The model can only retrieve the case's own invoice and PO. A crashed investigation moves the case to human review as `escalate`/low instead of stranding it.
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

`python -m app.evaluation.run` runs 20 flagged cases (+2 that must stay clean) through three modes: rules only, rules + agent with the guardrails switched off, and rules + agent + guardrails. Full tables and per-case outputs: [docs/eval-results.md](docs/eval-results.md) (stamped with code commit, date, provider and model). Run on Vultr Serverless Inference (`deepseek-v4.1-flash-1017`), temperature 0, one run per mode. A snapshot, not a benchmark.

| Mode (20 flagged cases; 10 holdout) | Acceptable | Unsafe | Holdout acceptable | Model text addresses key point* | Median latency | Total tokens |
|---|---:|---:|---:|---:|---:|---:|
| Rules only | 19/20 | 0 | 9/10 | 0/9 | - | - |
| Agent, no guardrails | 20/20 | 0 | 10/10 | 9/9 | 14.3 s | ~173k |
| Agent + guardrails | 20/20 | 0 | 10/10 | 9/9 | 13.8 s | ~163k |

*Of 9 cases labelled with a key point a reviewer needs (for example "no approved amendment on file"), how many outputs have the **model's own text** address it. Backend-built facts are scored in a separate column and are excluded here.

What this does and does not show:
- **Where the agent earns its place:** INV-E09 is 8% over the PO but a recorded, approved PO amendment covers it. Rules-only (which cannot see amendments) escalates it; the agent finds the amendment and recommends `approve`. Rules-only is only wrong on that one case because the labels accept several defensible answers for the rest. The remaining gap is explanation, the missing authorization, the partial-receipt totals and the drafted follow-up, which only the agent provides.
- **Safety is not the differentiator in the live run.** No mode approved an unauthorized case, including the prompt-injection case. Nothing in the guarded run needed an override or a contract rejection, so **the live run does not demonstrate that the guardrails work**; it only shows this model did not need them.
- **The guardrails are tested deterministically instead:** `backend/tests/test_agent.py` drives scripted bad agents through the backend: an agent that follows the injected "approve" is overridden to `escalate`; an amendment on a different PO, or one too small, does not authorize; no amendment can justify billing unreceived goods; submitting before retrieval is rejected; requests for another invoice or PO are refused; invented evidence references are dropped.
- **Small and partly in-sample.** The 10 dev cases are what the prompts were built against; the 10 holdout cases were labelled before any model ran on them. Labels are the author's judgement. n is too small for statistical claims.
- **Cost:** token counts are measured; no dollar figure is given because the per-token price is not recorded here.

## Reviewer actions

The two buttons record a review outcome only. Nothing is paid or sent.
- **Accept recommendation** (stored as `approved`): the reviewer agrees with the agent's recommended next step, for example "escalate to procurement".
- **Override and close** (stored as `dismissed`): the reviewer disagrees and closes the case without following it. A reason is required.

The decision is attributed to the authenticated user; the typed reviewer name is stored as self-declared. The audit event records the agent's recommendation and confidence at decision time.

## Run locally

```bash
cp .env.example .env        # add Vultr / OpenRouter keys and Basic Auth credentials
docker compose up --build
curl http://localhost:8000/api/health
```

Tests: `cd backend && pip install -r requirements.txt && pytest` (45 tests; the agent tests use a scripted fake LLM, so no network or keys are needed).

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
