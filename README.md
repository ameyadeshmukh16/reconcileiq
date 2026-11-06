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

## Deploy to a Vultr VM

1. Point a DuckDNS name at the VM's public IPv4.
2. On the VM (Ubuntu 24.04): `git clone https://github.com/ameyadeshmukh16/reconcileiq.git && cd reconcileiq && sudo bash scripts/vm-setup.sh`
3. `cp .env.example .env`, then set `PUBLIC_HOST` to the DuckDNS name, plus the API keys and Basic Auth credentials.
4. `./scripts/deploy.sh`, then check `https://<name>.duckdns.org/api/health`.

If the certificate fails, check that ports 80/443 are open in both ufw and the Vultr firewall group.

## Layout

- `backend/` — FastAPI app, rule engine, investigation agent
- `data/` — synthetic AP dataset
- `frontend/` — UI (AI Studio export)
- `docs/` — architecture and decisions
