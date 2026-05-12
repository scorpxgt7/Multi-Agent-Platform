#!/usr/bin/env bash
set -euo pipefail

echo "Running startup checks for Multi-Agent-Platform..."

if [ -f ./deploy/env.production.example ]; then
  echo "Found deploy/env.production.example - ensure you have a .env with production secrets"
fi

# Check API gateway health
echo -n "Checking api-gateway... "
if curl --fail --silent --show-error http://api-gateway:8080/health >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAILED"
  exit 2
fi

# Check orchestrator
echo -n "Checking orchestrator-service... "
if curl --fail --silent --show-error http://orchestrator-service:8105/health >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAILED"
  exit 2
fi

# Check redis (best-effort)
echo -n "Checking redis (PING)... "
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -h redis ping | grep -iq PONG; then
    echo "OK"
  else
    echo "FAILED"
    exit 2
  fi
else
  echo "redis-cli not available - skipping"
fi

echo "Startup checks passed"
