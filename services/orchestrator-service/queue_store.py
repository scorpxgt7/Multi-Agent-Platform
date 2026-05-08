from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from shared.models import ExecutionEvent, ExecutionRun, ExecutionStatus, WorkflowCheckpoint, WorkflowDeadLetter, WorkflowQueueItem, WorkerHeartbeat


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def status_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


class WorkflowQueueStore:
    def __init__(self, session_factory, execution_store, workflow_store, events):
        self.session_factory = session_factory
        self.execution_store = execution_store
        self.workflow_store = workflow_store
        self.events = events

    def _serialize_queue_item(self, item: WorkflowQueueItem) -> dict[str, Any]:
        return {
            "id": item.id,
            "organization_id": item.organization_id,
            "execution_id": item.execution_id,
            "request_id": item.request_id,
            "workflow_definition_id": item.workflow_definition_id,
            "workflow_deployment_id": item.workflow_deployment_id,
            "status": item.status,
            "priority": item.priority,
            "attempts": item.attempts,
            "max_retries": item.max_retries,
            "worker_id": item.worker_id,
            "current_step": (item.checkpoint_state or {}).get("current_step", "queued"),
            "queued_at": item.queued_at.isoformat() if item.queued_at else None,
            "started_at": item.started_at.isoformat() if item.started_at else None,
            "completed_at": item.completed_at.isoformat() if item.completed_at else None,
            "next_attempt_at": item.next_attempt_at.isoformat() if item.next_attempt_at else None,
            "locked_at": item.locked_at.isoformat() if item.locked_at else None,
            "last_error": item.last_error,
            "retry_history": item.retry_history or [],
            "checkpoint_state": item.checkpoint_state or {},
        }

    def _serialize_worker(self, worker: WorkerHeartbeat) -> dict[str, Any]:
        return {
            "id": worker.id,
            "worker_id": worker.worker_id,
            "worker_type": worker.worker_type,
            "status": worker.status,
            "current_request_id": worker.current_request_id,
            "details": worker.details or {},
            "last_heartbeat_at": worker.last_heartbeat_at.isoformat() if worker.last_heartbeat_at else None,
        }

    def _workflow_context(self, organization_id: str, workflow_deployment_id: str | None) -> dict[str, Any]:
        deployment = None
        if workflow_deployment_id:
            deployment = self.workflow_store.get_deployment(organization_id=organization_id, deployment_id=workflow_deployment_id)
        if not deployment:
            deployment = self.workflow_store.get_active(organization_id)
        if not deployment:
            return {}
        return {
            "workflow": deployment.get("compiled_definition", {}).get("workflow", {}),
            "workflow_definition": deployment.get("compiled_definition", {}),
            "workflow_deployment": deployment,
            "runtime_config": deployment.get("runtime_config", {}),
        }

    def enqueue(
        self,
        *,
        organization_id: str,
        team_id: str,
        actor_id: str,
        subsystem: str,
        task: str,
        context: dict[str, Any],
        short_term_memory: list[dict[str, Any]],
        workflow_deployment_id: str | None = None,
        priority: int = 100,
        max_retries: int = 3,
    ) -> dict[str, Any]:
        workflow_context = self._workflow_context(organization_id, workflow_deployment_id)
        workflow_definition_id = workflow_context.get("workflow_deployment", {}).get("workflow_definition_id", "")
        deployment_id = workflow_context.get("workflow_deployment", {}).get("id", workflow_deployment_id or "")
        execution_identifiers = self.execution_store.create_run(
            organization_id=organization_id,
            team_id=team_id,
            actor_id=actor_id,
            subsystem=subsystem,
            task=task,
            context=context,
            workflow_definition_id=workflow_definition_id,
            workflow_deployment_id=deployment_id,
            queue_status="queued",
        )
        initial_state = {
            "request_id": execution_identifiers["request_id"],
            "execution_id": execution_identifiers["execution_id"],
            "organization_id": organization_id,
            "task": task,
            "team_id": team_id,
            "actor_id": actor_id,
            "subsystem": subsystem,
            "context": {
                **context,
                "organization_id": organization_id,
                "operator_id": context.get("operator_id", ""),
                "operator_role": context.get("operator_role", "operator"),
            },
            "short_term_memory": short_term_memory,
            "delegation_chain": [],
            "provider_usage": [],
            "skill_execution_count": 0,
            "workflow_progress": {},
            "current_step": "queued",
        }
        initial_state.update(workflow_context)
        initial_state["context"] = {
            **context,
            **initial_state.get("runtime_config", {}),
            "organization_id": organization_id,
            "operator_id": context.get("operator_id", ""),
            "operator_role": context.get("operator_role", "operator"),
        }

        with self.session_factory() as session:
            item = WorkflowQueueItem(
                organization_id=organization_id,
                execution_id=execution_identifiers["execution_id"],
                request_id=execution_identifiers["request_id"],
                workflow_definition_id=workflow_definition_id,
                workflow_deployment_id=deployment_id,
                status="queued",
                priority=priority,
                attempts=0,
                max_retries=max_retries,
                checkpoint_state=initial_state,
                retry_history=[{"event": "queued", "timestamp": now_utc().isoformat(), "state": "queued"}],
            )
            session.add(item)
            session.flush()
            initial_state["queue_item_id"] = item.id
            session.add(
                WorkflowCheckpoint(
                    organization_id=organization_id,
                    execution_id=execution_identifiers["execution_id"],
                    request_id=execution_identifiers["request_id"],
                    step_name="queued",
                    status="queued",
                    state_snapshot=initial_state,
                    metadata={"queue_item_id": item.id, "max_retries": max_retries, "priority": priority},
                )
            )
            session.commit()
            session.refresh(item)

        self.execution_store.update_run(
            execution_id=execution_identifiers["execution_id"],
            latest_status=ExecutionStatus.queued.value,
            current_step="queued",
            delegation_chain=[],
            provider_usage=[],
            state_snapshot=initial_state,
            queue_status="queued",
            workflow_definition_id=workflow_definition_id,
            workflow_deployment_id=deployment_id,
        )
        self.execution_store.append_event(
            execution_id=execution_identifiers["execution_id"],
            request_id=execution_identifiers["request_id"],
            organization_id=organization_id,
            team_id=team_id,
            event_type="task.queued",
            status="queued",
            agent_name="orchestrator-service",
            payload={"workflow_definition_id": workflow_definition_id, "workflow_deployment_id": deployment_id, "priority": priority, "max_retries": max_retries},
        )
        self.events.emit(
            "task.queued",
            {
                "request_id": execution_identifiers["request_id"],
                "team_id": team_id,
                "organization_id": organization_id,
                "workflow_deployment_id": deployment_id,
                "priority": priority,
            },
        )
        return {
            "request_id": execution_identifiers["request_id"],
            "execution_id": execution_identifiers["execution_id"],
            "queue_item": self._serialize_queue_item(item),
            "state": initial_state,
            "workflow_context": workflow_context,
        }

    def record_checkpoint(self, *, execution_id: str, request_id: str, organization_id: str, team_id: str, step_name: str, status: str, state_snapshot: dict[str, Any], metadata: dict[str, Any] | None = None):
        with self.session_factory() as session:
            queue_item = session.scalar(select(WorkflowQueueItem).where(WorkflowQueueItem.execution_id == execution_id, WorkflowQueueItem.organization_id == organization_id))
            if queue_item:
                queue_item.checkpoint_state = state_snapshot
                queue_item.status = status
                if status == "running":
                    queue_item.started_at = queue_item.started_at or now_utc()
                    queue_item.locked_at = now_utc()
                if status in {"completed", "failed", "cancelled", "dead_letter"}:
                    queue_item.completed_at = now_utc()
                session.add(
                    WorkflowCheckpoint(
                        organization_id=organization_id,
                        execution_id=execution_id,
                        request_id=request_id,
                        step_name=step_name,
                        status=status,
                        state_snapshot=state_snapshot,
                        metadata=metadata or {},
                    )
                )
                session.commit()

    def claim_next(self, *, worker_id: str, worker_type: str = "workflow-worker") -> dict[str, Any] | None:
        with self.session_factory() as session:
            now = now_utc()
            item = session.scalar(
                select(WorkflowQueueItem)
                .where(WorkflowQueueItem.status.in_(["queued", "retrying"]), WorkflowQueueItem.next_attempt_at <= now)
                .order_by(WorkflowQueueItem.priority.asc(), WorkflowQueueItem.queued_at.asc())
                .with_for_update(skip_locked=True)
            )
            if not item:
                return None
            item.status = "running"
            item.worker_id = worker_id
            item.started_at = item.started_at or now
            item.locked_at = now
            session.commit()
            session.refresh(item)
            self.record_worker_heartbeat(worker_id=worker_id, worker_type=worker_type, status="running", current_request_id=item.request_id, details={"claim": item.request_id})
            return self._serialize_queue_item(item)

    def complete(
        self,
        *,
        execution_id: str,
        organization_id: str,
        request_id: str,
        team_id: str,
        result_payload: dict[str, Any],
        state_snapshot: dict[str, Any],
        final_status: str = "completed",
    ):
        with self.session_factory() as session:
            item = session.scalar(select(WorkflowQueueItem).where(WorkflowQueueItem.execution_id == execution_id, WorkflowQueueItem.organization_id == organization_id))
            if item:
                item.status = "completed"
                item.completed_at = now_utc()
                item.checkpoint_state = state_snapshot
                item.last_error = ""
                session.commit()
        self.execution_store.update_run(
            execution_id=execution_id,
            latest_status=final_status,
            current_step="completed" if final_status == ExecutionStatus.completed.value else final_status,
            delegation_chain=state_snapshot.get("delegation_chain", []),
            provider_usage=state_snapshot.get("provider_usage", []),
            state_snapshot=state_snapshot,
            result_payload=result_payload,
            queue_status="completed",
            retry_count=state_snapshot.get("queue_retry_count", 0),
            completed=True,
        )
        self.execution_store.append_event(
            execution_id=execution_id,
            request_id=request_id,
            organization_id=organization_id,
            team_id=team_id,
            event_type="task.completed",
            status=final_status,
            agent_name="workflow-worker",
            payload=result_payload,
        )
        self.events.emit("task.completed", {"request_id": request_id, "team_id": team_id, "organization_id": organization_id, "result": result_payload})

    def fail(
        self,
        *,
        execution_id: str,
        organization_id: str,
        request_id: str,
        team_id: str,
        error_message: str,
        state_snapshot: dict[str, Any],
        retryable: bool = True,
    ) -> dict[str, Any]:
        with self.session_factory() as session:
            item = session.scalar(select(WorkflowQueueItem).where(WorkflowQueueItem.execution_id == execution_id, WorkflowQueueItem.organization_id == organization_id))
            if not item:
                return {"status": "missing"}
            item.attempts += 1
            attempt_number = item.attempts
            item.last_error = error_message
            item.checkpoint_state = state_snapshot
            retry_history = list(item.retry_history or [])
            retry_history.append({"event": "failed", "timestamp": now_utc().isoformat(), "error": error_message, "attempt": attempt_number})
            item.retry_history = retry_history
            if retryable and item.attempts <= item.max_retries:
                item.status = "retrying"
                item.next_attempt_at = now_utc() + timedelta(seconds=min(30, 5 * item.attempts))
                item.worker_id = ""
                item.locked_at = None
                outcome = "retrying"
            else:
                item.status = "dead_letter"
                item.completed_at = now_utc()
                item.worker_id = ""
                item.locked_at = None
                session.add(
                    WorkflowDeadLetter(
                        organization_id=organization_id,
                        execution_id=execution_id,
                        request_id=request_id,
                        reason=error_message,
                        payload={"state_snapshot": state_snapshot, "attempts": item.attempts},
                    )
                )
                outcome = "dead_letter"
            session.commit()
        queue_status = "retrying" if outcome == "retrying" else "dead_letter"
        latest_status = ExecutionStatus.failed.value
        self.execution_store.update_run(
            execution_id=execution_id,
            latest_status=latest_status,
            current_step="failed",
            delegation_chain=state_snapshot.get("delegation_chain", []),
            provider_usage=state_snapshot.get("provider_usage", []),
            state_snapshot=state_snapshot,
            error_message=error_message,
            queue_status=queue_status,
            retry_count=attempt_number,
        )
        self.execution_store.append_event(
            execution_id=execution_id,
            request_id=request_id,
            organization_id=organization_id,
            team_id=team_id,
            event_type="execution.recovery" if outcome == "retrying" else "task.failed",
            status="failed",
            agent_name="workflow-worker",
            payload={"error": error_message, "attempts": attempt_number, "retryable": retryable, "outcome": outcome},
        )
        self.events.emit(
            "execution.recovery" if outcome == "retrying" else "task.failed",
            {
                "request_id": request_id,
                "team_id": team_id,
                "organization_id": organization_id,
                "error": error_message,
                "outcome": outcome,
            },
        )
        return {"status": outcome}

    def cancel(self, *, organization_id: str, request_id: str, reason: str, operator_id: str = "system") -> dict[str, Any]:
        with self.session_factory() as session:
            item = session.scalar(select(WorkflowQueueItem).where(WorkflowQueueItem.organization_id == organization_id, WorkflowQueueItem.request_id == request_id))
            if not item:
                raise ValueError("workflow_queue_item_not_found")
            item.status = "cancelled"
            item.worker_id = ""
            item.locked_at = None
            item.last_error = reason
            item.completed_at = now_utc()
            item.retry_history = list(item.retry_history or []) + [{"event": "cancelled", "timestamp": now_utc().isoformat(), "reason": reason, "operator_id": operator_id}]
            session.commit()
        self.execution_store.update_run(
            execution_id=item.execution_id,
            latest_status=ExecutionStatus.cancelled.value,
            current_step="cancelled",
            delegation_chain=item.checkpoint_state.get("delegation_chain", []),
            provider_usage=item.checkpoint_state.get("provider_usage", []),
            state_snapshot=item.checkpoint_state,
            error_message=reason,
            queue_status="cancelled",
            retry_count=item.attempts,
            completed=True,
        )
        self.execution_store.append_event(
            execution_id=item.execution_id,
            request_id=request_id,
            organization_id=organization_id,
            team_id=item.checkpoint_state.get("team_id", ""),
            event_type="task.cancelled",
            status="cancelled",
            agent_name="workflow-worker",
            payload={"reason": reason, "operator_id": operator_id},
        )
        self.events.emit("task.cancelled", {"request_id": request_id, "organization_id": organization_id, "reason": reason})
        return {"status": "cancelled", "request_id": request_id}

    def retry(self, *, organization_id: str, request_id: str, reason: str, operator_id: str = "system") -> dict[str, Any]:
        with self.session_factory() as session:
            item = session.scalar(select(WorkflowQueueItem).where(WorkflowQueueItem.organization_id == organization_id, WorkflowQueueItem.request_id == request_id))
            if not item:
                raise ValueError("workflow_queue_item_not_found")
            state_snapshot = item.checkpoint_state or {}
            item.attempts += 1
            item.status = "queued"
            item.worker_id = ""
            item.locked_at = None
            item.started_at = None
            item.completed_at = None
            item.last_error = ""
            item.next_attempt_at = now_utc()
            item.retry_history = list(item.retry_history or []) + [{"event": "retry", "timestamp": now_utc().isoformat(), "reason": reason, "operator_id": operator_id}]
            session.commit()
        self.execution_store.update_run(
            execution_id=item.execution_id,
            latest_status=ExecutionStatus.queued.value,
            current_step=state_snapshot.get("current_step", "queued"),
            delegation_chain=state_snapshot.get("delegation_chain", []),
            provider_usage=state_snapshot.get("provider_usage", []),
            state_snapshot=state_snapshot,
            error_message="",
            queue_status="queued",
            retry_count=item.attempts,
        )
        self.execution_store.append_event(
            execution_id=item.execution_id,
            request_id=request_id,
            organization_id=organization_id,
            team_id=state_snapshot.get("team_id", ""),
            event_type="execution.recovery",
            status="queued",
            agent_name="workflow-worker",
            payload={"reason": reason, "operator_id": operator_id},
        )
        self.events.emit("execution.recovery", {"request_id": request_id, "organization_id": organization_id, "reason": reason})
        return {"status": "queued", "request_id": request_id}

    def recover_stale_items(self, *, stale_after_seconds: int = 900) -> list[dict[str, Any]]:
        cutoff = now_utc() - timedelta(seconds=stale_after_seconds)
        recovered: list[dict[str, Any]] = []
        with self.session_factory() as session:
            items = session.scalars(
                select(WorkflowQueueItem).where(WorkflowQueueItem.status == "running", WorkflowQueueItem.locked_at.isnot(None), WorkflowQueueItem.locked_at < cutoff)
            ).all()
            for item in items:
                item.status = "retrying"
                item.worker_id = ""
                item.next_attempt_at = now_utc()
                item.retry_history = list(item.retry_history or []) + [{"event": "recovered", "timestamp": now_utc().isoformat(), "reason": "stale_worker"}]
                recovered.append(self._serialize_queue_item(item))
                self.execution_store.update_run(
                    execution_id=item.execution_id,
                    latest_status=ExecutionStatus.running.value,
                    current_step=item.checkpoint_state.get("current_step", "queued"),
                    delegation_chain=item.checkpoint_state.get("delegation_chain", []),
                    provider_usage=item.checkpoint_state.get("provider_usage", []),
                    state_snapshot=item.checkpoint_state,
                    queue_status="retrying",
                    retry_count=item.attempts,
                )
                self.events.emit("execution.recovery", {"request_id": item.request_id, "organization_id": item.organization_id, "reason": "stale_worker"})
            if items:
                session.commit()
        return recovered

    def heartbeat(self, *, worker_id: str, worker_type: str = "workflow-worker", status: str = "idle", current_request_id: str = "", details: dict[str, Any] | None = None):
        with self.session_factory() as session:
            worker = session.scalar(select(WorkerHeartbeat).where(WorkerHeartbeat.worker_id == worker_id))
            if not worker:
                worker = WorkerHeartbeat(worker_id=worker_id, worker_type=worker_type, status=status, current_request_id=current_request_id, details=details or {}, last_heartbeat_at=now_utc())
                session.add(worker)
            else:
                worker.worker_type = worker_type
                worker.status = status
                worker.current_request_id = current_request_id
                worker.details = details or {}
                worker.last_heartbeat_at = now_utc()
            session.commit()

    def status(self, organization_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            items = session.scalars(select(WorkflowQueueItem).where(WorkflowQueueItem.organization_id == organization_id).order_by(WorkflowQueueItem.queued_at.desc())).all()
            workers = session.scalars(select(WorkerHeartbeat).order_by(WorkerHeartbeat.last_heartbeat_at.desc())).all()
            dead_letters = session.scalars(select(WorkflowDeadLetter).where(WorkflowDeadLetter.organization_id == organization_id).order_by(WorkflowDeadLetter.created_at.desc()).limit(10)).all()
            recovery_events = session.scalars(
                select(ExecutionEvent)
                .where(ExecutionEvent.organization_id == organization_id, ExecutionEvent.event_type.in_(["execution.recovery", "task.cancelled", "task.failed"]))
                .order_by(ExecutionEvent.created_at.desc(), ExecutionEvent.id.desc())
                .limit(20)
            ).all()
            summary = {
                "queued": sum(1 for item in items if item.status == "queued"),
                "running": sum(1 for item in items if item.status == "running"),
                "retrying": sum(1 for item in items if item.status == "retrying"),
                "completed": sum(1 for item in items if item.status == "completed"),
                "failed": sum(1 for item in items if item.status in {"failed", "dead_letter"}),
                "cancelled": sum(1 for item in items if item.status == "cancelled"),
                "dead_letter": sum(1 for item in items if item.status == "dead_letter"),
            }
            return {
                "organization_id": organization_id,
                "summary": summary,
                "items": [self._serialize_queue_item(item) for item in items[:50]],
                "workers": [self._serialize_worker(worker) for worker in workers],
                "dead_letters": [
                    {
                        "id": dead_letter.id,
                        "organization_id": dead_letter.organization_id,
                        "execution_id": dead_letter.execution_id,
                        "request_id": dead_letter.request_id,
                        "reason": dead_letter.reason,
                        "payload": dead_letter.payload,
                        "created_at": dead_letter.created_at.isoformat() if dead_letter.created_at else None,
                    }
                    for dead_letter in dead_letters
                ],
                "recovery_events": [
                    {
                        "id": event.id,
                        "execution_id": event.execution_id,
                        "request_id": event.request_id,
                        "event_type": event.event_type,
                        "status": event.status,
                        "agent_name": event.agent_name,
                        "payload": event.payload,
                        "created_at": event.created_at.isoformat() if event.created_at else None,
                    }
                    for event in recovery_events
                ],
            }
