from __future__ import annotations

import asyncio
import os
import signal
import uuid
from typing import Any

import main as orchestrator
from queue_store import WorkflowQueueStore


WORKER_ID = os.getenv("WORKER_ID", f"workflow-worker-{uuid.uuid4().hex[:8]}")
WORKER_TYPE = os.getenv("WORKER_TYPE", "workflow-worker")
POLL_SECONDS = float(os.getenv("WORKER_POLL_SECONDS", "2.0"))
EXECUTION_TIMEOUT_SECONDS = float(os.getenv("WORKER_EXECUTION_TIMEOUT_SECONDS", "900"))
STALE_SECONDS = int(os.getenv("WORKER_STALE_SECONDS", "900"))


def queue_store() -> WorkflowQueueStore:
    return orchestrator.queue_store


async def execute_item(item: dict[str, Any]) -> dict[str, Any]:
    state = dict(item.get("checkpoint_state") or {})
    state.setdefault("request_id", item["request_id"])
    state.setdefault("execution_id", item["execution_id"])
    state.setdefault("organization_id", item["organization_id"])
    state.setdefault("queue_item_id", item["id"])
    state.setdefault("queue_retry_count", item.get("attempts", 0))
    state.setdefault("workflow_progress", {})
    state["queue_item_id"] = item["id"]
    state["queue_status"] = "running"
    result = await asyncio.wait_for(orchestrator.execute_workflow_graph(state), timeout=EXECUTION_TIMEOUT_SECONDS)
    return result


async def poll_once() -> bool:
    queue_store().recover_stale_items(stale_after_seconds=STALE_SECONDS)
    item = queue_store().claim_next(worker_id=WORKER_ID, worker_type=WORKER_TYPE)
    if not item:
        queue_store().heartbeat(worker_id=WORKER_ID, worker_type=WORKER_TYPE, status="idle", current_request_id="", details={"poll": "idle"})
        await asyncio.sleep(POLL_SECONDS)
        return False

    queue_store().heartbeat(worker_id=WORKER_ID, worker_type=WORKER_TYPE, status="running", current_request_id=item["request_id"], details={"queue_item_id": item["id"], "status": item["status"]})
    try:
        result = await execute_item(item)
        final_result = result.get("final_result", {})
        final_status = final_result.get("status", "completed")
        if final_status in {"completed", "awaiting_approval"}:
            queue_store().complete(
                execution_id=item["execution_id"],
                organization_id=item["organization_id"],
                request_id=item["request_id"],
                team_id=result.get("team_id", item.get("checkpoint_state", {}).get("team_id", "")),
                result_payload=final_result,
                state_snapshot=result,
                final_status=final_status,
            )
        else:
            queue_store().fail(
                execution_id=item["execution_id"],
                organization_id=item["organization_id"],
                request_id=item["request_id"],
                team_id=result.get("team_id", item.get("checkpoint_state", {}).get("team_id", "")),
                state_snapshot=result,
                error_message=final_result.get("summary", "workflow_failed"),
                retryable=not final_result.get("policy_violation"),
            )
    except Exception as error:
        retryable = True
        queue_store().fail(
            execution_id=item["execution_id"],
            organization_id=item["organization_id"],
            request_id=item["request_id"],
            team_id=item.get("checkpoint_state", {}).get("team_id", ""),
            error_message=str(error),
            state_snapshot=item.get("checkpoint_state", {}),
            retryable=retryable,
        )
    finally:
        queue_store().heartbeat(worker_id=WORKER_ID, worker_type=WORKER_TYPE, status="idle", current_request_id="", details={"poll": "idle"})
    return True


async def run():
    stop = asyncio.Event()

    def handle_signal(*_: Any):
        stop.set()

    for signame in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(signame, handle_signal)
        except Exception:
            pass

    while not stop.is_set():
        try:
            await poll_once()
        except Exception as error:
            queue_store().heartbeat(worker_id=WORKER_ID, worker_type=WORKER_TYPE, status="error", current_request_id="", details={"error": str(error)})
            await asyncio.sleep(POLL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run())
