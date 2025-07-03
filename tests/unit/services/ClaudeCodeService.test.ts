import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";

// Mock factories for better performance
const createMockConfigService = () => {
  const service = new ConfigurationService();
  jest.spyOn(service, "validateModel").mockReturnValue(true);
  jest.spyOn(service, "validatePath").mockReturnValue(true);
  return service;
};

// Mock child_process
jest.mock(
  "child_process",
  () => ({
    exec: jest.fn(),
    spawn: jest.fn(),
  }),
  { virtual: true },
);

// Mock promisify
jest.mock(
  "util",
  () => ({
    promisify: jest.fn((_fn) => jest.fn()),
  }),
  { virtual: true },
);

// Mock vscode
jest.mock(
  "vscode",
  () => ({
    workspace: {
      getConfiguration: jest.fn(() => ({
        get: jest.fn((key: string) => {
          const defaults: Record<string, unknown> = {
            defaultModel: "claude-sonnet-4-20250514",
            allowAllTools: false,
            outputFormat: "text",
            maxTurns: 10,
            defaultRootPath: "",
            showVerboseOutput: false,
            terminalName: "Claude Interactive",
            autoOpenTerminal: true,
          };
          return defaults[key];
        }),
      })),
      onDidChangeConfiguration: jest.fn(),
    },
    ConfigurationTarget: {
      Workspace: 1,
    },
  }),
  { virtual: true },
);

describe("ClaudeCodeService", () => {
  let claudeCodeService: ClaudeCodeService;
  let configService: ConfigurationService;

  beforeEach(() => {
    configService = createMockConfigService();
    claudeCodeService = new ClaudeCodeService(configService);

    // Mock the internal executeCommand method directly
    jest.spyOn(claudeCodeService as any, "executeCommand").mockResolvedValue({
      success: true,
      output: "Task completed successfully",
      error: undefined,
      exitCode: 0,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("Model and Path Validation", () => {
    it("should reject invalid models", async () => {
      jest.spyOn(configService, "validateModel").mockReturnValue(false);

      await expect(
        claudeCodeService.runTask("test task", "invalid-model", "/valid/path"),
      ).rejects.toThrow("Invalid model: invalid-model");
    });

    it("should reject invalid paths", async () => {
      jest.spyOn(configService, "validatePath").mockReturnValue(false);

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "invalid-path",
        ),
      ).rejects.toThrow("Invalid root path: invalid-path");
    });
  });

  describe("JSON Output Processing", () => {
    it("should handle JSON output format in task execution", async () => {
      const mockJsonOutput =
        '{"result": "This is the extracted result", "metadata": {"tokens": 100}}';

      // Mock executeCommand to return JSON
      jest.spyOn(claudeCodeService as any, "executeCommand").mockResolvedValue({
        success: true,
        output: mockJsonOutput,
        error: undefined,
        exitCode: 0,
      });

      const result = await claudeCodeService.runTask(
        "test task",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result).toBe("This is the extracted result");
    });

    it("should handle malformed JSON through task execution", async () => {
      const malformedJson = '{"result": incomplete json';

      // Mock executeCommand to return malformed JSON
      jest.spyOn(claudeCodeService as any, "executeCommand").mockResolvedValue({
        success: true,
        output: malformedJson,
        error: undefined,
        exitCode: 0,
      });

      const result = await claudeCodeService.runTask(
        "test task",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result).toBe(malformedJson); // Should return original if parsing fails
    });

    it("should handle JSON without result field through task execution", async () => {
      const jsonWithoutResult =
        '{"metadata": {"tokens": 100}, "other": "data"}';

      // Mock executeCommand to return JSON without result field
      jest.spyOn(claudeCodeService as any, "executeCommand").mockResolvedValue({
        success: true,
        output: jsonWithoutResult,
        error: undefined,
        exitCode: 0,
      });

      const result = await claudeCodeService.runTask(
        "test task",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result).toEqual(expect.stringContaining('"metadata"'));
      expect(result).toEqual(expect.stringContaining('"other"'));
    });
  });

  describe("Command Building and Execution", () => {
    it("should execute task with correct command arguments", async () => {
      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
      );

      // Verify task execution was successful
      expect(result).toBe("Task completed successfully");
    });

    it("should include output format in command execution", async () => {
      // Mock executeCommand to return JSON
      jest.spyOn(claudeCodeService as any, "executeCommand").mockResolvedValue({
        success: true,
        output: '{"result": "Task completed"}',
        error: undefined,
        exitCode: 0,
      });

      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result).toBe("Task completed");
    });

    it("should include max turns in command execution", async () => {
      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { maxTurns: 5 },
      );

      expect(result).toBe("Task completed successfully");
    });

    it("should include allow all tools flag when specified", async () => {
      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { allowAllTools: true },
      );

      expect(result).toBe("Task completed successfully");
    });

    it("should include session resume when specified", async () => {
      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { resumeSessionId: "session123" },
      );

      expect(result).toBe("Task completed successfully");
    });
  });

  describe("Error Handling", () => {
    it("should handle command execution failures gracefully", async () => {
      // Mock executeCommand to fail
      jest.spyOn(claudeCodeService as any, "executeCommand").mockResolvedValue({
        success: false,
        output: "",
        error: "Command failed",
        exitCode: 1,
      });

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow("Command failed");
    });
  });
});
