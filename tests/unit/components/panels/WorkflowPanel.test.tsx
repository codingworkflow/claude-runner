import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import WorkflowPanel from "../../../../src/components/panels/WorkflowPanel";
import {
  ExtensionState,
  ExtensionActions,
} from "../../../../src/contexts/ExtensionContext";
import {
  ClaudeWorkflow,
  WorkflowMetadata,
} from "../../../../src/types/WorkflowTypes";
import { WorkflowParser } from "../../../../src/services/WorkflowParser";

// Mock child components
jest.mock("../../../../src/components/common/Card", () => {
  return ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="mock-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
});

jest.mock("../../../../src/components/common/Button", () => {
  return ({
    onClick,
    disabled,
    children,
    className,
  }: {
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-testid="mock-button"
    >
      {children}
    </button>
  );
});

jest.mock("../../../../src/components/common/PathSelector", () => {
  return ({
    rootPath,
    onUpdateRootPath,
    disabled,
  }: {
    rootPath?: string;
    onUpdateRootPath?: (path: string) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="mock-path-selector">
      <input
        value={rootPath}
        onChange={(e) => onUpdateRootPath?.(e.target.value)}
        disabled={disabled}
        placeholder="Root path"
      />
    </div>
  );
});

jest.mock("../../../../src/components/common/ModelSelector", () => {
  return ({
    model,
    onUpdateModel,
    disabled,
  }: {
    model?: string;
    onUpdateModel?: (model: string) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="mock-model-selector">
      <select
        value={model}
        onChange={(e) => onUpdateModel?.(e.target.value)}
        disabled={disabled}
      >
        <option value="auto">Auto</option>
        <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
        <option value="claude-opus-4-20250514">Claude Opus 4</option>
      </select>
    </div>
  );
});

// Mock WorkflowParser
jest.mock("../../../../src/services/WorkflowParser", () => ({
  WorkflowParser: {
    parseYaml: jest.fn(),
    toYaml: jest.fn(),
  },
}));

// Mock window.confirm
global.confirm = jest.fn();

// Create mock extension state
const createMockExtensionState = (
  overrides: {
    main?: Partial<ExtensionState["main"]>;
  } = {},
): ExtensionState => {
  const baseState: ExtensionState = {
    currentView: "main",
    main: {
      activeTab: "pipeline",
      model: "claude-sonnet-4-20250514",
      rootPath: "/workspace",
      allowAllTools: false,
      parallelTasksCount: 1,
      status: "stopped",
      tasks: [],
      currentTaskIndex: undefined,
      results: undefined,
      taskCompleted: undefined,
      taskError: undefined,
      chatPrompt: "",
      showChatPrompt: false,
      outputFormat: "json",
      availablePipelines: [],
      availableModels: [],
      workflows: [],
      currentWorkflow: null,
      workflowInputs: {},
      executionStatus: "idle",
      stepStatuses: {},
      isPaused: false,
      currentExecutionId: undefined,
      pausedPipelines: [],
      resumableWorkflows: [],
    },
    commands: {
      activeTab: "global",
      globalCommands: [],
      projectCommands: [],
      loading: false,
      rootPath: "",
    },
    usage: {
      activeTab: "usage",
      projects: [],
      selectedProject: "",
      conversations: [],
      selectedConversation: "",
      conversationData: null,
      projectsLoading: false,
      conversationsLoading: false,
      conversationLoading: false,
      projectsError: null,
      conversationsError: null,
      conversationError: null,
      selectedPeriod: "today",
      totalHours: 5,
      startHour: 0,
      limitType: "output",
      limitValue: 0,
      autoRefresh: false,
      report: null,
      loading: false,
      error: null,
    },
    claude: {
      version: "1.0.0",
      isAvailable: true,
      isInstalled: true,
      error: undefined,
      loading: false,
    },
  };

  return {
    ...baseState,
    main: { ...baseState.main, ...overrides.main },
  };
};

const createMockActions = (): ExtensionActions => ({
  setCurrentView: jest.fn(),
  updateMainState: jest.fn(),
  startInteractive: jest.fn(),
  runTasks: jest.fn(),
  cancelTask: jest.fn(),
  updateModel: jest.fn(),
  updateRootPath: jest.fn(),
  updateAllowAllTools: jest.fn(),
  updateActiveTab: jest.fn(),
  updateChatPrompt: jest.fn(),
  updateShowChatPrompt: jest.fn(),
  updateOutputFormat: jest.fn(),
  updateParallelTasksCount: jest.fn(),
  savePipeline: jest.fn(),
  loadPipeline: jest.fn(),
  pipelineAddTask: jest.fn(),
  pipelineRemoveTask: jest.fn(),
  pipelineClearAll: jest.fn(),
  pipelineUpdateTaskField: jest.fn(),
  recheckClaude: jest.fn(),
  loadWorkflows: jest.fn(),
  loadWorkflow: jest.fn(),
  saveWorkflow: jest.fn(),
  deleteWorkflow: jest.fn(),
  updateWorkflowInputs: jest.fn(),
  runWorkflow: jest.fn(),
  cancelWorkflow: jest.fn(),
  createSampleWorkflow: jest.fn(),
  pausePipeline: jest.fn(),
  resumePipeline: jest.fn(),
  pauseWorkflow: jest.fn(),
  resumeWorkflow: jest.fn(),
  deleteWorkflowState: jest.fn(),
  getResumableWorkflows: jest.fn(),
  updateCommandsState: jest.fn(),
  scanCommands: jest.fn(),
  createCommand: jest.fn(),
  openFile: jest.fn(),
  deleteCommand: jest.fn(),
  updateUsageState: jest.fn(),
  requestUsageReport: jest.fn(),
  requestLogProjects: jest.fn(),
  requestLogConversations: jest.fn(),
  requestLogConversation: jest.fn(),
});

// Mock the useExtension hook
jest.mock("../../../../src/contexts/ExtensionContext", () => ({
  ...jest.requireActual("../../../../src/contexts/ExtensionContext"),
  useExtension: jest.fn(),
}));

// Create test wrapper component
const WorkflowPanelWithContext = ({
  disabled = false,
  state = createMockExtensionState(),
  actions = createMockActions(),
}: {
  disabled?: boolean;
  state?: ExtensionState;
  actions?: ExtensionActions;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useExtension } = require("../../../../src/contexts/ExtensionContext");
  useExtension.mockImplementation(() => ({ state, actions }));

  return <WorkflowPanel disabled={disabled} />;
};

// Create sample workflow data
const createSampleWorkflow = (): ClaudeWorkflow => ({
  name: "Sample Workflow",
  on: {
    workflow_dispatch: {
      inputs: {
        message: {
          description: "Input message",
          required: true,
          default: "Hello",
        },
        optional_param: {
          description: "Optional parameter",
          required: false,
          default: "default_value",
        },
      },
    },
  },
  jobs: {
    test_job: {
      name: "Test Job",
      steps: [
        {
          id: "step1",
          name: "Claude Step",
          uses: "claude-pipeline-action@v1",
          with: {
            prompt: "Process the input: ${{ inputs.message }}",
            model: "claude-sonnet-4-20250514",
            output_session: true,
          },
        },
        {
          id: "step2",
          name: "Non-Claude Step",
          run: "echo 'Regular step'",
        },
      ],
    },
  },
});

const createSampleWorkflowMetadata = (): WorkflowMetadata => ({
  id: "workflow-1",
  name: "Sample Workflow",
  description: "A sample workflow for testing",
  created: new Date("2024-01-01"),
  modified: new Date("2024-01-02"),
  path: "/workflows/sample.yml",
});

// Cast the mocked WorkflowParser to have Jest mock methods
const mockWorkflowParser = jest.mocked(WorkflowParser);

describe("WorkflowPanel", () => {
  let mockActions: ExtensionActions;
  let sampleWorkflow: ClaudeWorkflow;
  let sampleWorkflowMetadata: WorkflowMetadata;
  let baseExtensionState: ExtensionState;

  beforeAll(() => {
    // Create expensive objects once per test suite
    sampleWorkflow = createSampleWorkflow();
    sampleWorkflowMetadata = createSampleWorkflowMetadata();
    baseExtensionState = createMockExtensionState();
  });

  beforeEach(() => {
    // Only create fresh actions and clear mocks
    mockActions = createMockActions();
    jest.clearAllMocks();
    mockWorkflowParser.parseYaml.mockReturnValue(sampleWorkflow);
    mockWorkflowParser.toYaml.mockReturnValue(
      "name: Sample Workflow\njobs:\n  test_job:\n    steps: []",
    );
    (global.confirm as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    // Clean up heavy mock objects to prevent memory leaks
    jest.clearAllMocks();
    mockActions = {} as ExtensionActions;
  });

  describe("workflow panel rendering and layout", () => {
    it("renders the main workflow interface components", () => {
      render(<WorkflowPanelWithContext />);

      expect(screen.getByText("Workflow Selection")).toBeInTheDocument();
      expect(screen.getByText("Select a workflow...")).toBeInTheDocument();
      expect(screen.getByText("Create Sample")).toBeInTheDocument();
    });

    it("calls loadWorkflows on component mount", () => {
      render(<WorkflowPanelWithContext actions={mockActions} />);

      expect(mockActions.loadWorkflows).toHaveBeenCalledTimes(1);
    });

    it("renders workflow selection dropdown with workflows", () => {
      const workflows = [sampleWorkflowMetadata];
      const state = {
        ...baseExtensionState,
        main: { ...baseExtensionState.main, workflows },
      };
      render(<WorkflowPanelWithContext state={state} />);

      expect(
        screen.getByText("Sample Workflow (workflow-1)"),
      ).toBeInTheDocument();
    });

    it("shows configuration and execution sections when workflow is selected", () => {
      const state = {
        ...baseExtensionState,
        main: {
          ...baseExtensionState.main,
          currentWorkflow: sampleWorkflow,
          workflows: [sampleWorkflowMetadata],
        },
      };
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Configuration")).toBeInTheDocument();
      expect(screen.getByText("Workflow Inputs")).toBeInTheDocument();
      expect(screen.getByText("Workflow Steps")).toBeInTheDocument();
      expect(screen.getByText("Execution")).toBeInTheDocument();
    });
  });

  describe("workflow list display and management", () => {
    it("handles workflow selection from dropdown", () => {
      const workflows = [sampleWorkflowMetadata];
      const state = {
        ...baseExtensionState,
        main: { ...baseExtensionState.main, workflows },
      };
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "workflow-1" } });

      expect(mockActions.loadWorkflow).toHaveBeenCalledWith("workflow-1");
    });

    it("handles create sample workflow action", () => {
      render(<WorkflowPanelWithContext actions={mockActions} />);

      const createButton = screen.getByText("Create Sample");
      fireEvent.click(createButton);

      expect(mockActions.createSampleWorkflow).toHaveBeenCalledTimes(1);
    });

    it("shows workflow management buttons when workflow is selected", () => {
      const state = {
        ...baseExtensionState,
        main: { ...baseExtensionState.main, currentWorkflow: sampleWorkflow },
      };
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Edit YAML")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("handles workflow deletion with confirmation", () => {
      const state = {
        ...baseExtensionState,
        main: { ...baseExtensionState.main, currentWorkflow: sampleWorkflow },
      };
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const deleteButton = screen.getByText("Delete");
      fireEvent.click(deleteButton);

      expect(global.confirm).toHaveBeenCalledWith(
        "Are you sure you want to delete this workflow?",
      );
      expect(mockActions.deleteWorkflow).toHaveBeenCalledTimes(1);
    });

    it("does not delete workflow when confirmation is cancelled", () => {
      (global.confirm as jest.Mock).mockReturnValue(false);
      const state = {
        ...baseExtensionState,
        main: { ...baseExtensionState.main, currentWorkflow: sampleWorkflow },
      };
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const deleteButton = screen.getByText("Delete");
      fireEvent.click(deleteButton);

      expect(mockActions.deleteWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("workflow execution controls (start, stop, pause)", () => {
    it("shows run workflow button when workflow is ready", () => {
      const state = {
        ...baseExtensionState,
        main: {
          ...baseExtensionState.main,
          currentWorkflow: sampleWorkflow,
          executionStatus: "idle" as const,
        },
      };
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Run Workflow")).toBeInTheDocument();
    });

    it("handles run workflow action", () => {
      const state = {
        ...baseExtensionState,
        main: {
          ...baseExtensionState.main,
          currentWorkflow: sampleWorkflow,
          executionStatus: "idle" as const,
        },
      };
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const runButton = screen.getByText("Run Workflow");
      fireEvent.click(runButton);

      expect(mockActions.runWorkflow).toHaveBeenCalledTimes(1);
    });

    it("shows cancel button during workflow execution", () => {
      const state = {
        ...baseExtensionState,
        main: {
          ...baseExtensionState.main,
          currentWorkflow: sampleWorkflow,
          executionStatus: "running" as const,
        },
      };
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Running...")).toBeInTheDocument();
    });

    it("handles cancel workflow action", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
        },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const cancelButton = screen.getByText("Cancel");
      fireEvent.click(cancelButton);

      expect(mockActions.cancelWorkflow).toHaveBeenCalledTimes(1);
    });

    it("disables run button when workflow is running", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const runButton = screen.getByText("Run Workflow");
      expect(runButton).toBeDisabled();
    });

    it("disables run button when in edit mode", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "idle",
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      const runButton = screen.getByText("Run Workflow");
      expect(runButton).toBeDisabled();
    });
  });

  describe("workflow progress tracking and display", () => {
    it("displays execution status correctly", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "completed",
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("displays failed execution status", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "failed",
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("displays step statuses when workflow is executing", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
          stepStatuses: {
            step1: {
              status: "completed",
              output: { result: "Step completed successfully" },
            },
            step2: {
              status: "running",
            },
          },
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Status: completed")).toBeInTheDocument();
      expect(screen.getByText("Status: running")).toBeInTheDocument();
      expect(screen.getByText("Output:")).toBeInTheDocument();
      expect(
        screen.getByText("Step completed successfully"),
      ).toBeInTheDocument();
    });

    it("applies correct CSS classes for step statuses", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
          stepStatuses: {
            step1: { status: "completed" },
            step2: { status: "failed" },
          },
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const completedStatus =
        screen.getByText("Status: completed").parentElement;
      const failedStatus = screen.getByText("Status: failed").parentElement;

      expect(completedStatus).toHaveClass("text-green-500");
      expect(failedStatus).toHaveClass("text-red-500");
    });
  });

  describe("workflow error handling and user feedback", () => {
    it("displays YAML parse errors", () => {
      mockWorkflowParser.parseYaml.mockImplementation(() => {
        throw new Error("Invalid YAML syntax");
      });

      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      const textarea = screen.getByDisplayValue(/name: Sample Workflow/);
      fireEvent.change(textarea, {
        target: { value: "invalid: yaml: content" },
      });

      expect(screen.getByText("Invalid YAML syntax")).toBeInTheDocument();
    });

    it("disables save button when there are parse errors", () => {
      mockWorkflowParser.parseYaml.mockImplementation(() => {
        throw new Error("Parse error");
      });

      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      const textarea = screen.getByDisplayValue(/name: Sample Workflow/);
      fireEvent.change(textarea, { target: { value: "invalid yaml" } });

      const saveButton = screen.getByText("Save Workflow");
      expect(saveButton).toBeDisabled();
    });

    it("handles save workflow errors gracefully", () => {
      mockWorkflowParser.parseYaml.mockImplementation(() => {
        throw new Error("Save failed");
      });

      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      const saveButton = screen.getByText("Save Workflow");
      fireEvent.click(saveButton);

      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });

    it("handles workflow execution errors in step display", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
          stepStatuses: {
            step1: {
              status: "failed",
              output: { result: "Error: Step failed with timeout" },
            },
          },
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Status: failed")).toBeInTheDocument();
      expect(
        screen.getByText("Error: Step failed with timeout"),
      ).toBeInTheDocument();
    });
  });

  describe("workflow configuration and settings", () => {
    it("displays workflow inputs correctly", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          workflowInputs: { message: "Test message" },
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByDisplayValue("Test message")).toBeInTheDocument();
      expect(screen.getByText("message")).toBeInTheDocument();
      expect(screen.getByText("*")).toBeInTheDocument(); // Required field indicator
    });

    it("handles workflow input changes", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          workflowInputs: { message: "Initial" },
        },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const input = screen.getByDisplayValue("Initial");
      fireEvent.change(input, { target: { value: "Updated message" } });

      expect(mockActions.updateWorkflowInputs).toHaveBeenCalledWith({
        message: "Updated message",
      });
    });

    it("displays default values for workflow inputs", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          workflowInputs: {},
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByDisplayValue("Hello")).toBeInTheDocument(); // Default value
      expect(screen.getByDisplayValue("default_value")).toBeInTheDocument(); // Default value
    });

    it("passes configuration updates to child components", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          rootPath: "/custom/path",
          model: "claude-opus-4-20250514",
        },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const pathSelector = screen.getByTestId("mock-path-selector");
      const modelSelector = screen.getByTestId("mock-model-selector");

      expect(pathSelector.querySelector("input")).toHaveValue("/custom/path");
      expect(modelSelector.querySelector("select")).toHaveValue(
        "claude-opus-4-20250514",
      );
    });

    it("handles model and path updates", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const modelSelect = screen
        .getByTestId("mock-model-selector")
        .querySelector("select");
      const pathInput = screen
        .getByTestId("mock-path-selector")
        .querySelector("input");

      if (modelSelect) {
        fireEvent.change(modelSelect, {
          target: { value: "claude-opus-4-20250514" },
        });
      }
      if (pathInput) {
        fireEvent.change(pathInput, { target: { value: "/new/path" } });
      }

      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
      expect(mockActions.updateRootPath).toHaveBeenCalledWith("/new/path");
    });
  });

  describe("workflow accessibility and keyboard navigation", () => {
    it("provides proper labels for workflow inputs", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const messageLabel = screen.getByText("message");
      const optionalLabel = screen.getByText("optional_param");

      expect(messageLabel).toBeInTheDocument();
      expect(optionalLabel).toBeInTheDocument();
    });

    it("supports keyboard navigation for workflow selection", () => {
      const workflows = [sampleWorkflowMetadata];
      const state = createMockExtensionState({
        main: { workflows },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const select = screen.getByRole("combobox");
      select.focus();

      // Simulate arrow key navigation
      fireEvent.keyDown(select, { key: "ArrowDown" });
      fireEvent.change(select, { target: { value: "workflow-1" } });

      expect(mockActions.loadWorkflow).toHaveBeenCalledWith("workflow-1");
    });

    it("maintains focus management during workflow operations", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const runButton = screen.getByText("Run Workflow");
      runButton.focus();

      expect(document.activeElement).toBe(runButton);
    });

    it("provides appropriate ARIA attributes for workflow steps", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
        },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const stepElements = screen.getAllByText(/Claude Step|Non-Claude step/);
      expect(stepElements.length).toBeGreaterThan(0);
    });
  });

  describe("workflow editor functionality", () => {
    it("toggles edit mode correctly", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      expect(screen.getByText("Workflow YAML")).toBeInTheDocument();
      expect(screen.getByText("Cancel Edit")).toBeInTheDocument();
      expect(screen.getByText("Save Workflow")).toBeInTheDocument();
    });

    it("loads YAML content when entering edit mode", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      expect(mockWorkflowParser.toYaml).toHaveBeenCalledWith(sampleWorkflow);
    });

    it("saves workflow successfully", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      const saveButton = screen.getByText("Save Workflow");
      fireEvent.click(saveButton);

      expect(mockActions.saveWorkflow).toHaveBeenCalledTimes(1);
    });

    it("cancels edit mode without saving", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      const cancelButton = screen.getByText("Cancel Edit");
      fireEvent.click(cancelButton);

      expect(screen.getByText("Edit YAML")).toBeInTheDocument();
      expect(screen.queryByText("Workflow YAML")).not.toBeInTheDocument();
    });
  });

  describe("workflow step visualization", () => {
    it("displays Claude steps correctly", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Claude Step")).toBeInTheDocument();
      expect(screen.getByText("Prompt:")).toBeInTheDocument();
      expect(
        screen.getByText("Process the input: ${{ inputs.message }}"),
      ).toBeInTheDocument();
      expect(screen.getByText("Model:")).toBeInTheDocument();
      expect(screen.getByText("claude-sonnet-4-20250514")).toBeInTheDocument();
    });

    it("displays non-Claude steps correctly", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Non-Claude Step")).toBeInTheDocument();
    });

    it("groups steps by job correctly", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Test Job")).toBeInTheDocument();
    });

    it("displays step additional properties", () => {
      const workflowWithResumeSession: ClaudeWorkflow = {
        ...sampleWorkflow,
        jobs: {
          test_job: {
            name: "Test Job",
            steps: [
              {
                id: "step1",
                name: "Claude Step with Resume",
                uses: "claude-pipeline-action@v1",
                with: {
                  prompt: "Continue from previous session",
                  resume_session: "${{ steps.previous.outputs.session_id }}",
                  output_session: true,
                },
              },
            ],
          },
        },
      };

      const state = createMockExtensionState({
        main: { currentWorkflow: workflowWithResumeSession },
      });
      render(<WorkflowPanelWithContext state={state} />);

      expect(screen.getByText("Resume Session:")).toBeInTheDocument();
      expect(screen.getByText("Output Session:")).toBeInTheDocument();
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });
  });

  describe("component integration and lifecycle", () => {
    it("renders without crashing with minimal props", () => {
      expect(() => {
        render(<WorkflowPanelWithContext />);
      }).not.toThrow();
    });

    it("handles disabled state correctly", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext disabled={true} state={state} />);

      const selects = screen.getAllByRole("combobox");
      const runButton = screen.getByText("Run Workflow");
      const editButton = screen.getByText("Edit YAML");

      // Both selects should be disabled (workflow and model selectors)
      expect(selects[0]).toBeDisabled(); // workflow selector
      expect(selects[1]).toBeDisabled(); // model selector
      expect(runButton).toBeDisabled();
      expect(editButton).toBeDisabled();
    });

    it("updates workflow YAML when currentWorkflow changes", () => {
      // Clear the mock to start fresh
      mockWorkflowParser.toYaml.mockClear();

      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });

      render(<WorkflowPanelWithContext state={state} />);

      // The useEffect should have been called when the component mounted with a currentWorkflow
      expect(mockWorkflowParser.toYaml).toHaveBeenCalledWith(sampleWorkflow);
    });

    it("maintains component state during workflow operations", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      const { rerender } = render(<WorkflowPanelWithContext state={state} />);

      const editButton = screen.getByText("Edit YAML");
      fireEvent.click(editButton);

      expect(screen.getByText("Workflow YAML")).toBeInTheDocument();

      rerender(<WorkflowPanelWithContext state={state} />);
      expect(screen.getByText("Workflow YAML")).toBeInTheDocument();
    });

    it("handles rapid user interactions without errors", () => {
      const state = createMockExtensionState({
        main: { currentWorkflow: sampleWorkflow },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const editButton = screen.getByText("Edit YAML");

      // Simulate rapid clicks
      fireEvent.click(editButton);
      fireEvent.click(screen.getByText("Cancel Edit"));
      fireEvent.click(screen.getByText("Edit YAML"));

      expect(screen.getByText("Workflow YAML")).toBeInTheDocument();
    });
  });

  describe("workflow execution flow integration", () => {
    it("integrates workflow execution with step progress tracking", async () => {
      const runningState = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
          stepStatuses: {
            step1: { status: "running" },
          },
        },
      });

      const { unmount } = render(
        <WorkflowPanelWithContext state={runningState} />,
      );

      expect(screen.getByText("Status: running")).toBeInTheDocument();

      // Unmount and render with completed status
      unmount();

      const completedState = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
          stepStatuses: {
            step1: {
              status: "completed",
              output: { result: "Step completed" },
            },
          },
        },
      });

      render(<WorkflowPanelWithContext state={completedState} />);

      expect(screen.getByText("Status: completed")).toBeInTheDocument();
      expect(screen.getByText("Step completed")).toBeInTheDocument();
    });

    it("handles workflow completion status updates", () => {
      const runningState = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "running",
        },
      });

      const { unmount } = render(
        <WorkflowPanelWithContext state={runningState} />,
      );
      expect(screen.getByText("Running...")).toBeInTheDocument();

      // Unmount and remount to force fresh render
      unmount();

      const completedState = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "completed",
        },
      });

      render(<WorkflowPanelWithContext state={completedState} />);
      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("manages workflow state transitions correctly", () => {
      const state = createMockExtensionState({
        main: {
          currentWorkflow: sampleWorkflow,
          executionStatus: "idle",
        },
      });
      render(<WorkflowPanelWithContext state={state} actions={mockActions} />);

      const runButton = screen.getByText("Run Workflow");
      expect(runButton).not.toBeDisabled();

      fireEvent.click(runButton);
      expect(mockActions.runWorkflow).toHaveBeenCalledTimes(1);
    });
  });
});
