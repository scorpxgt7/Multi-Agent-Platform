import { useCallback, useEffect, useRef, useState } from "react";

const AGENT_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6"];
const STATUS_COLOR = {
  idle: "#252f3a",
  thinking: "#f59e0b",
  active: "#10b981",
  done: "#10b981",
  error: "#ef4444",
};

const DEFAULT_AGENTS = [
  { id: "a1", name: "Researcher", specialty: "Research & Intel", description: "Gathers relevant facts, context, and source inputs for the task." },
  { id: "a2", name: "Analyst", specialty: "Data Analysis", description: "Sorts signals, identifies patterns, and sharpens the problem framing." },
  { id: "a3", name: "Strategist", specialty: "Strategic Plan", description: "Turns findings into an execution plan with priorities and tradeoffs." },
  { id: "a4", name: "Writer", specialty: "Content & Comms", description: "Packages the work into clear output for stakeholders or operators." },
  { id: "a5", name: "Reviewer", specialty: "Quality Assurance", description: "Checks gaps, risks, and readiness before the final delivery." },
];

const EMPTY_STATUSES = {
  manager: "idle",
  supervisor: "idle",
  a1: "idle",
  a2: "idle",
  a3: "idle",
  a4: "idle",
  a5: "idle",
};

const TASK_PRESETS = [
  {
    label: "Research Brief",
    task: "Research a new market opportunity, summarize the strongest signals, and propose the next actions.",
  },
  {
    label: "Operations Workflow",
    task: "Design a repeatable workflow for intake, validation, execution, quality review, and delivery.",
  },
  {
    label: "Product Planning",
    task: "Break down a product initiative into user needs, requirements, implementation steps, risks, and rollout priorities.",
  },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function summarizeTask(task, fallback = "the requested workflow") {
  const summary = compactText(task);
  if (!summary) return fallback;
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}

function buildDirectiveMap(task, agents) {
  const summary = summarizeTask(task);
  const directives = {};

  agents.forEach((agent, index) => {
    const handoff = index === 0
      ? "Start the chain with a strong factual baseline."
      : "Use previous agent output as working context and improve it with your specialty.";
    directives[agent.name] = `For ${summary}, focus on ${agent.specialty.toLowerCase()}. ${agent.description} ${handoff}`;
  });

  return directives;
}

function buildManagerPlan(task, agents) {
  const summary = summarizeTask(task);
  const teamFocus = agents.map((agent, index) => `${index + 1}. ${agent.name}: ${agent.specialty} - ${agent.description}`).join("\n");

  return [
    `Objective: deliver a complete result for ${summary}.`,
    "Operating plan:",
    "1. Clarify the scope, desired outcome, and constraints that can be inferred from the task.",
    "2. Split the work into focused specialist contributions so the team does not overlap unnecessarily.",
    "3. Build the output progressively, allowing later agents to strengthen and refine prior work.",
    "4. Close with a quality pass that surfaces risks, assumptions, and next actions.",
    "Team focus:",
    teamFocus,
  ].join("\n");
}

function buildSupervisorBrief(task, agents, directiveMap) {
  const summary = summarizeTask(task);
  return [
    `Supervisor brief for ${summary}:`,
    ...agents.map((agent) => `${agent.name}: ${directiveMap[agent.name]}`),
  ].join("\n");
}

function buildAgentContribution(task, agent, directive, previousOutputs) {
  const summary = summarizeTask(task);
  const previousNames = previousOutputs.map((entry) => entry.name);

  return [
    `Focus area: ${agent.specialty}`,
    `Directive: ${directive}`,
    `Context used: ${previousNames.length ? previousNames.join(", ") : "No prior agent context yet."}`,
    `Contribution: For ${summary}, ${agent.name} should produce a practical ${agent.specialty.toLowerCase()} output that directly helps the team move toward a final deliverable.`,
    `Execution notes: ${agent.description} Keep the contribution actionable, compact, and easy for the next handoff to reuse.`,
    "Handoff guidance: Preserve the strongest points, remove duplication, and elevate anything that reduces execution risk or improves clarity.",
  ].join("\n\n");
}

function buildSynthesis(task, agents, collected) {
  const summary = summarizeTask(task);
  return [
    `Synthesis for ${summary}:`,
    "The team completed a full pass across discovery, analysis, planning, packaging, and review.",
    ...agents.map((agent) => `- ${agent.name}: ${compactText(collected[agent.name] || "No contribution recorded.")}`),
    "Integrated view: combine the validated findings, sharpen them into an execution-ready plan, and only move forward once the reviewer notes are addressed.",
  ].join("\n");
}

function buildFinalReport(task, agents, collected, synthesis) {
  const summary = summarizeTask(task);
  const specialistSections = agents.map((agent) => `${agent.name}: ${compactText(collected[agent.name] || "No contribution recorded.")}`).join("\n");

  return [
    "Executive Summary",
    `This run addressed ${summary} through a manager-led multi-agent workflow with specialist handoffs and a final quality pass.`,
    "",
    "Specialist Outputs",
    specialistSections,
    "",
    "Supervisor Synthesis",
    synthesis,
    "",
    "Recommended Next Steps",
    "1. Confirm the synthesized output matches the business goal and required level of detail.",
    "2. Turn the strongest parts into a reusable workflow or domain-specific preset.",
    "3. Add approval checkpoints before any external execution, customer delivery, or irreversible action.",
  ].join("\n");
}

async function runLocalPipelineStage(stage, payload) {
  await wait(320);

  switch (stage) {
    case "manager-plan":
      return buildManagerPlan(payload.task, payload.agents);
    case "supervisor-brief":
      return buildSupervisorBrief(payload.task, payload.agents, payload.directiveMap);
    case "agent-contribution":
      return buildAgentContribution(payload.task, payload.agent, payload.directive, payload.previousOutputs);
    case "supervisor-synthesis":
      return buildSynthesis(payload.task, payload.agents, payload.collected);
    case "manager-final":
      return buildFinalReport(payload.task, payload.agents, payload.collected, payload.synthesis);
    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}

function AgentNode({ name, role, status, size = "sm", onClick }) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.idle;
  const dimension = size === "lg" ? 66 : size === "md" ? 50 : 38;
  const codeFont = size === "lg" ? 13 : size === "md" ? 11 : 9;
  const nameFont = size === "lg" ? 12 : 10;

  return (
    <div onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ width: dimension, height: dimension, borderRadius: "50%", border: `1.5px solid ${color}`, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: status !== "idle" ? `0 0 14px ${color}45` : "none", transition: "all 0.35s ease", animation: status === "thinking" ? "nodePulse 1.4s ease-in-out infinite" : "none", position: "relative", userSelect: "none", flexShrink: 0 }}>
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: codeFont, color, fontWeight: "bold", letterSpacing: "0.04em" }}>
          {name.slice(0, 2).toUpperCase()}
        </span>
        {status === "done" && (
          <span style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 900 }}>OK</span>
        )}
      </div>
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: nameFont, color: status !== "idle" ? color : "#4a5870", textTransform: "uppercase", letterSpacing: "0.07em", transition: "color 0.3s" }}>{name}</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#2e3d4d", marginTop: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>{role.slice(0, 12)}</div>
      </div>
    </div>
  );
}

