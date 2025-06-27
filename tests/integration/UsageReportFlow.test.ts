import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import * as vscode from "vscode";
import { ClaudeRunnerPanel } from "../../src/providers/ClaudeRunnerPanel";
import { ClaudeCodeService } from "../../src/services/ClaudeCodeService";
import { ClaudeService } from "../../src/services/ClaudeService";
import { TerminalService } from "../../src/services/TerminalService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { UsageReportService } from "../../src/services/UsageReportService";

// Mock VSCode API
const mockContext = {
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
  },
  globalState: {
    get: jest.fn().mockReturnValue(undefined),
    update: jest.fn(),
  },
  // NOSONAR: /tmp is safe in test context for VSCode extension mock data
  extensionUri: { with: jest.fn(), fsPath: "/tmp/mock-extension" },
  // NOSONAR: /tmp is safe in test context for VSCode extension mock data
  globalStorageUri: { fsPath: "/tmp/mock-global-storage" },
  subscriptions: [],
} as unknown as vscode.ExtensionContext;

const mockWebview = {
  postMessage: jest.fn(),
  asWebviewUri: jest.fn().mockReturnValue("mock://uri"),
  html: "",
  onDidReceiveMessage: jest.fn(),
  options: {},
  cspSource: "",
} as unknown as vscode.Webview;

const mockWebviewView = {
  webview: mockWebview,
  visible: true,
  show: jest.fn(),
  title: "Claude Runner",
  description: "Claude Runner",
  viewType: "claude-runner.mainView",
  badge: undefined,
  onDidDispose: jest.fn(),
  onDidChangeVisibility: jest.fn(),
} as unknown as vscode.WebviewView;

// Mock file system for PipelineService
jest.mock("fs/promises", () => ({
  mkdir: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve("{}")),
  access: jest.fn(() => Promise.resolve()),
  readdir: jest.fn(() => Promise.resolve([])),
  rm: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));

// Mock services
jest.mock("../../src/services/ClaudeCodeService");
jest.mock("../../src/services/TerminalService");
jest.mock("../../src/services/ConfigurationService");
jest.mock("../../src/services/UsageReportService");

const mockConfigService =
  new ConfigurationService() as jest.Mocked<ConfigurationService>;
const mockClaudeCodeService = new ClaudeCodeService(
  mockConfigService,
) as jest.Mocked<ClaudeCodeService>;
const mockTerminalService = new TerminalService(
  mockConfigService,
) as jest.Mocked<TerminalService>;

