import React from "react";
import { motion } from "framer-motion";
import { Brain, Bot, Database, GitBranch, KeyRound, PanelTopOpen, Shield, Workflow } from "lucide-react";
import { Handle, Position } from "reactflow";

const ICONS = {
  agent: Bot,
  skill: Brain,
  policy: Shield,
  approval: KeyRound,
  router: GitBranch,
  memory: Database,
  provider: PanelTopOpen,
};

function statusTone(status) {
  if (status === "active" || status === "running") return "is-active";
  if (status === "ready" || status === "available") return "is-ready";
  if (status === "warn" || status === "needs-review") return "is-warn";
  if (status === "failed" || status === "blocked") return "is-failed";
  return "is-idle";
}

export default function WorkflowNode({ data, selected }) {
  const Icon = ICONS[data.type] || Workflow;
  const tone = statusTone(data.runtimeStatus || data.status);

  return (
    <motion.div
      className={`workflow-node workflow-node-${data.type || "generic"} ${selected ? "is-selected" : ""} ${tone}`}
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <Handle type="target" position={Position.Top} className="workflow-handle" />
      <div className="workflow-node-head">
        <div className="workflow-node-icon">
          <Icon size={15} />
        </div>
        <div className="workflow-node-titlewrap">
          <strong className="workflow-node-title">{data.label}</strong>
          <span className="workflow-node-subtitle">{data.type}</span>
        </div>
        <span className="workflow-node-status">{data.runtimeStatus || data.status || "draft"}</span>
      </div>

      <div className="workflow-node-body">
        {data.role ? <div className="workflow-node-field"><span>Role</span><strong>{data.role}</strong></div> : null}
        {data.provider ? <div className="workflow-node-field"><span>Provider</span><strong>{data.provider}</strong></div> : null}
        {data.executionType ? <div className="workflow-node-field"><span>Execution</span><strong>{data.executionType}</strong></div> : null}
        {data.memoryProfile ? <div className="workflow-node-field"><span>Memory</span><strong>{data.memoryProfile}</strong></div> : null}
        {Array.isArray(data.skills) && data.skills.length > 0 ? <div className="workflow-node-tags">{data.skills.slice(0, 4).map((skill) => <span key={skill}>{skill}</span>)}</div> : null}
        {Array.isArray(data.policies) && data.policies.length > 0 ? <div className="workflow-node-tags workflow-node-tags-muted">{data.policies.slice(0, 3).map((policy) => <span key={policy}>{policy}</span>)}</div> : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="workflow-handle" />
    </motion.div>
  );
}
