from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from shared.models import WorkflowDeployment, WorkflowDefinition, WorkflowEdge, WorkflowNode


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class WorkflowStore:
    def __init__(self, session_factory):
        self.session_factory = session_factory

    def _next_version(self, session, organization_id: str) -> int:
        versions = session.scalars(select(WorkflowDeployment.version).where(WorkflowDeployment.organization_id == organization_id)).all()
        return (max(versions) if versions else 0) + 1

    def deploy(self, *, organization_id: str, operator_id: str, compiled: dict[str, Any]) -> dict[str, Any]:
        workflow = compiled.get("definition", {}).get("workflow", {})
        nodes = compiled.get("definition", {}).get("nodes", [])
        edges = compiled.get("definition", {}).get("edges", [])
        runtime_config = compiled.get("definition", {}).get("runtime_config", {})
        validation_status = compiled.get("validation_status", "valid")
        validation_details = {
            "issues": compiled.get("issues", []),
            "summary": compiled.get("summary", {}),
        }

        with self.session_factory() as session:
            version = self._next_version(session, organization_id)
            workflow_definition = WorkflowDefinition(
                organization_id=organization_id,
                name=workflow.get("name") or runtime_config.get("workflow_name") or "Visual Workforce Graph",
                version=version,
                status="deployed",
                created_by=operator_id,
                compiled_definition=compiled.get("definition", {}),
                runtime_config=runtime_config,
            )
            session.add(workflow_definition)
            session.flush()

            for node in nodes:
                session.add(
                    WorkflowNode(
                        workflow_definition_id=workflow_definition.id,
                        node_id=node.get("id", ""),
                        node_type=node.get("type", ""),
                        label=node.get("data", {}).get("label", node.get("id", "")),
                        config_json=node.get("data", {}),
                        position_x=float(node.get("position", {}).get("x", 0.0) or 0.0),
                        position_y=float(node.get("position", {}).get("y", 0.0) or 0.0),
                    )
                )

            for edge in edges:
                session.add(
                    WorkflowEdge(
                        workflow_definition_id=workflow_definition.id,
                        edge_id=edge.get("id", ""),
                        source_node=edge.get("source", ""),
                        target_node=edge.get("target", ""),
                        edge_type=edge.get("type", "delegation"),
                        condition_json=edge.get("data", {}),
                    )
                )

            session.query(WorkflowDeployment).filter(WorkflowDeployment.organization_id == organization_id, WorkflowDeployment.status == "active").update({"status": "inactive"}, synchronize_session=False)

            deployment = WorkflowDeployment(
                organization_id=organization_id,
                workflow_definition_id=workflow_definition.id,
                version=version,
                status="active",
                validation_status=validation_status,
                validation_details=validation_details,
                compiled_definition=compiled.get("definition", {}),
                runtime_config=runtime_config,
                deployed_at=now_utc(),
            )
            session.add(deployment)
            session.commit()
            session.refresh(workflow_definition)
            session.refresh(deployment)

            return self.serialize_deployment(deployment, workflow_definition)

    def list_versions(self, organization_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            deployments = session.scalars(
                select(WorkflowDeployment).where(WorkflowDeployment.organization_id == organization_id).order_by(WorkflowDeployment.version.desc())
            ).all()
            definitions = {
                definition.id: definition
                for definition in session.scalars(select(WorkflowDefinition).where(WorkflowDefinition.organization_id == organization_id)).all()
            }
            return [self.serialize_deployment(deployment, definitions.get(deployment.workflow_definition_id)) for deployment in deployments]

    def get_active(self, organization_id: str) -> dict[str, Any] | None:
        with self.session_factory() as session:
            deployment = session.scalar(
                select(WorkflowDeployment).where(WorkflowDeployment.organization_id == organization_id, WorkflowDeployment.status == "active").order_by(WorkflowDeployment.version.desc())
            )
            if not deployment:
                return None
            definition = session.get(WorkflowDefinition, deployment.workflow_definition_id)
            return self.serialize_deployment(deployment, definition)

    def rollback(self, *, organization_id: str, deployment_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            deployment = session.get(WorkflowDeployment, deployment_id)
            if not deployment or deployment.organization_id != organization_id:
                raise ValueError("workflow_deployment_not_found")
            previous_active = session.scalar(
                select(WorkflowDeployment).where(WorkflowDeployment.organization_id == organization_id, WorkflowDeployment.status == "active").order_by(WorkflowDeployment.version.desc())
            )
            session.query(WorkflowDeployment).filter(WorkflowDeployment.organization_id == organization_id).update({"status": "inactive"}, synchronize_session=False)
            deployment.status = "active"
            deployment.deployed_at = now_utc()
            if previous_active and previous_active.id != deployment.id:
                deployment.rolled_back_from_deployment_id = previous_active.id
            session.commit()
            definition = session.get(WorkflowDefinition, deployment.workflow_definition_id)
            return self.serialize_deployment(deployment, definition)

    def serialize_deployment(self, deployment: WorkflowDeployment, definition: WorkflowDefinition | None = None) -> dict[str, Any]:
        definition_payload = definition.compiled_definition if definition else deployment.compiled_definition
        runtime_config = definition.runtime_config if definition else deployment.runtime_config
        return {
            "id": deployment.id,
            "organization_id": deployment.organization_id,
            "workflow_definition_id": deployment.workflow_definition_id,
            "version": deployment.version,
            "status": deployment.status,
            "validation_status": deployment.validation_status,
            "validation_details": deployment.validation_details,
            "compiled_definition": definition_payload,
            "runtime_config": runtime_config,
            "deployed_at": deployment.deployed_at.isoformat() if deployment.deployed_at else None,
            "rolled_back_from_deployment_id": deployment.rolled_back_from_deployment_id,
            "workflow": {
                "id": definition.id if definition else deployment.workflow_definition_id,
                "name": definition.name if definition else definition_payload.get("workflow", {}).get("name", "Visual Workforce Graph"),
                "version": definition.version if definition else deployment.version,
                "status": definition.status if definition else "deployed",
                "created_by": definition.created_by if definition else "system",
                "created_at": definition.created_at.isoformat() if definition and definition.created_at else None,
                "updated_at": definition.updated_at.isoformat() if definition and definition.updated_at else None,
            },
        }
