import * as vscode from "vscode";
import { ClaudeRunnerPanel } from "../../src/providers/ClaudeRunnerPanel";
import { ClaudeCodeService } from "../../src/services/ClaudeCodeService";
import { TerminalService } from "../../src/services/TerminalService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { LogsService } from "../../src/services/LogsService";
import { UsageReportService } from "../../src/services/UsageReportService";
import { mkdir, rmdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

// Mock VSCode API
const mockWorkspaceState = {
  get: jest.fn(),
  update: jest.fn(),
  keys: jest.fn().mockReturnValue([]),
};

const mockContext = {
  workspaceState: mockWorkspaceState,
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn().mockReturnValue([]),
  },
  extensionUri: vscode.Uri.file("/mock/path"),
  subscriptions: [],
  extensionPath: "/mock/path",
} as unknown as vscode.ExtensionContext;

const mockWebview = {
  postMessage: jest.fn(),
  asWebviewUri: jest.fn().mockReturnValue(vscode.Uri.parse("mock://uri")),
  html: "",
  onDidReceiveMessage: jest.fn(),
  options: {},
  cspSource: "mock-csp",
} as unknown as vscode.Webview;

// Remove unused mockWebviewView
// const mockWebviewView = {
//   webview: mockWebview,
//   visible: true,
//   title: 'Claude Runner',
//   description: '',
//   onDidChangeVisibility: jest.fn(),
//   onDidDispose: jest.fn(),
//   show: jest.fn(),
//   badge: undefined
// } as unknown as vscode.WebviewView;

// Mock services
jest.mock("../../src/services/ClaudeCodeService");
jest.mock("../../src/services/TerminalService");
jest.mock("../../src/services/ConfigurationService");
jest.mock("../../src/services/UsageReportService");

const MockedClaudeCodeService = ClaudeCodeService as jest.MockedClass<
  typeof ClaudeCodeService
>;
const MockedTerminalService = TerminalService as jest.MockedClass<
  typeof TerminalService
>;
const MockedConfigurationService = ConfigurationService as jest.MockedClass<
  typeof ConfigurationService
>;
const MockedUsageReportService = UsageReportService as jest.MockedClass<
  typeof UsageReportService
>;

