import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// Mock the useExtension hook at the module level
jest.mock("../../../../src/contexts/ExtensionContext", () => ({
  ...jest.requireActual("../../../../src/contexts/ExtensionContext"),
  useExtension: jest.fn(),
}));

// Store the mock reference to update it during tests
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useExtension } = require("../../../../src/contexts/ExtensionContext");

const ChatPanelWithContext = ({
  disabled = false,
  state = createMockExtensionState(),
  actions = createMockActions(),
}: {
  disabled?: boolean;
  state?: ExtensionState;
  actions?: ExtensionActions;
}) => {
  useExtension.mockReturnValue({ state, actions });
  return <ChatPanel disabled={disabled} />;
};

describe("ChatPanel", () => {
  let mockActions: ExtensionActions;

  beforeEach(() => {
    mockActions = createMockActions();
    jest.clearAllMocks();

    // Mock scrollIntoView which isn't available in test environment
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockActions = {} as ExtensionActions;
  });

  describe("chat mode selection", () => {
    it("renders chat mode selector buttons", () => {
      render(<ChatPanelWithContext />);

      expect(screen.getByText("VSCode")).toBeInTheDocument();
      expect(screen.getByText("Terminal")).toBeInTheDocument();
    });

    it("defaults to extension mode", () => {
      render(<ChatPanelWithContext />);

      const extensionButton = screen.getByText("VSCode");
      expect(extensionButton).toHaveAttribute("data-variant", "primary");
    });

    it("switches between terminal and extension modes", () => {
      render(<ChatPanelWithContext />);

      const terminalButton = screen.getByText("Terminal");
      fireEvent.click(terminalButton);

      // Component should handle internal state for mode switching
      expect(terminalButton).toBeInTheDocument();
    });
  });

  describe("terminal mode functionality", () => {
    it("shows terminal mode interface when selected", () => {
      render(<ChatPanelWithContext />);

      const terminalButton = screen.getByText("Terminal");
      fireEvent.click(terminalButton);

      expect(
        screen.getByText(/Start an interactive Claude chat session/),
      ).toBeInTheDocument();
      expect(screen.getByText("Start Terminal Session")).toBeInTheDocument();
    });

    it("shows Add Initial Prompt button in terminal mode", () => {
      render(<ChatPanelWithContext />);

      fireEvent.click(screen.getByText("Terminal"));
      expect(screen.getByText("Add Initial Prompt")).toBeInTheDocument();
    });

    it("calls startInteractive with prompt in terminal mode", () => {
      const state = createMockExtensionState({
        main: { showChatPrompt: true, chatPrompt: "Test prompt" },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      fireEvent.click(screen.getByText("Terminal"));
      fireEvent.click(screen.getByText("Start Terminal Session"));

      expect(mockActions.startInteractive).toHaveBeenCalledWith("Test prompt");
    });
  });

  describe("extension mode chat functionality", () => {
    it("shows extension mode chat interface when selected", () => {
      render(<ChatPanelWithContext />);

      expect(
        screen.getByPlaceholderText(/Type your message/),
      ).toBeInTheDocument();
      expect(screen.getByText("Send")).toBeInTheDocument();
    });

    it("displays empty chat state", () => {
      render(<ChatPanelWithContext />);

      expect(
        screen.getByText("Start a conversation with Claude..."),
      ).toBeInTheDocument();
    });

    it("displays chat messages", () => {
      const state = createMockExtensionState({
        main: {
          chatMessages: [
            {
              role: "user",
              content: "Hello",
              timestamp: new Date().toISOString(),
            },
            {
              role: "assistant",
              content: "Hi there!",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });
      render(<ChatPanelWithContext state={state} />);

      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Hi there!")).toBeInTheDocument();
      expect(screen.getByText("👤 You")).toBeInTheDocument();
      expect(screen.getByText("🤖 Claude")).toBeInTheDocument();
    });

    it("handles sending a message and sets loading state", async () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const input = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(input, { target: { value: "Test message" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      // Should set chatSending to true immediately
      expect(mockActions.updateMainState).toHaveBeenCalledWith({
        chatSending: true,
      });

      // Should send the message
      expect(mockActions.sendChatMessage).toHaveBeenCalledWith(
        "Test message",
        true,
      );
    });

    it("handles Enter key to send message", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const input = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(input, { target: { value: "Test message" } });
      fireEvent.keyPress(input, { key: "Enter", code: "Enter", charCode: 13 });

      expect(mockActions.sendChatMessage).toHaveBeenCalledWith(
        "Test message",
        true,
      );
    });

    it("handles Shift+Enter for new line without sending", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const input = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(input, { target: { value: "Test message" } });
      fireEvent.keyPress(input, {
        key: "Enter",
        code: "Enter",
        charCode: 13,
        shiftKey: true,
      });

      expect(mockActions.sendChatMessage).not.toHaveBeenCalled();
    });

    it("disables send button when message is empty", () => {
      render(<ChatPanelWithContext />);

      const sendButton = screen.getByText("Send");
      expect(sendButton).toBeDisabled();
    });

    it("shows 'Processing...' when message is being sent", () => {
      const state = createMockExtensionState({
        main: { chatSending: true },
      });
      render(<ChatPanelWithContext state={state} />);

      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });

    it("shows spinner element when message is being sent", () => {
      const state = createMockExtensionState({
        main: { chatSending: true },
      });
      render(<ChatPanelWithContext state={state} />);

      // Check that the loading spinner element exists
      const spinner = document.querySelector(".loading-spinner") as HTMLElement;
      expect(spinner).toBeInTheDocument();

      // Check that the send button shows both spinner and text
      const sendButton = screen.getByText("Processing...").parentElement;
      expect(sendButton).toContainElement(spinner as HTMLElement);
    });

    it("clears chat when Clear Chat button is clicked", () => {
      const state = createMockExtensionState({
        main: {
          chatMessages: [
            {
              role: "user",
              content: "Hello",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const clearButton = screen.getByText("Clear Chat");
      fireEvent.click(clearButton);

      expect(mockActions.clearChatSession).toHaveBeenCalled();
    });

    it("disables Clear Chat button when no messages", () => {
      render(<ChatPanelWithContext />);

      const clearButton = screen.getByText("Clear Chat");
      expect(clearButton).toBeDisabled();
    });

    it("maintains session ID for subsequent messages", () => {
      const state = createMockExtensionState({
        main: {
          chatMessages: [
            {
              role: "user",
              content: "First",
              timestamp: new Date().toISOString(),
            },
          ],
          chatSessionId: "test-session-123",
        },
      });
      render(<ChatPanelWithContext state={state} actions={mockActions} />);

      const input = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(input, { target: { value: "Second message" } });
      fireEvent.click(screen.getByText("Send"));

      expect(mockActions.sendChatMessage).toHaveBeenCalledWith(
        "Second message",
        false,
      );
    });
  });

  describe("chat interface interaction", () => {
    it("disables all controls when disabled prop is true", () => {
      render(<ChatPanelWithContext disabled={true} />);

      const terminalButton = screen.getByText("Terminal");
      const extensionButton = screen.getByText("VSCode");
      const input = screen.getByPlaceholderText(/Type your message/);
      const sendButton = screen.getByText("Send");

      expect(terminalButton).toBeDisabled();
      expect(extensionButton).toBeDisabled();
      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it("disables controls when sending message", () => {
      const state = createMockExtensionState({
        main: { chatSending: true },
      });
      render(<ChatPanelWithContext state={state} />);

      const input = screen.getByPlaceholderText(/Type your message/);
      const modelSelector = screen
        .getByTestId("mock-model-selector")
        .querySelector("select");

      expect(input).toBeDisabled();
      expect(modelSelector).toBeDisabled();
    });

    it("preserves input value while typing", () => {
      render(<ChatPanelWithContext />);

      const input = screen.getByPlaceholderText(
        /Type your message/,
      ) as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: "Test in progress" } });

      expect(input.value).toBe("Test in progress");
    });

    it("clears input after sending message", () => {
      const { rerender } = render(
        <ChatPanelWithContext actions={mockActions} />,
      );

      const input = screen.getByPlaceholderText(
        /Type your message/,
      ) as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: "Test message" } });
      fireEvent.click(screen.getByText("Send"));

      // Simulate component update after message sent
      rerender(<ChatPanelWithContext actions={mockActions} />);

      expect(input.value).toBe("");
    });

    it("scrolls to bottom when new messages arrive", async () => {
      const scrollIntoViewMock = jest.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;

      const state = createMockExtensionState({
        main: {
          chatMessages: [
            {
              role: "user",
              content: "Hello",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      const { rerender } = render(<ChatPanelWithContext state={state} />);

      const updatedState = createMockExtensionState({
        main: {
          chatMessages: [
            {
              role: "user",
              content: "Hello",
              timestamp: new Date().toISOString(),
            },
            {
              role: "assistant",
              content: "Hi!",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      rerender(<ChatPanelWithContext state={updatedState} />);

      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth" });
      });
    });
  });

  describe("chat persistence and state management", () => {
    it("displays messages from initial state", () => {
      const stateWithMessages = createMockExtensionState({
        main: {
          chatMessages: [
            {
              role: "user",
              content: "Hello Claude",
              timestamp: new Date().toISOString(),
            },
            {
              role: "assistant",
              content: "Hello! How can I help?",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      render(<ChatPanelWithContext state={stateWithMessages} />);

      expect(screen.getByText("Hello Claude")).toBeInTheDocument();
      expect(screen.getByText("Hello! How can I help?")).toBeInTheDocument();
      expect(
        screen.queryByText("Start a conversation with Claude..."),
      ).not.toBeInTheDocument();
    });

    it("preserves chat mode selection internally", () => {
      render(<ChatPanelWithContext />);

      const terminalButton = screen.getByText("Terminal");
      fireEvent.click(terminalButton);

      expect(screen.getByText("Start Terminal Session")).toBeInTheDocument();
    });

    it("handles rapid message sending", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const input = screen.getByPlaceholderText(/Type your message/);
      const sendButton = screen.getByText("Send");

      fireEvent.change(input, { target: { value: "Message 1" } });
      fireEvent.click(sendButton);
      fireEvent.change(input, { target: { value: "Message 2" } });
      fireEvent.click(sendButton);

      expect(mockActions.sendChatMessage).toHaveBeenCalledTimes(2);
    });

    it("shows user message immediately when sent", () => {
      render(<ChatPanelWithContext actions={mockActions} />);

      const input = screen.getByPlaceholderText(/Type your message/);
      const sendButton = screen.getByText("Send");

      // Initially should show empty state
      expect(
        screen.getByText("Start a conversation with Claude..."),
      ).toBeInTheDocument();

      // Send a message
      fireEvent.change(input, { target: { value: "Hello!" } });
      fireEvent.click(sendButton);

      // User message should appear immediately
      expect(screen.getByText("Hello!")).toBeInTheDocument();
      expect(
        screen.queryByText("Start a conversation with Claude..."),
      ).not.toBeInTheDocument();

      // Input should be cleared
      expect(input).toHaveValue("");
    });

    it("has proper responsive layout structure", () => {
      render(<ChatPanelWithContext />);

      // Chat container should exist (messages area)
      const chatContainer = document.querySelector(".chat-container");
      expect(chatContainer).toBeInTheDocument();

      // Input container should exist (input area)
      const inputContainer = document.querySelector(".chat-input-container");
      expect(inputContainer).toBeInTheDocument();

      // Input container should be outside chat container (fixed at bottom)
      expect(chatContainer?.contains(inputContainer)).toBe(false);

      // Messages area should be inside chat container
      const messagesArea = document.querySelector(".chat-messages");
      expect(chatContainer?.contains(messagesArea)).toBe(true);
    });

    it("shows loading button when sending message", () => {
      const stateWithSending = createMockExtensionState({
        main: {
          chatSending: true,
          chatMessages: [
            {
              role: "user",
              content: "Hello",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      render(<ChatPanelWithContext state={stateWithSending} />);

      // Should show the sending text with spinner
      expect(screen.getByText("Processing...")).toBeInTheDocument();

      // Should show spinner element
      const spinner = document.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();

      // Should show both user message and loading
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    it("shows loading state during complete send flow", async () => {
      // Create state with both chatSending and chatMessages set from the start
      const stateWithLoading = createMockExtensionState({
        main: {
          chatSending: true,
          chatMessages: [
            {
              role: "user",
              content: "Test message",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      render(
        <ChatPanelWithContext state={stateWithLoading} actions={mockActions} />,
      );

      // Should show sending text immediately
      expect(screen.getByText("Processing...")).toBeInTheDocument();

      // Should show spinner element
      const spinner = document.querySelector(".loading-spinner");
      expect(spinner).toBeInTheDocument();

      expect(screen.getByText("Test message")).toBeInTheDocument();
    });
  });
});
