import { SUBSYSTEMS } from "../nexus/data.js";

const NODE_COLORS = {
  agent: "#38bdf8",
  skill: "#22c55e",
  policy: "#f59e0b",
  approval: "#f97316",
  router: "#a78bfa",
  memory: "#14b8a6",
  provider: "#ec4899",
};

function makeId(prefix, value) {
  return `${prefix}-${value}`.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
}

function baseNode(id, type, label, position, data = {}) {
  return {
    id,
    type,
    position,
    data: {
      label,
      color: NODE_COLORS[type] || "#94a3b8",
      ...data,
    },
  };
}

function defaultProviderNode(index) {
  const providers = [
    { id: "openai", label: "OpenAI", model: "gpt-4.1-mini" },
    { id: "ollama", label: "Ollama", model: "llama3:8b" },
    { id: "anthropic", label: "Anthropic", model: "claude-3.7-sonnet" },
    { id: "groq", label: "Groq", model: "llama-3.3-70b" },
  ];
  const provider = providers[index % providers.length];
  return baseNode(makeId("provider", provider.id), "provider", provider.label, { x: 760, y: 60 + index * 120 }, { provider: provider.id, model: provider.model, status: "available" });
}

export function buildSeedWorkflow(registry, organizationId, currentOperator = {}) {
  const agents = Array.isArray(registry.agents) ? registry.agents : [];
  const skills = Array.isArray(registry.skills) ? registry.skills : [];
  const policies = Array.isArray(registry.policies) ? registry.policies : [];
  const teams = Array.isArray(registry.teams) ? registry.teams : [];
  const subsystem = agents.length > 3 ? SUBSYSTEMS.find((item) => item.id === "admin") || SUBSYSTEMS[0] : SUBSYSTEMS[0];
  const headAdminNode = baseNode(makeId("agent", "head-admin"), "agent", currentOperator?.name || "Head Admin", { x: 60, y: 120 }, {
    role: "Head Admin",
    provider: "policy-driven",
    memoryProfile: "organization",
    skills: [],
    approvals: ["governance", "delegation"],
    runtimeHealth: "ready",
    subsystem: subsystem.id,
    entityId: "head-admin",
    isSynthetic: true,
  });

  const agentNodes = agents.map((agent, index) =>
    baseNode(makeId("agent", agent.id), "agent", agent.name, { x: 240 + index * 220, y: 120 + (index % 2) * 160 }, {
      role: agent.role_name || agent.role_id || "agent",
      provider: agent.config?.provider || "openai",
      memoryProfile: agent.memory_config?.namespace || "default",
      skills: agent.skill_ids || [],
      approvals: [],
      runtimeHealth: "ready",
      subsystem: subsystem.id,
      entityId: agent.id,
    }),
  );

  const skillNodes = skills.map((skill, index) =>
    baseNode(makeId("skill", skill.id), "skill", skill.name, { x: 620 + (index % 2) * 240, y: 80 + Math.floor(index / 2) * 150 }, {
      executionType: skill.execution_type || "hybrid",
      provider: "openai",
      inputSchema: skill.input_schema || {},
      outputSchema: skill.output_schema || {},
      permissions: [],
      retryPolicy: "standard",
      timeout: "60s",
      entityId: skill.id,
    }),
  );

  const policyNodes = policies.map((policy, index) =>
    baseNode(makeId("policy", policy.id), "policy", policy.name, { x: 40, y: 80 + index * 170 }, {
      effect: policy.effect,
      scope: policy.scope,
      approvalThreshold: policy.approval_threshold,
      restrictions: policy.restrictions || {},
      entityId: policy.id,
    }),
  );

  const approvalNodes = teams.map((team, index) =>
    baseNode(makeId("approval", team.id), "approval", `${team.name} Approval`, { x: 260, y: 460 + index * 150 }, {
      status: team.governance_config?.approval_required ? "required" : "optional",
      agentIds: team.agent_ids || [],
      delegationTargets: team.governance_config?.delegation_targets || [],
      riskScore: team.governance_config?.risk_score ?? 0,
      entityId: team.id,
    }),
  );

  const routerNodes = [
    baseNode("router-default", "router", "Policy Router", { x: 480, y: 20 }, {
      routes: ["delegation", "skill_execution", "approval"],
      entityId: "router-default",
    }),
  ];

  const memoryNodes = [
    baseNode("memory-org", "memory", "Org Memory", { x: 980, y: 80 }, {
      memoryScope: "organization",
      entityId: organizationId || "global",
    }),
  ];

  const providerNodes = [defaultProviderNode(0), defaultProviderNode(1)];

  const nodes = [...policyNodes, ...routerNodes, headAdminNode, ...agentNodes, ...skillNodes, ...approvalNodes, ...memoryNodes, ...providerNodes];
  const edges = [];

  agentNodes.forEach((agentNode) => {
    const agent = agents.find((item) => makeId("agent", item.id) === agentNode.id);
    (agent?.skill_ids || []).forEach((skillId) => {
      const skillNodeId = makeId("skill", skillId);
      edges.push({
        id: `${agentNode.id}->${skillNodeId}`,
        source: agentNode.id,
        target: skillNodeId,
        type: "execution",
        data: { edgeType: "execution" },
      });
    });
  });

  teams.forEach((team) => {
    const headAdminNodeId = headAdminNode.id;
    (team.governance_config?.delegation_targets || []).forEach((targetId) => {
      edges.push({
        id: `${headAdminNodeId}->${makeId("agent", targetId)}`,
        source: headAdminNodeId,
        target: makeId("agent", targetId),
        type: "delegation",
        data: { edgeType: "delegation" },
      });
    });
    edges.push({
      id: `${headAdminNodeId}->${makeId("approval", team.id)}`,
      source: headAdminNodeId,
      target: makeId("approval", team.id),
      type: "approval",
      data: { edgeType: "approval" },
    });
  });

  if (agentNodes.length > 0) {
    edges.push({
      id: `${headAdminNode.id}->${agentNodes[0].id}`,
      source: headAdminNode.id,
      target: agentNodes[0].id,
      type: "delegation",
      data: { edgeType: "delegation", reason: "default-workflow-seed" },
    });
  }

  policies.forEach((policy) => {
    const policyNodeId = makeId("policy", policy.id);
    (policy.restrictions?.allowed_skill_ids || policy.restrictions?.skill_ids || []).forEach((skillId) => {
      edges.push({
        id: `${policyNodeId}->${makeId("skill", skillId)}`,
        source: policyNodeId,
        target: makeId("skill", skillId),
        type: "policy",
        data: { edgeType: "policy" },
      });
    });
    (policy.conditions?.role_ids || []).forEach((roleId) => {
      const roleAgents = agents.filter((agent) => agent.role_id === roleId);
      roleAgents.forEach((agent) => {
        edges.push({
          id: `${policyNodeId}->${makeId("agent", agent.id)}`,
          source: policyNodeId,
          target: makeId("agent", agent.id),
          type: "policy",
          data: { edgeType: "policy" },
        });
      });
    });
  });

  providerNodes.forEach((providerNode) => {
    agentNodes.forEach((agentNode) => {
      edges.push({
        id: `${providerNode.id}->${agentNode.id}`,
        source: providerNode.id,
        target: agentNode.id,
        type: "fallback",
        data: { edgeType: "fallback" },
      });
    });
  });

  return {
    workflow: {
      id: makeId("workflow", organizationId || "global"),
      organizationId: organizationId || "global",
      name: "Visual Workforce Graph",
      version: 1,
      status: "draft",
      createdBy: currentOperator?.name || currentOperator?.email || "system",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deployedVersion: null,
    },
    nodes,
    edges,
    validation: [],
    runtime: {
      executionStatus: "idle",
      activeRunId: "",
      focusedExecutionId: "",
    },
    versions: [],
  };
}

