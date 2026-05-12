# Monitoring & Dashboards

This document describes how to bring up Prometheus + Grafana and provision starter dashboards.

1. Deploy monitoring stack

```bash
./scripts/deploy_monitoring.sh
```

This launches Prometheus (http://localhost:9090) and Grafana (http://localhost:3000).

2. Grafana provisioning

- Grafana is pre-provisioned to use Prometheus at `http://prometheus:9090` and will load JSON dashboards provided in `infra/grafana/dashboards`.
- Dashboards included as scaffolds: `queue`, `worker_health`, `deployment_health`, `provider_latency`, `orchestration_throughput`, `failures_retries`.

3. Verify dashboards

- Open Grafana at `http://<host>:3000` and sign in (default admin user can be configured via compose env).
- Dashboards will appear under the home folder; if you do not see them, confirm provisioning files are mounted at `/etc/grafana/provisioning` and dashboards at `/var/lib/grafana/dashboards`.

4. Prometheus scrape expansion

- `infra/prometheus/prometheus.yml` contains starter scrape jobs; add metrics exporters as needed (Postgres exporter, Redis exporter) and update job targets.

Notes

- The included dashboards are scaffolds. Replace metric names with actual Prometheus metrics exported by services or exporters.
