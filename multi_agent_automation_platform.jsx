import React, { useMemo, useState } from "react";

/*
  Multi-Agent Automation Platform
  Fix applied:
  - Removed lucide-react imports because the runtime was failing to fetch icon modules from CDN.
  - Removed shadcn/ui and framer-motion dependencies to make this prototype more portable.
  - Added inline SVG icons and a small self-test panel for workflow/status logic.
*/

const iconPaths = {
  activity: "M4 12h4l2-7 4 14 2-7h4",
  bot: "M12 8V4m-4 4h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Zm1 5h.01M15 13h.01",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5.3A3.5 3.5 0 0 0 7.5 18H9m6-14a3 3 0 0 1 3 3 3 0 0 1 2 5.3A3.5 3.5 0 0 1 16.5 18H15M9 4v14m6-14v14M9 9h6M9 14h6",
  briefcase: "M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1m-9 0h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 5h14",
  check: "M20 6 9 17l-5-5",
  chevron: "m9 18 6-6-6-6",
  clipboard: "M9 4h6l1 2h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l1-2Zm0 7h6m-6 4h6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v5l3 2",
  cpu: "M9 9h6v6H9zM4 9h2m-2 6h2m12-6h2m-2 6h2M9 4v2m6-2v2M9 18v2m6-2v2M7 7h10v10H7z",
  database: "M4 6c0-2 4-3 8-3s8 1 8 3-4 3-8 3-8-1-8-3Zm0 0v6c0 2 4 3 8 3s8-1 8-3V6M4 12v6c0 2 4 3 8 3s8-1 8-3v-6",
  fileSearch: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M10.5 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm2.5-1 3 3",
  gauge: "M4 14a8 8 0 0 1 16 0M12 14l4-4M5 19h14",
  git: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 6v6a3 3 0 1 0 3 3M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0c0 3-2 4-6 4H6",
  layout: "M3 4h18v16H3zM3 9h18M9 9v11",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  pause: "M8 5v14M16 5v14",
  play: "M8 5v14l11-7Z",
  refresh: "M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M1 12h3m16 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-4-10 3 3 5-6",
  sliders: "M4 6h10m4 0h2M4 12h2m4 0h10M4 18h10m4 0h2M14 4v4M8 10v4M16 16v4",
  sparkles: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6 12 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  wand: "M15 4l5 5M14 5l5 5L8 21H3v-5L14 5Zm-2-2 1-2m7 11 2 1M3 7l2 1m2-5 1 2",
};

function Icon({ name, className = "h-5 w-5" }) {
  if (!iconPaths[name]) {
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name] || iconPaths.activity} />
    </svg>
  );
}

