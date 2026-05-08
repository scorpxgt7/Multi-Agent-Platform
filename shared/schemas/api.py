from typing import Any, Literal

from pydantic import BaseModel, Field


class SkillCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    version: str = "1.0.0"
    execution_type: Literal["tool", "reasoning", "hybrid"]
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    dependency_ids: list[str] = Field(default_factory=list)


class SkillExecuteRequest(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)
    actor_id: str = "system"


class RoleCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    permissions: dict[str, Any] = Field(default_factory=dict)
    approval_threshold: float = 0.5
    skill_ids: list[str] = Field(default_factory=list)


class OrganizationBootstrap(BaseModel):
    organization_name: str
    organization_slug: str
    workspace_name: str = ""
    workspace_slug: str = ""
    operator_name: str
    operator_email: str


class OperatorCreate(BaseModel):
    name: str
    email: str
    role: Literal["admin", "operator", "viewer"] = "viewer"
    permissions: dict[str, Any] = Field(default_factory=dict)


class OperatorUpdate(BaseModel):
    name: str
    email: str
    role: Literal["admin", "operator", "viewer"] = "viewer"
    permissions: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class AgentCreate(BaseModel):
    name: str
    role_id: str
    autonomy_level: Literal["guided", "supervised", "autonomous"] = "supervised"
    memory_config: dict[str, Any] = Field(default_factory=dict)
    skill_overrides: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    skill_ids: list[str] = Field(default_factory=list)


class AgentUpdate(BaseModel):
    name: str
    role_id: str
    autonomy_level: Literal["guided", "supervised", "autonomous"] = "supervised"
    memory_config: dict[str, Any] = Field(default_factory=dict)
    skill_overrides: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    skill_ids: list[str] = Field(default_factory=list)


class TeamCreate(BaseModel):
    name: str
    description: str = ""
    governance_config: dict[str, Any] = Field(default_factory=dict)
    agent_ids: list[str] = Field(default_factory=list)


class TeamUpdate(BaseModel):
    name: str
    description: str = ""
    governance_config: dict[str, Any] = Field(default_factory=dict)
    agent_ids: list[str] = Field(default_factory=list)


class PolicyCreate(BaseModel):
    name: str
    scope: str = "global"
    effect: Literal["allow", "review", "deny"] = "review"
    approval_threshold: float = 0.75
    conditions: dict[str, Any] = Field(default_factory=dict)
    restrictions: dict[str, Any] = Field(default_factory=dict)


class PolicyUpdate(BaseModel):
    name: str
    scope: str = "global"
    effect: Literal["allow", "review", "deny"] = "review"
    approval_threshold: float = 0.75
    conditions: dict[str, Any] = Field(default_factory=dict)
    restrictions: dict[str, Any] = Field(default_factory=dict)


class PolicyEvaluationRequest(BaseModel):
    role_id: str | None = None
    team_id: str | None = None
    skill_ids: list[str] = Field(default_factory=list)
    target_agent_id: str | None = None
    target_agent_name: str | None = None
    provider_name: str | None = None
    execution_mode: Literal["delegation", "skill_execution", "approval"] = "approval"
    risk_score: float = 0.0
    delegation_count: int = 0
    skill_execution_count: int = 0
    request_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class TaskCreate(BaseModel):
    team_id: str
    task: str
    actor_id: str = "head-admin"
    subsystem: str = "mission"
    organization_id: str | None = None
    operator_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    short_term_memory: list[dict[str, Any]] = Field(default_factory=list)


class MemoryWrite(BaseModel):
    namespace: str = "default"
    scope: Literal["short_term", "long_term"] = "long_term"
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemorySearch(BaseModel):
    namespace: str = "default"
    query: str
    top_k: int = 5
    metadata: dict[str, Any] = Field(default_factory=dict)
