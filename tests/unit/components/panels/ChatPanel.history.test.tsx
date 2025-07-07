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
  return () => <div data-testid="mock-toggle" />;
});

jest.mock("../../../../src/components/common/PathSelector", () => {
  return () => <div data-testid="mock-path-selector" />;
});

jest.mock("../../../../src/components/common/ModelSelector", () => {
  return () => <div data-testid="mock-model-selector" />;
});

jest.mock("../../../../src/components/common/ClaudeVersionDisplay", () => {
  return () => <div data-testid="mock-claude-version" />;
});

// Create mock extension context
const createMockExtensionState = (
  overrides: {
    main?: Partial<ExtensionState["main"]>;
    usage?: Partial<ExtensionState["usage"]>;
    claude?: Partial<ExtensionState["claude"]>;
  } = {},
): ExtensionState => {
  const baseState: ExtensionState = {
    currentView: "main",
    main: {
      activeTab: "chat",
      model: "claude-sonnet-4-20250514",
      rootPath: "/workspace",
      allowAllTools: false,
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
      chatMessages: [],
      chatSessionId: undefined,
      chatSending: false,
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
  sendChatMessage: jest.fn(),
  clearChatSession: jest.fn(),
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

describe("ChatPanel History Functionality", () => {
  let mockActions: ExtensionActions;

  beforeEach(() => {
    mockActions = createMockActions();
    jest.clearAllMocks();

    // Mock scrollIntoView which isn't available in test environment
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("history selector", () => {
    it("shows Load History button", () => {
      render(<ChatPanelWithContext />);

      expect(screen.getByText("Load History")).toBeInTheDocument();
    });

    it("opens history selector when Load History is clicked", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const loadHistoryButton = screen.getByText("Load History");
      fireEvent.click(loadHistoryButton);

      expect(screen.getByText("Load Conversation History")).toBeInTheDocument();
      expect(screen.getByText("Hide History")).toBeInTheDocument();
      expect(mockActions.requestLogProjects).toHaveBeenCalled();
    });

    it("shows project selector when history is open", () => {
      const state = createMockExtensionState({
        usage: {
          projects: [
            {
              name: "project1",
              path: "/path/to/project1",
              conversationCount: 5,
              lastModified: "2023-01-01",
            },
            {
              name: "project2",
              path: "/path/to/project2",
              conversationCount: 3,
              lastModified: "2023-01-02",
            },
          ],
        },
      });

      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const loadHistoryButton = screen.getByText("Load History");
      fireEvent.click(loadHistoryButton);

      const projectSelect = screen.getByDisplayValue("Select a project...");
      expect(projectSelect).toBeInTheDocument();
    });

    it("loads conversations when project is selected", () => {
      const state = createMockExtensionState({
        usage: {
          projects: [
            {
              name: "project1",
              path: "/path/to/project1",
              conversationCount: 5,
              lastModified: "2023-01-01",
            },
          ],
        },
      });

      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const loadHistoryButton = screen.getByText("Load History");
      fireEvent.click(loadHistoryButton);

      const projectSelect = screen.getByDisplayValue("Select a project...");
      fireEvent.change(projectSelect, { target: { value: "project1" } });

      expect(mockActions.updateUsageState).toHaveBeenCalledWith({
        selectedProject: "project1",
      });
      expect(mockActions.requestLogConversations).toHaveBeenCalledWith(
        "project1",
      );
    });

    it("displays conversations when available", () => {
      const state = createMockExtensionState({
        usage: {
          selectedProject: "project1",
          conversations: [
            {
              id: "conv1",
              sessionId: "session1",
              fileName: "conv1.json",
              firstTimestamp: "2023-01-01T10:00:00Z",
              lastTimestamp: "2023-01-01T11:00:00Z",
              messageCount: 5,
              summary: "Discussion about TypeScript",
              filePath: "/path/to/conv1.json",
            },
          ],
        },
      });

      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const loadHistoryButton = screen.getByText("Load History");
      fireEvent.click(loadHistoryButton);

      expect(screen.getByText("5 messages")).toBeInTheDocument();
      expect(
        screen.getByText("Discussion about TypeScript"),
      ).toBeInTheDocument();
    });

    it("loads conversation when clicked", () => {
      const state = createMockExtensionState({
        usage: {
          selectedProject: "project1",
          conversations: [
            {
              id: "conv1",
              sessionId: "session1",
              fileName: "conv1.json",
              firstTimestamp: "2023-01-01T10:00:00Z",
              lastTimestamp: "2023-01-01T11:00:00Z",
              messageCount: 5,
              summary: "Discussion about TypeScript",
              filePath: "/path/to/conv1.json",
            },
          ],
        },
      });

      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const loadHistoryButton = screen.getByText("Load History");
      fireEvent.click(loadHistoryButton);

      const conversationItem = screen
        .getByText("Discussion about TypeScript")
        .closest(".conversation-item");
      if (conversationItem) {
        fireEvent.click(conversationItem);
      }

      expect(mockActions.requestLogConversation).toHaveBeenCalledWith(
        "/path/to/conv1.json",
      );
    });

    it("closes history selector after loading conversation", () => {
      const state = createMockExtensionState({
        usage: {
          selectedProject: "project1",
          conversations: [
            {
              id: "conv1",
              sessionId: "session1",
              fileName: "conv1.json",
              firstTimestamp: "2023-01-01T10:00:00Z",
              lastTimestamp: "2023-01-01T11:00:00Z",
              messageCount: 5,
              summary: "Discussion about TypeScript",
              filePath: "/path/to/conv1.json",
            },
          ],
        },
      });

      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const loadHistoryButton = screen.getByText("Load History");
      fireEvent.click(loadHistoryButton);

      const conversationItem = screen
        .getByText("Discussion about TypeScript")
        .closest(".conversation-item");
      if (conversationItem) {
        fireEvent.click(conversationItem);
      }

      expect(
        screen.queryByText("Load Conversation History"),
      ).not.toBeInTheDocument();
    });
  });
});
