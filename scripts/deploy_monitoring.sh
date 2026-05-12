#!/usr/bin/env bash
set -euo pipefail

echo "Deploying monitoring stack (Prometheus + Grafana)"
docker compose -f infra/docker-compose.monitoring.yml up -d --build
echo "Monitoring stack started (Prometheus: http://localhost:9090, Grafana: http://localhost:3000)"
