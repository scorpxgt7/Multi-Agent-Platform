#!/usr/bin/env bash
set -euo pipefail

echo "Running startup checks for Multi-Agent-Platform..."

if [ -f ./deploy/env.production.example ]; then
  echo "Found deploy/env.production.example - ensure you have a .env with production secrets"
fi

REPORT=${REPORT:-/tmp/deploy_report.json}
echo "Collecting startup checks (report -> $REPORT)"

ok=true

check() {
  name=$1
  url=$2
  echo -n "Checking $name... "
  if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
    echo "OK"
    jq --arg k "$name" --arg v "ok" '. + {($k): $v}' "$REPORT" 2>/dev/null || true
  else
    echo "FAILED"
    ok=false
  fi
}

# Initialize minimal report
echo "{}" > "$REPORT"

check api-gateway http://api-gateway:8080/health
check orchestrator-service http://orchestrator-service:8105/health

# Redis check (best-effort)
echo -n "Checking redis (PING)... "
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -h redis ping | grep -iq PONG; then
    echo "OK"
  else
    echo "FAILED"
    ok=false
  fi
else
  echo "redis-cli not available - skipping"
fi

if [ "$ok" = false ]; then
  echo "One or more startup checks failed" >&2
  exit 2
fi

echo "Startup checks passed"

# Optionally run validation-runner to exercise the runtime (best-effort)
if [ "${RUN_VALIDATION:-false}" = "true" ]; then
  echo "Running validation-runner to validate runtime behavior..."
  if docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml run --rm validation-runner; then
    echo "Validation-runner completed"
  else
    echo "Validation-runner failed (non-blocking)" >&2
  fi
fi

# Generate a simple deployment report
./scripts/deploy_report.sh || true
