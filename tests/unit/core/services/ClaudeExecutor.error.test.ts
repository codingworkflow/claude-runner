import { ClaudeExecutor } from "../../../../src/core/services/ClaudeExecutor";
import { ILogger, IConfigManager } from "../../../../src/core/interfaces";
import { TaskItem } from "../../../../src/core/models/Task";
import { ChildProcess } from "child_process";
import { Writable, Readable } from "stream";
// Removed unused import StandardErrorScenarios

class MockLogger implements ILogger {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  debug = jest.fn();
}

class MockConfigManager implements IConfigManager {
  addSource = jest.fn();
  get = jest.fn();
  set = jest.fn();
  validateModel = jest.fn();
  validatePath = jest.fn();
}

class TestableClaudeExecutor extends ClaudeExecutor {
  // No additional methods needed for error testing
}

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

function createMockChildProcess(): ChildProcess {
  const mockStdin = new Writable({
    write: jest.fn(),
  });

  const mockStdout = new Readable({
    read: jest.fn(),
  });

  const mockStderr = new Readable({
    read: jest.fn(),
  });

  const events: { [key: string]: Array<(...args: unknown[]) => void> } = {};

  const mockChild = {
    stdin: mockStdin,
    stdout: mockStdout,
    stderr: mockStderr,
    killed: false,
    connected: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: "",
    pid: 12345,
    channel: undefined,
    disconnect: jest.fn(),
    kill: jest.fn(),
    ref: jest.fn(),
    unref: jest.fn(),
    send: jest.fn(),
    on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!events[event]) {
        events[event] = [];
      }
      events[event].push(callback);
      return mockChild;
    }),
    addListener: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    setMaxListeners: jest.fn(),
    getMaxListeners: jest.fn(),
    listeners: jest.fn(),
    rawListeners: jest.fn(),
    emit: jest.fn((event: string, ...args: unknown[]) => {
      if (events[event]) {
        events[event].forEach((callback) => callback(...args));
      }
      return false;
    }),
    listenerCount: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    eventNames: jest.fn(),
  };

  mockStdout.on = jest.fn(
    (event: string, callback: (...args: unknown[]) => void) => {
      if (!events[`stdout_${event}`]) {
        events[`stdout_${event}`] = [];
      }
      events[`stdout_${event}`].push(callback);
      return mockStdout;
    },
  );

  mockStderr.on = jest.fn(
    (event: string, callback: (...args: unknown[]) => void) => {
      if (!events[`stderr_${event}`]) {
        events[`stderr_${event}`] = [];
      }
      events[`stderr_${event}`].push(callback);
      return mockStderr;
    },
  );

  (
    mockStdout as unknown as {
      emit: (event: string, ...args: unknown[]) => void;
    }
  ).emit = (event: string, ...args: unknown[]) => {
    if (events[`stdout_${event}`]) {
      events[`stdout_${event}`].forEach((callback) => callback(...args));
    }
  };

  (
    mockStderr as unknown as {
      emit: (event: string, ...args: unknown[]) => void;
    }
  ).emit = (event: string, ...args: unknown[]) => {
    if (events[`stderr_${event}`]) {
      events[`stderr_${event}`].forEach((callback) => callback(...args));
    }
  };

  return mockChild as unknown as ChildProcess;
}

