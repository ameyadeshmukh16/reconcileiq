# ReconcileIQ — Architecture & Decisions (v3, FROZEN for implementation)

> **Implementation note (2026-11-07):** this spec is the frozen v3 plan. Where the build differs, [decisions.md](decisions.md) ("Resolved during implementation", items 5-17) is authoritative: verified facts are backend-built, the investigation contract and authorization guardrail are enforced in code, `calculate_difference` is an optional helper, a PO-approvals tool was added, and the reviewer buttons mean Accept recommendation / Override and close (stored as `approved` / `dismissed`).

**Hackathon:** Vultr Agent Rush
**Challenge track:** Challenge 2 — "Powering the Future of Work" (Finance & Accounting / Procurement)
**Format:** Solo build, **1 day, ~10 hours total**
**Working title:** ReconcileIQ
**Status:** Frozen. Two external reviews evaluated and selectively adopted (Section 8). No further planning rounds before implementation — this is the build spec.

---

## 1. Product Positioning

> ReconcileIQ — an evidence-driven AP exception investigation and resolution **recommendation** platform, with human-controlled execution.

Precise about what it does: detects a discrepancy, retrieves supporting evidence, investigates and explains it, recommends a resolution, drafts a follow-up, obtains human approval, records the decision. It does not autonomously resolve anything — no ERP write-back, no vendor email actually sent. This is a deliberate accuracy correction from earlier drafts that implied more autonomy than the product has.

**Why this domain:** maps directly onto the brief's Finance & Accounting focus area, reuses genuine data-quality/reconciliation engineering judgment, kept generic (not client-specific).

**Known ceiling:** reconciliation agents are a known enterprise-agent category. The idea alone doesn't win originality — evidence-backed investigation behavior and execution quality carry that.

---

## 2. Core Technical Flow

