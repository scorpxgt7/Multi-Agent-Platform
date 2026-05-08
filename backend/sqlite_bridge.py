import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path.cwd()
DATA_DIR = ROOT / "backend" / "data"
DB_PATH = Path(os.environ.get("NEXUS_DB_PATH", DATA_DIR / "nexus-runs.db"))
LEGACY_JSON_PATH = DATA_DIR / "nexus-runs.json"


def ensure_run_columns(connection):
    existing_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(runs)").fetchall()
    }
    column_additions = [
        ("subsystem_id", "TEXT"),
        ("preset_id", "TEXT"),
    ]

    for column_name, column_type in column_additions:
        if column_name not in existing_columns:
            connection.execute(f"ALTER TABLE runs ADD COLUMN {column_name} {column_type}")


def ensure_connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            subsystem_id TEXT,
            preset_id TEXT,
            runtime_mode TEXT NOT NULL,
            engine TEXT,
            engine_label TEXT,
            task TEXT NOT NULL,
            time TEXT,
            status TEXT,
            started_at TEXT,
            completed_at TEXT,
            duration_ms INTEGER,
            final_output TEXT,
            entries_json TEXT,
            statuses_json TEXT,
            manager_plan TEXT,
            supervisor_brief TEXT,
            synthesis TEXT,
            artifacts_json TEXT,
            error_message TEXT
        )
        """
    )
    ensure_run_columns(connection)
    connection.commit()
    return connection


def migrate_legacy_json(connection):
    count = connection.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
    if count or not LEGACY_JSON_PATH.exists():
        return False

    with LEGACY_JSON_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, list):
        return False

    for run in payload:
        write_run(connection, normalize_run(run))

    connection.commit()
    return True


def normalize_run(run):
    return {
        "id": str(run.get("id")),
        "subsystemId": run.get("subsystemId", "mission"),
        "presetId": run.get("presetId"),
        "runtimeMode": run.get("runtimeMode", "backend"),
        "engine": run.get("engine", "local-simulation"),
        "engineLabel": run.get("engineLabel", run.get("engine", "local-simulation")),
        "task": run.get("task", ""),
        "time": run.get("time"),
        "status": run.get("status", "completed"),
        "startedAt": run.get("startedAt"),
        "completedAt": run.get("completedAt"),
        "durationMs": run.get("durationMs"),
        "finalOutput": run.get("finalOutput", ""),
        "entries": run.get("entries", []),
        "statuses": run.get("statuses", []),
        "managerPlan": run.get("managerPlan", ""),
        "supervisorBrief": run.get("supervisorBrief", ""),
        "synthesis": run.get("synthesis", ""),
        "artifacts": run.get("artifacts", []),
        "errorMessage": run.get("errorMessage"),
    }


def write_run(connection, run):
    connection.execute(
        """
        INSERT OR REPLACE INTO runs (
            id, subsystem_id, preset_id, runtime_mode, engine, engine_label, task, time, status,
            started_at, completed_at, duration_ms, final_output,
            entries_json, statuses_json, manager_plan, supervisor_brief,
            synthesis, artifacts_json, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run["id"],
            run.get("subsystemId", "mission"),
            run.get("presetId"),
            run["runtimeMode"],
            run.get("engine"),
            run.get("engineLabel"),
            run["task"],
            run.get("time"),
            run.get("status"),
            run.get("startedAt"),
            run.get("completedAt"),
            run.get("durationMs"),
            run.get("finalOutput", ""),
            json.dumps(run.get("entries", [])),
            json.dumps(run.get("statuses", [])),
            run.get("managerPlan", ""),
            run.get("supervisorBrief", ""),
            run.get("synthesis", ""),
            json.dumps(run.get("artifacts", [])),
            run.get("errorMessage"),
        ),
    )


def row_to_run(row):
    return {
        "id": row["id"],
        "subsystemId": row["subsystem_id"] or "mission",
        "presetId": row["preset_id"],
        "runtimeMode": row["runtime_mode"],
        "engine": row["engine"],
        "engineLabel": row["engine_label"],
        "task": row["task"],
        "time": row["time"],
        "status": row["status"],
        "startedAt": row["started_at"],
        "completedAt": row["completed_at"],
        "durationMs": row["duration_ms"],
        "finalOutput": row["final_output"],
        "entries": json.loads(row["entries_json"] or "[]"),
        "statuses": json.loads(row["statuses_json"] or "[]"),
        "managerPlan": row["manager_plan"],
        "supervisorBrief": row["supervisor_brief"],
        "synthesis": row["synthesis"],
        "artifacts": json.loads(row["artifacts_json"] or "[]"),
        "errorMessage": row["error_message"],
    }


def row_to_summary(row):
    artifacts = json.loads(row["artifacts_json"] or "[]")
    return {
        "id": row["id"],
        "subsystemId": row["subsystem_id"] or "mission",
        "presetId": row["preset_id"],
        "runtimeMode": row["runtime_mode"],
        "engine": row["engine"],
        "engineLabel": row["engine_label"],
        "task": row["task"],
        "time": row["time"],
        "status": row["status"],
        "startedAt": row["started_at"],
        "completedAt": row["completed_at"],
        "durationMs": row["duration_ms"],
        "finalOutput": row["final_output"],
        "artifactCount": len(artifacts),
        "errorMessage": row["error_message"],
    }


def read_payload():
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    connection = ensure_connection()
    migrated = migrate_legacy_json(connection)

    if command == "health":
        print(json.dumps({"dbPath": str(DB_PATH), "migratedLegacyJson": migrated}))
        return

    if command == "list_runs":
        rows = connection.execute(
            """
            SELECT * FROM runs
            ORDER BY
              COALESCE(completed_at, started_at, time, id) DESC
            """
        ).fetchall()
        print(json.dumps({"runs": [row_to_summary(row) for row in rows]}))
        return

    if command == "get_run":
        payload = read_payload()
        row = connection.execute("SELECT * FROM runs WHERE id = ?", (str(payload.get("id")),)).fetchone()
        print(json.dumps({"run": row_to_run(row) if row else None}))
        return

    if command == "save_run":
        payload = read_payload()
        run = normalize_run(payload.get("run", {}))
        write_run(connection, run)
        connection.commit()
        print(json.dumps({"ok": True, "id": run["id"]}))
        return

    raise SystemExit(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
