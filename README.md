# ReconcileIQ

Evidence-driven AP exception investigation and resolution **recommendation** platform, with human-controlled execution.
Built for the Vultr Agent Rush hackathon (Challenge 2 — Finance & Accounting / Procurement).

**Status:** scaffold only. See [docs/architecture.md](docs/architecture.md) for the frozen v3 spec and [docs/decisions.md](docs/decisions.md) for open decisions.

## Run locally

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:8000/api/health
```

## Layout

- `backend/` — FastAPI app, rule engine, investigation agent
- `data/` — synthetic AP dataset
- `frontend/` — UI (AI Studio export)
- `docs/` — architecture and decisions