describe("Conversation Flows End-to-End Tests", () => {
  let panel: ClaudeRunnerPanel;
  let mockClaudeCodeService: jest.Mocked<ClaudeCodeService>;
  let mockTerminalService: jest.Mocked<TerminalService>;
  let mockConfigService: jest.Mocked<ConfigurationService>;
  let mockUsageReportService: jest.Mocked<UsageReportService>;
  let messageHandler: (message: any) => void;
  let testLogsDir: string;

  beforeAll(async () => {
    // Set up test logs directory
    testLogsDir = path.join(tmpdir(), "claude-runner-conversation-test");
    await mkdir(testLogsDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rmdir(testLogsDir, { recursive: true });
    } catch (error) {
      console.warn("Failed to clean up test logs directory:", error);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock services
    mockClaudeCodeService = new MockedClaudeCodeService(
      {} as unknown,
    ) as jest.Mocked<ClaudeCodeService>;
    mockTerminalService = new MockedTerminalService(
      {} as unknown,
    ) as jest.Mocked<TerminalService>;
    mockConfigService =
      new MockedConfigurationService() as jest.Mocked<ConfigurationService>;
    mockUsageReportService =
      new MockedUsageReportService() as jest.Mocked<UsageReportService>;

    // Setup default mock configurations
    mockConfigService.getConfiguration.mockReturnValue({
      defaultModel: "claude-sonnet-4-20250514",
      defaultRootPath: "/test/workspace",
      allowAllTools: false,
      outputFormat: "text",
      maxTurns: 10,
      autoOpenTerminal: true,
      terminalName: "Claude Interactive",
      showVerboseOutput: false,
    });

    mockClaudeCodeService.executeInteractive.mockResolvedValue({
      success: true,
      output: "Interactive session started",
      command: "claude-code chat --model claude-sonnet-4-20250514",
    });

    mockClaudeCodeService.executeTask.mockResolvedValue({
      success: true,
      output: "Task completed successfully",
      result: "Hello! I can help you with your task.",
      command: 'claude-code task "test task"',
    });

    // Create panel instance
    panel = new ClaudeRunnerPanel(mockContext);

    // Capture message handler
    const onDidReceiveMessageCall =
      mockWebview.onDidReceiveMessage.mock.calls[0];
    if (onDidReceiveMessageCall) {
      messageHandler = onDidReceiveMessageCall[0];
    }
  });

  describe("Interactive Chat Flow", () => {
    test("should start interactive chat session with default settings", async () => {
      const message = {
        type: "startChat",
        data: {
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
        },
      };

      await messageHandler(message);

      expect(mockClaudeCodeService.executeInteractive).toHaveBeenCalledWith({
        model: "claude-sonnet-4-20250514",
        rootPath: "/test/workspace",
        allowAllTools: false,
        prompt: undefined,
      });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "chatStarted",
        data: expect.objectContaining({
          success: true,
          command: expect.stringContaining("claude-code chat"),
        }),
      });
    });

    test("should start interactive chat with custom prompt", async () => {
      const message = {
        type: "startChat",
        data: {
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: true,
          prompt: "Help me debug this Python script",
        },
      };

      await messageHandler(message);

      expect(mockClaudeCodeService.executeInteractive).toHaveBeenCalledWith({
        model: "claude-sonnet-4-20250514",
        rootPath: "/test/workspace",
        allowAllTools: true,
        prompt: "Help me debug this Python script",
      });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "chatStarted",
        data: expect.objectContaining({
          success: true,
        }),
      });
    });

    test("should handle chat session failures gracefully", async () => {
      mockClaudeCodeService.executeInteractive.mockResolvedValue({
        success: false,
        output: "Claude CLI not found",
        error: "Command not found: claude-code",
        command: "claude-code chat",
      });

      const message = {
        type: "startChat",
        data: {
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
        },
      };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "chatError",
        data: expect.objectContaining({
          success: false,
          error: "Command not found: claude-code",
        }),
      });
    });

    test("should update terminal service when starting chat", async () => {
      const message = {
        type: "startChat",
        data: {
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
        },
      };

      await messageHandler(message);

      expect(
        mockTerminalService.createInteractiveTerminal,
      ).toHaveBeenCalledWith("Claude Interactive", "/test/workspace");
    });
  });

  describe("Task Execution Flow", () => {
    test("should execute single task with proper configuration", async () => {
      const message = {
        type: "executeTask",
        data: {
          task: "Create a Python function to calculate fibonacci numbers",
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: true,
          outputFormat: "text",
          maxTurns: 5,
        },
      };

      await messageHandler(message);

      expect(mockClaudeCodeService.executeTask).toHaveBeenCalledWith({
        task: "Create a Python function to calculate fibonacci numbers",
        model: "claude-sonnet-4-20250514",
        rootPath: "/test/workspace",
        allowAllTools: true,
        outputFormat: "text",
        maxTurns: 5,
        showVerboseOutput: false,
      });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "taskCompleted",
        data: expect.objectContaining({
          success: true,
          result: "Hello! I can help you with your task.",
        }),
      });
    });

    test("should execute task with JSON output format", async () => {
      mockClaudeCodeService.executeTask.mockResolvedValue({
        success: true,
        output: "Task completed",
        result: JSON.stringify({
          code: "def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)",
          explanation: "Recursive fibonacci implementation",
        }),
        command: 'claude-code task "fibonacci function" --output json',
      });

      const message = {
        type: "executeTask",
        data: {
          task: "Create fibonacci function",
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
          outputFormat: "json",
          maxTurns: 10,
        },
      };

      await messageHandler(message);

      expect(mockClaudeCodeService.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          outputFormat: "json",
        }),
      );

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "taskCompleted",
        data: expect.objectContaining({
          success: true,
          result: expect.objectContaining({
            code: expect.stringContaining("fibonacci"),
            explanation: expect.any(String),
          }),
        }),
      });
    });

    test("should handle task execution errors", async () => {
      mockClaudeCodeService.executeTask.mockResolvedValue({
        success: false,
        output: "Task failed",
        error: "API rate limit exceeded",
        command: 'claude-code task "test task"',
      });

      const message = {
        type: "executeTask",
        data: {
          task: "Test task",
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
          outputFormat: "text",
          maxTurns: 10,
        },
      };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "taskError",
        data: expect.objectContaining({
          success: false,
          error: "API rate limit exceeded",
        }),
      });
    });
  });

  describe("Pipeline Execution Flow", () => {
    test("should execute pipeline with multiple tasks", async () => {
      const tasks = [
        "Analyze the codebase structure",
        "Identify potential optimizations",
        "Generate improvement recommendations",
      ];

      // Mock successful responses for each task
      mockClaudeCodeService.executeTask
        .mockResolvedValueOnce({
          success: true,
          output: "Analysis complete",
          result: "Codebase has 15 modules with clear separation of concerns.",
          command: 'claude-code task "Analyze the codebase structure"',
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Optimization analysis complete",
          result:
            "Found 3 areas for optimization: database queries, file I/O, and caching.",
          command: 'claude-code task "Identify potential optimizations"',
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Recommendations generated",
          result:
            "Implement connection pooling, add file caching, and use Redis for session storage.",
          command: 'claude-code task "Generate improvement recommendations"',
        });

      const message = {
        type: "executePipeline",
        data: {
          tasks,
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: true,
          outputFormat: "text",
          maxTurns: 10,
          parallelTasksCount: 1,
        },
      };

      await messageHandler(message);

      // Verify all tasks were executed
      expect(mockClaudeCodeService.executeTask).toHaveBeenCalledTimes(3);

      // Verify correct parameters for each task
      tasks.forEach((task, index) => {
        expect(mockClaudeCodeService.executeTask).toHaveBeenNthCalledWith(
          index + 1,
          expect.objectContaining({
            task,
            model: "claude-sonnet-4-20250514",
            rootPath: "/test/workspace",
            allowAllTools: true,
            outputFormat: "text",
            maxTurns: 10,
          }),
        );
      });

      // Verify pipeline completion message
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "pipelineCompleted",
        data: expect.objectContaining({
          success: true,
          results: expect.arrayContaining([
            expect.objectContaining({ success: true }),
            expect.objectContaining({ success: true }),
            expect.objectContaining({ success: true }),
          ]),
        }),
      });
    });

    test("should handle partial pipeline failures", async () => {
      const tasks = ["Task 1: Success", "Task 2: Will fail", "Task 3: Success"];

      mockClaudeCodeService.executeTask
        .mockResolvedValueOnce({
          success: true,
          output: "Task 1 completed",
          result: "Task 1 result",
          command: 'claude-code task "Task 1: Success"',
        })
        .mockResolvedValueOnce({
          success: false,
          output: "Task 2 failed",
          error: "Invalid input parameters",
          command: 'claude-code task "Task 2: Will fail"',
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Task 3 completed",
          result: "Task 3 result",
          command: 'claude-code task "Task 3: Success"',
        });

      const message = {
        type: "executePipeline",
        data: {
          tasks,
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
          outputFormat: "text",
          maxTurns: 10,
          parallelTasksCount: 1,
        },
      };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "pipelineCompleted",
        data: expect.objectContaining({
          success: false, // Overall pipeline failed due to one task failure
          results: expect.arrayContaining([
            expect.objectContaining({ success: true }),
            expect.objectContaining({
              success: false,
              error: "Invalid input parameters",
            }),
            expect.objectContaining({ success: true }),
          ]),
        }),
      });
    });

    test("should execute tasks in parallel when configured", async () => {
      const tasks = ["Task A", "Task B", "Task C"];

      // Create promises that we can control
      let resolveTask1: (value: any) => void;
      let resolveTask2: (value: any) => void;
      let resolveTask3: (value: any) => void;

      const task1Promise = new Promise((resolve) => {
        resolveTask1 = resolve;
      });
      const task2Promise = new Promise((resolve) => {
        resolveTask2 = resolve;
      });
      const task3Promise = new Promise((resolve) => {
        resolveTask3 = resolve;
      });

      mockClaudeCodeService.executeTask
        .mockReturnValueOnce(task1Promise)
        .mockReturnValueOnce(task2Promise)
        .mockReturnValueOnce(task3Promise);

      const message = {
        type: "executePipeline",
        data: {
          tasks,
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
          outputFormat: "text",
          maxTurns: 10,
          parallelTasksCount: 3, // Execute all tasks in parallel
        },
      };

      // Start pipeline execution
      const pipelinePromise = messageHandler(message);

      // Verify all tasks started (called immediately due to parallelism)
      expect(mockClaudeCodeService.executeTask).toHaveBeenCalledTimes(3);

      // Resolve tasks in reverse order to test parallelism
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      resolveTask3!({
        success: true,
        result: "Task C done",
        command: "task C",
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      resolveTask1!({
        success: true,
        result: "Task A done",
        command: "task A",
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      resolveTask2!({
        success: true,
        result: "Task B done",
        command: "task B",
      });

      await pipelinePromise;

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "pipelineCompleted",
        data: expect.objectContaining({
          success: true,
          results: expect.arrayContaining([
            expect.objectContaining({ result: "Task A done" }),
            expect.objectContaining({ result: "Task B done" }),
            expect.objectContaining({ result: "Task C done" }),
          ]),
        }),
      });
    });
  });

  describe("Configuration Management Flow", () => {
    test("should update configuration settings", async () => {
      const message = {
        type: "updateConfiguration",
        data: {
          defaultModel: "claude-opus-4-20250514",
          defaultRootPath: "/new/workspace",
          allowAllTools: true,
          outputFormat: "json",
          maxTurns: 15,
          autoOpenTerminal: false,
        },
      };

      await messageHandler(message);

      expect(mockConfigService.updateConfiguration).toHaveBeenCalledWith({
        defaultModel: "claude-opus-4-20250514",
        defaultRootPath: "/new/workspace",
        allowAllTools: true,
        outputFormat: "json",
        maxTurns: 15,
        autoOpenTerminal: false,
      });

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "configurationUpdated",
        data: { success: true },
      });
    });

    test("should load current configuration", async () => {
      const message = { type: "getConfiguration" };

      await messageHandler(message);

      expect(mockConfigService.getConfiguration).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "configurationLoaded",
        data: expect.objectContaining({
          defaultModel: "claude-sonnet-4-20250514",
          defaultRootPath: "/test/workspace",
          allowAllTools: false,
        }),
      });
    });
  });

  describe("Logs and Usage Tracking Flow", () => {
    test("should request usage report data", async () => {
      const mockUsageData = {
        totalSessions: 25,
        totalTokens: 150000,
        averageSessionLength: 45,
        mostUsedModel: "claude-sonnet-4-20250514",
        topProjects: ["project-a", "project-b"],
        recentActivity: [],
      };

      mockUsageReportService.generateReport.mockResolvedValue(mockUsageData);

      const message = { type: "getUsageReport" };

      await messageHandler(message);

      expect(mockUsageReportService.generateReport).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageReportData",
        data: mockUsageData,
      });
    });

    test("should request conversation logs", async () => {
      // Create mock logs service
      const logsService = new LogsService();
      jest
        .spyOn(logsService, "listProjects")
        .mockResolvedValue([
          {
            name: "test-project",
            path: "/test/path",
            conversationCount: 5,
            lastModified: new Date(),
          },
        ]);

      const message = { type: "getConversationLogs" };

      // Mock the panel's logs service
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (panel as any).logsService = logsService;

      await messageHandler(message);

      expect(logsService.listProjects).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "conversationLogsData",
        data: expect.objectContaining({
          projects: expect.arrayContaining([
            expect.objectContaining({
              name: "test-project",
              conversationCount: 5,
            }),
          ]),
        }),
      });
    });
  });

  describe("Error Handling and Recovery", () => {
    test("should handle invalid message types gracefully", async () => {
      const message = { type: "invalidMessageType", data: {} };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "error",
        data: { message: "Unknown message type: invalidMessageType" },
      });
    });

    test("should handle service initialization failures", async () => {
      // Mock service constructor to throw
      MockedClaudeCodeService.mockImplementation(() => {
        throw new Error("Service initialization failed");
      });

      expect(() => {
        new ClaudeRunnerPanel(mockContext);
      }).toThrow("Service initialization failed");
    });

    test("should handle webview message sending failures", async () => {
      mockWebview.postMessage.mockRejectedValue(
        new Error("Webview communication failed"),
      );

      const message = { type: "getConfiguration" };

      // Should not throw, but handle gracefully
      await expect(messageHandler(message)).resolves.not.toThrow();
    });
  });

  describe("State Management and Persistence", () => {
    test("should persist UI state across sessions", async () => {
      const uiState = {
        activeTab: "chat",
        selectedModel: "claude-sonnet-4-20250514",
        rootPath: "/test/workspace",
        allowAllTools: true,
        chatPrompt: "Help me with testing",
        showChatPrompt: true,
        parallelTasksCount: 2,
        tasks: [
          { id: "1", name: "Task 1", description: "First task" },
          { id: "2", name: "Task 2", description: "Second task" },
        ],
      };

      const message = { type: "updateUIState", data: uiState };

      await messageHandler(message);

      expect(mockWorkspaceState.update).toHaveBeenCalledWith(
        "claudeRunner.uiState",
        uiState,
      );
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "uiStateUpdated",
        data: { success: true },
      });
    });

    test("should restore UI state on panel initialization", async () => {
      const savedUIState = {
        activeTab: "pipeline",
        selectedModel: "claude-opus-4-20250514",
        rootPath: "/saved/workspace",
        allowAllTools: false,
      };

      mockWorkspaceState.get.mockReturnValue(savedUIState);

      // Create new panel to trigger state restoration
      new ClaudeRunnerPanel(mockContext);

      expect(mockWorkspaceState.get).toHaveBeenCalledWith(
        "claudeRunner.uiState",
        expect.any(Object),
      );
    });
  });
});
