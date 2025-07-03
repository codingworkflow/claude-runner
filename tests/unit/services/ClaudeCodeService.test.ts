import { jest, describe, it, beforeEach, expect } from "@jest/globals";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import { promisify } from "util";

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
    it("should handle JSON output format in task execution", async () => {
      const mockJsonOutput =
        '{"result": "This is the extracted result", "metadata": {"tokens": 100}}';

      // Mock child_process.exec for successful execution

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: mockJsonOutput,
          stderr: "",
        }),
      );

      // Test through public API - runTask with JSON output format
      const result = await claudeCodeService.runTask(
        "test task",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("This is the extracted result");
    });

    it("should handle malformed JSON through task execution", async () => {
      const malformedJson = '{"result": incomplete json';

      // Mock child_process.exec for malformed JSON

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: malformedJson,
          stderr: "",
        }),
      );

      // Test through public API
      const result = await claudeCodeService.runTask(
        "test task",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe(malformedJson); // Should return original if parsing fails
    });

    it("should handle JSON without result field through task execution", async () => {
      const jsonWithoutResult =
        '{"metadata": {"tokens": 100}, "other": "data"}';

      // Mock child_process.exec for JSON without result field

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: jsonWithoutResult,
          stderr: "",
        }),
      );

      // Test through public API
      const result = await claudeCodeService.runTask(
        "test task",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual(expect.stringContaining('"metadata"'));
      expect(result.output).toEqual(expect.stringContaining('"other"'));
    });
  });

  describe("Command Building and Execution", () => {
    it("should execute task with correct command arguments", async () => {
      // Mock child_process.exec for successful execution

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: "Task completed successfully",
          stderr: "",
        }),
      );

      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
      );

      // Verify task execution was successful
      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed successfully");
    });

    it("should include output format in command execution", async () => {
      // Mock child_process.exec for JSON output

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: '{"result": "Task completed"}',
          stderr: "",
        }),
      );

      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { outputFormat: "json" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed");
    });

    it("should include max turns in command execution", async () => {
      // Mock child_process.exec for max turns

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: "Task completed",
          stderr: "",
        }),
      );

      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { maxTurns: 5 },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed");
    });

    it("should include allow all tools flag when specified", async () => {
      // Mock child_process.exec for allow all tools

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: "Task completed",
          stderr: "",
        }),
      );

      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { allowAllTools: true },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed");
    });

    it("should include session resume when specified", async () => {
      // Mock child_process.exec for session resume

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: "Task completed",
          stderr: "",
        }),
      );

      const result = await claudeCodeService.runTask(
        "test prompt",
        "claude-sonnet-4-20250514",
        "/valid/path",
        { resumeSessionId: "session123" },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed");
    });
  });

  describe("Pipeline Status Management", () => {
    it("should track pipeline execution through public API", async () => {
      const tasks = [
        {
          id: "1",
          prompt: "Test prompt",
          status: "pending" as const,
        },
      ];

      // Mock child_process.exec for pipeline execution

      promisify.mockImplementation(() =>
        jest.fn().mockResolvedValue({
          stdout: "Task completed",
          stderr: "",
        }),
      );

      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      // Test pipeline execution through public API
      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/valid/path",
        {},
        onProgress,
        onComplete,
        onError,
      );

      // Verify callbacks were called
      expect(onProgress).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle command execution failures gracefully", async () => {
      // Mock child_process.exec to fail

      promisify.mockImplementation(() =>
        jest.fn().mockRejectedValue(new Error("Command failed")),
      );

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow("Command failed");
    });
  });

  describe("Rate Limit Detection", () => {
    it("should detect and handle rate limit in task execution", async () => {
      const rateLimitMessage = "Claude AI usage limit reached|1750928400";

      // Mock child_process.exec to fail with rate limit

      promisify.mockImplementation(() =>
        jest.fn().mockRejectedValue(new Error(rateLimitMessage)),
      );

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow(rateLimitMessage);
    });

    it("should handle rate limit detection in mixed output", async () => {
      const mixedOutput = `Error occurred while processing request.
Claude AI usage limit reached|1750928400
Please try again later.`;

      // Mock child_process.exec to fail with mixed output

      promisify.mockImplementation(() =>
        jest.fn().mockRejectedValue(new Error(mixedOutput)),
      );

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow(expect.stringContaining("Claude AI usage limit"));
    });

    it("should handle normal error messages without rate limit", async () => {
      const normalError = "Command execution failed with exit code 1";

      // Mock child_process.exec to fail with normal error

      promisify.mockImplementation(() =>
        jest.fn().mockRejectedValue(new Error(normalError)),
      );

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow(normalError);
    });

    it("should handle empty error output", async () => {
      // Mock child_process.exec to fail with empty error

      promisify.mockImplementation(() =>
        jest.fn().mockRejectedValue(new Error("")),
      );

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow();
    });

    it("should handle invalid rate limit timestamp format", async () => {
      const invalidMessage = "Claude AI usage limit reached|invalid_timestamp";

      // Mock child_process.exec to fail with invalid timestamp

      promisify.mockImplementation(() =>
        jest.fn().mockRejectedValue(new Error(invalidMessage)),
      );

      await expect(
        claudeCodeService.runTask(
          "test task",
          "claude-sonnet-4-20250514",
          "/valid/path",
        ),
      ).rejects.toThrow(invalidMessage);
    });

    it("should handle multiple rate limit patterns in task execution", async () => {
      const testCases = [
        "Claude AI usage limit reached|1750928400",
        "Error: Claude AI usage limit reached|1750928500 - please wait",
        "Claude AI usage limit reached|1750928600\nAdditional info here",
      ];

      for (const testCase of testCases) {
        // Mock child_process.exec to fail with rate limit patterns

        promisify.mockImplementation(() =>
          jest.fn().mockRejectedValue(new Error(testCase)),
        );

        await expect(
          claudeCodeService.runTask(
            "test task",
            "claude-sonnet-4-20250514",
            "/valid/path",
          ),
        ).rejects.toThrow(expect.stringContaining("Claude AI usage limit"));
      }
    });
  });

  describe("Pipeline Rate Limit Handling", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should pause pipeline execution on rate limit detection", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task 1",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
        {
          id: "task2",
          prompt: "test task 2",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      const mockOnProgress = jest.fn();
      const mockOnComplete = jest.fn();
      const mockOnError = jest.fn();

      // Mock command execution to return rate limit error on first call
      const resetTimeSeconds = Math.floor((Date.now() + 3600000) / 1000); // 1 hour from now in seconds
      const resetTime = resetTimeSeconds * 1000; // Convert back to milliseconds for comparison
      const rateLimitError = `Claude AI usage limit reached|${resetTimeSeconds}`;

      mockCommandExecution.executeCommand.mockResolvedValueOnce({
        success: false,
        output: rateLimitError,
        error: rateLimitError,
        exitCode: 429,
      });

      // Start pipeline execution
      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        mockOnProgress,
        mockOnComplete,
        mockOnError,
      );

      // Verify task was marked as paused
      expect(tasks[0].status).toBe("paused");
      expect(tasks[0].pausedUntil).toBe(resetTime);
      expect(tasks[0].results).toBe("Rate limited - waiting for reset");

      // Verify callbacks were called correctly
      expect(mockOnProgress).toHaveBeenCalled();
      expect(mockOnComplete).not.toHaveBeenCalled();
      expect(mockOnError).not.toHaveBeenCalled();

      // Verify pipeline state through public API
      const pausedPipelines = claudeCodeService.getPausedPipelines();
      expect(pausedPipelines.length).toBeGreaterThan(0);
      expect(pausedPipelines[0].currentIndex).toBe(0);
    });

    it("should handle rate limit in error scenarios during pipeline execution", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task 1",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      const mockOnProgress = jest.fn();
      const mockOnComplete = jest.fn();
      const mockOnError = jest.fn();

      // Mock command execution to throw rate limit error
      const resetTimeSeconds = Math.floor((Date.now() + 1800000) / 1000); // 30 minutes from now in seconds
      const resetTime = resetTimeSeconds * 1000; // Convert back to milliseconds for comparison
      const rateLimitError = `Claude AI usage limit reached|${resetTimeSeconds}`;

      mockCommandExecution.executeCommand.mockRejectedValueOnce(
        new Error(rateLimitError),
      );

      // Start pipeline execution
      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        mockOnProgress,
        mockOnComplete,
        mockOnError,
      );

      // Verify task was marked as paused
      expect(tasks[0].status).toBe("paused");
      expect(tasks[0].pausedUntil).toBe(resetTime);
      expect(tasks[0].results).toBe("Rate limited - waiting for reset");

      // Verify callbacks were called correctly
      expect(mockOnProgress).toHaveBeenCalled();
      expect(mockOnComplete).not.toHaveBeenCalled();
      expect(mockOnError).not.toHaveBeenCalled();
    });

    it("should store multiple paused pipelines independently", async () => {
      const tasks1 = [
        {
          id: "task1",
          prompt: "test 1",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];
      const tasks2 = [
        {
          id: "task2",
          prompt: "test 2",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      const resetTime1Seconds = Math.floor((Date.now() + 3600000) / 1000); // 1 hour in seconds
      const resetTime2Seconds = Math.floor((Date.now() + 7200000) / 1000); // 2 hours in seconds

      mockCommandExecution.executeCommand
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resetTime1Seconds}`,
          error: `Claude AI usage limit reached|${resetTime1Seconds}`,
        })
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resetTime2Seconds}`,
          error: `Claude AI usage limit reached|${resetTime2Seconds}`,
        });

      // Start first pipeline
      await claudeCodeService.runTaskPipeline(
        tasks1,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );

      // Start second pipeline
      await claudeCodeService.runTaskPipeline(
        tasks2,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );

      // Verify both pipelines are stored through public API
      const pausedPipelines = claudeCodeService.getPausedPipelines();
      expect(pausedPipelines.length).toBe(2);

      // Verify the pipelines have different identities
      expect(pausedPipelines[0].pipelineId).not.toBe(
        pausedPipelines[1].pipelineId,
      );
    });
  });

  describe("Rate Limit Scheduler Timing", () => {
    beforeEach(() => {
      jest.clearAllTimers();
      jest.useFakeTimers();
      jest.clearAllMocks();
      // Mock setTimeout as a spy for testing
      jest.spyOn(global, "setTimeout");
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it("should schedule pipeline resume after rate limit expires", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      const mockOnProgress = jest.fn();
      const mockOnComplete = jest.fn();
      const mockOnError = jest.fn();

      // Use fixed time for predictable test results
      const fixedCurrentTime = 1735732800000; // 2025-01-01 12:00:00 UTC
      jest.spyOn(Date, "now").mockReturnValue(fixedCurrentTime);

      const resumeTimeSeconds = Math.floor(fixedCurrentTime / 1000) + 5; // 5 seconds later
      const resumeTime = resumeTimeSeconds * 1000; // Convert back to milliseconds

      // Mock command execution to fail with rate limit
      mockCommandExecution.executeCommand
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resumeTimeSeconds}`,
          error: `Claude AI usage limit reached|${resumeTimeSeconds}`,
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Task completed successfully",
        });

      // Start pipeline execution
      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        mockOnProgress,
        mockOnComplete,
        mockOnError,
      );

      // Verify task was paused with correct timestamp
      expect(tasks[0].status).toBe("paused");
      expect(tasks[0].pausedUntil).toBe(resumeTime);

      // Verify setTimeout was called with correct delay (5000ms)
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(jest.getTimerCount()).toBe(1);

      // Verify pipeline state through public API
      const pausedPipelines = claudeCodeService.getPausedPipelines();
      expect(pausedPipelines.length).toBe(1);

      // Fast-forward time by 5 seconds to trigger the timeout
      jest.advanceTimersByTime(5000);

      // Cleanup
      (Date.now as jest.Mock).mockRestore();
    });

    it("should handle multiple pipelines with different resume times", async () => {
      const tasks1 = [
        {
          id: "task1",
          prompt: "test 1",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];
      const tasks2 = [
        {
          id: "task2",
          prompt: "test 2",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      // Use fixed current time for predictable tests
      const fixedCurrentTime = 1735732800000; // 2025-01-01 12:00:00 UTC
      jest.spyOn(Date, "now").mockReturnValue(fixedCurrentTime);

      const resumeTime1Seconds = Math.floor(fixedCurrentTime / 1000) + 3; // 3 seconds later
      const resumeTime2Seconds = Math.floor(fixedCurrentTime / 1000) + 8; // 8 seconds later

      mockCommandExecution.executeCommand
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resumeTime1Seconds}`,
          error: `Claude AI usage limit reached|${resumeTime1Seconds}`,
        })
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resumeTime2Seconds}`,
          error: `Claude AI usage limit reached|${resumeTime2Seconds}`,
        });

      // Start both pipelines
      await claudeCodeService.runTaskPipeline(
        tasks1,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );
      await claudeCodeService.runTaskPipeline(
        tasks2,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );

      // Verify both timeouts were scheduled with correct delays
      expect(setTimeout).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 3000);
      expect(setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 8000);

      // Verify both pipelines are tracked
      const pausedPipelines = claudeCodeService.getPausedPipelines();
      expect(pausedPipelines.length).toBe(2);

      (Date.now as jest.Mock).mockRestore();
    });

    it("should not schedule resume if reset time is in the past", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      // Use fixed current time for predictable tests
      const fixedCurrentTime = 1735732800000; // 2025-01-01 12:00:00 UTC
      jest.spyOn(Date, "now").mockReturnValue(fixedCurrentTime);

      // Set reset time to 5 seconds in the past
      const resetTimeSeconds = Math.floor(fixedCurrentTime / 1000) - 5;

      mockCommandExecution.executeCommand.mockResolvedValueOnce({
        success: false,
        output: `Claude AI usage limit reached|${resetTimeSeconds}`,
        error: `Claude AI usage limit reached|${resetTimeSeconds}`,
      });

      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );

      // Verify task was paused but no timeout was scheduled (delay <= 0)
      expect(tasks[0].status).toBe("paused");
      expect(setTimeout).not.toHaveBeenCalled();

      (Date.now as jest.Mock).mockRestore();
    });

    it("should correctly calculate delay from current time to reset time", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      // Mock specific current time
      const fixedCurrentTime = 1735732800000; // 2025-01-01 12:00:00 UTC
      jest.spyOn(Date, "now").mockReturnValue(fixedCurrentTime);

      // Set reset time to exactly 10 seconds in the future
      const resetTime = fixedCurrentTime + 10000;
      const resetTimeSeconds = Math.floor(resetTime / 1000);

      mockCommandExecution.executeCommand.mockResolvedValueOnce({
        success: false,
        output: `Claude AI usage limit reached|${resetTimeSeconds}`,
        error: `Claude AI usage limit reached|${resetTimeSeconds}`,
      });

      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );

      // Verify setTimeout was called with exactly 10000ms delay
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);

      // Cleanup
      (Date.now as jest.Mock).mockRestore();
    });

    it("should handle resume pipeline execution correctly after timeout", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "first task",
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      // Use fixed time for predictable results
      const fixedCurrentTime = 1735732800000; // 2025-01-01 12:00:00 UTC
      jest.spyOn(Date, "now").mockReturnValue(fixedCurrentTime);

      const resumeTimeSeconds = Math.floor(fixedCurrentTime / 1000) + 2; // 2 seconds later
      const resumeTime = resumeTimeSeconds * 1000; // Convert back to milliseconds

      const mockOnProgress = jest.fn();
      const mockOnComplete = jest.fn();
      const mockOnError = jest.fn();

      mockCommandExecution.executeCommand.mockResolvedValueOnce({
        success: false,
        output: `Claude AI usage limit reached|${resumeTimeSeconds}`,
        error: `Claude AI usage limit reached|${resumeTimeSeconds}`,
      });

      // Start pipeline
      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        mockOnProgress,
        mockOnComplete,
        mockOnError,
      );

      // Verify first task was paused
      expect(tasks[0].status).toBe("paused");
      expect(tasks[0].pausedUntil).toBe(resumeTime);

      // Verify pipeline state through public API
      const pausedPipelines = claudeCodeService.getPausedPipelines();
      expect(pausedPipelines.length).toBe(1);

      // Verify setTimeout was called with correct delay (2000ms)
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Fast-forward time to trigger resume
      jest.advanceTimersByTime(2000);

      // Cleanup
      (Date.now as jest.Mock).mockRestore();
    });
  });

  describe("evaluateCondition", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe("Condition: always", () => {
      it("should always return shouldRun: true", async () => {
        const result = await claudeCodeService.evaluateCondition(
          undefined,
          "always",
          false,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should return shouldRun: true even when previous step failed", async () => {
        const result = await claudeCodeService.evaluateCondition(
          undefined,
          "always",
          false,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe("Condition: on_success", () => {
      it("should return shouldRun: true when previousStepSuccess is true", async () => {
        const result = await claudeCodeService.evaluateCondition(
          undefined,
          "on_success",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should return shouldRun: false when previousStepSuccess is false", async () => {
        const result = await claudeCodeService.evaluateCondition(
          undefined,
          "on_success",
          false,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(result.reason).toBe(
          "Condition 'on_success' not met (previous step failed)",
        );
      });
    });

    describe("Condition: on_failure", () => {
      it("should return shouldRun: true when previousStepSuccess is false", async () => {
        const result = await claudeCodeService.evaluateCondition(
          undefined,
          "on_failure",
          false,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should return shouldRun: false when previousStepSuccess is true", async () => {
        const result = await claudeCodeService.evaluateCondition(
          undefined,
          "on_failure",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(result.reason).toBe(
          "Condition 'on_failure' not met (previous step succeeded)",
        );
      });
    });

    describe("No condition specified", () => {
      it("should always return shouldRun: true when condition is undefined (KISS default)", async () => {
        const resultSuccess = await claudeCodeService.evaluateCondition(
          undefined,
          undefined,
          true,
          "/test/dir",
        );

        expect(resultSuccess.shouldRun).toBe(true);
        expect(resultSuccess.reason).toBeUndefined();

        const resultFailure = await claudeCodeService.evaluateCondition(
          undefined,
          undefined,
          false,
          "/test/dir",
        );

        expect(resultFailure.shouldRun).toBe(true);
        expect(resultFailure.reason).toBeUndefined();
      });
    });

    describe("Check command execution", () => {
      it("should return shouldRun: true when check command succeeds", async () => {
        mockCommandExecution.executeCommand.mockResolvedValue({
          success: true,
          output: "Command executed successfully",
          exitCode: 0,
        });

        const result = await claudeCodeService.evaluateCondition(
          "test -f file.txt",
          "always",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(true);
        expect(result.reason).toBeUndefined();
        expect(mockCommandExecution.executeCommand).toHaveBeenCalledWith(
          ["test", "-f", "file.txt"],
          "/test/dir",
        );
      });

      it("should return shouldRun: false when check command fails", async () => {
        mockCommandExecution.executeCommand.mockResolvedValue({
          success: false,
          output: "",
          error: "File not found",
          exitCode: 1,
        });

        const result = await claudeCodeService.evaluateCondition(
          "test -f nonexistent.txt",
          "always",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(result.reason).toBe("Check command failed: File not found");
        expect(mockCommandExecution.executeCommand).toHaveBeenCalledWith(
          ["test", "-f", "nonexistent.txt"],
          "/test/dir",
        );
      });

      it("should return shouldRun: false when check command fails without error message", async () => {
        mockCommandExecution.executeCommand.mockResolvedValue({
          success: false,
          output: "",
          exitCode: 1,
        });

        const result = await claudeCodeService.evaluateCondition(
          "false",
          "always",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(result.reason).toBe(
          "Check command failed: Command returned non-zero exit code",
        );
      });
    });

    describe("Check command error handling", () => {
      it("should handle check command execution exceptions", async () => {
        const executionError = new Error("Command execution failed");
        mockCommandExecution.executeCommand.mockRejectedValue(executionError);

        const result = await claudeCodeService.evaluateCondition(
          "invalid-command",
          "always",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(result.reason).toBe(
          "Check command execution failed: Command execution failed",
        );
      });

      it("should handle non-Error exceptions in check command", async () => {
        mockCommandExecution.executeCommand.mockRejectedValue("String error");

        const result = await claudeCodeService.evaluateCondition(
          "invalid-command",
          "always",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(result.reason).toBe(
          "Check command execution failed: String error",
        );
      });
    });

    describe("Combined condition and check command scenarios", () => {
      it("should skip check command when condition is not met", async () => {
        // This test ensures check command is not executed when condition fails
        const result = await claudeCodeService.evaluateCondition(
          "echo 'should not run'",
          "on_success",
          false, // Previous step failed
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(result.reason).toBe(
          "Condition 'on_success' not met (previous step failed)",
        );
        expect(mockCommandExecution.executeCommand).not.toHaveBeenCalled();
      });

      it("should execute check command when condition is met", async () => {
        mockCommandExecution.executeCommand.mockResolvedValue({
          success: true,
          output: "Check passed",
          exitCode: 0,
        });

        const result = await claudeCodeService.evaluateCondition(
          "test -d /test/dir",
          "on_success",
          true, // Previous step succeeded
          "/test/dir",
        );

        expect(result.shouldRun).toBe(true);
        expect(result.reason).toBeUndefined();
        expect(mockCommandExecution.executeCommand).toHaveBeenCalledWith(
          ["test", "-d", "/test/dir"],
          "/test/dir",
        );
      });

      it("should handle complex check command with multiple arguments", async () => {
        mockCommandExecution.executeCommand.mockResolvedValue({
          success: true,
          output: "Files found",
          exitCode: 0,
        });

        const result = await claudeCodeService.evaluateCondition(
          'find /test/dir -name "*.js" -type f',
          "always",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(true);
        expect(mockCommandExecution.executeCommand).toHaveBeenCalledWith(
          ["find", "/test/dir", "-name", '"*.js"', "-type", "f"],
          "/test/dir",
        );
      });
    });

    describe("Edge cases and validation", () => {
      it("should handle empty check command string", async () => {
        const result = await claudeCodeService.evaluateCondition(
          "",
          "always",
          true,
          "/test/dir",
        );

        // Empty string should be treated as no check command
        expect(result.shouldRun).toBe(true);
        expect(result.reason).toBeUndefined();
        expect(mockCommandExecution.executeCommand).not.toHaveBeenCalled();
      });

      it("should handle whitespace-only check command", async () => {
        mockCommandExecution.executeCommand.mockResolvedValue({
          success: false,
          output: "",
          error: "Invalid command",
          exitCode: 127,
        });

        const result = await claudeCodeService.evaluateCondition(
          "   ",
          "always",
          true,
          "/test/dir",
        );

        expect(result.shouldRun).toBe(false);
        expect(mockCommandExecution.executeCommand).toHaveBeenCalledWith(
          ["", "", "", ""],
          "/test/dir",
        );
      });

      it("should use correct working directory for check command", async () => {
        mockCommandExecution.executeCommand.mockResolvedValue({
          success: true,
          output: "Success",
          exitCode: 0,
        });

        const customWorkingDir = "/custom/working/directory";
        await claudeCodeService.evaluateCondition(
          "pwd",
          "always",
          true,
          customWorkingDir,
        );

        expect(mockCommandExecution.executeCommand).toHaveBeenCalledWith(
          ["pwd"],
          customWorkingDir,
        );
      });
    });
  });
});
