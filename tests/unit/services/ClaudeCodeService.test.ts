import { jest, describe, it, beforeEach, expect } from "@jest/globals";
import {
  ClaudeCodeService,
  CommandResult,
} from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";

// Interface for accessing private methods in tests
interface ClaudeCodeServicePrivates {
  executeTaskCommand: (
    task: string,
    model: string,
    rootPath: string,
    options: import("../../../src/services/ClaudeCodeService").TaskOptions,
  ) => Promise<CommandResult>;
  buildTaskCommand: (
    task: string,
    model: string,
    options: import("../../../src/services/ClaudeCodeService").TaskOptions,
  ) => string[];
  executeCommand: (args: string[], cwd: string) => Promise<CommandResult>;
  detectRateLimit: (output: string) => {
    isRateLimited: boolean;
    resetTime?: number;
  };
  resumePipeline: (pipelineId: string) => Promise<void>;
  currentPipelineExecution: {
    tasks: import("../../../src/services/ClaudeCodeService").TaskItem[];
    currentIndex: number;
    onProgress: (
      tasks: import("../../../src/services/ClaudeCodeService").TaskItem[],
      currentIndex: number,
    ) => void;
    onComplete: (
      tasks: import("../../../src/services/ClaudeCodeService").TaskItem[],
    ) => void;
    onError: (
      error: string,
      tasks: import("../../../src/services/ClaudeCodeService").TaskItem[],
    ) => void;
  } | null;
  pausedPipelines: Map<
    string,
    {
      tasks: import("../../../src/services/ClaudeCodeService").TaskItem[];
      currentIndex: number;
      resetTime: number;
      workflowPath?: string;
      onProgress: (
        tasks: import("../../../src/services/ClaudeCodeService").TaskItem[],
        currentIndex: number,
      ) => void;
      onComplete: (
        tasks: import("../../../src/services/ClaudeCodeService").TaskItem[],
      ) => void;
      onError: (
        error: string,
        tasks: import("../../../src/services/ClaudeCodeService").TaskItem[],
      ) => void;
    }
  >;
  extractResultFromJson: (output: string) => string;
}

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
      const extractedResult = (
        claudeCodeService as unknown as {
          extractResultFromJson: (output: string) => string;
        }
      ).extractResultFromJson(mockJsonOutput);
      expect(extractedResult).toBe("This is the extracted result");
    });

    it("should handle malformed JSON gracefully", () => {
      // Suppress console.warn for this test
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const malformedJson = '{"result": incomplete json';

      const extractedResult = (
        claudeCodeService as unknown as {
          extractResultFromJson: (output: string) => string;
        }
      ).extractResultFromJson(malformedJson);
      expect(extractedResult).toBe(malformedJson); // Should return original if parsing fails

      consoleSpy.mockRestore();
    });

    it("should handle JSON without result field", () => {
      const jsonWithoutResult =
        '{"metadata": {"tokens": 100}, "other": "data"}';

      const extractedResult = (
        claudeCodeService as unknown as {
          extractResultFromJson: (output: string) => string;
        }
      ).extractResultFromJson(jsonWithoutResult);
      // Should return formatted JSON since no result field exists
      expect(extractedResult).toEqual(expect.stringContaining('"metadata"'));
      expect(extractedResult).toEqual(expect.stringContaining('"other"'));
    });
  });

  describe("Command Building", () => {
    it("should build basic task command correctly", () => {
      const args = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).buildTaskCommand("test prompt", "claude-sonnet-4-20250514", {});

      expect(args).toContain("claude");
      expect(args).toContain("-p");
      expect(args).toContain("--model");
      expect(args).toContain("claude-sonnet-4-20250514");
      // The prompt is escaped and wrapped in quotes
      expect(args.some((arg) => arg.includes("test prompt"))).toBe(true);
    });

    it("should include output format in command", () => {
      const args = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).buildTaskCommand("test prompt", "claude-sonnet-4-20250514", {
        outputFormat: "json",
      });

      expect(args).toContain("--output-format");
      expect(args).toContain("json");
    });

    it("should include max turns in command", () => {
      const args = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).buildTaskCommand("test prompt", "claude-sonnet-4-20250514", {
        maxTurns: 5,
      });

      expect(args).toContain("--max-turns");
      expect(args).toContain("5");
    });

    it("should include allow all tools flag when specified", () => {
      const args = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).buildTaskCommand("test prompt", "claude-sonnet-4-20250514", {
        allowAllTools: true,
      });

      expect(args).toContain("--dangerously-skip-permissions");
    });

    it("should include session resume when specified", () => {
      const args = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).buildTaskCommand("test prompt", "claude-sonnet-4-20250514", {
        resumeSessionId: "session123",
      });

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
          status: "pending" as const,
        },
      ];

      expect(
        (claudeCodeService as unknown as ClaudeCodeServicePrivates)
          .currentPipelineExecution,
      ).toBeNull();

      // Set up pipeline (would normally be done by runTaskPipeline)
      (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).currentPipelineExecution = {
        tasks,
        currentIndex: 0,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      const execution = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).currentPipelineExecution;
      expect(execution).not.toBeNull();
      if (execution) {
        expect(execution.tasks).toEqual(tasks);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle command execution failures gracefully", () => {
      // Mock executeCommand to return failure
      jest
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeCommand",
        )
        .mockResolvedValue({
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

      const result = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).detectRateLimit(rateLimitMessage);

      expect(result.isRateLimited).toBe(true);
      expect(result.resetTime).toBe(1750928400000); // Converted to milliseconds
    });

    it("should detect rate limit message in mixed output", () => {
      const mixedOutput = `Error occurred while processing request.
Claude AI usage limit reached|1750928400
Please try again later.`;

      const result = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).detectRateLimit(mixedOutput);

      expect(result.isRateLimited).toBe(true);
      expect(result.resetTime).toBe(1750928400000);
    });

    it("should not detect rate limit in normal error messages", () => {
      const normalError = "Command execution failed with exit code 1";

      const result = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).detectRateLimit(normalError);

      expect(result.isRateLimited).toBe(false);
      expect(result.resetTime).toBeUndefined();
    });

    it("should not detect rate limit in empty string", () => {
      const result = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).detectRateLimit("");

      expect(result.isRateLimited).toBe(false);
      expect(result.resetTime).toBeUndefined();
    });

    it("should not detect rate limit with invalid timestamp format", () => {
      const invalidMessage = "Claude AI usage limit reached|invalid_timestamp";

      const result = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).detectRateLimit(invalidMessage);

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
        const result = (
          claudeCodeService as unknown as ClaudeCodeServicePrivates
        ).detectRateLimit(testCase);
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
          const result = (
            claudeCodeService as unknown as ClaudeCodeServicePrivates
          ).detectRateLimit(message);
          expect(result.isRateLimited).toBe(true);

          const resetTime = result.resetTime;
          if (!resetTime) {
            throw new Error("Expected resetTime to be defined in test");
          }
          const timeDiff = resetTime - currentTime;
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
      (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).pausedPipelines.clear();
      (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).currentPipelineExecution = null;
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

      // Mock executeTaskCommand to return rate limit error on first call
      const resetTimeSeconds = Math.floor((Date.now() + 3600000) / 1000); // 1 hour from now in seconds
      const resetTime = resetTimeSeconds * 1000; // Convert back to milliseconds for comparison
      const rateLimitError = `Claude AI usage limit reached|${resetTimeSeconds}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
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
      const pausedPipelines = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).pausedPipelines;
      expect(pausedPipelines.size).toBe(1);

      const storedState = Array.from(pausedPipelines.values())[0] as {
        tasks: import("../../../src/services/ClaudeCodeService").TaskItem[];
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

      jest
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
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
      const resetTime1 = resetTime1Seconds * 1000; // Convert to milliseconds
      const resetTime2 = resetTime2Seconds * 1000; // Convert to milliseconds

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
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
      const pausedPipelines = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).pausedPipelines;
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
      (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).pausedPipelines.clear();
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
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
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
      const resumePipelineSpy = jest
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "resumePipeline",
        )
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
      const pausedPipelines = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).pausedPipelines;
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

      jest
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
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

      const resumePipelineSpy = jest.spyOn(
        claudeCodeService as unknown as ClaudeCodeServicePrivates,
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
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resetTimeSeconds}`,
          error: `Claude AI usage limit reached|${resetTimeSeconds}`,
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumePipelineSpy = jest.spyOn(
        claudeCodeService as unknown as ClaudeCodeServicePrivates,
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
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
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
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "executeTaskCommand",
        )
        .mockResolvedValueOnce({
          success: false,
          output: `Claude AI usage limit reached|${resumeTimeSeconds}`,
          error: `Claude AI usage limit reached|${resumeTimeSeconds}`,
        });

      // Mock resumePipeline to track when it's called
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumePipelineSpy = jest
        .spyOn(
          claudeCodeService as unknown as ClaudeCodeServicePrivates,
          "resumePipeline",
        )
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
      const pausedPipelines = (
        claudeCodeService as unknown as ClaudeCodeServicePrivates
      ).pausedPipelines;
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

  describe("evaluateCondition", () => {
    let mockExecuteCommand: jest.MockedFunction<
      (args: string[], cwd: string) => Promise<CommandResult>
    >;

    beforeEach(() => {
      // Mock the executeCommand method
      mockExecuteCommand = jest.spyOn(
        claudeCodeService as unknown as ClaudeCodeServicePrivates,
        "executeCommand",
      ) as jest.MockedFunction<
        (args: string[], cwd: string) => Promise<CommandResult>
      >;
    });

    afterEach(() => {
      mockExecuteCommand.mockRestore();
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
        mockExecuteCommand.mockResolvedValue({
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
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          ["test", "-f", "file.txt"],
          "/test/dir",
        );
      });

      it("should return shouldRun: false when check command fails", async () => {
        mockExecuteCommand.mockResolvedValue({
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
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          ["test", "-f", "nonexistent.txt"],
          "/test/dir",
        );
      });

      it("should return shouldRun: false when check command fails without error message", async () => {
        mockExecuteCommand.mockResolvedValue({
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
        mockExecuteCommand.mockRejectedValue(executionError);

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
        mockExecuteCommand.mockRejectedValue("String error");

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
        expect(mockExecuteCommand).not.toHaveBeenCalled();
      });

      it("should execute check command when condition is met", async () => {
        mockExecuteCommand.mockResolvedValue({
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
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          ["test", "-d", "/test/dir"],
          "/test/dir",
        );
      });

      it("should handle complex check command with multiple arguments", async () => {
        mockExecuteCommand.mockResolvedValue({
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
        expect(mockExecuteCommand).toHaveBeenCalledWith(
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
        expect(mockExecuteCommand).not.toHaveBeenCalled();
      });

      it("should handle whitespace-only check command", async () => {
        mockExecuteCommand.mockResolvedValue({
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
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          ["", "", "", ""],
          "/test/dir",
        );
      });

      it("should use correct working directory for check command", async () => {
        mockExecuteCommand.mockResolvedValue({
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

        expect(mockExecuteCommand).toHaveBeenCalledWith(
          ["pwd"],
          customWorkingDir,
        );
      });
    });
  });
});
