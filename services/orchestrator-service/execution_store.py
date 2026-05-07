from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import ExecutionEvent, ExecutionRun, ExecutionStatus


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def status_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


class ExecutionStore:
    def __init__(self, session_factory):
        self.session_factory = session_factory

    def create_run(self, *, team_id: str, actor_id: str, subsystem: str, task: str, context: dict[str, Any]) -> dict[str, str]:
        request_id = str(uuid.uuid4())
        execution_id = str(uuid.uuid4())
        with self.session_factory() as session:
            run = ExecutionRun(
                id=execution_id,
                request_id=request_id,
                team_id=team_id,
                actor_id=actor_id,
                subsystem=subsystem,
                task=task,
                latest_status=ExecutionStatus.queued,
                final_status=ExecutionStatus.queued.value,
                current_step="received",
                context=context,
                state_snapshot={},
            )
            session.add(run)
            session.flush()
            session.add(
                ExecutionEvent(
                    execution_id=execution_id,
                    request_id=request_id,
                    team_id=team_id,
                    event_type="task.received",
                    status=ExecutionStatus.queued.value,
                    agent_name="head-admin",
                    payload={"task": task, "subsystem": subsystem},
                )
            )
            session.commit()
        return {"request_id": request_id, "execution_id": execution_id}

    def append_event(
        self,
        *,
        execution_id: str,
        request_id: str,
        team_id: str,
        event_type: str,
        status: str,
        agent_name: str = "",
        skill_id: str = "",
        provider_name: str = "",
        payload: dict[str, Any] | None = None,
    ) -> None:
        with self.session_factory() as session:
            session.add(
                ExecutionEvent(
                    execution_id=execution_id,
                    request_id=request_id,
                    team_id=team_id,
                    event_type=event_type,
                    status=status,
                    agent_name=agent_name,
                    skill_id=skill_id,
                    provider_name=provider_name,
                    payload=payload or {},
                )
            )
            session.commit()

    def update_run(
        self,
        *,
        execution_id: str,
        latest_status: str,
        current_step: str,
        delegation_chain: list[dict[str, Any]] | None = None,
        provider_usage: list[dict[str, Any]] | None = None,
        state_snapshot: dict[str, Any] | None = None,
        result_payload: dict[str, Any] | None = None,
        error_message: str | None = None,
        completed: bool = False,
    ) -> None:
        with self.session_factory() as session:
            run = session.get(ExecutionRun, execution_id)
            if not run:
                return
            run.latest_status = latest_status
            run.final_status = latest_status
            run.current_step = current_step
            if delegation_chain is not None:
                run.delegation_chain = delegation_chain
            if provider_usage is not None:
                run.provider_usage = provider_usage
            if state_snapshot is not None:
                run.state_snapshot = state_snapshot
            if result_payload is not None:
                run.result_payload = result_payload
            if error_message is not None:
                run.error_message = error_message
            if completed:
                run.completed_at = now_utc()
            session.commit()

    def list_runs(self) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            runs = session.scalars(select(ExecutionRun).order_by(ExecutionRun.started_at.desc()).limit(50)).all()
            return [
                {
                    "id": run.id,
                    "request_id": run.request_id,
                    "team_id": run.team_id,
                    "actor_id": run.actor_id,
                    "subsystem": run.subsystem,
                    "task": run.task,
                    "latest_status": status_value(run.latest_status),
                    "final_status": run.final_status,
                    "current_step": run.current_step,
                    "delegation_chain": run.delegation_chain,
                    "provider_usage": run.provider_usage,
                    "started_at": run.started_at.isoformat() if run.started_at else None,
                    "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                    "error_message": run.error_message,
                }
                for run in runs
            ]

    def get_run_detail(self, request_id: str) -> dict[str, Any] | None:
        with self.session_factory() as session:
            run = session.scalar(select(ExecutionRun).where(ExecutionRun.request_id == request_id))
            if not run:
                return None
            events = session.scalars(select(ExecutionEvent).where(ExecutionEvent.execution_id == run.id).order_by(ExecutionEvent.created_at.asc(), ExecutionEvent.id.asc())).all()
            return {
                "execution": {
                    "id": run.id,
                    "request_id": run.request_id,
                    "team_id": run.team_id,
                    "actor_id": run.actor_id,
                    "subsystem": run.subsystem,
                    "task": run.task,
                    "latest_status": status_value(run.latest_status),
                    "final_status": run.final_status,
                    "current_step": run.current_step,
                    "delegation_chain": run.delegation_chain,
                    "provider_usage": run.provider_usage,
                    "context": run.context,
                    "result_payload": run.result_payload,
                    "state_snapshot": run.state_snapshot,
                    "error_message": run.error_message,
                    "started_at": run.started_at.isoformat() if run.started_at else None,
                    "completed_at": run.completed_at.isoformat() if run.completed_at else None,
                },
                "events": [
                    {
                        "id": event.id,
                        "event_type": event.event_type,
                        "status": event.status,
                        "agent_name": event.agent_name,
                        "skill_id": event.skill_id,
                        "provider_name": event.provider_name,
                        "payload": event.payload,
                        "created_at": event.created_at.isoformat() if event.created_at else None,
                    }
                    for event in events
                ],
            }

    def get_status(self, request_id: str) -> dict[str, Any] | None:
        with self.session_factory() as session:
            run = session.scalar(select(ExecutionRun).where(ExecutionRun.request_id == request_id))
            if not run:
                return None
            return {
                "request_id": run.request_id,
                "team_id": run.team_id,
                "latest_status": status_value(run.latest_status),
                "current_step": run.current_step,
                "delegation_chain": run.delegation_chain,
                "provider_usage": run.provider_usage,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            }