function Card({ children, className = "" }) {
  return <div className={`rounded-3xl border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Button({ children, onClick, disabled = false, variant = "primary" }) {

  const base = "inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "dark"
      ? "bg-zinc-950 text-white hover:bg-zinc-800"
      : variant === "ghost"
        ? "bg-white/10 text-white hover:bg-white/20"
        : "bg-white text-zinc-950 hover:bg-zinc-200";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

const initialAgents = [
  {
    id: "research",
    name: "Research Agent",
    specialty: "Research & Discovery",
    description: "Collects requirements, finds references, summarizes useful context, and identifies missing information.",
    icon: "fileSearch",
    accent: "bg-blue-500",
  },
  {
    id: "planning",
    name: "Planning Agent",
    specialty: "Workflow Planning",
    description: "Breaks the automation request into milestones, dependencies, triggers, and execution steps.",
    icon: "git",
    accent: "bg-violet-500",
  },
  {
    id: "execution",
    name: "Execution Agent",
    specialty: "Task Execution",
    description: "Runs the core automation steps, prepares outputs, and coordinates tool/API actions.",
    icon: "cpu",
    accent: "bg-emerald-500",
  },
  {
    id: "data",
    name: "Data Agent",
    specialty: "Data Processing",
    description: "Handles structured data, files, validation, transformation, enrichment, and reporting logic.",
    icon: "database",
    accent: "bg-amber-500",
  },
  {
    id: "qa",
    name: "QA Agent",
    specialty: "Quality Assurance",
    description: "Reviews results, checks edge cases, validates completion, and flags risk before final delivery.",
    icon: "shield",
    accent: "bg-rose-500",
  },
];

const taskTemplates = [
  {
    name: "Customer Support Automation",
    task: "Analyze incoming customer messages, classify intent, draft a response, check quality, and prepare the final reply.",
  },
  {
    name: "Data Cleanup Workflow",
    task: "Import a spreadsheet, normalize fields, detect duplicate records, validate missing data, and produce a cleanup report.",
  },
  {
    name: "Content Production Flow",
    task: "Research a topic, create an outline, draft the content, optimize it, and run final quality review.",
  },
  {
    name: "Lead Processing Automation",
    task: "Review new leads, enrich contact details, score urgency, assign follow-up steps, and prepare a status summary.",
  },
];

const workflowSteps = [
  {
    owner: "Overall Manager",
    title: "Understand the objective",
    detail: "Clarifies the automation goal, success criteria, and operating constraints.",
  },
  {
    owner: "Overall Manager",
    title: "Create operation brief",
    detail: "Defines what needs to happen, what each team member should own, and what the final output should look like.",
  },
  {
    owner: "Supervisor",
    title: "Assign subtasks",
    detail: "Converts the operation brief into agent-specific work packets and sets the sequence of execution.",
  },
  {
    owner: "Research Agent",
    title: "Gather context",
    detail: "Collects relevant information, checks gaps, and prepares notes for the rest of the team.",
  },
  {
    owner: "Planning Agent",
    title: "Design workflow",
    detail: "Builds the step-by-step automation path, including dependencies, inputs, outputs, and fallback paths.",
  },
  {
    owner: "Execution Agent",
    title: "Run automation",
    detail: "Carries out the operational steps and prepares draft deliverables.",
  },
  {
    owner: "Data Agent",
    title: "Process data",
    detail: "Structures, validates, transforms, or enriches any data required by the automation.",
  },
  {
    owner: "QA Agent",
    title: "Validate output",
    detail: "Reviews final output for accuracy, completion, risks, and improvement opportunities.",
  },
  {
    owner: "Supervisor",
    title: "Compile result",
    detail: "Combines agent outputs into one clean package for the manager.",
  },
  {
    owner: "Overall Manager",
    title: "Approve final delivery",
    detail: "Reviews the completed package and marks the operation as ready.",
  },
];

function statusForStep(currentStep, index, isRunning, isComplete) {
  const status = isComplete || index < currentStep
    ? "complete"
    : index === currentStep && isRunning
      ? "active"
      : index === currentStep && !isRunning && currentStep > 0
        ? "paused"
        : "pending";

  return status;
}

function calculateProgress(currentStep, totalSteps) {
  if (!totalSteps) {
    return 0;
  }

  const progress = Math.min(100, Math.round((currentStep / totalSteps) * 100));

  return progress;
}

function runSelfTests() {

  const tests = [
    {
      name: "Initial step is pending when not running",
      pass: statusForStep(0, 0, false, false) === "pending",
    },
    {
      name: "Current step is active when running",
      pass: statusForStep(0, 0, true, false) === "active",
    },
    {
      name: "Previous step becomes complete",
      pass: statusForStep(2, 1, true, false) === "complete",
    },
    {
      name: "Paused current step is marked paused",
      pass: statusForStep(2, 2, false, false) === "paused",
    },
    {
      name: "Completed workflow marks every step complete",
      pass: statusForStep(10, 9, false, true) === "complete",
    },
    {
      name: "Progress reaches 100% at final step",
      pass: calculateProgress(10, 10) === 100,
    },
    {
      name: "Progress starts at 0%",
      pass: calculateProgress(0, 10) === 0,
    },
  ];

  return tests;
}

function StatusPill({ status }) {

  const styles = {
    active: "bg-zinc-950 text-white",
    complete: "bg-emerald-100 text-emerald-800",
    paused: "bg-amber-100 text-amber-800",
    pending: "bg-zinc-100 text-zinc-500",
  };

  const labels = {
    active: "Running",
    complete: "Done",
    paused: "Paused",
    pending: "Waiting",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

function AgentCard({ agent, status, index, onChange, editable = true }) {

  return (
    <div className="h-full animate-[fadeIn_0.25s_ease-out]" style={{ animationDelay: `${index * 35}ms` }}>
      <Card className="h-full overflow-hidden rounded-2xl">
        <div className={`h-1.5 ${agent.accent}`} />
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-zinc-100 p-2.5 text-zinc-800">
                <Icon name={agent.icon} className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-950">{agent.name}</h3>
                <p className="text-sm text-zinc-500">{agent.specialty}</p>
              </div>
            </div>
            <StatusPill status={status} />
          </div>

          <p className="text-sm leading-6 text-zinc-600">{agent.description}</p>

          <div className="rounded-xl bg-zinc-50 p-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              Customize specialty
            </label>
            <input
              value={agent.specialty}
              disabled={!editable}
              onChange={(event) => onChange(agent.id, "specialty", event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-500"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

function TeamNode({ title, subtitle, icon, tone = "dark" }) {

  const toneClass =
    tone === "dark"
      ? "bg-zinc-950 text-white"
      : tone === "mid"
        ? "bg-zinc-800 text-white"
        : "border border-zinc-200 bg-white text-zinc-950";

  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm ${toneClass}`}>
      <div className="rounded-xl bg-white/15 p-2">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs opacity-70">{subtitle}</div>
      </div>
    </div>
  );
}

