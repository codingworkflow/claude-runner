import { jest, describe, it, beforeEach, expect } from "@jest/globals";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";

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
          const defaults: Record<string, any> = {
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
    configService = new ConfigurationService();
    claudeCodeService = new ClaudeCodeService(configService);

    // Mock validateModel to return true for valid models
    jest.spyOn(configService, "validateModel").mockReturnValue(true);
    jest.spyOn(configService, "validatePath").mockReturnValue(true);
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
    it("should extract result from JSON output format", () => {
      const mockJsonOutput =
        '{"result": "This is the extracted result", "metadata": {"tokens": 100}}';

      // Access private method via type assertion for testing
      const extractedResult = (claudeCodeService as any).extractResultFromJson(
        mockJsonOutput,
      );
      expect(extractedResult).toBe("This is the extracted result");
    });

    it("should handle malformed JSON gracefully", () => {
      // Suppress console.warn for this test
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const malformedJson = '{"result": incomplete json';

      const extractedResult = (claudeCodeService as any).extractResultFromJson(
        malformedJson,
      );
      expect(extractedResult).toBe(malformedJson); // Should return original if parsing fails

      consoleSpy.mockRestore();
    });

    it("should handle JSON without result field", () => {
      const jsonWithoutResult =
        '{"metadata": {"tokens": 100}, "other": "data"}';

      const extractedResult = (claudeCodeService as any).extractResultFromJson(
        jsonWithoutResult,
      );
      // Should return formatted JSON since no result field exists
      expect(extractedResult).toEqual(expect.stringContaining('"metadata"'));
      expect(extractedResult).toEqual(expect.stringContaining('"other"'));
    });
  });

  describe("Command Building", () => {
    it("should build basic task command correctly", () => {
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        {},
      );

      expect(args).toContain("claude");
      expect(args).toContain("-p");
      expect(args).toContain("--model");
      expect(args).toContain("claude-sonnet-4-20250514");
      // The prompt is escaped and wrapped in quotes
      expect(args.some((arg) => arg.includes("test prompt"))).toBe(true);
    });

    it("should include output format in command", () => {
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        { outputFormat: "json" },
      );

      expect(args).toContain("--output-format");
      expect(args).toContain("json");
    });

    it("should include max turns in command", () => {
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        { maxTurns: 5 },
      );

      expect(args).toContain("--max-turns");
      expect(args).toContain("5");
    });

    it("should include allow all tools flag when specified", () => {
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        { allowAllTools: true },
      );

      expect(args).toContain("--dangerously-skip-permissions");
    });

    it("should include session resume when specified", () => {
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        { resumeSessionId: "session123" },
      );

      expect(args).toContain("-r");
      expect(args).toContain("session123");
    });
  });

  describe("Pipeline Status Management", () => {
    it("should track pipeline execution state", () => {
      const tasks = [
        {
          id: "1",
          name: "Task 1",
          prompt: "Test prompt",
          resumePrevious: false,
          status: "pending" as const,
        },
      ];

      expect((claudeCodeService as any).currentPipelineExecution).toBeNull();

      // Set up pipeline (would normally be done by runTaskPipeline)
      (claudeCodeService as any).currentPipelineExecution = {
        tasks,
        currentIndex: 0,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      expect(
        (claudeCodeService as any).currentPipelineExecution,
      ).not.toBeNull();
      expect((claudeCodeService as any).currentPipelineExecution.tasks).toEqual(
        tasks,
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle command execution failures gracefully", () => {
      // Mock executeCommand to return failure
      jest.spyOn(claudeCodeService as any, "executeCommand").mockResolvedValue({
        success: false,
        output: "",
        error: "Command failed",
        exitCode: 1,
      });

      return expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow("Command failed");
    });
  });
});
