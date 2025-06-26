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
    it("should extract result from JSON output format", () => {
      const mockJsonOutput =
        '{"result": "This is the extracted result", "metadata": {"tokens": 100}}';

      // Access private method via type assertion for testing
      const extractedResult = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (claudeCodeService as any).extractResultFromJson(mockJsonOutput);
      expect(extractedResult).toBe("This is the extracted result");
    });

    it("should handle malformed JSON gracefully", () => {
      // Suppress console.warn for this test
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const malformedJson = '{"result": incomplete json';

      const extractedResult = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (claudeCodeService as any).extractResultFromJson(malformedJson);
      expect(extractedResult).toBe(malformedJson); // Should return original if parsing fails

      consoleSpy.mockRestore();
    });

    it("should handle JSON without result field", () => {
      const jsonWithoutResult =
        '{"metadata": {"tokens": 100}, "other": "data"}';

      const extractedResult = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (claudeCodeService as any).extractResultFromJson(jsonWithoutResult);
      // Should return formatted JSON since no result field exists
      expect(extractedResult).toEqual(expect.stringContaining('"metadata"'));
      expect(extractedResult).toEqual(expect.stringContaining('"other"'));
    });
  });

  describe("Command Building", () => {
    it("should build basic task command correctly", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        { outputFormat: "json" },
      );

      expect(args).toContain("--output-format");
      expect(args).toContain("json");
    });

    it("should include max turns in command", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        { maxTurns: 5 },
      );

      expect(args).toContain("--max-turns");
      expect(args).toContain("5");
    });

    it("should include allow all tools flag when specified", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        "claude-sonnet-4-20250514",
        { allowAllTools: true },
      );

      expect(args).toContain("--dangerously-skip-permissions");
    });

    it("should include session resume when specified", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((claudeCodeService as any).currentPipelineExecution).toBeNull();

      // Set up pipeline (would normally be done by runTaskPipeline)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (claudeCodeService as any).currentPipelineExecution = {
        tasks,
        currentIndex: 0,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (claudeCodeService as any).currentPipelineExecution,
      ).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((claudeCodeService as any).currentPipelineExecution.tasks).toEqual(
        tasks,
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle command execution failures gracefully", () => {
      // Mock executeCommand to return failure
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  describe("Rate Limit Detection", () => {
    it("should detect rate limit message with timestamp", () => {
      const rateLimitMessage = "Claude AI usage limit reached|1750928400";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (claudeCodeService as any).detectRateLimit(
        rateLimitMessage,
      );

      expect(result.isRateLimited).toBe(true);
      expect(result.resetTime).toBe(1750928400000); // Converted to milliseconds
    });

    it("should detect rate limit message in mixed output", () => {
      const mixedOutput = `Error occurred while processing request.
Claude AI usage limit reached|1750928400
Please try again later.`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (claudeCodeService as any).detectRateLimit(mixedOutput);

      expect(result.isRateLimited).toBe(true);
      expect(result.resetTime).toBe(1750928400000);
    });

    it("should not detect rate limit in normal error messages", () => {
      const normalError = "Command execution failed with exit code 1";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (claudeCodeService as any).detectRateLimit(normalError);

      expect(result.isRateLimited).toBe(false);
      expect(result.resetTime).toBeUndefined();
    });

    it("should not detect rate limit in empty string", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (claudeCodeService as any).detectRateLimit("");

      expect(result.isRateLimited).toBe(false);
      expect(result.resetTime).toBeUndefined();
    });

    it("should not detect rate limit with invalid timestamp format", () => {
      const invalidMessage = "Claude AI usage limit reached|invalid_timestamp";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (claudeCodeService as any).detectRateLimit(invalidMessage);

      expect(result.isRateLimited).toBe(false);
      expect(result.resetTime).toBeUndefined();
    });

    it("should detect multiple rate limit patterns", () => {
      const testCases = [
        "Claude AI usage limit reached|1750928400",
        "Error: Claude AI usage limit reached|1750928500 - please wait",
        "Claude AI usage limit reached|1750928600\nAdditional info here",
      ];

      testCases.forEach((testCase, _index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (claudeCodeService as any).detectRateLimit(testCase);
        expect(result.isRateLimited).toBe(true);
        expect(result.resetTime).toBeGreaterThan(1750928000000);
      });
    });

    it("should correctly extract time until resume in hours and minutes", () => {
      // Test current time: 2025-01-01 12:00:00 UTC (1735732800000)
      const currentTime = 1735732800000;
      const oneHourLater = Math.floor((currentTime + 3600000) / 1000); // +1 hour
      const twoHoursLater = Math.floor((currentTime + 7200000) / 1000); // +2 hours
      const thirtyMinutesLater = Math.floor((currentTime + 1800000) / 1000); // +30 minutes

      // Mock Date.now to return fixed time
      const originalNow = Date.now;
      Date.now = jest.fn(() => currentTime);

      try {
        const testCases = [
          {
            message: `Claude AI usage limit reached|${oneHourLater}`,
            expectedHours: 1,
            expectedMinutes: 0,
          },
          {
            message: `Claude AI usage limit reached|${twoHoursLater}`,
            expectedHours: 2,
            expectedMinutes: 0,
          },
          {
            message: `Claude AI usage limit reached|${thirtyMinutesLater}`,
            expectedHours: 0,
            expectedMinutes: 30,
          },
        ];

        testCases.forEach(({ message, expectedHours, expectedMinutes }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = (claudeCodeService as any).detectRateLimit(message);
          expect(result.isRateLimited).toBe(true);

          const timeDiff = result.resetTime - currentTime;
          const hours = Math.floor(timeDiff / 3600000);
          const minutes = Math.floor((timeDiff % 3600000) / 60000);

          expect(hours).toBe(expectedHours);
          expect(minutes).toBe(expectedMinutes);
        });
      } finally {
        Date.now = originalNow;
      }
    });
  });

  describe("Pipeline Rate Limit Handling", () => {
    beforeEach(() => {
      // Reset any stored pipeline state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (claudeCodeService as any).pausedPipelines.clear();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (claudeCodeService as any).currentPipelineExecution = null;
    });

    it("should pause pipeline execution on rate limit detection", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task 1",
          resumePrevious: false,
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
        {
          id: "task2",
          prompt: "test task 2",
          resumePrevious: false,
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      const mockOnProgress = jest.fn();
      const mockOnComplete = jest.fn();
      const mockOnError = jest.fn();

      // Mock executeTaskCommand to return rate limit error on first call
      const resetTimeSeconds = Math.floor((Date.now() + 3600000) / 1000); // 1 hour from now in seconds
      const resetTime = resetTimeSeconds * 1000; // Convert back to milliseconds for comparison
      const rateLimitError = `Claude AI usage limit reached|${resetTimeSeconds}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
        .mockResolvedValueOnce({
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

      // Verify pipeline state was stored
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pausedPipelines = (claudeCodeService as any).pausedPipelines;
      expect(pausedPipelines.size).toBe(1);

      const storedState = Array.from(pausedPipelines.values())[0] as {
        tasks: typeof tasks;
        currentIndex: number;
        resetTime: number;
      };
      expect(storedState.tasks).toEqual(tasks);
      expect(storedState.currentIndex).toBe(0);
      expect(storedState.resetTime).toBe(resetTime);
    });

    it("should handle rate limit in catch block during pipeline execution", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task 1",
          resumePrevious: false,
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      const mockOnProgress = jest.fn();
      const mockOnComplete = jest.fn();
      const mockOnError = jest.fn();

      // Mock executeTaskCommand to throw rate limit error
      const resetTimeSeconds = Math.floor((Date.now() + 1800000) / 1000); // 30 minutes from now in seconds
      const resetTime = resetTimeSeconds * 1000; // Convert back to milliseconds for comparison
      const rateLimitError = `Claude AI usage limit reached|${resetTimeSeconds}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
        .mockRejectedValueOnce(new Error(rateLimitError));

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
          resumePrevious: false,
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];
      const tasks2 = [
        {
          id: "task2",
          prompt: "test 2",
          resumePrevious: false,
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];

      const resetTime1Seconds = Math.floor((Date.now() + 3600000) / 1000); // 1 hour in seconds
      const resetTime2Seconds = Math.floor((Date.now() + 7200000) / 1000); // 2 hours in seconds
      const resetTime1 = resetTime1Seconds * 1000; // Convert to milliseconds
      const resetTime2 = resetTime2Seconds * 1000; // Convert to milliseconds

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
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

      // Verify both pipelines are stored separately
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pausedPipelines = (claudeCodeService as any).pausedPipelines;
      expect(pausedPipelines.size).toBe(2);

      const storedStates = Array.from(pausedPipelines.values()) as {
        resetTime: number;
      }[];
      expect(storedStates.some((state) => state.resetTime === resetTime1)).toBe(
        true,
      );
      expect(storedStates.some((state) => state.resetTime === resetTime2)).toBe(
        true,
      );
    });
  });

  describe("Rate Limit Scheduler Timing", () => {
    beforeEach(() => {
      jest.clearAllTimers();
      jest.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (claudeCodeService as any).pausedPipelines.clear();
      // Mock setTimeout as a spy for testing
      jest.spyOn(global, "setTimeout");
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it("should resume pipeline after 5 seconds when rate limit expires", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task",
          resumePrevious: false,
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

      // Mock executeTaskCommand to fail with rate limit first, then succeed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resumeTimeSeconds}`,
          error: `Claude AI usage limit reached|${resumeTimeSeconds}`,
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Task completed successfully",
        });

      // Mock resumePipeline to track when it's called
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumePipelineSpy = jest
        .spyOn(claudeCodeService as any, "resumePipeline")
        .mockImplementation(() => Promise.resolve());

      // Start pipeline execution
      const pipelinePromise = claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/path",
        {},
        mockOnProgress,
        mockOnComplete,
        mockOnError,
      );

      // Wait for initial execution to complete (should pause due to rate limit)
      await pipelinePromise;

      // Verify task was paused with correct timestamp
      expect(tasks[0].status).toBe("paused");
      expect(tasks[0].pausedUntil).toBe(resumeTime);

      // Verify pipeline state was stored
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pausedPipelines = (claudeCodeService as any).pausedPipelines;
      expect(pausedPipelines.size).toBe(1);

      // Verify setTimeout was called with correct delay (5000ms)
      expect(jest.getTimerCount()).toBe(1);

      // Verify resumePipeline hasn't been called yet
      expect(resumePipelineSpy).not.toHaveBeenCalled();

      // Fast-forward time by 5 seconds to trigger the timeout
      jest.advanceTimersByTime(5000);

      // Verify resumePipeline was called
      expect(resumePipelineSpy).toHaveBeenCalledTimes(1);

      // Cleanup
      resumePipelineSpy.mockRestore();
      (Date.now as jest.Mock).mockRestore();
    });

    it("should handle multiple pipelines with different resume times", async () => {
      const tasks1 = [
        {
          id: "task1",
          prompt: "test 1",
          resumePrevious: false,
          status: "pending" as const,
          results: undefined,
          pausedUntil: undefined,
        },
      ];
      const tasks2 = [
        {
          id: "task2",
          prompt: "test 2",
          resumePrevious: false,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumePipelineSpy = jest.spyOn(
        claudeCodeService as any,
        "resumePipeline",
      );

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

      // Verify both timeouts were scheduled
      expect(setTimeout).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 3000);
      expect(setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 8000);

      // Fast-forward to 3 seconds - only first pipeline should resume
      jest.advanceTimersByTime(3000);
      expect(resumePipelineSpy).toHaveBeenCalledTimes(1);

      // Fast-forward to 8 seconds total - second pipeline should resume
      jest.advanceTimersByTime(5000);
      expect(resumePipelineSpy).toHaveBeenCalledTimes(2);

      resumePipelineSpy.mockRestore();
      (Date.now as jest.Mock).mockRestore();
    });

    it("should not schedule resume if reset time is in the past", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task",
          resumePrevious: false,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resetTimeSeconds}`,
          error: `Claude AI usage limit reached|${resetTimeSeconds}`,
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumePipelineSpy = jest.spyOn(
        claudeCodeService as any,
        "resumePipeline",
      );

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
      expect(resumePipelineSpy).not.toHaveBeenCalled();

      resumePipelineSpy.mockRestore();
      (Date.now as jest.Mock).mockRestore();
    });

    it("should correctly calculate delay from current time to reset time", async () => {
      const tasks = [
        {
          id: "task1",
          prompt: "test task",
          resumePrevious: false,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
        .mockResolvedValueOnce({
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
          resumePrevious: false,
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

      // Mock executeTaskCommand to fail with rate limit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(claudeCodeService as any, "executeTaskCommand")
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resumeTimeSeconds}`,
          error: `Claude AI usage limit reached|${resumeTimeSeconds}`,
        });

      // Mock resumePipeline to track when it's called
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumePipelineSpy = jest
        .spyOn(claudeCodeService as any, "resumePipeline")
        .mockImplementation(() => Promise.resolve());

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

      // Verify pipeline state was stored
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pausedPipelines = (claudeCodeService as any).pausedPipelines;
      expect(pausedPipelines.size).toBe(1);

      // Verify setTimeout was called with correct delay (2000ms)
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);

      // Fast-forward time to trigger resume
      jest.advanceTimersByTime(2000);

      // Verify resumePipeline was called
      expect(resumePipelineSpy).toHaveBeenCalledTimes(1);

      // Cleanup
      resumePipelineSpy.mockRestore();
      (Date.now as jest.Mock).mockRestore();
    });
  });
});