function LogEntry({ entry }) {
  const textColor = entry.type === "error" ? "#ef4444" : entry.type === "success" ? "#10b981" : entry.type === "output" ? "#6a7d90" : "#364556";

  return (
    <div style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #0c1218", animation: "fadeIn 0.25s ease" }}>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#202c38", whiteSpace: "nowrap", paddingTop: 2, minWidth: 58 }}>{entry.time}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 9, color: entry.color || "#4a5870", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: entry.type === "output" ? 3 : 0 }}>
          {entry.from}
        </div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, lineHeight: 1.55, color: textColor, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {entry.message}
        </div>
      </div>
    </div>
  );
}

function AgentEditor({ agent, color, onSave, onCancel }) {
  const [form, setForm] = useState({ ...agent });
  const inputProps = (key) => ({
    value: form[key],
    onChange: (event) => setForm((previous) => ({ ...previous, [key]: event.target.value })),
    style: { width: "100%", background: "#070a0e", border: "1px solid #1a2530", borderRadius: 3, color: "#8fa0b0", padding: "7px 10px", fontFamily: "'Share Tech Mono',monospace", fontSize: 11, outline: "none", lineHeight: 1.5 },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color, letterSpacing: "0.15em", textTransform: "uppercase" }}>Editing: {agent.name}</div>
      {[{ key: "name", label: "Agent name" }, { key: "specialty", label: "Specialty / role label" }].map(({ key, label }) => (
        <div key={key}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#364556", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
          <input {...inputProps(key)} />
        </div>
      ))}
      <div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#364556", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</div>
        <textarea {...inputProps("description")} rows={3} style={{ ...inputProps("description").style, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={() => onSave(form)} style={{ flex: 1, padding: "8px 0", background: `${color}12`, border: `1px solid ${color}50`, borderRadius: 3, color, cursor: "pointer", fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Save agent</button>
        <button onClick={onCancel} style={{ padding: "8px 14px", background: "transparent", border: "1px solid #1a2530", borderRadius: 3, color: "#4a5870", cursor: "pointer", fontFamily: "Rajdhani,sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>Cancel</button>
      </div>
    </div>
  );
}

export default function NexusAgentPlatform() {
  const [agents, setAgents] = useState(DEFAULT_AGENTS);
  const [task, setTask] = useState(TASK_PRESETS[0].task);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [statuses, setStatuses] = useState(EMPTY_STATUSES);
  const [log, setLog] = useState([]);
  const [finalOutput, setFinalOutput] = useState("");
  const [activeTab, setActiveTab] = useState("log");
  const [showConfig, setShowConfig] = useState(false);
  const [editAgent, setEditAgent] = useState(null);
  const logRef = useRef(null);
  const logId = useRef(0);
  const agentsRef = useRef(agents);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const setStatus = useCallback((id, status) => {
    setStatuses((previous) => ({ ...previous, [id]: status }));
  }, []);

  const addLog = useCallback((from, message, type = "system") => {
    const liveAgents = agentsRef.current;
    let color = "#4a5870";

    if (from === "MANAGER") color = "#f59e0b";
    else if (from === "SUPERVISOR") color = "#10b981";
    else {
      const index = liveAgents.findIndex((agent) => agent.name.toUpperCase() === from);
      if (index >= 0) color = AGENT_COLORS[index];
    }

    setLog((previous) => [
      ...previous,
      {
        id: ++logId.current,
        from,
        message,
        type,
        color,
        time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      },
    ]);
  }, []);

  const resetAll = useCallback(() => {
    setStatuses(EMPTY_STATUSES);
    setLog([]);
    setFinalOutput("");
    setPhase("idle");
    setActiveTab("log");
  }, []);

  const runPipeline = async () => {
    if (!task.trim() || running) return;

    setRunning(true);
    resetAll();

    const activeAgents = agentsRef.current;
    const directiveMap = buildDirectiveMap(task, activeAgents);

    try {
      setStatus("manager", "thinking");
      addLog("SYSTEM", "Runtime mode: local orchestrator. No external model provider is required in Phase 1.", "system");
      addLog("MANAGER", "Analyzing task. Drafting operational plan...", "system");
      const managerPlan = await runLocalPipelineStage("manager-plan", { task, agents: activeAgents });
      setStatus("manager", "done");
      addLog("MANAGER", managerPlan, "output");

      setStatus("supervisor", "thinking");
      addLog("SUPERVISOR", "Plan received. Drafting agent directives...", "system");
      const supervisorBrief = await runLocalPipelineStage("supervisor-brief", { task, agents: activeAgents, directiveMap });
      setStatus("supervisor", "done");
      addLog("SUPERVISOR", supervisorBrief, "output");

      const collected = {};
      for (let index = 0; index < activeAgents.length; index += 1) {
        const agent = activeAgents[index];
        const previousOutputs = activeAgents.slice(0, index).map((previousAgent) => ({
          name: previousAgent.name,
          output: collected[previousAgent.name],
        }));

        setStatus("supervisor", "active");
        setStatus(agent.id, "thinking");
        addLog(agent.name.toUpperCase(), `Assigned. Starting ${agent.specialty}...`, "system");

        const contribution = await runLocalPipelineStage("agent-contribution", {
          task,
          agent,
          directive: directiveMap[agent.name],
          previousOutputs,
        });

        collected[agent.name] = contribution;
        setStatus(agent.id, "done");
        addLog(agent.name.toUpperCase(), contribution, "output");
      }

      setStatus("supervisor", "thinking");
      addLog("SUPERVISOR", "All specialists complete. Synthesizing...", "system");
      const synthesis = await runLocalPipelineStage("supervisor-synthesis", {
        task,
        agents: activeAgents,
        collected,
      });
      setStatus("supervisor", "done");
      addLog("SUPERVISOR", "Synthesis complete. Escalating to Manager.", "system");

      setStatus("manager", "thinking");
      addLog("MANAGER", "Reviewing synthesis. Preparing final deliverable...", "system");
      const finalReport = await runLocalPipelineStage("manager-final", {
        task,
        agents: activeAgents,
        collected,
        synthesis,
      });
      setFinalOutput(finalReport);
      setStatus("manager", "done");
      addLog("MANAGER", "Mission complete. Final report ready.", "success");
      setPhase("complete");
      setActiveTab("output");
    } catch (error) {
      addLog("SYSTEM", `Error: ${error.message}`, "error");
      setPhase("error");
    } finally {
      setRunning(false);
    }
  };

  const phaseLabel = phase === "complete" ? "COMPLETE" : phase === "error" ? "ERROR" : running ? "ACTIVE" : "STANDBY";
  const phaseDot = phase === "complete" ? "#10b981" : phase === "error" ? "#ef4444" : running ? "#f59e0b" : "#252f3a";

  return (
    <div style={{ fontFamily: "Rajdhani,sans-serif", background: "#06080c", minHeight: "100vh", color: "#c0cdd8", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        @keyframes nodePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.65;transform:scale(1.06)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
        *{box-sizing:border-box;margin:0;padding:0}
        textarea,input{resize:none;font-size:11px}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:#08090e}
        ::-webkit-scrollbar-thumb{background:#1a2530;border-radius:2px}
        button:disabled{opacity:.35;cursor:not-allowed!important}
        button{transition:all .2s}
      `}</style>

      <div style={{ padding: "12px 20px", borderBottom: "1px solid #141c28", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#f59e0b", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 2 }}>NEXUS PLATFORM v1.1</div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.04em", color: "#dce8f0", textTransform: "uppercase" }}>Multi-Agent Command</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid #141c28", borderRadius: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: phaseDot, boxShadow: running ? `0 0 8px ${phaseDot}` : "none", transition: "all .3s" }} />
            <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#364556" }}>{phaseLabel}</span>
          </div>
          <button onClick={() => { setShowConfig(!showConfig); setEditAgent(null); }} style={{ padding: "5px 12px", background: showConfig ? "#111a24" : "transparent", border: "1px solid #1a2530", borderRadius: 3, color: showConfig ? "#a0b0c0" : "#4a5870", cursor: "pointer", fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Configure
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div style={{ width: 340, minWidth: 300, borderRight: "1px solid #141c28", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 14px", borderBottom: "1px solid #141c28", flexShrink: 0 }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#2e3d4d", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 14 }}>Command Hierarchy</div>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <AgentNode name="Manager" role="Operations" status={statuses.manager} size="lg" />
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <div style={{ width: 1, height: 18, background: statuses.manager !== "idle" ? "#f59e0b30" : "#141c28", transition: "background .4s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <AgentNode name="Supervisor" role="Coordination" status={statuses.supervisor} size="md" />
            </div>
            <div style={{ position: "relative", height: 22, marginBottom: 4 }}>
              <div style={{ position: "absolute", left: "9%", right: "9%", top: "50%", height: 1, background: "#111c28" }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: "50%", width: 1, background: statuses.supervisor !== "idle" ? "#10b98130" : "#111c28", transition: "background .4s" }} />
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} style={{ position: "absolute", left: `${9 + index * 20.5}%`, top: "50%", bottom: 0, width: 1, background: statuses[agents[index]?.id] !== "idle" ? `${AGENT_COLORS[index]}50` : "#111c28", transition: "background .4s" }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
              {agents.map((agent, index) => (
                <AgentNode key={agent.id} name={agent.name} role={agent.specialty} status={statuses[agent.id]} size="sm" onClick={() => !running && (setShowConfig(true), setEditAgent({ ...agent, colorIndex: index }))} />
              ))}
            </div>
          </div>

          <div style={{ padding: "14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#2e3d4d", letterSpacing: "0.22em", textTransform: "uppercase" }}>Task Input</div>
            <div style={{ display: "grid", gap: 8 }}>
              {TASK_PRESETS.map((preset) => (
                <button key={preset.label} type="button" disabled={running} onClick={() => setTask(preset.task)} style={{ textAlign: "left", padding: "9px 11px", background: "#0b0e15", border: "1px solid #1a2530", borderRadius: 4, color: "#8fa0b0", cursor: "pointer", fontFamily: "'Share Tech Mono',monospace", fontSize: 10 }}>
                  {preset.label}
                </button>
              ))}
            </div>
            <textarea value={task} onChange={(event) => setTask(event.target.value)} disabled={running} placeholder="Describe the task to assign to the team..." rows={6} style={{ background: "#0b0e15", border: "1px solid #1a2530", borderRadius: 4, color: "#8fa0b0", padding: "9px 11px", fontFamily: "'Share Tech Mono',monospace", fontSize: 11, lineHeight: 1.5, outline: "none", width: "100%" }} />
            <button onClick={runPipeline} disabled={running || !task.trim()} style={{ padding: "10px 0", background: running ? "#0f1820" : "linear-gradient(135deg,#f59e0b1a,#f59e0b0a)", border: `1px solid ${running ? "#1a2530" : "#f59e0b45"}`, borderRadius: 4, color: running ? "#364556" : "#f59e0b", cursor: "pointer", fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", width: "100%" }}>
              {running ? "Team Active" : "Deploy Team"}
            </button>
            {(phase === "complete" || phase === "error") && (
              <button onClick={() => { resetAll(); setTask(""); }} style={{ padding: "8px 0", background: "transparent", border: "1px solid #1a2530", borderRadius: 4, color: "#364556", cursor: "pointer", fontFamily: "Rajdhani,sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", width: "100%" }}>
                Reset
              </button>
            )}
            <div style={{ padding: "10px", background: "#0c1018", border: "1px solid #141c28", borderRadius: 4 }}>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#2e3d4d", letterSpacing: "0.15em", marginBottom: 6, textTransform: "uppercase" }}>Phase 1 Runtime</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#364556", lineHeight: 1.5 }}>
                This build runs locally without any external API requirement. Phase 2 can swap the runtime for a backend provider adapter.
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div style={{ display: "flex", borderBottom: "1px solid #141c28", padding: "0 14px", flexShrink: 0 }}>
            {["log", "output"].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "11px 14px", background: "transparent", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#f59e0b" : "transparent"}`, color: activeTab === tab ? "#f59e0b" : "#364556", cursor: "pointer", fontFamily: "Rajdhani,sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", transition: "all .2s", marginBottom: -1 }}>
                {tab === "log" ? `Activity Log${log.length ? ` (${log.length})` : ""}` : "Final Output"}
              </button>
            ))}
          </div>

          {activeTab === "log" && (
            <div ref={logRef} style={{ flex: 1, overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column" }}>
              {log.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#1e2c38", letterSpacing: "0.2em" }}>AWAITING TASK</div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#141c28" }}>Activity will stream here once deployed</div>
                </div>
              ) : (
                log.map((entry) => <LogEntry key={entry.id} entry={entry} />)
              )}
            </div>
          )}

          {activeTab === "output" && (
            <div style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>
              {finalOutput ? (
                <>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#10b981", letterSpacing: "0.2em", marginBottom: 14, textTransform: "uppercase" }}>Mission Complete - Final Report</div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "#8fa0b0", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{finalOutput}</div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: "#1e2c38", letterSpacing: "0.2em" }}>NO OUTPUT YET</div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#141c28" }}>Final report appears here on completion</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showConfig && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => { setShowConfig(false); setEditAgent(null); }}>
          <div style={{ background: "#0c0f16", border: "1px solid #1a2530", borderRadius: 6, padding: 22, width: 460, maxWidth: "92vw", maxHeight: "80vh", overflow: "auto" }} onClick={(event) => event.stopPropagation()}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#f59e0b", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 3 }}>Configuration</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#dce8f0", textTransform: "uppercase", marginBottom: 18 }}>Agent setup</div>

            {editAgent ? (
              <AgentEditor
                agent={editAgent}
                color={AGENT_COLORS[editAgent.colorIndex]}
                onSave={(updated) => {
                  setAgents((previous) => previous.map((agent) => (agent.id === updated.id ? updated : agent)));
                  setEditAgent(null);
                }}
                onCancel={() => setEditAgent(null)}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#2e3d4d", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>Click an agent to edit</div>
                {agents.map((agent, index) => (
                  <div key={agent.id} onClick={() => setEditAgent({ ...agent, colorIndex: index })} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", border: "1px solid #1a2530", borderRadius: 4, cursor: "pointer", transition: "border-color .2s" }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${AGENT_COLORS[index]}`, background: `${AGENT_COLORS[index]}15`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: AGENT_COLORS[index], fontWeight: "bold", flexShrink: 0 }}>
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#c0cdd8", marginBottom: 1 }}>{agent.name}</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#364556" }}>{agent.specialty}</div>
                    </div>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#2e3d4d" }}>Edit</div>
                  </div>
                ))}
                <div style={{ marginTop: 10, padding: "10px", background: "#07090e", border: "1px solid #141c28", borderRadius: 4 }}>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 8, color: "#2e3d4d", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Tip</div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: "#364556", lineHeight: 1.5 }}>
                    Rename agents and rewrite their specialties to fit any workflow without changing the core orchestration shell.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