describe("Usage Report Integration Flow", () => {
  let panel: ClaudeRunnerPanel;
  let messageHandler: (message: unknown) => void;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock configuration
    (mockConfigService.getConfiguration as jest.Mock).mockReturnValue({
      defaultModel: "claude-sonnet-4-20250514",
      defaultRootPath: "/test/path",
      allowAllTools: false,
      outputFormat: "json",
      maxTurns: 10,
      showVerboseOutput: false,
      terminalName: "Claude Interactive",
      autoOpenTerminal: true,
    });

    panel = new ClaudeRunnerPanel(
      mockContext,
      mockClaudeCodeService,
      {} as jest.Mocked<ClaudeService>,
      mockTerminalService,
      mockConfigService,
    );

    // Setup webview
    panel.resolveWebviewView(
      mockWebviewView,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken,
    );

    // Capture the message handler
    const onDidReceiveMessageCalls = (
      mockWebview.onDidReceiveMessage as jest.Mock
    ).mock.calls;
    expect(onDidReceiveMessageCalls.length).toBeGreaterThan(0);
    messageHandler = onDidReceiveMessageCalls[0][0] as (
      message: unknown,
    ) => void;
  });

  describe("requestUsageReport message handling", () => {
    it("should handle requestUsageReport message and send back data", async () => {
      const mockReportData = {
        period: "today" as const,
        startDate: "2025-06-17",
        endDate: "2025-06-17",
        dailyReports: [
          {
            date: "2025-06-17",
            models: ["claude-sonnet-4-20250514"],
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreateTokens: 100,
            cacheReadTokens: 200,
            totalTokens: 1800,
            costUSD: 0.015,
          },
        ],
        totals: {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreateTokens: 100,
          cacheReadTokens: 200,
          totalTokens: 1800,
          costUSD: 0.015,
          models: ["claude-sonnet-4-20250514"],
        },
      };

      // Mock the usage report service
      const mockUsageReportService = UsageReportService as jest.MockedClass<
        typeof UsageReportService
      >;
      const mockInstance = mockUsageReportService.mock
        .instances[0] as jest.Mocked<UsageReportService>;
      mockInstance.generateReport.mockResolvedValue(mockReportData);

      // Send the message
      await messageHandler({
        command: "requestUsageReport",
        period: "today",
      });

      // Verify service was called
      expect(mockInstance.generateReport).toHaveBeenCalledWith(
        "today",
        undefined,
        undefined,
      );

      // Verify response was sent
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        command: "usageReportData",
        data: mockReportData,
      });
    });

    it("should handle service errors and send error message", async () => {
      const mockError = new Error("Failed to read usage files");

      // Mock the usage report service to throw an error
      const mockUsageReportService = UsageReportService as jest.MockedClass<
        typeof UsageReportService
      >;
      const mockInstance = mockUsageReportService.mock
        .instances[0] as jest.Mocked<UsageReportService>;
      mockInstance.generateReport.mockRejectedValue(mockError);

      // Send the message
      await messageHandler({
        command: "requestUsageReport",
        period: "week",
      });

      // Verify service was called
      expect(mockInstance.generateReport).toHaveBeenCalledWith(
        "week",
        undefined,
        undefined,
      );

      // Verify error response was sent
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        command: "usageReportError",
        error: "Failed to read usage files",
      });
    });

    it("should handle different period types", async () => {
      const mockUsageReportService = UsageReportService as jest.MockedClass<
        typeof UsageReportService
      >;
      const mockInstance = mockUsageReportService.mock
        .instances[0] as jest.Mocked<UsageReportService>;

      // Mock empty report
      const emptyReport = {
        period: "month" as const,
        startDate: "2025-05-18",
        endDate: "2025-06-17",
        dailyReports: [],
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          costUSD: 0,
          models: [],
        },
      };

      mockInstance.generateReport.mockResolvedValue(emptyReport);

      // Test each period type
      for (const period of ["today", "week", "month"]) {
        jest.clearAllMocks();

        // Create period-specific report
        const periodReport = {
          ...emptyReport,
          period: period as "today" | "week" | "month",
        };
        mockInstance.generateReport.mockResolvedValue(periodReport);

        await messageHandler({
          command: "requestUsageReport",
          period,
        });

        expect(mockInstance.generateReport).toHaveBeenCalledWith(
          period,
          undefined,
          undefined,
        );
        expect(mockWebview.postMessage).toHaveBeenCalledWith({
          command: "usageReportData",
          data: periodReport,
        });
      }
    });

    it("should handle unknown commands gracefully", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await messageHandler({
        command: "unknownCommand",
        data: "test",
      });

      // Unknown commands trigger error logging via the error path
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ClaudeRunner] Unhandled error:",
        expect.any(Error),
      );
      // System should send error message to webview
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        command: "error",
        error: "Unknown or invalid command: unknownCommand",
      });

      consoleErrorSpy.mockRestore();
    });

    it("should handle malformed messages gracefully", async () => {
      // Test with undefined message
      await expect(messageHandler(undefined)).resolves.not.toThrow();

      // Test with null message
      await expect(messageHandler(null)).resolves.not.toThrow();

      // Test with message without command
      await expect(messageHandler({ period: "today" })).resolves.not.toThrow();
    });
  });

  describe("message flow timing", () => {
    it("should handle rapid successive requests correctly", async () => {
      const mockReport = {
        period: "today" as const,
        startDate: "2025-06-17",
        endDate: "2025-06-17",
        dailyReports: [],
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          costUSD: 0,
          models: [],
        },
      };

      // Use the existing mock instance that was setup in beforeEach
      const mockUsageReportService = UsageReportService as jest.MockedClass<
        typeof UsageReportService
      >;
      const mockInstance = mockUsageReportService.mock
        .instances[0] as jest.Mocked<UsageReportService>;

      // Clear mock call history but keep the mock implementation
      mockInstance.generateReport.mockClear();
      (mockWebview.postMessage as jest.Mock).mockClear();

      // Mock with minimal delay and period-specific responses
      mockInstance.generateReport.mockImplementation(
        async (period, _hours, _startHour) => {
          return { ...mockReport, period };
        },
      );

      // Send multiple rapid requests sequentially to ensure they all process
      await messageHandler({ command: "requestUsageReport", period: "today" });
      await messageHandler({ command: "requestUsageReport", period: "week" });
      await messageHandler({ command: "requestUsageReport", period: "month" });

      // All requests should have been processed
      expect(mockInstance.generateReport).toHaveBeenCalledTimes(3);
      expect(mockWebview.postMessage).toHaveBeenCalledTimes(3);
    });
  });
});

describe("UsageReportService Mock Verification", () => {
  it("should properly mock the service", () => {
    const service = new UsageReportService();
    expect(service.generateReport).toBeDefined();
    expect(typeof service.generateReport).toBe("function");
  });
});
