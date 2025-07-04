import { WorkflowSimulationWorkspace } from "./WorkflowSimulationWorkspace";

export const createMockExtensionContext = (
  workspace: WorkflowSimulationWorkspace,
) => {
  const mockActions = {
    loadWorkflow: jest.fn((workflowPath: string) => {
      const tasks = workspace.loadWorkflow(workflowPath);
      return Promise.resolve(tasks);
    }),
    loadPipeline: jest.fn(),
    savePipeline: jest.fn(),
    pipelineAddTask: jest.fn(),
    pipelineRemoveTask: jest.fn(),
    pipelineUpdateTaskField: jest.fn(),
    pipelineClearAll: jest.fn(),
  };

  return {
    state: {
      main: {
        tasks: workspace.getWorkflowState().tasks,
        availablePipelines: workspace.getWorkflowState().availablePipelines,
        discoveredWorkflows: workspace.discoverWorkflows(),
        model: "claude-sonnet-4-20250514",
        availableModels: ["claude-sonnet-4-20250514", "claude-opus-4-20250514"],
      },
    },
    actions: mockActions,
  };
};
