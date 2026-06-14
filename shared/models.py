import enum
import uuid

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from shared.db import Base


class ExecutionType(str, enum.Enum):
    tool = "tool"
    reasoning = "reasoning"
    hybrid = "hybrid"


class AutonomyLevel(str, enum.Enum):
    guided = "guided"
    supervised = "supervised"
    autonomous = "autonomous"


class PolicyEffect(str, enum.Enum):
    allow = "allow"
    review = "review"
    deny = "deny"


class OperatorRole(str, enum.Enum):
    admin = "admin"
    operator = "operator"
    viewer = "viewer"


class ExecutionStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    awaiting_approval = "awaiting_approval"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0.0")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    execution_type: Mapped[ExecutionType] = mapped_column(Enum(ExecutionType), nullable=False)
    input_schema: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    output_schema: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SkillDependency(Base):
    __tablename__ = "skill_dependencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    depends_on_skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    requirement_type: Mapped[str] = mapped_column(String(32), nullable=False, default="required")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    permissions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    approval_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RoleSkill(Base):
    __tablename__ = "role_skills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    restriction_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True)
    autonomy_level: Mapped[AutonomyLevel] = mapped_column(Enum(AutonomyLevel), nullable=False, default=AutonomyLevel.supervised)
    memory_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    skill_overrides: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AgentSkill(Base):
    __tablename__ = "agent_skills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    override_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    governance_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TeamAgent(Base):
    __tablename__ = "team_agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    scope: Mapped[str] = mapped_column(String(64), nullable=False, default="global")
    effect: Mapped[PolicyEffect] = mapped_column(Enum(PolicyEffect), nullable=False, default=PolicyEffect.review)
    approval_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.75)
    conditions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    restrictions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    actor_type: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False, default="system")
    resource_type: Mapped[str] = mapped_column(String(128), nullable=False, default="platform")
    resource_id: Mapped[str] = mapped_column(String(128), nullable=False, default="global")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ExecutionRun(Base):
    __tablename__ = "execution_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(128), nullable=False, default="head-admin")
    subsystem: Mapped[str] = mapped_column(String(64), nullable=False, default="mission")
    task: Mapped[str] = mapped_column(Text, nullable=False)
    workflow_definition_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    workflow_deployment_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    latest_status: Mapped[ExecutionStatus] = mapped_column(Enum(ExecutionStatus), nullable=False, default=ExecutionStatus.queued, index=True)
    final_status: Mapped[str] = mapped_column(String(64), nullable=False, default="queued")
    current_step: Mapped[str] = mapped_column(String(128), nullable=False, default="received")
    queue_status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_queued", index=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delegation_chain: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    provider_usage: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    result_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    state_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExecutionEvent(Base):
    __tablename__ = "execution_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="queued")
    agent_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    skill_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    provider_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MemoryRecord(Base):
    __tablename__ = "memory_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    namespace: Mapped[str] = mapped_column(String(64), nullable=False, default="default", index=True)
    scope: Mapped[str] = mapped_column(String(64), nullable=False, default="long_term")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_payload: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)
    embedding: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    workspace_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    workspace_slug: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Operator(Base):
    __tablename__ = "operators"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    role: Mapped[OperatorRole] = mapped_column(Enum(OperatorRole), nullable=False, default=OperatorRole.viewer)
    api_key: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    permissions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_by: Mapped[str] = mapped_column(String(128), nullable=False, default="system")
    compiled_definition: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    runtime_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WorkflowNode(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_definition_id: Mapped[str] = mapped_column(ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    node_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    position_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowEdge(Base):
    __tablename__ = "workflow_edges"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_definition_id: Mapped[str] = mapped_column(ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    edge_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    source_node: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    target_node: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    edge_type: Mapped[str] = mapped_column(String(64), nullable=False, default="delegation")
    condition_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowDeployment(Base):
    __tablename__ = "workflow_deployments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    workflow_definition_id: Mapped[str] = mapped_column(ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="inactive", index=True)
    validation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    validation_details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    compiled_definition: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    runtime_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    deployed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_from_deployment_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WorkflowQueueItem(Base):
    __tablename__ = "workflow_queue_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_runs.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    workflow_definition_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    workflow_deployment_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    worker_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    queued_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    next_attempt_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    locked_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str] = mapped_column(Text, nullable=False, default="")
    checkpoint_state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    retry_history: Mapped[list] = mapped_column(JSON, nullable=False, default=list)


class WorkflowCheckpoint(Base):
    __tablename__ = "workflow_checkpoints"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    step_name: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    state_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    metadata_payload: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkflowDeadLetter(Base):
    __tablename__ = "workflow_dead_letters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(ForeignKey("execution_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    worker_type: Mapped[str] = mapped_column(String(64), nullable=False, default="workflow-worker")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="idle")
    current_request_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    last_heartbeat_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
