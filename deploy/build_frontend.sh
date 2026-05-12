#!/usr/bin/env bash
set -euo pipefail

# Build frontend with environment injected for Vite
DEPLOY_ENV=${DEPLOY_ENV:-local}
echo "Building frontend for environment: $DEPLOY_ENV"
export VITE_DEPLOY_ENV=$DEPLOY_ENV
npm ci
npm run build
echo "Frontend build complete"
