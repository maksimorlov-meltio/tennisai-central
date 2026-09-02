#!/usr/bin/env bash
# Update the running site to whatever is on GitHub. Run ON THE SERVER:
#
#   cd /opt/tennisai && bash deploy/hetzner/update.sh
#
# The database volume and .env are untouched — both live outside git.
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

echo "== before =="
git --no-pager log --oneline -1

echo
echo "== fetching =="
git fetch --quiet origin
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"

echo
echo "== after =="
git --no-pager log --oneline -1

echo
echo "== rebuild and restart =="
cd "$ROOT/deploy/hetzner"
docker compose up -d --build
sleep 8
docker compose ps

echo
echo "== health =="
curl -fsS http://127.0.0.1/api/health || echo "  (not answering — 'docker compose logs --tail 50 api')"
echo
