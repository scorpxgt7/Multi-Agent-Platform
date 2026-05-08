import { create } from "zustand";
import { persist } from "zustand/middleware";

const EMPTY_WORKSPACE = {
  workflow: null,
  nodes: [],
  edges: [],
  validation: [],
  runtime: {
    executionStatus: "idle",
    activeRunId: "",
    focusedExecutionId: "",
  },
  versions: [],
};

export const useWorkflowStore = create(
  persist(
    (set, get) => ({
      activeOrganizationId: "",
      workspacesByOrg: {},
      selectedNodeId: "",
      selectedExecutionId: "",
      panel: "builder",
      setActiveOrganizationId(organizationId) {
        set({ activeOrganizationId: organizationId, selectedNodeId: "", selectedExecutionId: "" });
      },
      setPanel(panel) {
        set({ panel });
      },
      ensureWorkspace(organizationId, seedWorkspace) {
        const current = get().workspacesByOrg[organizationId];
        if (current) {
          return current;
        }
        set((state) => ({
          workspacesByOrg: {
            ...state.workspacesByOrg,
            [organizationId]: seedWorkspace,
          },
        }));
        return seedWorkspace;
      },
      setWorkspace(organizationId, nextWorkspace) {
        set((state) => ({
          workspacesByOrg: {
            ...state.workspacesByOrg,
            [organizationId]: nextWorkspace,
          },
        }));
      },
      updateWorkspace(organizationId, updater) {
        const current = get().workspacesByOrg[organizationId] || EMPTY_WORKSPACE;
        const nextWorkspace = updater(current);
        get().setWorkspace(organizationId, nextWorkspace);
        return nextWorkspace;
      },
      selectNode(nodeId) {
        set({ selectedNodeId: nodeId });
      },
      selectExecution(executionId) {
        set({ selectedExecutionId: executionId });
      },
      setValidation(organizationId, validation) {
        get().updateWorkspace(organizationId, (workspace) => ({
          ...workspace,
          validation,
        }));
      },
      deployVersion(organizationId) {
        const current = get().workspacesByOrg[organizationId];
        if (!current?.workflow) {
          return null;
        }
        const version = {
          id: `${current.workflow.id}-${current.workflow.version}`,
          workflow: current.workflow,
          nodes: current.nodes,
          edges: current.edges,
          validation: current.validation,
          runtime: current.runtime,
          createdAt: new Date().toISOString(),
        };
        const nextWorkspace = {
          ...current,
          workflow: {
            ...current.workflow,
            status: "deployed",
            deployedVersion: current.workflow.version,
            updatedAt: new Date().toISOString(),
          },
          versions: [version, ...(current.versions || [])].slice(0, 10),
        };
        get().setWorkspace(organizationId, nextWorkspace);
        return version;
      },
    }),
    {
      name: "workflow-builder-store",
      partialize: (state) => ({
        activeOrganizationId: state.activeOrganizationId,
        workspacesByOrg: state.workspacesByOrg,
      }),
    },
  ),
);

export { EMPTY_WORKSPACE };