1. **Ingest**: synthetic wholesale AP dataset — vendors, invoices, POs, goods receipts — with seeded anomalies and 2 deliberate failure cases (missing GRN, contradictory evidence).
   - **Design decision**: every invoice/PO/GRN has exactly one line item. This makes "header-level" and "line-item-level" matching the same thing by construction, closing the credibility gap a true multi-line dataset would otherwise expose (header totals can't support quantity claims when a document has multiple products) — without building a relational line-items schema.
2. **Deterministic rule engine** (pandas): three-way matching (invoice vs. PO vs. goods receipt) on that single line item tags each case `clean`, `rule_flagged` (unambiguous, e.g. exact duplicate), or `needs_investigation`.
   - Rule-flagged cases get a templated action, no LLM call.
3. **Investigation agent** (tool-calling): for `needs_investigation` cases, retrieves the invoice, PO, and goods-receipt records via tools, checks the relevant tolerance policy, and produces a structured finding — evidence used, recommendation, confidence indicator (never called a validated probability), whether human approval is required.
   - **Inference**: Vultr Serverless Inference primary. **Fallback to OpenRouter only on transient/availability failures** (timeout, 5xx, rate limit) — **never** on auth or configuration errors, which must fail loudly so a build-time bug surfaces immediately instead of being silently masked by a fallback. Provider and model actually used are recorded per case and shown in the UI.
   - **Hard rule, not model-dependent**: every agent-investigated case requires human approval. Confidence level never overrides this. The agent cannot invent evidence, cannot calculate authoritative financial values itself (those come from deterministic backend functions), and must escalate rather than guess when evidence is missing or contradictory. A vendor-name mismatch is never auto-resolved as impersonation; missing evidence is never auto-resolved as fraud.
4. **Audit trail**: every rule check, agent tool call (with its actual result), and human decision is appended to an insert-only events log. The investigation timeline shown in the UI is built from these real entries — not a fabricated or paraphrased narrative.
5. **Human-in-the-loop dashboard**: cases reviewed with evidence and reasoning visible, approved or dismissed, with transition rules enforced (see Section 3).

---

## 3. Data Model

| Entity | Purpose |
|---|---|
| `vendors` | Vendor master |
| `invoices` | Invoice header + single line item (quantity, amount) |
| `purchase_orders` | PO header + single line item |
| `goods_receipts` | Receiving record + single line item |
| `cases` | A reconciliation case: links to invoice/PO/GRN, current status, investigation result |
| `audit_events` | Append-only: what happened, when, by what actor (rule engine / agent / human) |

### Case (API-facing shape)
```json
{
  "case_id": "string (uuid)",
  "invoice_number": "string",
  "vendor_name": "string",
  "po_number": "string | null",
  "invoice_amount": "number",
  "po_amount": "number | null",
  "quantity_billed": "number | null",
  "quantity_received": "number | null",
  "invoice_date": "ISO date",
  "po_date": "ISO date | null",
  "anomaly_type": "enum: duplicate_invoice | amount_mismatch | vendor_name_mismatch | date_anomaly | quantity_mismatch | missing_evidence | clean",
  "detection_method": "enum: rule_engine | agent_investigation",
  "investigation_provider": "enum: vultr | openrouter | none",
  "evidence": [
    { "source": "invoice | purchase_order | goods_receipt", "field": "string", "value": "any" }
  ],
  "finding": "string (what the agent concluded, distinguishing verified fact from interpretation)",
  "confidence": "enum: low | medium | high (indicator, not a calibrated probability)",
  "recommendation": "enum: approve | request_vendor_clarification | escalate | reject",
  "requires_human_approval": "boolean (always true for agent_investigation cases)",
  "suggested_action": "string (drafted follow-up)",
  "status": "enum: received | investigating | awaiting_review | approved | dismissed",
  "flagged_at": "ISO timestamp",
  "resolved_at": "ISO timestamp | null",
  "resolved_by": "string | null",
  "resolution_reason": "string | null"
}
```

### API surface
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/runs` | Trigger a pipeline run on the dataset |
| GET | `/api/runs/{run_id}` | Run summary (counts by status/severity) |
| GET | `/api/cases` | List cases (filterable by status/severity) |
| GET | `/api/cases/{case_id}` | Full case detail: evidence, timeline, finding |
| PATCH | `/api/cases/{case_id}` | Approve or dismiss (reason + actor required) |

**Auth**: HTTP Basic Auth via FastAPI middleware on write endpoints (`POST`, `PATCH`). Chosen over a bearer API key embedded in frontend JS — the browser handles the credential natively via its auth dialog; nothing sensitive sits in page source for anyone inspecting the deployed app.

### Status model and transition rules
`received → investigating → awaiting_review → approved | dismissed`

Enforced, not just logged:
- Only a case in `awaiting_review` can be approved or dismissed.
- A case already in `approved` or `dismissed` cannot be re-decided.
- Every status change and its audit event are written in a single transaction (no case update without a corresponding audit entry, and vice versa).
- `escalated` is represented as `awaiting_review` with `recommendation: escalate` — not a separate status — since it still needs the same human gate, just with a different suggested next step.

The audit log, not additional states, is what makes the workflow look complete in the UI timeline.

### UI screens
1. **Operations dashboard**: run summary stats, case table (filterable by status/severity/anomaly type).
2. **Investigation workspace** (the centerpiece): invoice vs. PO vs. GRN comparison, the agent's actual retrieved evidence, finding, confidence, recommendation, real timeline of tool calls from the audit log, approve/dismiss controls (reason required).
3. **Trigger-run view**: minimal control to kick off a run on the dataset.

---

## 4. Anomaly Set (seeded in synthetic data)

- Duplicate invoice number from same vendor (rule-flagged, no LLM)
- Invoice amount vs. PO amount mismatch over tolerance
- Vendor name near-match / possible impersonation (agent must verify identity, never auto-flag as fraud)
- Invoice date before PO date, or stale invoice (>90 days)
- Quantity billed vs. quantity received mismatch
- 2 failure cases: missing GRN record, contradictory evidence — correct agent behavior is to escalate, not guess

Tolerances (amount %, date windows) are hardcoded named constants in one config file.

---

## 5. Stack

| Layer | Choice |
|---|---|
| Rule engine | Pandas |
| Investigation agent | Tool-calling, ~4-5 tools (get_invoice, get_po, get_goods_receipt, check_policy, calculate_difference) |
| Inference | Vultr Serverless Inference primary; OpenRouter fallback on transient failures only (not auth/config errors) |
| Backend/orchestration | FastAPI |
| State | SQLite, insert-only `audit_events` table, transactional status updates |
| Auth | HTTP Basic Auth middleware on write endpoints |
| Frontend | Google AI Studio (Build mode), built against the real running API (not mocks) |
| Deployment | Single Vultr VM, Docker Compose |
| Public URL | DuckDNS subdomain (fallback: nip.io) |

---

## 6. Build Order — 10-Hour Budget (deployment first; UI built early against mocks, per explicit preference; backend agent work resequenced behind its own data layer)

| Hours | Task | Risk |
|---|---|---|
| 0–1.5 | Deploy a minimal FastAPI skeleton to the Vultr VM, DuckDNS resolving to it, end to end | **High** — first time with VM + Docker + DNS together |
| 1.5–2.5 | **Google AI Studio UI**, built against the frozen Case/RunSummary contract (Section 3) with mock JSON — dashboard, investigation workspace, trigger view | Medium — first-time tool |
| 2.5–3.5 | SQLite schema + synthetic dataset (vendors, invoices, POs, GRNs, single-line-item design, seeded anomalies + 2 failure cases), loaded and queryable | Low |
| 3.5–4.5 | Deterministic reconciliation engine (pandas) + the data-access functions the agent's tools will call | Low |
| 4.5–5 | **Validate one real tool-calling investigation through Vultr Serverless Inference before building the rest of the agent** | **High** — isolated spike; if it doesn't work cleanly, the OpenRouter fallback decision is made here, early, not discovered at hour 6 |
| 5–6.5 | Full investigation agent: all tools, structured finding output, audit event writes, status transition rules | Medium-High |
| 6.5–7.5 | FastAPI endpoints wrapping the above, HTTP Basic Auth on writes | Medium |
| 7.5–8.5 | **Wire the AI Studio UI to the real, live API** — swap mock JSON for real endpoints, real timeline rendered from the audit log | Medium — lighter than building UI from scratch, since the UI already exists from hour 1.5–2.5 |
| 8.5–10 | Verify deployment end to end, README (Vultr architecture + use-case writeup), short demo video, minimal slide/cover image, LabLab submission | Medium — easy to underbudget |

**Execution environment:** architecture/planning in chat; build, deployment, and repo work in Claude Code (this sandbox cannot reach Vultr's API or SSH the VM).

### Cut order if behind schedule at any checkpoint
1. Vultr-as-primary → OpenRouter entirely (this is the one pre-authorized automatic call; it was validated as a possibility at hour 3.5–4, not discovered late)
2. Audit-log timeline UI polish → plain status badges
3. Failure-case demonstrations → ship without them
4. Slide deck → single README screenshot instead
5. **Not cut under any circumstance**: deployment, the core investigation flow, and human-approval enforcement (that last one is a one-line check, removing it would be a correctness regression for near-zero time saved — never worth cutting).

---

## 7. Explicitly Deferred (post-MVP, not this build)

- True multi-line-item relational schema (if the business scenario ever needs multiple products per invoice)
- Configurable/versioned tolerance policy engine (currently: hardcoded constants)
- Cross-invoice / cross-vendor pattern detection
- OCR/PDF ingestion (CSV only)
- Formal multi-model evaluation harness comparing providers on cost/latency/accuracy
- Real vendor email dispatch / ERP write-back (the product recommends and drafts; a human executes outside the system)

---

## 8. Review Disposition

Two external reviews (ChatGPT) were evaluated against the 10-hour solo constraint, not adopted wholesale.

**Round 1** proposed a much larger scope (14-entity schema, 10-state workflow engine, full line-item matching, formal model-evaluation harness, versioned policy engine). Correct in direction, not buildable in the time available. Selectively adopted: investigation-over-classification framing, structured evidence, three-way matching concept (simplified), audit trail, minimal auth, deploy-early, failure-case demonstration, Vultr-as-primary.

**Round 2** reviewed the resulting v2 and caught real residual issues, evaluated below — adopted with cost-reducing refinements where the literal recommendation was more expensive than necessary:

| Issue raised | Adopted as | Why refined, if refined |
|---|---|---|
| Header-level matching can't support quantity claims | Single-line-item dataset design (not relational line tables) | Same correctness fix, ~0 cost instead of new schema/joins |
| Silent fallback to OpenRouter on "any friction" | Fallback only on transient errors; auth/config errors fail loud | A blanket fallback would mask the exact bugs you need to catch during the 10 hours, not just at demo time |
| Agent scheduled before its data layer exists | Resequenced: data layer → rule engine → **validated agent spike** → full agent → API → UI | Pure resequencing, 0 added cost, fixes a real dependency bug in v2 |
| No transition validation | Enforced status transitions + atomic case/audit writes | ~20 min, prevents a genuine correctness failure (double-approval) |
| Positioning overclaims autonomous resolution | "Resolution recommendation... human-controlled execution" | Free wording fix |
| No explicit agent boundaries | Hardcoded: approval always required regardless of confidence; no invented evidence; escalate on missing/contradictory evidence | Mostly prompt text + one backend rule, not new architecture |
| API key could leak via frontend JS | HTTP Basic Auth middleware instead of bearer-in-JS | Simpler than the review's three proposed options, same security property |
| Investigation UI must show real tool execution | Already the design intent; reinforced as implementation discipline | No cost — a note not to fake it under time pressure |

**Rejected across both rounds, consistently, for scope reasons:** 14-entity schema, 10-state workflow engine, full relational line-item matching, formal multi-provider evaluation harness, versioned policy configuration, cross-invoice pattern detection, OCR/PDF, ERP integration, multi-agent architecture.

---

## 9. Known Risks

- **Two first-time, high-risk integration points carry the timeline**: Vultr VM/Docker/DNS deployment (hour 0–1.5), and Vultr Serverless Inference tool-calling (validated in isolation at hour 3.5–4, before the full agent is built on top of it). Both scheduled early so failure surfaces with time left to react.
- **Originality ceiling**: addressed by the investigation/evidence framing and genuine tool-calling behavior, not by the idea itself.
- **Visual default risk**: Google AI Studio's default generated UI trends generic; push for a distinct visual identity rather than accepting the first generated layout.
