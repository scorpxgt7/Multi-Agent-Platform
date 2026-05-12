# Operational README

This document provides operational guidance for deploying, validating, and monitoring the Multi-Agent Platform.

See the `docs/` directory for focused workflow documents:

- `docs/quickstart.md` — quick local startup and basic validation.
- `docs/deployment.md` — VPS deployment flow and CI/CD integration.
- `docs/runtime_startup.md` — runtime startup automation and checks.
- `docs/recovery_rollback.md` — backup, restore, and rollback practices.
- `docs/troubleshooting.md` — common operational issues and mitigations.
- `docs/monitoring.md` — Prometheus/Grafana provisioning and dashboards.
- `docs/architecture.md` — high-level architecture overview and diagram.
- `docs/validation.md` — validation flow and runtime tests.

Quick references:

- Start runtime (production): `DEPLOY_ENV=production ./deploy/start_runtime.sh`
- Start runtime (staging): `DEPLOY_ENV=staging ./deploy/start_runtime.sh`
- Bootstrap `.env`: `./deploy/bootstrap_env.sh`
- Deploy to VPS: `DEPLOY_HOST=x ./deploy/deploy_vps.sh`
- Rollback on VPS: `DEPLOY_HOST=x ./deploy/rollback_vps.sh`
- Backup Postgres: `./scripts/backup_postgres.sh`
- Restore Postgres: `./scripts/restore_postgres.sh <file>`
- Backup Redis: `./scripts/backup_redis.sh`
- Restore Redis: `./scripts/restore_redis.sh <file>`

For operational runbooks, check the files listed above.
