/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { ClaudeRunnerPanel } from "../../src/providers/ClaudeRunnerPanel";
import { ClaudeCodeService } from "../../src/services/ClaudeCodeService";
import { TerminalService } from "../../src/services/TerminalService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { UsageReportService } from "../../src/services/UsageReportService";

// Mock VSCode API
const mockContext = {
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn().mockReturnValue([]),
  },
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
} as any as vscode.Webview;

const mockWebviewView = {
  webview: mockWebview,
  visible: true,
  title: "Claude Runner",
  description: "",
  onDidChangeVisibility: jest.fn(),
  onDidDispose: jest.fn(),
  show: jest.fn(),
  badge: undefined,
} as any as vscode.WebviewView;

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

describe("Usage Report Integration Flow", () => {
  let panel: ClaudeRunnerPanel;
  let mockClaudeCodeService: jest.Mocked<ClaudeCodeService>;
  let mockTerminalService: jest.Mocked<TerminalService>;
  let mockConfigService: jest.Mocked<ConfigurationService>;
  let mockUsageReportService: jest.Mocked<UsageReportService>;
  let messageHandler: (message: any) => void;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock configuration
    const mockConfig = {
      defaultModel: "claude-sonnet-4-20250514",
      defaultRootPath: "/test/workspace",
      allowAllTools: false,
      outputFormat: "text" as const,
      maxTurns: 10,
      autoOpenTerminal: true,
      terminalName: "Claude Interactive",
      showVerboseOutput: false,
    };

    mockClaudeCodeService = new MockedClaudeCodeService(
      {} as any,
    ) as jest.Mocked<ClaudeCodeService>;
    mockTerminalService = new MockedTerminalService(
      {} as any,
    ) as jest.Mocked<TerminalService>;
    mockConfigService =
      new MockedConfigurationService() as jest.Mocked<ConfigurationService>;
    mockUsageReportService =
      new MockedUsageReportService() as jest.Mocked<UsageReportService>;

    mockConfigService.getConfiguration.mockReturnValue(mockConfig);

    // Mock usage report data
    const mockUsageData = {
      totalSessions: 42,
      totalTokens: 256000,
      averageSessionLength: 38.5,
      mostUsedModel: "claude-sonnet-4-20250514",
      totalCost: 25.5,
      sessionsThisWeek: 12,
      tokensThisWeek: 48000,
      topProjects: [
        { name: "project-alpha", sessionCount: 15, tokenCount: 96000 },
        { name: "project-beta", sessionCount: 10, tokenCount: 64000 },
      ],
      modelUsage: [
        { model: "claude-sonnet-4-20250514", count: 35, percentage: 83.3 },
        { model: "claude-opus-4-20250514", count: 7, percentage: 16.7 },
      ],
      recentActivity: [
        {
          timestamp: "2024-01-15T10:30:00Z",
          project: "project-alpha",
          model: "claude-sonnet-4-20250514",
          tokens: 1200,
          type: "chat",
        },
        {
          timestamp: "2024-01-15T09:15:00Z",
          project: "project-beta",
          model: "claude-sonnet-4-20250514",
          tokens: 850,
          type: "task",
        },
      ],
      dailyUsage: [
        { date: "2024-01-15", sessions: 3, tokens: 4500 },
        { date: "2024-01-14", sessions: 2, tokens: 3200 },
        { date: "2024-01-13", sessions: 4, tokens: 6100 },
      ],
    };

    mockUsageReportService.generateReport.mockResolvedValue(mockUsageData);

    // Create panel
    panel = new ClaudeRunnerPanel(mockContext);

    // Capture the message handler
    const onDidReceiveMessageCall =
      mockWebview.onDidReceiveMessage.mock.calls[0];
    if (onDidReceiveMessageCall) {
      messageHandler = onDidReceiveMessageCall[0];
    }
  });

  describe("Usage Report Generation", () => {
    test("should generate comprehensive usage report", async () => {
      const message = { type: "getUsageReport" };

      await messageHandler(message);

      expect(mockUsageReportService.generateReport).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageReportData",
        data: expect.objectContaining({
          totalSessions: 42,
          totalTokens: 256000,
          averageSessionLength: 38.5,
          mostUsedModel: "claude-sonnet-4-20250514",
          totalCost: 25.5,
        }),
      });
    });

    test("should include project breakdown in usage report", async () => {
      const message = { type: "getUsageReport" };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageReportData",
        data: expect.objectContaining({
          topProjects: expect.arrayContaining([
            expect.objectContaining({
              name: "project-alpha",
              sessionCount: 15,
              tokenCount: 96000,
            }),
            expect.objectContaining({
              name: "project-beta",
              sessionCount: 10,
              tokenCount: 64000,
            }),
          ]),
        }),
      });
    });

    test("should include model usage statistics", async () => {
      const message = { type: "getUsageReport" };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageReportData",
        data: expect.objectContaining({
          modelUsage: expect.arrayContaining([
            expect.objectContaining({
              model: "claude-sonnet-4-20250514",
              count: 35,
              percentage: 83.3,
            }),
            expect.objectContaining({
              model: "claude-opus-4-20250514",
              count: 7,
              percentage: 16.7,
            }),
          ]),
        }),
      });
    });

    test("should include recent activity timeline", async () => {
      const message = { type: "getUsageReport" };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageReportData",
        data: expect.objectContaining({
          recentActivity: expect.arrayContaining([
            expect.objectContaining({
              timestamp: "2024-01-15T10:30:00Z",
              project: "project-alpha",
              model: "claude-sonnet-4-20250514",
              tokens: 1200,
              type: "chat",
            }),
          ]),
        }),
      });
    });
  });

  describe("Usage Report Error Handling", () => {
    test("should handle usage report generation failures", async () => {
      mockUsageReportService.generateReport.mockRejectedValue(
        new Error("Failed to read log files"),
      );

      const message = { type: "getUsageReport" };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageReportError",
        data: expect.objectContaining({
          error: "Failed to read log files",
        }),
      });
    });

    test("should handle partial usage data gracefully", async () => {
      const partialUsageData = {
        totalSessions: 10,
        totalTokens: 50000,
        averageSessionLength: 25.0,
        mostUsedModel: "claude-sonnet-4-20250514",
        topProjects: [],
        modelUsage: [],
        recentActivity: [],
        dailyUsage: [],
      };

      mockUsageReportService.generateReport.mockResolvedValue(partialUsageData);

      const message = { type: "getUsageReport" };

      await messageHandler(message);

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageReportData",
        data: expect.objectContaining({
          totalSessions: 10,
          totalTokens: 50000,
          topProjects: [],
          modelUsage: [],
          recentActivity: [],
        }),
      });
    });
  });

  describe("Usage Tracking Integration", () => {
    test("should track chat session usage", async () => {
      // Start a chat session
      mockClaudeCodeService.executeInteractive.mockResolvedValue({
        success: true,
        output: "Interactive session started",
        command: "claude-code chat --model claude-sonnet-4-20250514",
      });

      const chatMessage = {
        type: "startChat",
        data: {
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
        },
      };

      await messageHandler(chatMessage);

      // Verify usage tracking was initiated
      expect(mockUsageReportService.trackSession).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "chat",
          model: "claude-sonnet-4-20250514",
          project: expect.any(String),
        }),
      );
    });

    test("should track task execution usage", async () => {
      mockClaudeCodeService.executeTask.mockResolvedValue({
        success: true,
        output: "Task completed",
        result: "Task result",
        command: 'claude-code task "test task"',
      });

      const taskMessage = {
        type: "executeTask",
        data: {
          task: "Create a test function",
          model: "claude-sonnet-4-20250514",
          rootPath: "/test/workspace",
          allowAllTools: false,
          outputFormat: "text",
          maxTurns: 10,
        },
      };

      await messageHandler(taskMessage);

      expect(mockUsageReportService.trackSession).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "task",
          model: "claude-sonnet-4-20250514",
          project: expect.any(String),
        }),
      );
    });

    test("should track pipeline execution usage", async () => {
      const tasks = ["Task 1", "Task 2", "Task 3"];

      mockClaudeCodeService.executeTask.mockResolvedValue({
        success: true,
        output: "Task completed",
        result: "Task result",
        command: 'claude-code task "test task"',
      });

      const pipelineMessage = {
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

      await messageHandler(pipelineMessage);

      expect(mockUsageReportService.trackSession).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "pipeline",
          model: "claude-sonnet-4-20250514",
          project: expect.any(String),
          taskCount: 3,
        }),
      );
    });
  });

  describe("Usage Data Export", () => {
    test("should export usage data to CSV format", async () => {
      const csvData = `Date,Sessions,Tokens,Model,Project,Type
2024-01-15,3,4500,claude-sonnet-4-20250514,project-alpha,chat
2024-01-14,2,3200,claude-sonnet-4-20250514,project-beta,task`;

      mockUsageReportService.exportToCSV.mockResolvedValue(csvData);

      const message = {
        type: "exportUsageData",
        data: { format: "csv" },
      };

      await messageHandler(message);

      expect(mockUsageReportService.exportToCSV).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageDataExported",
        data: expect.objectContaining({
          format: "csv",
          data: csvData,
        }),
      });
    });

    test("should export usage data to JSON format", async () => {
      const jsonData = {
        exportDate: "2024-01-15T12:00:00Z",
        totalSessions: 42,
        sessions: [
          {
            timestamp: "2024-01-15T10:30:00Z",
            model: "claude-sonnet-4-20250514",
            project: "project-alpha",
            type: "chat",
            tokens: 1200,
          },
        ],
      };

      mockUsageReportService.exportToJSON.mockResolvedValue(jsonData);

      const message = {
        type: "exportUsageData",
        data: { format: "json" },
      };

      await messageHandler(message);

      expect(mockUsageReportService.exportToJSON).toHaveBeenCalled();
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: "usageDataExported",
        data: expect.objectContaining({
          format: "json",
          data: jsonData,
        }),
      });
    });
  });
});
