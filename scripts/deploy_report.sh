#!/usr/bin/env bash
set -euo pipefail

# Produce a small JSON deployment report by probing key endpoints.
OUT=${OUT:-/tmp/deploy_report.json}
GATEWAY=${API_GATEWAY_URL:-http://localhost:8787}

echo "Collecting deployment report into $OUT"
jq -n '{ok: true, services: {}}' > "$OUT"

probe() {
  local name=$1
  local url=$2
  echo "Probing $name -> $url"
  if curl --silent --fail "$url" -m 5 -o /tmp/${name}.out; then
    local body
    body=$(cat /tmp/${name}.out)
    jq --arg name "$name" --argjson body "$(jq -Rn --arg s "$body" '$s')" '.services[$name] = {ok: true, body: $body}' "$OUT" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
  else
    jq --arg name "$name" '.services[$name] = {ok: false}' "$OUT" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
  fi
}

probe api "$GATEWAY/health"
probe api_diagnostics "$GATEWAY/v1/diagnostics"
probe api_audit "$GATEWAY/v1/deployment/audit"

echo "Deployment report written to $OUT"
cat "$OUT"
