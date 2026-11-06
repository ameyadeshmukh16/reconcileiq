#!/usr/bin/env bash
# One-time VM bootstrap (Ubuntu 22.04/24.04). Run as root on the Vultr VM.
set -euo pipefail

apt-get update
apt-get install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

docker --version
docker compose version