export function serializeWorkflow(workspace) {
  return {
    workflow: workspace.workflow,
    nodes: workspace.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: workspace.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      data: edge.data,
    })),
    validation: workspace.validation || [],
    runtime: workspace.runtime || {},
  };
}

export function validateWorkflow(workspace) {
  const issues = [];
  const nodeIds = new Set(workspace.nodes.map((node) => node.id));

  if (workspace.nodes.length === 0) {
    issues.push({ level: "error", code: "empty_graph", message: "Add at least one agent, skill, or policy node." });
  }

  workspace.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ level: "error", code: "dangling_edge", message: `Edge ${edge.id} references a missing node.` });
    }
  });

  const agentNodes = workspace.nodes.filter((node) => node.type === "agent");
  agentNodes.forEach((node) => {
    if (!node.data?.role) {
      issues.push({ level: "warn", code: "agent_role_missing", message: `${node.data?.label || node.id} is missing a role binding.` });
    }
    if (!Array.isArray(node.data?.skills) || node.data.skills.length === 0) {
      issues.push({ level: "warn", code: "agent_no_skills", message: `${node.data?.label || node.id} has no assigned skills.` });
    }
  });

  const providerNodes = workspace.nodes.filter((node) => node.type === "provider");
  if (providerNodes.length === 0) {
    issues.push({ level: "warn", code: "provider_missing", message: "Add at least one provider node for routing and fallback." });
  }

  const approvalNodes = workspace.nodes.filter((node) => node.type === "approval");
  if (approvalNodes.length === 0) {
    issues.push({ level: "warn", code: "approval_missing", message: "Add an approval node to model human-in-the-loop checkpoints." });
  }

  return issues;
}
