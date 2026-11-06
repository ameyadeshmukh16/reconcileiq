#!/usr/bin/env bash
# Run on the Vultr VM from the repo root: ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo ".env missing - copy .env.example and fill it in"; exit 1; }
git pull --ff-only
docker compose up -d --build
docker compose ps
