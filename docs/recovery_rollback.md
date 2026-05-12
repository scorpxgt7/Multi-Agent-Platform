# Recovery and Rollback

This runbook covers backup/restore and rollback procedures.

Backups

- Postgres backups: `./scripts/backup_postgres.sh` creates SQL dumps into `./backups` by default.
- Restore Postgres: `./scripts/restore_postgres.sh <backup-file.sql>` restores into the running Postgres container.
- Redis backups: `./scripts/backup_redis.sh` triggers `SAVE` and copies `dump.rdb` to `./backups`.
- Restore Redis: `./scripts/restore_redis.sh <dump.rdb>` copies the RDB into the container and restarts it.

Rollback

- The deploy helper persists a `.last_deploy` commit on the remote host.
- To rollback remotely run:

```bash
DEPLOY_HOST=1.2.3.4 DEPLOY_USER=ubuntu DEPLOY_PATH=/opt/multi-agent ./deploy/rollback_vps.sh
```

Recovery validation

- Use `scripts/verify_persistence.sh` to ensure seeded data survives restart and restore operations.
- Use `scripts/validate_restart_recovery.sh` to perform a down/up and run validation-runner.
- Use `scripts/validate_queue_recovery.sh` to confirm worker restart preserves queue processing.
