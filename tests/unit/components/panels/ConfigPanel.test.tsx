import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ConfigPanel from "../../../../src/components/panels/ConfigPanel";

const mockActions = {
  updateModel: jest.fn(),
  updateRootPath: jest.fn(),
  updateAllowAllTools: jest.fn(),
  setCurrentView: jest.fn(),
  updateMainState: jest.fn(),
  startInteractive: jest.fn(),
  runTasks: jest.fn(),
  cancelTask: jest.fn(),
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
};

const mockState = {
  currentView: "main" as const,
  main: {
    activeTab: "chat" as const,
    model: "claude-sonnet-4-20250514",
    rootPath: "/workspace",
    allowAllTools: false,
    parallelTasksCount: 1,
    status: "stopped" as const,
    tasks: [],
    currentTaskIndex: undefined,
    results: undefined,
    taskCompleted: undefined,
    taskError: undefined,
    chatPrompt: "",
    showChatPrompt: false,
    outputFormat: "json" as const,
    availablePipelines: [],
    availableModels: [],
    workflows: [],
    currentWorkflow: null,
    workflowInputs: {},
    executionStatus: "idle" as const,
    stepStatuses: {},
    isPaused: false,
    currentExecutionId: undefined,
    pausedPipelines: [],
    resumableWorkflows: [],
  },
  commands: {
    activeTab: "global" as const,
    globalCommands: [],
    projectCommands: [],
    loading: false,
    rootPath: "",
  },
  usage: {
    activeTab: "usage" as const,
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
    selectedPeriod: "today" as const,
    totalHours: 5,
    startHour: 0,
    limitType: "output" as const,
    limitValue: 0,
    autoRefresh: false,
    report: null,
    loading: false,
    error: null,
  },
  claude: {
    version: "3.0.0",
    isAvailable: true,
    isInstalled: true,
    error: undefined,
    loading: false,
  },
};

jest.mock("../../../../src/contexts/ExtensionContext", () => ({
  useExtension: () => ({
    state: mockState,
    actions: mockActions,
    dispatch: jest.fn(),
  }),
  ExtensionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-extension-provider">{children}</div>
  ),
}));