describe("ClaudeExecutor - Error Handling and Recovery", () => {
  let executor: TestableClaudeExecutor;
  let mockLogger: MockLogger;
  let mockConfig: MockConfigManager;
  let mockSpawn: jest.MockedFunction<typeof import("child_process").spawn>;

  beforeEach(() => {
    mockLogger = new MockLogger();
    mockConfig = new MockConfigManager();
    executor = new TestableClaudeExecutor(mockLogger, mockConfig);
    mockSpawn = jest.requireMock("child_process").spawn as jest.MockedFunction<
      typeof import("child_process").spawn
    >;

    mockConfig.validateModel.mockReturnValue(true);
    mockConfig.validatePath.mockReturnValue(true);

    jest.clearAllMocks();
  });

  describe("validation errors", () => {
    it("should handle invalid model validation", async () => {
      mockConfig.validateModel.mockReturnValue(false);

      const result = await executor.executeTask(
        "test task",
        "invalid-model",
        "/test",
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid model/i);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Task execution failed"),
        expect.any(Error),
      );
    });

    it("should handle invalid path validation", async () => {
      mockConfig.validatePath.mockReturnValue(false);

      const result = await executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/invalid/path",
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid.*directory/i);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Task execution failed"),
        expect.any(Error),
      );
    });

    it("should handle empty task description", async () => {
      const result = await executor.executeTask(
        "",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Cannot read properties|undefined|stdin/i);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Task execution failed"),
        expect.any(Error),
      );
    });
  });

  describe("command execution errors", () => {
    it("should handle spawn error", async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error("Failed to spawn process");
      });

      const result = await executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/spawn/i);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Task execution failed"),
        expect.any(Error),
      );
    });

    it("should handle process error event", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.emit("error", new Error("Process error"));
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Process error/i);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Task execution failed"),
        expect.any(Error),
      );
    });

    it("should handle stderr output as error", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stderr?.emit("data", Buffer.from("Command execution failed"));
        mockChild.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Command execution failed/i);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Task execution failed"),
        expect.any(Error),
      );
    });

    it("should handle non-zero exit code", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Some output"));
        mockChild.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Some output/i);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Task execution failed"),
        expect.any(Error),
      );
    });
  });

  describe("rate limit detection and recovery", () => {
    it("should handle rate limit error in output", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit(
          "data",
          Buffer.from("Claude AI usage limit reached|1234567890"),
        );
        mockChild.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Claude AI usage limit reached");
    });

    it("should handle rate limit response", async () => {
      const rateLimitOutput = "Claude AI usage limit reached|1234567890";

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from(rateLimitOutput));
        mockChild.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe(rateLimitOutput);
    });

    it("should handle retry timeout", async () => {
      const rateLimitOutput = "Claude AI usage limit reached|1234567890";

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from(rateLimitOutput));
        mockChild.emit("close", 1);
      }, 0);

      await expect(
        executor.executeTaskWithRetry(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          1, // Only 1 retry
        ),
      ).rejects.toThrow();
    });
  });

  describe("pipeline error handling", () => {
    it("should stop pipeline on task failure", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task-1",
          name: "Task 1",
          prompt: "First task",
          status: "pending",
          results: "",
        },
        {
          id: "task-2",
          name: "Task 2",
          prompt: "Second task",
          status: "pending",
          results: "",
        },
      ];

      let taskIndex = 0;
      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          if (taskIndex === 0) {
            mockChild.stderr?.emit("data", Buffer.from("First task failed"));
            mockChild.emit("close", 1);
          }
          taskIndex++;
        }, 0);

        return mockChild;
      });

      await executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      // Pipeline should handle the error gracefully
      expect(tasks[0].status).toMatch(/error|failed/);
      expect(tasks[1].status).toBe("pending");
    });

    it("should handle task interruption", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task-1",
          name: "Long Task",
          prompt: "Task that takes time",
          status: "pending",
          results: "",
        },
      ];

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const pipelinePromise = executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        executor.cancelCurrentTask();
        mockChild.emit("close", 1, "SIGTERM");
      }, 5);

      await pipelinePromise;
    });

    it("should handle multiple task failures", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task-1",
          name: "Task 1",
          prompt: "First task",
          status: "pending",
          results: "",
        },
        {
          id: "task-2",
          name: "Task 2",
          prompt: "Second task",
          status: "pending",
          results: "",
        },
      ];

      let taskIndex = 0;
      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          if (taskIndex === 0) {
            mockChild.stderr?.emit("data", Buffer.from("Task failed"));
            mockChild.emit("close", 1);
          } else {
            mockChild.stdout?.emit("data", Buffer.from("Success"));
            mockChild.emit("close", 0);
          }
          taskIndex++;
        }, 0);

        return mockChild;
      });

      await executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(tasks[0].status).toMatch(/error|failed/);
    });
  });

  describe("JSON parsing errors", () => {
    it("should handle malformed JSON output", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        { outputFormat: "json" },
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("{ invalid json }"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      // The executor still returns success but with the raw output
      expect(result.success).toBe(true);
      expect(result.output).toBe("{ invalid json }");
    });

    it("should handle empty JSON output", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        { outputFormat: "json" },
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from(""));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      // The executor handles empty output gracefully
      expect(result.success).toBe(true);
      expect(result.output).toBe("");
    });
  });

  describe("resource and memory errors", () => {
    it("should handle out of memory errors", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "memory intensive task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stderr?.emit(
          "data",
          Buffer.from("JavaScript heap out of memory"),
        );
        mockChild.emit("close", 134);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("JavaScript heap out of memory");
    });

    it("should handle process termination", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "terminating task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.kill = jest.fn(() => {
          mockChild.emit("close", 1, "SIGTERM");
          return true;
        });
        executor.cancelCurrentTask();
      }, 10);

      const result = await resultPromise;

      expect(result.success).toBe(false);
    });
  });
});
