import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow } from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";
import { Play, Plus, Save, Shield, Shuffle, Workflow as WorkflowIcon } from "lucide-react";

import { listExecutions, getExecution } from "../observability/api.js";
import {
  deployWorkflowDefinition,
  listWorkflowVersions,
  loadActiveWorkflowDeployment,
  loadWorkspaceSnapshot,
  rollbackWorkflowDeployment,
  validateWorkflowDefinition,
} from "./workflowApi.js";
import { buildSeedWorkflow, serializeWorkflow, validateWorkflow } from "./graphUtils.js";
import WorkflowNode from "./WorkflowNode.jsx";
import { useWorkflowStore, EMPTY_WORKSPACE } from "./workflowStore.js";

const NODE_LIBRARY = [
  { type: "agent", label: "Agent", title: "Agent node", description: "Head Admin, Finance, Legal, HR" },
  { type: "skill", label: "Skill", title: "Skill node", description: "Approval, invoice, legal, onboarding" },
  { type: "policy", label: "Policy", title: "Policy node", description: "Governance, thresholds, restrictions" },
  { type: "approval", label: "Approval", title: "Approval node", description: "Pause for human review" },
  { type: "router", label: "Router", title: "Router node", description: "Conditional branching and fallback" },
  { type: "memory", label: "Memory", title: "Memory node", description: "Organization or execution memory" },
  { type: "provider", label: "Provider", title: "Provider node", description: "OpenAI, Ollama, Anthropic, Groq" },
];

function makeTemplate(type) {
  return {
    id: `${type}-${Date.now()}`,
    type,
    data: {
      type,
      label: `${type[0].toUpperCase()}${type.slice(1)}`,
      status: "draft",
      runtimeStatus: "draft",
    },
    position: { x: 80, y: 80 },
  };
}

function compileWorkflowJson(workspace) {
  return JSON.stringify(serializeWorkflow(workspace), null, 2);
}