export default function MultiAgentAutomationPlatform() {

  const [agents, setAgents] = useState(initialAgents);
  const [task, setTask] = useState(taskTemplates[0].task);
  const [selectedTemplate, setSelectedTemplate] = useState(taskTemplates[0].name);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState([
    "System initialized.",
    "Manager is ready to receive a new automation request.",
  ]);

  const isComplete = currentStep >= workflowSteps.length;
  const progress = useMemo(() => calculateProgress(currentStep, workflowSteps.length), [currentStep]);
  const activeOwner = isComplete ? "Complete" : workflowSteps[currentStep]?.owner || "Ready";
  const selfTests = useMemo(() => runSelfTests(), []);
  const passedTests = selfTests.filter((test) => test.pass).length;

  const metrics = [
    { label: "Team Size", value: "7", detail: "1 manager, 1 supervisor, 5 agents", icon: "users" },
    { label: "Progress", value: `${progress}%`, detail: "Current workflow completion", icon: "gauge" },
    { label: "Active Owner", value: activeOwner, detail: "Currently responsible role", icon: "activity" },
    { label: "Mode", value: "Flexible", detail: "Customize skills and task type", icon: "sliders" },
  ];

  function updateAgent(id, field, value) {

    setAgents((previous) => {
      const nextAgents = previous.map((agent) => (agent.id === id ? { ...agent, [field]: value } : agent));

      return nextAgents;
    });
  }

  function applyTemplate(name) {

    const template = taskTemplates.find((item) => item.name === name);
    setSelectedTemplate(name);
    if (template) {

      setTask(template.task);
      setCurrentStep(0);
      setIsRunning(false);
      setLog([
        `Template selected: ${template.name}.`,
        "Manager is ready to start the operation.",
      ]);
    } else {
    }
  }

  function runNextStep() {

    if (isComplete) {
      return;
    }

    const step = workflowSteps[currentStep];

    setLog((previous) => {
      const nextLog = [
        `${step.owner}: ${step.title} - ${step.detail}`,
        ...previous,
      ];

      return nextLog;
    });
    setCurrentStep((previous) => {
      const nextStep = previous + 1;
      return nextStep;
    });
    setIsRunning(true);
  }

  function resetWorkflow() {

    setCurrentStep(0);
    setIsRunning(false);
    setLog(["Workflow reset.", "Manager is ready to receive a new automation request."]);
  }

  function pauseWorkflow() {

    setIsRunning(false);
    if (!isComplete) {
      setLog((previous) => {
        const nextLog = ["Workflow paused by operator.", ...previous];

        return nextLog;
      });
    } else {
    }
  }

  function getAgentStatus(agentName) {
    const index = workflowSteps.findIndex((step) => step.owner === agentName);

    if (index === -1) {
      return "pending";
    }

    const status = statusForStep(currentStep, index, isRunning, isComplete);

    return status;
  }

  const managerStatus = isComplete
    ? "complete"
    : activeOwner === "Overall Manager" && isRunning
      ? "active"
      : currentStep > 1
        ? "complete"
        : "pending";

  const supervisorStatus = isComplete
    ? "complete"
    : activeOwner === "Supervisor" && isRunning
      ? "active"
      : currentStep > 2
        ? "complete"
        : "pending";

  return (
    <div className="min-h-screen bg-zinc-50 p-4 text-zinc-950 sm:p-6 lg:p-8">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl bg-zinc-950 text-white shadow-sm">
          <div className="grid gap-6 p-6 md:grid-cols-[1.25fr_0.75fr] md:p-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
                <Icon name="sparkles" className="h-4 w-4" />
                Multi-Agent Automation Command Center
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                  Simulate a real automation team from intake to final approval.
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-white/70">
                  One overall manager controls the operation, one supervisor coordinates assignments, and five specialist agents handle research, planning, execution, data, and QA.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={runNextStep} disabled={isComplete}>
                  <Icon name="play" className="mr-2 h-4 w-4" />
                  {isComplete ? "Workflow Complete" : "Run Next Step"}
                </Button>
                <Button onClick={pauseWorkflow} variant="ghost">
                  <Icon name="pause" className="mr-2 h-4 w-4" />
                  Pause
                </Button>
                <Button onClick={resetWorkflow} variant="ghost">
                  <Icon name="refresh" className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60">Operation Progress</p>
                  <p className="mt-1 text-4xl font-bold">{progress}%</p>
                </div>
                <Icon name="layout" className="h-10 w-10 text-white/70" />
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-5 rounded-2xl bg-black/20 p-4">
                <p className="text-sm text-white/60">Current Task</p>
                <p className="mt-2 text-sm leading-6 text-white/90">{task}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label} className="rounded-2xl">
              <div className="flex items-start gap-4 p-5">
                <div className="rounded-2xl bg-zinc-100 p-3 text-zinc-800">
                  <Icon name={metric.icon} className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">{metric.label}</p>
                  <p className="mt-1 text-xl font-semibold text-zinc-950">{metric.value}</p>
                  <p className="mt-1 text-xs text-zinc-400">{metric.detail}</p>
                </div>
              </div>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Task Intake</h2>
                  <p className="text-sm text-zinc-500">Choose a template or write any automation request.</p>
                </div>
                <Icon name="wand" className="h-5 w-5 text-zinc-500" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Automation Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(event) => applyTemplate(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-zinc-400"
                >
                  {taskTemplates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Custom Task</label>
                <textarea
                  value={task}
                  onChange={(event) => {
                    setTask(event.target.value);
                  }}
                  rows={7}
                  className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-zinc-400"
                />
              </div>

              <div className="rounded-2xl bg-zinc-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-800">
                  <Icon name="briefcase" className="h-4 w-4" />
                  Suggested use cases
                </div>
                <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                  <div className="rounded-xl bg-white p-3">Email handling</div>
                  <div className="rounded-xl bg-white p-3">Lead routing</div>
                  <div className="rounded-xl bg-white p-3">Ticket triage</div>
                  <div className="rounded-xl bg-white p-3">Data reports</div>
                  <div className="rounded-xl bg-white p-3">Content workflows</div>
                  <div className="rounded-xl bg-white p-3">QA checklists</div>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-6 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Team Structure</h2>
                  <p className="text-sm text-zinc-500">Manager oversees, supervisor coordinates, agents execute.</p>
                </div>
                <Icon name="users" className="h-5 w-5 text-zinc-500" />
              </div>

              <div className="space-y-4">
                <TeamNode title="Overall Manager" subtitle="Owns goals, priorities, final approval" icon="brain" tone="dark" />
                <div className="ml-7 h-6 w-px bg-zinc-200" />
                <TeamNode title="Supervisor" subtitle="Assigns subtasks and tracks agent progress" icon="clipboard" tone="mid" />
                <div className="ml-7 h-6 w-px bg-zinc-200" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {agents.map((agent) => (
                    <div key={agent.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <div className="rounded-xl bg-white p-2 text-zinc-700 shadow-sm">
                        <Icon name={agent.icon} className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{agent.name}</p>
                        <p className="text-xs text-zinc-500">{agent.specialty}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Specialist Agent Control Panel</h2>
                  <p className="text-sm text-zinc-500">Edit specialties to adapt the platform to different automation jobs.</p>
                </div>
                <Icon name="settings" className="h-5 w-5 text-zinc-500" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <AgentCard
                  agent={{ id: "manager", name: "Overall Manager", specialty: "Operations Lead", description: "Oversees the entire operation, defines objectives, reviews final delivery, and approves completion.", icon: "brain", accent: "bg-zinc-950" }}
                  status={managerStatus}
                  index={0}
                  onChange={() => {}}
                  editable={false}
                />
                <AgentCard
                  agent={{ id: "supervisor", name: "Supervisor", specialty: "Agent Coordinator", description: "Monitors each sub-agent, assigns tasks, resolves blockers, and compiles the final result for review.", icon: "clipboard", accent: "bg-zinc-800" }}
                  status={supervisorStatus}
                  index={1}
                  onChange={() => {}}
                  editable={false}
                />
                {agents.map((agent, index) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    status={getAgentStatus(agent.name)}
                    index={index + 2}
                    onChange={updateAgent}
                  />
                ))}
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Workflow Queue</h2>
                    <p className="text-sm text-zinc-500">Step-by-step task flow from manager to agents.</p>
                  </div>
                  <Icon name="list" className="h-5 w-5 text-zinc-500" />
                </div>

                <div className="space-y-3">
                  {workflowSteps.map((step, index) => {
                    const status = statusForStep(currentStep, index, isRunning, isComplete);
                    return (
                      <div
                        key={`${step.owner}-${step.title}`}
                        className={`rounded-2xl border p-4 transition ${
                          status === "active"
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : status === "complete"
                              ? "border-emerald-100 bg-emerald-50"
                              : "border-zinc-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex gap-3">
                            <div className={`mt-0.5 rounded-full p-1 ${status === "active" ? "bg-white/15" : "bg-zinc-100"}`}>
                              {status === "complete" ? (
                                <Icon name="check" className="h-4 w-4 text-emerald-700" />
                              ) : (
                                <Icon name="chevron" className={`h-4 w-4 ${status === "active" ? "text-white" : "text-zinc-500"}`} />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{step.title}</p>
                              <p className={`mt-1 text-xs ${status === "active" ? "text-white/70" : "text-zinc-500"}`}>{step.owner}</p>
                              <p className={`mt-2 text-sm leading-5 ${status === "active" ? "text-white/80" : "text-zinc-600"}`}>{step.detail}</p>
                            </div>
                          </div>
                          <StatusPill status={status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <Card>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Recommended Platform Layers</h2>
                  <p className="text-sm text-zinc-500">Use this structure when turning the prototype into a real app.</p>
                </div>
                <Icon name="bot" className="h-5 w-5 text-zinc-500" />
              </div>

              <div className="space-y-3">
                {[
                  ["UI Layer", "Dashboard, task intake, agent status, logs, approvals"],
                  ["Orchestration Layer", "Manager/supervisor routing, task splitting, retries, dependencies"],
                  ["Agent Layer", "Specialist prompts, tools, permissions, memory, guardrails"],
                  ["Tool Layer", "Email, files, CRM, browser, database, API connectors"],
                  ["Storage Layer", "Task history, logs, outputs, configs, reusable templates"],
                  ["QA Layer", "Validation rules, human approval, risk checks, audit trail"],
                ].map(([title, detail]) => (
                  <div key={title} className="rounded-2xl bg-zinc-50 p-4">
                    <p className="font-semibold text-zinc-900">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Live Operation Log</h2>
                    <p className="text-sm text-zinc-500">Tracks decisions, handoffs, and completion notes.</p>
                  </div>
                  <Icon name="clock" className="h-5 w-5 text-zinc-500" />
                </div>

                <div className="max-h-[420px] space-y-3 overflow-auto rounded-2xl bg-zinc-950 p-4 text-white">
                  {log.map((entry, index) => (
                    <div key={`${entry}-${index}`} className="rounded-2xl bg-white/10 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs text-white/50">
                        <Icon name="activity" className="h-3.5 w-3.5" />
                        Event {log.length - index}
                      </div>
                      <p className="text-sm leading-6 text-white/85">{entry}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Self-Test Panel</h2>
                    <p className="text-sm text-zinc-500">Basic checks for workflow and status logic.</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                    {passedTests}/{selfTests.length} passed
                  </span>
                </div>

                <div className="space-y-2">
                  {selfTests.map((test) => (
                    <div key={test.name} className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                      <span className="text-zinc-700">{test.name}</span>
                      <span className={test.pass ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                        {test.pass ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}

