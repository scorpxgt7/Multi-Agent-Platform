#!/usr/bin/env bash
set -u -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT/validation-results"
REPORT="$REPORT_DIR/current-commit-$(date -u +%Y%m%dT%H%M%SZ).log"
mkdir -p "$REPORT_DIR"

run_check() {
  local name="$1"
  shift
  echo "== $name ==" | tee -a "$REPORT"
  echo "$*" | tee -a "$REPORT"
  if "$@" >>"$REPORT" 2>&1; then
    echo "PASS $name" | tee -a "$REPORT"
    return 0
  fi
  echo "FAIL $name" | tee -a "$REPORT"
  return 1
}

cd "$ROOT" || exit 2
status=0
run_check "frontend build" npm run build || status=1
run_check "backend config validation" npm run validate:backend || status=1
run_check "python unit tests" python3 -m pytest tests || status=1

if command -v docker >/dev/null 2>&1; then
  run_check "compose config" docker compose -f infra/docker-compose.yml config || status=1
else
  echo "WARN docker unavailable; skipping compose config" | tee -a "$REPORT"
fi

echo "Report: $REPORT"
exit "$status"