function WorkflowSidebar({ workspace, validation, focusedExecution, executions, onValidate, onDeploy, onSeed, onSelectExecution, onReloadExecutions }) {
  const deployed = workspace.workflow?.status === "deployed";
  const draftVersion = workspace.workflow?.version || 1;

  return (
    <aside className="workflow-sidebar">
      <div className="workflow-panel workflow-panel-compact">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Workspace</p>
            <h2>{workspace.workflow?.name || "Visual Workforce Graph"}</h2>
          </div>
          <span className={`workflow-pill ${deployed ? "is-ready" : "is-draft"}`}>{workspace.workflow?.status || "draft"}</span>
        </div>
        <div className="workflow-stats">
          <div><span>Version</span><strong>{draftVersion}</strong></div>
          <div><span>Nodes</span><strong>{workspace.nodes.length}</strong></div>
          <div><span>Edges</span><strong>{workspace.edges.length}</strong></div>
          <div><span>Issues</span><strong>{validation.length}</strong></div>
        </div>
        <div className="workflow-actionrow">
          <button type="button" className="workflow-button" onClick={onValidate}>
            <Shield size={15} />
            Validate
          </button>
          <button type="button" className="workflow-button" onClick={onDeploy}>
            <Play size={15} />
            Deploy
          </button>
          <button type="button" className="workflow-button workflow-button-muted" onClick={onSeed}>
            <Shuffle size={15} />
            Reseed
          </button>
        </div>
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Palette</p>
            <h3>Drag nodes onto the canvas</h3>
          </div>
        </div>
        <div className="workflow-library">
          {NODE_LIBRARY.map((item) => (
            <button
              key={item.type}
              type="button"
              className="workflow-library-item"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/reactflow", JSON.stringify(makeTemplate(item.type)));
                event.dataTransfer.effectAllowed = "move";
              }}
              title={item.description}
            >
              <span className="workflow-library-icon">
                <Plus size={14} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Deploy Flow</p>
            <h3>Draft to deploy</h3>
          </div>
        </div>
        <ol className="workflow-stage-list">
          <li className={validation.some((item) => item.level === "error") ? "is-failed" : "is-ready"}>Graph validation</li>
          <li className={validation.some((item) => item.code?.includes("policy")) ? "is-warn" : "is-ready"}>Policy validation</li>
          <li className={workspace.edges.length > 0 ? "is-ready" : "is-warn"}>Dependency validation</li>
          <li className={workspace.nodes.some((node) => node.type === "provider") ? "is-ready" : "is-warn"}>Provider validation</li>
          <li className={workspace.workflow?.deploymentStatus === "active" || deployed ? "is-ready" : "is-draft"}>Runtime deployment</li>
          <li className={focusedExecution ? "is-ready" : "is-draft"}>Live execution</li>
        </ol>
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Execution</p>
            <h3>Live overlay</h3>
          </div>
          <button type="button" className="workflow-link" onClick={onReloadExecutions}>
            Refresh
          </button>
        </div>
        <div className="workflow-execution-list">
          {executions.length === 0 ? <p className="workflow-empty">No execution history loaded yet.</p> : null}
          {executions.slice(0, 5).map((execution) => (
            <button
              type="button"
              key={execution.request_id}
              className={`workflow-execution-item ${focusedExecution?.execution?.request_id === execution.request_id ? "is-selected" : ""}`}
              onClick={() => onSelectExecution(execution.request_id)}
            >
              <strong>{execution.task.slice(0, 42)}</strong>
              <span>{execution.latest_status}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function WorkflowInspector({ selectedNode, workspace, validation, compiledJson, onUpdateNode, onClearSelection, onSaveDraft, onRollback, versions, focusedExecution, activeDeployment }) {
  const [localName, setLocalName] = useState(selectedNode?.data?.label || "");
  const [localRole, setLocalRole] = useState(selectedNode?.data?.role || "");
  const [localProvider, setLocalProvider] = useState(selectedNode?.data?.provider || "");
  const [localMemory, setLocalMemory] = useState(selectedNode?.data?.memoryProfile || "");
  const [localSkills, setLocalSkills] = useState((selectedNode?.data?.skills || []).join(", "));

  useEffect(() => {
    setLocalName(selectedNode?.data?.label || "");
    setLocalRole(selectedNode?.data?.role || "");
    setLocalProvider(selectedNode?.data?.provider || "");
    setLocalMemory(selectedNode?.data?.memoryProfile || "");
    setLocalSkills((selectedNode?.data?.skills || []).join(", "));
  }, [selectedNode?.id]);

  const providerOptions = workspace.nodes.filter((node) => node.type === "provider");

  return (
    <aside className="workflow-inspector">
      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Inspector</p>
            <h3>{selectedNode ? selectedNode.data.label : "Workflow"}</h3>
          </div>
          {selectedNode ? (
            <button type="button" className="workflow-link" onClick={onClearSelection}>
              Clear
            </button>
          ) : null}
        </div>

        {selectedNode ? (
          <div className="workflow-form">
            <label>
              <span>Node name</span>
              <input value={localName} onChange={(event) => setLocalName(event.target.value)} />
            </label>
            {selectedNode.type === "agent" ? (
              <>
                <label>
                  <span>Role</span>
                  <input value={localRole} onChange={(event) => setLocalRole(event.target.value)} />
                </label>
                <label>
                  <span>Memory profile</span>
                  <input value={localMemory} onChange={(event) => setLocalMemory(event.target.value)} />
                </label>
                <label>
                  <span>Allowed skills</span>
                  <input value={localSkills} onChange={(event) => setLocalSkills(event.target.value)} />
                </label>
              </>
            ) : null}
            {selectedNode.type === "skill" ? (
              <>
                <label>
                  <span>Provider</span>
                  <select value={localProvider} onChange={(event) => setLocalProvider(event.target.value)}>
                    <option value="">Select provider</option>
                    {providerOptions.map((provider) => (
                      <option key={provider.id} value={provider.data.provider || provider.data.label}>
                        {provider.data.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Required permissions</span>
                  <input value={localSkills} onChange={(event) => setLocalSkills(event.target.value)} />
                </label>
              </>
            ) : null}
            {selectedNode.type === "policy" ? (
              <label>
                <span>Policy target skills</span>
                <input value={localSkills} onChange={(event) => setLocalSkills(event.target.value)} />
              </label>
            ) : null}
            <div className="workflow-actionrow">
              <button
                type="button"
                className="workflow-button"
                onClick={() =>
                  onUpdateNode(selectedNode.id, {
                    label: localName,
                    role: localRole,
                    provider: localProvider,
                    memoryProfile: localMemory,
                    skills: localSkills.split(",").map((item) => item.trim()).filter(Boolean),
                  })
                }
              >
                <Save size={15} />
                Save Node
              </button>
            </div>
          </div>
        ) : (
          <p className="workflow-empty">Select a node to edit agent roles, provider routing, skills, policies, and memory.</p>
        )}
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Graph</p>
            <h3>Compiler preview</h3>
          </div>
        </div>
        <pre className="workflow-json">{compiledJson}</pre>
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Rollback</p>
            <h3>Deployment history</h3>
          </div>
          <button type="button" className="workflow-link" onClick={onSaveDraft}>
            Save draft
          </button>
        </div>
        <div className="workflow-version-list">
          {versions.length === 0 ? <p className="workflow-empty">No deployed versions yet.</p> : null}
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              className={`workflow-version-item ${activeDeployment?.id === version.id ? "is-selected" : ""}`}
              onClick={() => onRollback(version)}
            >
              <strong>v{version.workflow?.version || "1"}</strong>
              <span>{version.status}{version.deployed_at ? ` • ${version.deployed_at}` : ""}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Execution Replay</p>
            <h3>{focusedExecution?.execution?.request_id || "No run selected"}</h3>
          </div>
        </div>
        {focusedExecution ? (
          <div className="workflow-execution-detail">
            <div className="workflow-execution-state">
              <span>{focusedExecution.execution.latest_status}</span>
              <strong>{focusedExecution.execution.current_step}</strong>
            </div>
            <div className="workflow-execution-chain">
              {(focusedExecution.execution.delegation_chain || []).map((link, index) => (
                <span key={`${link.from}-${link.to}-${index}`}>{link.from}{' -> '}{link.to}</span>
              ))}
            </div>
            <div className="workflow-execution-events">
              {(focusedExecution.events || []).slice(0, 4).map((event) => (
                <div key={event.id} className="workflow-execution-event">
                  <strong>{event.event_type}</strong>
                  <span>{event.agent_name || "system"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="workflow-empty">Select a run from the overlay to replay its delegation and policy decisions.</p>
        )}
      </div>

      <div className="workflow-panel">
        <div className="workflow-panel-head">
          <div>
            <p className="workflow-eyebrow">Governance</p>
            <h3>Validation result</h3>
          </div>
        </div>
        <div className="workflow-validation-summary">
          <span className={`workflow-pill ${validation.some((item) => item.level === "error") ? "is-failed" : "is-ready"}`}>
            {validation.some((item) => item.level === "error") ? "invalid" : workspace.workflow?.validationStatus || "valid"}
          </span>
          <span className="workflow-validation-meta">
            {activeDeployment ? `active v${activeDeployment.version}` : "no active deployment"}
          </span>
        </div>
        <div className="workflow-validation-list">
          {validation.length === 0 ? <p className="workflow-empty">No issues detected.</p> : null}
          {validation.map((item) => (
            <div key={`${item.code}-${item.message}`} className={`workflow-validation-item ${item.level === "error" ? "is-failed" : "is-warn"}`}>
              <strong>{item.code}</strong>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function BuilderStage({ identityState }) {
  const activeOrganizationId = identityState.activeOrganizationId || "global";
  const apiKey = identityState.apiKey || "";
  const operator = identityState.operator || {};
  const activeOrgState = useWorkflowStore((state) => state.workspacesByOrg[activeOrganizationId] || EMPTY_WORKSPACE);
  const activeOrgId = useWorkflowStore((state) => state.activeOrganizationId);
  const setActiveOrganizationId = useWorkflowStore((state) => state.setActiveOrganizationId);
  const ensureWorkspace = useWorkflowStore((state) => state.ensureWorkspace);
  const setWorkspace = useWorkflowStore((state) => state.setWorkspace);
  const updateWorkspace = useWorkflowStore((state) => state.updateWorkspace);
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const selectedExecutionId = useWorkflowStore((state) => state.selectedExecutionId);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const selectExecution = useWorkflowStore((state) => state.selectExecution);
  const setValidation = useWorkflowStore((state) => state.setValidation);
  const reactFlow = useReactFlow();

  const [workspaceSnapshot, setWorkspaceSnapshot] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [focusedExecution, setFocusedExecution] = useState(null);
  const [deploymentHistory, setDeploymentHistory] = useState([]);
  const [activeDeployment, setActiveDeployment] = useState(null);
  const flowRef = useRef(null);

  useEffect(() => {
    setActiveOrganizationId(activeOrganizationId);
  }, [activeOrganizationId, setActiveOrganizationId]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([loadWorkspaceSnapshot(), loadActiveWorkflowDeployment(), listWorkflowVersions()])
      .then(([snapshot, active, versions]) => {
        if (!isMounted) return;
        setWorkspaceSnapshot(snapshot);
        setActiveDeployment(active?.deployment || null);
        setDeploymentHistory(versions?.versions || []);

        if (active?.deployment?.compiled_definition?.workflow) {
          const compiled = active.deployment.compiled_definition;
          const current = ensureWorkspace(activeOrganizationId, {
            ...compiled,
            workflow: {
              ...compiled.workflow,
              status: active.deployment.status === "active" ? "deployed" : compiled.workflow?.status || "draft",
              deploymentStatus: active.deployment.status,
              deploymentVersion: active.deployment.version,
              deploymentId: active.deployment.id,
              validationStatus: active.deployment.validation_status,
              deployedAt: active.deployment.deployed_at,
            },
            validation: active.deployment.validation_details?.issues || [],
          });
          setWorkspace(activeOrganizationId, current);
          return;
        }

        const seed = buildSeedWorkflow(snapshot, activeOrganizationId, operator);
        const current = ensureWorkspace(activeOrganizationId, seed);
        if (!current.workflow) {
          setWorkspace(activeOrganizationId, seed);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const seed = buildSeedWorkflow({ agents: [], skills: [], policies: [], teams: [] }, activeOrganizationId, operator);
        ensureWorkspace(activeOrganizationId, seed);
        setWorkspaceSnapshot({ agents: [], skills: [], policies: [], teams: [], executions: [] });
        setDeploymentHistory([]);
        setActiveDeployment(null);
      });
    return () => {
      isMounted = false;
    };
  }, [activeOrganizationId, operator?.name, operator?.email]);

  useEffect(() => {
    let isMounted = true;
    listExecutions()
      .then((items) => {
        if (isMounted) {
          setExecutions(items);
        }
      })
      .catch(() => {
        if (isMounted) {
          setExecutions([]);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [activeOrganizationId, apiKey]);

  const workspace = activeOrgState;
  const validation = workspace.validation || [];
  const compiledJson = useMemo(() => compileWorkflowJson(workspace), [workspace]);
  const selectedNode = workspace.nodes.find((node) => node.id === selectedNodeId) || null;

  const nodeTypes = useMemo(() => ({ agent: WorkflowNode, skill: WorkflowNode, policy: WorkflowNode, approval: WorkflowNode, router: WorkflowNode, memory: WorkflowNode, provider: WorkflowNode }), []);

  const onNodesChange = (changes) => {
    const nextNodes = applyNodeChanges(changes, workspace.nodes);
    updateWorkspace(activeOrganizationId, (current) => ({
      ...current,
      workflow: current.workflow ? { ...current.workflow, status: "draft", version: current.workflow.status === "deployed" ? current.workflow.version + 1 : current.workflow.version, updatedAt: new Date().toISOString() } : null,
      nodes: nextNodes,
    }));
  };

  const onEdgesChange = (changes) => {
    const nextEdges = applyEdgeChanges(changes, workspace.edges);
    updateWorkspace(activeOrganizationId, (current) => ({
      ...current,
      workflow: current.workflow ? { ...current.workflow, status: "draft", version: current.workflow.status === "deployed" ? current.workflow.version + 1 : current.workflow.version, updatedAt: new Date().toISOString() } : null,
      edges: nextEdges,
    }));
  };

  const onConnect = (connection) => {
    const edgeType = connection.target?.includes("policy") || connection.source?.includes("policy") ? "policy" : connection.target?.includes("approval") ? "approval" : connection.source?.includes("provider") ? "fallback" : "delegation";
    updateWorkspace(activeOrganizationId, (current) => ({
      ...current,
      workflow: current.workflow ? { ...current.workflow, status: "draft", version: current.workflow.status === "deployed" ? current.workflow.version + 1 : current.workflow.version, updatedAt: new Date().toISOString() } : null,
      edges: addEdge({ ...connection, type: edgeType, animated: edgeType !== "policy" }, current.edges),
    }));
  };

  const onDrop = (event) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/reactflow");
    if (!raw) return;
    const template = JSON.parse(raw);
    const bounds = flowRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const position = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    const projected = typeof reactFlow.project === "function" ? reactFlow.project(position) : position;
    const nextNode = {
      id: `${template.type}-${Date.now()}`,
      type: template.type,
      position: projected,
      data: {
        ...template.data,
        label: `${template.data.type[0].toUpperCase()}${template.data.type.slice(1)}`,
      },
    };
    updateWorkspace(activeOrganizationId, (current) => ({
      ...current,
      workflow: current.workflow ? { ...current.workflow, status: "draft", version: current.workflow.status === "deployed" ? current.workflow.version + 1 : current.workflow.version, updatedAt: new Date().toISOString() } : null,
      nodes: [...current.nodes, nextNode],
    }));
  };

  const onDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const onUpdateNode = (nodeId, patch) => {
    updateWorkspace(activeOrganizationId, (current) => ({
      ...current,
      workflow: current.workflow ? { ...current.workflow, status: "draft", version: current.workflow.status === "deployed" ? current.workflow.version + 1 : current.workflow.version, updatedAt: new Date().toISOString() } : null,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)),
    }));
  };

  const onSeed = () => {
    if (!workspaceSnapshot) return;
    const seed = buildSeedWorkflow(workspaceSnapshot, activeOrganizationId, operator);
    setWorkspace(activeOrganizationId, seed);
    setValidation(activeOrganizationId, []);
    selectNode("");
  };

  const onValidate = () => {
    validateWorkflowDefinition(workspace)
      .then((payload) => {
        const issues = payload?.issues || [];
        setValidation(activeOrganizationId, issues);
        updateWorkspace(activeOrganizationId, (current) => ({
          ...current,
          workflow: current.workflow
            ? {
                ...current.workflow,
                validationStatus: payload?.validation_status || (issues.some((item) => item.level === "error") ? "invalid" : "valid"),
              }
            : current.workflow,
        }));
      })
      .catch(() => {
        const issues = validateWorkflow(workspace);
        setValidation(activeOrganizationId, issues);
      });
  };

  const onDeploy = () => {
    deployWorkflowDefinition(workspace)
      .then((payload) => {
        const deployment = payload?.deployment || null;
        const compiled = payload?.compiled || null;
        if (compiled?.definition) {
          const definition = compiled.definition;
          setWorkspace(activeOrganizationId, {
            ...definition,
            workflow: {
              ...definition.workflow,
              status: "deployed",
              deploymentStatus: deployment?.status || "active",
              deploymentVersion: deployment?.version || definition.workflow?.version || 1,
              deploymentId: deployment?.id || "",
              validationStatus: deployment?.validation_status || "valid",
              deployedAt: deployment?.deployed_at || new Date().toISOString(),
            },
            validation: deployment?.validation_details?.issues || [],
          });
          setValidation(activeOrganizationId, deployment?.validation_details?.issues || []);
        }
        refreshDeployments();
      })
      .catch((error) => {
        const issues = validateWorkflow(workspace);
        setValidation(activeOrganizationId, issues);
        console.error(error);
      });
  };

  const onSaveDraft = () => {
    updateWorkspace(activeOrganizationId, (current) => ({
      ...current,
      workflow: current.workflow ? { ...current.workflow, status: "draft", updatedAt: new Date().toISOString() } : null,
    }));
  };

  const onRollback = (version) => {
    rollbackWorkflowDeployment(version.id)
      .then((payload) => {
        const deployment = payload?.deployment || null;
        const compiled = deployment?.compiled_definition || version.workflow || {};
        if (compiled) {
          setWorkspace(activeOrganizationId, {
            ...compiled,
            workflow: {
              ...compiled.workflow,
              status: "deployed",
              deploymentStatus: deployment?.status || "active",
              deploymentVersion: deployment?.version || compiled.workflow?.version || 1,
              deploymentId: deployment?.id || version.id,
              validationStatus: deployment?.validation_status || "valid",
              deployedAt: deployment?.deployed_at || new Date().toISOString(),
            },
            validation: deployment?.validation_details?.issues || version.validation || [],
          });
          setValidation(activeOrganizationId, deployment?.validation_details?.issues || version.validation || []);
        }
        refreshDeployments();
      })
      .catch(() => {
        setWorkspace(activeOrganizationId, {
          workflow: {
            ...(version.workflow || workspace.workflow || EMPTY_WORKSPACE.workflow),
            status: "draft",
            updatedAt: new Date().toISOString(),
          },
          nodes: version.nodes || [],
          edges: version.edges || [],
          validation: version.validation || [],
          runtime: version.runtime || EMPTY_WORKSPACE.runtime,
          versions: workspace.versions || [],
        });
      });
  };

  const onReloadExecutions = () => {
    listExecutions()
      .then((items) => {
        setExecutions(items);
      })
      .catch(() => {
        setExecutions([]);
      });
  };

  const refreshDeployments = () => {
    listWorkflowVersions()
      .then((payload) => {
        setDeploymentHistory(payload?.versions || []);
        const active = (payload?.versions || []).find((version) => version.status === "active") || null;
        setActiveDeployment(active);
      })
      .catch(() => {
        setDeploymentHistory([]);
        setActiveDeployment(null);
      });
  };

  const onSelectExecution = (requestId) => {
    selectExecution(requestId);
    getExecution(requestId)
      .then((payload) => {
        setFocusedExecution(payload);
        updateWorkspace(activeOrganizationId, (current) => ({
          ...current,
          runtime: {
            ...current.runtime,
            focusedExecutionId: requestId,
            executionStatus: payload.execution?.latest_status || "idle",
          },
        }));
      })
      .catch(() => {
        setFocusedExecution(null);
      });
  };

  useEffect(() => {
    if (!selectedExecutionId) {
      return;
    }
    onSelectExecution(selectedExecutionId);
  }, [selectedExecutionId]);

  const executionHighlights = useMemo(() => {
    if (!focusedExecution?.execution) {
      return {};
    }
    const chain = new Set((focusedExecution.execution.delegation_chain || []).flatMap((link) => [link.from, link.to]));
    const skillIds = new Set((focusedExecution.events || []).filter((event) => event.skill_id).map((event) => event.skill_id));
    const agentNames = new Set((focusedExecution.events || []).map((event) => event.agent_name).filter(Boolean));
    return { chain, skillIds, agentNames };
  }, [focusedExecution]);

  const canvasNodes = useMemo(
    () =>
      workspace.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          runtimeStatus:
            focusedExecution && executionHighlights.agentNames.has(node.data.label)
              ? "active"
              : focusedExecution && executionHighlights.skillIds.has(node.data.entityId)
                ? "active"
                : node.data.runtimeStatus || node.data.status || "draft",
        },
      })),
    [workspace.nodes, focusedExecution, executionHighlights],
  );

  return (
    <div className="workflow-studio">
      <div className="workflow-stage">
        <div className="workflow-canvas-toolbar">
          <div>
            <p className="workflow-eyebrow">Visual Runtime Builder</p>
            <h1>Deploy AI Workforce Graphs</h1>
          </div>
          <div className="workflow-toolbar-actions">
            <span className="workflow-pill">{workspace.workflow?.status || "draft"}</span>
            <span className="workflow-pill is-ready">org {activeOrganizationId || "global"}</span>
            <span className="workflow-pill">{workspace.workflow?.name || "workflow"}</span>
            <span className={`workflow-pill ${workspace.workflow?.deploymentStatus === "active" ? "is-ready" : "is-draft"}`}>
              {workspace.workflow?.deploymentStatus ? `deployment ${workspace.workflow.deploymentStatus}` : "deployment inactive"}
            </span>
          </div>
        </div>

        <div className="workflow-canvas-shell" ref={flowRef} onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={canvasNodes}
            edges={workspace.edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => selectNode(node.id)}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{ animated: true, markerEnd: { type: "arrowclosed" } }}
          >
            <Background gap={24} size={1} color="#1f2a37" />
            <Controls showInteractive={false} />
            <MiniMap zoomable pannable nodeColor={(node) => node.data?.color || "#94a3b8"} />
          </ReactFlow>

          <div className="workflow-canvas-overlay">
            <motion.div className="workflow-overlay-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="workflow-overlay-head">
                <WorkflowIcon size={16} />
                <strong>Compiler Preview</strong>
              </div>
              <p>Draft, validate, deploy, and replay workflows without writing orchestration code in the browser.</p>
            </motion.div>
          </div>
        </div>
      </div>

      <WorkflowSidebar
        workspace={workspace}
        validation={validation}
        focusedExecution={focusedExecution}
        executions={executions}
        onValidate={onValidate}
        onDeploy={onDeploy}
        onSeed={onSeed}
        onSelectExecution={onSelectExecution}
        onReloadExecutions={onReloadExecutions}
      />

      <WorkflowInspector
        selectedNode={selectedNode}
        workspace={workspace}
        validation={validation}
        compiledJson={compiledJson}
        onUpdateNode={onUpdateNode}
        onClearSelection={() => selectNode("")}
        onSaveDraft={onSaveDraft}
        onRollback={onRollback}
        versions={deploymentHistory}
        focusedExecution={focusedExecution}
        activeDeployment={activeDeployment}
      />
    </div>
  );
}

export default function WorkflowBuilder({ identityState }) {
  return (
    <ReactFlowProvider>
      <BuilderStage identityState={identityState} />
    </ReactFlowProvider>
  );
}
