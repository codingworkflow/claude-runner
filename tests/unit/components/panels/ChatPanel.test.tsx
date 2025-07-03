import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChatPanel from "../../../../src/components/panels/ChatPanel";
import {
  ExtensionState,
  ExtensionActions,
} from "../../../../src/contexts/ExtensionContext";

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
    variant,
    onClick,
    disabled,
    children,
  }: {
    variant?: string;
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-testid="mock-button"
    >
      {children}
    </button>
  );
});

jest.mock("../../../../src/components/common/Toggle", () => {
  return ({
    checked,
    onChange,
    label,
    disabled,
  }: {
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
  }) => (
    <div data-testid="mock-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <label>{label}</label>
    </div>
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

jest.mock("../../../../src/components/common/ClaudeVersionDisplay", () => {
  return ({
    version,
    isAvailable,
    error,
    isLoading,
  }: {
    version?: string;
    isAvailable?: boolean;
    error?: string;
    isLoading?: boolean;
  }) => (
    <div data-testid="mock-claude-version">
      <span>Version: {version}</span>
      <span>Available: {isAvailable ? "Yes" : "No"}</span>
      {error && <span>Error: {error}</span>}
      {isLoading && <span>Loading...</span>}
    </div>
  );
});

// Create mock extension context
const createMockExtensionState = (
  overrides: {
    main?: Partial<ExtensionState["main"]>;
    commands?: Partial<ExtensionState["commands"]>;
    usage?: Partial<ExtensionState["usage"]>;
    claude?: Partial<ExtensionState["claude"]>;
    currentView?: ExtensionState["currentView"];
  } = {},
): ExtensionState => {
  const baseState: ExtensionState = {
    currentView: "main",
    main: {
      activeTab: "chat",
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
    ...overrides,
    main: { ...baseState.main, ...overrides.main },
    commands: { ...baseState.commands, ...overrides.commands },
    usage: { ...baseState.usage, ...overrides.usage },
    claude: { ...baseState.claude, ...overrides.claude },
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

// Create wrapper component with mock context
// Mock the useExtension hook at the module level
jest.mock("../../../../src/contexts/ExtensionContext", () => ({
  ...jest.requireActual("../../../../src/contexts/ExtensionContext"),
  useExtension: jest.fn(),
}));

const ChatPanelWithContext = ({
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
  useExtension.mockReturnValue({ state, actions });

  return <ChatPanel disabled={disabled} />;
};

describe("ChatPanel", () => {
  let mockActions: ExtensionActions;
  let baseExtensionState: ExtensionState;

  beforeAll(() => {
    // Create expensive objects once per test suite
    baseExtensionState = createMockExtensionState();
  });

  beforeEach(() => {
    // Only create fresh actions and clear mocks
    mockActions = createMockActions();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up to prevent memory leaks
    jest.clearAllMocks();
    mockActions = {} as ExtensionActions;
  });

  describe("chat interface functionality and message handling", () => {
    it("renders the main chat interface components", () => {
      render(<ChatPanelWithContext />);

      expect(screen.getByTestId("mock-claude-version")).toBeInTheDocument();
      expect(screen.getByTestId("mock-path-selector")).toBeInTheDocument();
      expect(screen.getByTestId("mock-model-selector")).toBeInTheDocument();
      expect(screen.getByTestId("mock-toggle")).toBeInTheDocument();
      expect(screen.getByText("Interactive Chat Session")).toBeInTheDocument();
    });

    it("displays chat session description", () => {
      render(<ChatPanelWithContext />);

      expect(
        screen.getByText(/Start an interactive Claude chat session/),
      ).toBeInTheDocument();
    });

    it("shows Add Prompt button when prompt is not visible", () => {
      const state = {
        ...baseExtensionState,
        main: { ...baseExtensionState.main, showChatPrompt: false },
      };
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const addPromptButton = screen.getByText("Add Prompt");
      expect(addPromptButton).toBeInTheDocument();
    });

    it("shows Remove Prompt button and textarea when prompt is visible", () => {
      const state = {
        ...baseExtensionState,
        main: {
          ...baseExtensionState.main,
          showChatPrompt: true,
          chatPrompt: "Test prompt",
        },
      };
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      expect(screen.getByText("Remove Prompt")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test prompt")).toBeInTheDocument();
    });

    it("calls startInteractive without prompt when no prompt is provided", () => {
      const state = {
        ...baseExtensionState,
        main: { ...baseExtensionState.main, showChatPrompt: false },
      };
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const startButton = screen.getByText("Start Chat Session");
      fireEvent.click(startButton);

      expect(mockActions.startInteractive).toHaveBeenCalledTimes(1);
      expect(mockActions.startInteractive).toHaveBeenCalledWith();
    });

    it("calls startInteractive with prompt when prompt is provided", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "Test prompt" },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const startButton = screen.getByText("Start Chat Session");
      fireEvent.click(startButton);

      expect(mockActions.startInteractive).toHaveBeenCalledTimes(1);
      expect(mockActions.startInteractive).toHaveBeenCalledWith("Test prompt");
    });

    it("trims whitespace from chat prompt before starting", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "  Test prompt  " },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const startButton = screen.getByText("Start Chat Session");
      fireEvent.click(startButton);

      expect(mockActions.startInteractive).toHaveBeenCalledWith("Test prompt");
    });
  });

  describe("chat message display and formatting", () => {
    it("displays Claude version information", () => {
      const state = createMockExtensionState({
        claude: {
          version: "2.0.0",
          isAvailable: true,
          isInstalled: true,
          loading: false,
        },
      });
      render(<ChatPanelWithContext state={state} />);

      const versionDisplay = screen.getByTestId("mock-claude-version");
      expect(versionDisplay).toHaveTextContent("Version: 2.0.0");
      expect(versionDisplay).toHaveTextContent("Available: Yes");
    });

    it("displays Claude error state", () => {
      const state = createMockExtensionState({
        claude: {
          version: "Unknown",
          isAvailable: false,
          isInstalled: false,
          error: "Claude not found",
          loading: false,
        },
      });
      render(<ChatPanelWithContext state={state} />);

      const versionDisplay = screen.getByTestId("mock-claude-version");
      expect(versionDisplay).toHaveTextContent("Error: Claude not found");
      expect(versionDisplay).toHaveTextContent("Available: No");
    });

    it("displays Claude loading state", () => {
      const state = createMockExtensionState({
        claude: {
          version: "Checking...",
          isAvailable: false,
          isInstalled: true,
          loading: true,
        },
      });
      render(<ChatPanelWithContext state={state} />);

      const versionDisplay = screen.getByTestId("mock-claude-version");
      expect(versionDisplay).toHaveTextContent("Loading...");
    });

    it("displays current model selection", () => {
      const state = createMockExtensionState({
        main: { model: "claude-opus-4-20250514" },
      });
      render(<ChatPanelWithContext state={state} />);

      const modelSelector = screen.getByTestId("mock-model-selector");
      const select = modelSelector.querySelector("select");
      expect(select).toHaveValue("claude-opus-4-20250514");
    });

    it("displays current root path", () => {
      const state = createMockExtensionState({
        main: { rootPath: "/custom/path" },
      });
      render(<ChatPanelWithContext state={state} />);

      const pathSelector = screen.getByTestId("mock-path-selector");
      const input = pathSelector.querySelector("input");
      expect(input).toHaveValue("/custom/path");
    });
  });

  describe("chat input validation and submission", () => {
    it("handles Add Prompt button click", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: false },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const addButton = screen.getByText("Add Prompt");
      fireEvent.click(addButton);

      expect(mockActions.updateShowChatPrompt).toHaveBeenCalledWith(true);
    });

    it("handles Remove Prompt button click", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "Some prompt" },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const removeButton = screen.getByText("Remove Prompt");
      fireEvent.click(removeButton);

      expect(mockActions.updateShowChatPrompt).toHaveBeenCalledWith(false);
      expect(mockActions.updateChatPrompt).toHaveBeenCalledWith("");
    });

    it("handles prompt textarea changes", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "Initial prompt" },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const textarea = screen.getByDisplayValue("Initial prompt");
      fireEvent.change(textarea, { target: { value: "Updated prompt" } });

      expect(mockActions.updateChatPrompt).toHaveBeenCalledWith(
        "Updated prompt",
      );
    });

    it("validates that empty prompts are handled correctly", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "   " },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const startButton = screen.getByText("Start Chat Session");
      fireEvent.click(startButton);

      expect(mockActions.startInteractive).toHaveBeenCalledWith();
    });

    it("validates prompt textarea has correct attributes", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "Test" },
      });
      render(<ChatPanelWithContext state={state} />);

      const textarea = screen.getByDisplayValue("Test");
      expect(textarea).toHaveAttribute(
        "placeholder",
        "Enter your initial prompt for Claude...",
      );
      expect(textarea).toHaveAttribute("rows", "10");
    });
  });

  describe("chat history management and persistence", () => {
    it("preserves chat prompt state across renders", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "Persistent prompt" },
      });
      const { rerender } = render(<ChatPanelWithContext state={state} />);

      expect(screen.getByDisplayValue("Persistent prompt")).toBeInTheDocument();

      rerender(<ChatPanelWithContext state={state} />);
      expect(screen.getByDisplayValue("Persistent prompt")).toBeInTheDocument();
    });

    it("preserves model selection across renders", () => {
      const state = createMockExtensionState({
        main: { model: "claude-opus-4-20250514" },
      });
      const { rerender } = render(<ChatPanelWithContext state={state} />);

      let select = screen
        .getByTestId("mock-model-selector")
        .querySelector("select");
      expect(select).toHaveValue("claude-opus-4-20250514");

      rerender(<ChatPanelWithContext state={state} />);
      select = screen
        .getByTestId("mock-model-selector")
        .querySelector("select");
      expect(select).toHaveValue("claude-opus-4-20250514");
    });

    it("preserves tool permissions state", () => {
      const state = createMockExtensionState({
        main: { allowAllTools: true },
      });
      render(<ChatPanelWithContext state={state} />);

      const toggle = screen.getByTestId("mock-toggle");
      const checkbox = toggle.querySelector("input");
      expect(checkbox).toBeChecked();
    });

    it("preserves root path state", () => {
      const state = createMockExtensionState({
        main: { rootPath: "/preserved/path" },
      });
      render(<ChatPanelWithContext state={state} />);

      const pathInput = screen
        .getByTestId("mock-path-selector")
        .querySelector("input");
      expect(pathInput).toHaveValue("/preserved/path");
    });
  });

  describe("chat error handling and connection states", () => {
    it("handles disabled state correctly", () => {
      render(<ChatPanelWithContext disabled={true} />);

      const startButton = screen.getByText("Start Chat Session");
      const addPromptButton = screen.getByText("Add Prompt");

      expect(startButton).toBeDisabled();
      expect(addPromptButton).toBeDisabled();
    });

    it("disables all interactive elements when disabled", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "Test" },
      });
      render(<ChatPanelWithContext disabled={true} state={state} />);

      const textarea = screen.getByDisplayValue("Test");
      const removeButton = screen.getByText("Remove Prompt");
      const startButton = screen.getByText("Start Chat Session");

      expect(textarea).toBeDisabled();
      expect(removeButton).toBeDisabled();
      expect(startButton).toBeDisabled();
    });

    it("passes disabled state to child components", () => {
      render(<ChatPanelWithContext disabled={true} />);

      const pathSelector = screen.getByTestId("mock-path-selector");
      const modelSelector = screen.getByTestId("mock-model-selector");
      const toggle = screen.getByTestId("mock-toggle");

      expect(pathSelector.querySelector("input")).toBeDisabled();
      expect(modelSelector.querySelector("select")).toBeDisabled();
      expect(toggle.querySelector("input")).toBeDisabled();
    });

    it("handles model update actions", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const modelSelector = screen.getByTestId("mock-model-selector");
      const select = modelSelector.querySelector("select");

      if (select) {
        fireEvent.change(select, {
          target: { value: "claude-opus-4-20250514" },
        });
      }

      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
    });

    it("handles root path update actions", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const pathSelector = screen.getByTestId("mock-path-selector");
      const input = pathSelector.querySelector("input");

      if (input) {
        fireEvent.change(input, { target: { value: "/new/path" } });
      }

      expect(mockActions.updateRootPath).toHaveBeenCalledWith("/new/path");
    });

    it("handles tool permissions toggle", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const toggle = screen.getByTestId("mock-toggle");
      const checkbox = toggle.querySelector("input");

      if (checkbox) {
        fireEvent.click(checkbox);
      }

      expect(mockActions.updateAllowAllTools).toHaveBeenCalledWith(true);
    });

    it("displays proper tool permissions label", () => {
      render(<ChatPanelWithContext />);

      expect(
        screen.getByText("Allow All Tools (--dangerously-skip-permissions)"),
      ).toBeInTheDocument();
    });

    it("handles Claude system errors gracefully", () => {
      const state = createMockExtensionState({
        claude: {
          version: "Unknown",
          isAvailable: false,
          isInstalled: false,
          error: "Connection failed",
          loading: false,
        },
      });

      expect(() => {
        render(<ChatPanelWithContext state={state} />);
      }).not.toThrow();

      expect(screen.getByTestId("mock-claude-version")).toBeInTheDocument();
    });
  });

  describe("component integration and lifecycle", () => {
    it("renders without crashing with minimal props", () => {
      expect(() => {
        render(<ChatPanelWithContext />);
      }).not.toThrow();
    });

    it("maintains component structure with different states", () => {
      const states = [
        createMockExtensionState({ main: { showChatPrompt: false } }),
        createMockExtensionState({
          main: { showChatPrompt: true, chatPrompt: "Test" },
        }),
        createMockExtensionState({ claude: { loading: true } }),
        createMockExtensionState({ claude: { error: "Error" } }),
      ];

      states.forEach((state) => {
        const { unmount } = render(<ChatPanelWithContext state={state} />);
        expect(
          screen.getByText("Interactive Chat Session"),
        ).toBeInTheDocument();
        unmount();
      });
    });

    it("renders different prompt values correctly", () => {
      // Test with initial state
      const initialState = createMockExtensionState({
        main: { chatPrompt: "Initial", showChatPrompt: true },
      });

      const { unmount } = render(<ChatPanelWithContext state={initialState} />);
      expect(screen.getByDisplayValue("Initial")).toBeInTheDocument();
      unmount();

      // Test with updated state in a new render
      const updatedState = createMockExtensionState({
        main: { chatPrompt: "Updated", showChatPrompt: true },
      });

      render(<ChatPanelWithContext state={updatedState} />);
      expect(screen.getByDisplayValue("Updated")).toBeInTheDocument();
    });

    it("handles rapid action calls without errors", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const addButton = screen.getByText("Add Prompt");

      // Simulate rapid clicks
      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton);

      expect(mockActions.updateShowChatPrompt).toHaveBeenCalledTimes(3);
    });
  });
});