describe("ConfigPanel", () => {
  beforeAll(() => {
    // Save original state for restoration
    JSON.parse(JSON.stringify(mockState));
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset state to initial values more efficiently
    Object.assign(mockState.main, {
      model: "claude-sonnet-4-20250514",
      rootPath: "/workspace",
      allowAllTools: false,
    });
  });

  afterEach(() => {
    // Clean up to prevent memory leaks
    jest.clearAllMocks();
  });

  describe("configuration panel rendering and layout", () => {
    it("renders configuration panel with correct title", () => {
      render(<ConfigPanel disabled={false} />);

      const title = screen.getByText("Configuration");
      expect(title).toBeInTheDocument();
      expect(title).toHaveClass("card-title");
    });

    it("renders with proper card structure", () => {
      render(<ConfigPanel disabled={false} />);

      const card = screen.getByText("Configuration").closest(".card");
      expect(card).toHaveClass("card");
      expect(card).toBeInTheDocument();
    });

    it("renders all configuration sections", () => {
      render(<ConfigPanel disabled={false} />);

      expect(screen.getByText("Claude Model")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Select working directory"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Allow All Tools (--dangerously-skip-permissions)"),
      ).toBeInTheDocument();
    });

    it("has proper layout structure", () => {
      render(<ConfigPanel disabled={false} />);

      const container = screen.getByText("Configuration").closest(".card");
      const contentContainer = container?.querySelector(".space-y-4");
      expect(contentContainer).toBeInTheDocument();
      expect(contentContainer).toHaveClass("space-y-4");
    });

    it("renders ModelSelector component", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).toBeInTheDocument();
      expect(modelSelect).toHaveAttribute("id", "model-select");
    });

    it("renders PathSelector component", () => {
      render(<ConfigPanel disabled={false} />);

      const pathInput = screen.getByDisplayValue("/workspace");
      expect(pathInput).toBeInTheDocument();
      expect(screen.getByText("Browse")).toBeInTheDocument();
    });

    it("renders Toggle component for tool permissions", () => {
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveClass("toggle-switch");
    });
  });

  describe("configuration form validation and submission", () => {
    it("calls updateModel when model selection changes", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });

      expect(mockActions.updateModel).toHaveBeenCalledTimes(1);
      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
    });

    it("calls updateRootPath when path changes", () => {
      render(<ConfigPanel disabled={false} />);

      const pathInput = screen.getByPlaceholderText("Select working directory");
      fireEvent.change(pathInput, { target: { value: "/new/path" } });

      expect(mockActions.updateRootPath).toHaveBeenCalledTimes(1);
      expect(mockActions.updateRootPath).toHaveBeenCalledWith("/new/path");
    });

    it("calls updateAllowAllTools when toggle is clicked", () => {
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });
      fireEvent.click(toggle);

      expect(mockActions.updateAllowAllTools).toHaveBeenCalledTimes(1);
      expect(mockActions.updateAllowAllTools).toHaveBeenCalledWith(true);
    });

    it("handles rapid configuration changes", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");
      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });
      fireEvent.change(pathInput, { target: { value: "/new/path" } });
      fireEvent.click(toggle);

      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
      expect(mockActions.updateRootPath).toHaveBeenCalledWith("/new/path");
      expect(mockActions.updateAllowAllTools).toHaveBeenCalledWith(true);
    });

    it("validates form inputs correctly", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");

      expect(modelSelect).toHaveValue("claude-sonnet-4-20250514");
      expect(pathInput).toHaveValue("/workspace");
      expect(pathInput).toBeValid();
    });

    it("handles empty path input gracefully", () => {
      render(<ConfigPanel disabled={false} />);

      const pathInput = screen.getByPlaceholderText("Select working directory");
      fireEvent.change(pathInput, { target: { value: "" } });

      expect(mockActions.updateRootPath).toHaveBeenCalledWith("");
    });
  });

  describe("configuration setting persistence", () => {
    it("displays current model from state", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).toHaveValue("claude-sonnet-4-20250514");
    });

    it("displays current root path from state", () => {
      render(<ConfigPanel disabled={false} />);

      const pathInput = screen.getByPlaceholderText("Select working directory");
      expect(pathInput).toHaveValue("/workspace");
    });

    it("displays current tool permissions state", () => {
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).not.toHaveClass("checked");
    });

    it("reflects state changes in UI", () => {
      mockState.main.allowAllTools = true;
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });
      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(toggle).toHaveClass("checked");

      mockState.main.allowAllTools = false;
    });

    it("maintains state consistency across renders", () => {
      const { rerender } = render(<ConfigPanel disabled={false} />);

      expect(screen.getByRole("combobox")).toHaveValue(
        "claude-sonnet-4-20250514",
      );
      expect(screen.getByDisplayValue("/workspace")).toHaveValue("/workspace");

      rerender(<ConfigPanel disabled={false} />);

      expect(screen.getByRole("combobox")).toHaveValue(
        "claude-sonnet-4-20250514",
      );
      expect(screen.getByDisplayValue("/workspace")).toHaveValue("/workspace");
    });

    it("persists configuration through disabled state changes", () => {
      const { rerender } = render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByDisplayValue("/workspace");

      expect(modelSelect).toHaveValue("claude-sonnet-4-20250514");
      expect(pathInput).toHaveValue("/workspace");

      rerender(<ConfigPanel disabled={true} />);

      expect(screen.getByRole("combobox")).toHaveValue(
        "claude-sonnet-4-20250514",
      );
      expect(screen.getByDisplayValue("/workspace")).toHaveValue("/workspace");
    });
  });

  describe("configuration error handling and recovery", () => {
    it("handles missing model gracefully", () => {
      mockState.main.model = "";
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).toBeInTheDocument();

      mockState.main.model = "claude-sonnet-4-20250514";
    });

    it("handles missing root path gracefully", () => {
      mockState.main.rootPath = "";
      render(<ConfigPanel disabled={false} />);

      const pathInput = screen.getByDisplayValue("");
      expect(pathInput).toBeInTheDocument();
      expect(pathInput).toHaveValue("");

      mockState.main.rootPath = "/workspace";
    });

    it("recovers from action errors gracefully", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).toBeInTheDocument();
      expect(modelSelect).not.toBeDisabled();
    });

    it("continues to function after action failures", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");

      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });
      fireEvent.change(pathInput, { target: { value: "/new/path" } });

      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
      expect(mockActions.updateRootPath).toHaveBeenCalledWith("/new/path");
    });

    it("handles undefined actions gracefully", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).toBeInTheDocument();
    });
  });

  describe("configuration default value handling", () => {
    it("uses default model when none specified", () => {
      mockState.main.model = "";
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).toBeInTheDocument();

      mockState.main.model = "claude-sonnet-4-20250514";
    });

    it("uses empty string as default for root path", () => {
      mockState.main.rootPath = "";
      render(<ConfigPanel disabled={false} />);

      const pathInput = screen.getByDisplayValue("");
      expect(pathInput).toHaveValue("");

      mockState.main.rootPath = "/workspace";
    });

    it("uses false as default for allow all tools", () => {
      mockState.main.allowAllTools = false;
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });

    it("handles undefined state values", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).toBeInTheDocument();
    });
  });

  describe("configuration change detection and saving", () => {
    it("detects model changes", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });

      expect(mockActions.updateModel).toHaveBeenCalledTimes(1);
      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
    });

    it("detects path changes", () => {
      render(<ConfigPanel disabled={false} />);

      const pathInput = screen.getByPlaceholderText("Select working directory");
      fireEvent.change(pathInput, { target: { value: "/different/path" } });

      expect(mockActions.updateRootPath).toHaveBeenCalledTimes(1);
      expect(mockActions.updateRootPath).toHaveBeenCalledWith(
        "/different/path",
      );
    });

    it("detects toggle state changes", () => {
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });
      fireEvent.click(toggle);

      expect(mockActions.updateAllowAllTools).toHaveBeenCalledTimes(1);
      expect(mockActions.updateAllowAllTools).toHaveBeenCalledWith(true);
    });

    it("saves configuration changes immediately", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });

      expect(mockActions.updateModel).toHaveBeenCalledTimes(1);
    });

    it("batches multiple rapid changes", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });
      fireEvent.change(modelSelect, {
        target: { value: "claude-3-5-haiku-20241022" },
      });

      expect(mockActions.updateModel).toHaveBeenCalledTimes(2);
      expect(mockActions.updateModel).toHaveBeenLastCalledWith(
        "claude-3-5-haiku-20241022",
      );
    });
  });

  describe("configuration accessibility and keyboard navigation", () => {
    it("has proper form structure for accessibility", () => {
      render(<ConfigPanel disabled={false} />);

      const modelLabel = screen.getByText("Claude Model");
      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");

      expect(modelLabel).toHaveAttribute("for", "model-select");
      expect(modelSelect).toHaveAttribute("id", "model-select");
      expect(pathInput).toHaveAttribute("id", "root-path");
    });

    it("supports keyboard navigation between form elements", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");
      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      modelSelect.focus();
      expect(modelSelect).toHaveFocus();

      pathInput.focus();
      expect(pathInput).toHaveFocus();

      toggle.focus();
      expect(toggle).toHaveFocus();
    });

    it("maintains focus after interactions", () => {
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      toggle.focus();
      fireEvent.click(toggle);
      expect(toggle).toHaveFocus();
    });

    it("has proper ARIA labels and descriptions", () => {
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });
      expect(toggle).toHaveAttribute("aria-pressed");
      expect(toggle).toHaveAttribute(
        "aria-label",
        "Allow All Tools (--dangerously-skip-permissions)",
      );
    });

    it("provides accessible form labels", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByLabelText("Claude Model");
      const pathInput = screen.getByPlaceholderText("Select working directory");

      expect(modelSelect).toBeInTheDocument();
      expect(pathInput).toBeInTheDocument();
    });

    it("supports screen reader navigation", () => {
      render(<ConfigPanel disabled={false} />);

      const card = screen.getByText("Configuration").closest(".card");
      const title = screen.getByText("Configuration");

      expect(card).toBeInTheDocument();
      expect(title).toHaveClass("card-title");
    });

    it("handles keyboard events correctly", () => {
      render(<ConfigPanel disabled={false} />);

      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      toggle.focus();
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });

    it("maintains tab order correctly", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");
      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      expect(modelSelect).not.toBeDisabled();
      expect(pathInput).not.toBeDisabled();
      expect(toggle).not.toBeDisabled();
    });
  });

  describe("configuration panel disabled state", () => {
    it("disables all form elements when disabled prop is true", () => {
      render(<ConfigPanel disabled={true} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");
      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      expect(modelSelect).toBeDisabled();
      expect(pathInput).toBeDisabled();
      expect(toggle).toBeDisabled();
    });

    it("enables all form elements when disabled prop is false", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");
      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      expect(modelSelect).not.toBeDisabled();
      expect(pathInput).not.toBeDisabled();
      expect(toggle).not.toBeDisabled();
    });

    it("prevents interactions when disabled", () => {
      render(<ConfigPanel disabled={true} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");
      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      expect(modelSelect).toBeDisabled();
      expect(pathInput).toBeDisabled();
      expect(toggle).toBeDisabled();
    });

    it("maintains state visibility when disabled", () => {
      render(<ConfigPanel disabled={true} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByPlaceholderText("Select working directory");

      expect(modelSelect).toHaveValue("claude-sonnet-4-20250514");
      expect(pathInput).toHaveValue("/workspace");
    });

    it("toggles disabled state correctly", () => {
      const { rerender } = render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      expect(modelSelect).not.toBeDisabled();

      rerender(<ConfigPanel disabled={true} />);
      expect(screen.getByRole("combobox")).toBeDisabled();

      rerender(<ConfigPanel disabled={false} />);
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
  });

  describe("configuration integration testing", () => {
    it("integrates properly with extension context", () => {
      render(<ConfigPanel disabled={false} />);

      expect(screen.getByRole("combobox")).toHaveValue(
        "claude-sonnet-4-20250514",
      );
      expect(screen.getByDisplayValue("/workspace")).toHaveValue("/workspace");
      expect(
        screen.getByRole("button", {
          name: "Allow All Tools (--dangerously-skip-permissions)",
        }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("handles context updates correctly", () => {
      render(<ConfigPanel disabled={false} />);

      expect(screen.getByRole("combobox")).toHaveValue(
        "claude-sonnet-4-20250514",
      );
      expect(
        screen.getByPlaceholderText("Select working directory"),
      ).toHaveValue("/workspace");
      expect(
        screen.getByRole("button", {
          name: "Allow All Tools (--dangerously-skip-permissions)",
        }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("communicates with VSCode extension properly", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });

      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
    });

    it("maintains configuration consistency", () => {
      render(<ConfigPanel disabled={false} />);

      const modelSelect = screen.getByRole("combobox");
      const pathInput = screen.getByDisplayValue("/workspace");
      const toggle = screen.getByRole("button", {
        name: "Allow All Tools (--dangerously-skip-permissions)",
      });

      fireEvent.change(modelSelect, {
        target: { value: "claude-opus-4-20250514" },
      });
      fireEvent.change(pathInput, { target: { value: "/new/path" } });
      fireEvent.click(toggle);

      expect(mockActions.updateModel).toHaveBeenCalledWith(
        "claude-opus-4-20250514",
      );
      expect(mockActions.updateRootPath).toHaveBeenCalledWith("/new/path");
      expect(mockActions.updateAllowAllTools).toHaveBeenCalledWith(true);
    });
  });
});
