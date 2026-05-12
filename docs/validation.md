# Validation Flow

This document describes how to validate runtime behavior and deployment recovery.

1. Seed persistent data

```bash
./scripts/seed_persistence.sh
```

2. Verify persistence

```bash
./scripts/verify_persistence.sh
```

3. Validate restart recovery

```bash
./scripts/validate_restart_recovery.sh
```

4. Validate queue/workers recovery

```bash
./scripts/validate_queue_recovery.sh
```

5. Run the `validation-runner` (full integration exercise)

```bash
./scripts/run_validation.sh
```

6. If tests fail:

- Inspect `docker compose logs` for failing services.
- Inspect `/tmp/deploy_report.json` produced by `startup_checks.sh`.
- Restore backups if corruption is detected; use `scripts/restore_postgres.sh` and `scripts/restore_redis.sh`.
