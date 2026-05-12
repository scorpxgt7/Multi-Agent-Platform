#!/usr/bin/env bash
set -euo pipefail

# Append a simple deployment audit event to a file. Path controlled via DEPLOY_AUDIT_LOG_FILE env var.
LOG_FILE=${DEPLOY_AUDIT_LOG_FILE:-./deploy_audit.log}
MSG=${1:-"manual-event"}

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "$TIMESTAMP\t$MSG" >> "$LOG_FILE"
echo "Appended audit event to $LOG_FILE"
