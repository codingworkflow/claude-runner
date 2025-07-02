import { ClaudeExecutor } from "../../../../src/core/services/ClaudeExecutor";
import { ILogger, IConfigManager } from "../../../../src/core/interfaces";
import { TaskOptions } from "../../../../src/core/models/Task";
import { ChildProcess } from "child_process";
import { Writable, Readable } from "stream";

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
  public testFormatCommandPreview(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions,
  ): string {
    return this.formatCommandPreview(task, model, workingDirectory, options);
  }

  public async testValidateClaudeCommand(model: string): Promise<boolean> {
    return this.validateClaudeCommand(model);
  }
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

describe("ClaudeExecutor - Core Execution Engine", () => {
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

  describe("executeTaskWithRetry", () => {
    it("should succeed on first attempt", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTaskWithRetry(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Success"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.output).toBe("Success");
    });

    it("should retry on rate limit and eventually succeed", async () => {
      let attempt = 0;
      const rateLimitOutput = "Claude AI usage limit reached|1234567890";
      const successOutput = "Success after retry";

      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          if (attempt === 0) {
            mockChild.stdout?.emit("data", Buffer.from(rateLimitOutput));
            mockChild.emit("close", 1);
          } else {
            mockChild.stdout?.emit("data", Buffer.from(successOutput));
            mockChild.emit("close", 0);
          }
        }, 0);

        return mockChild;
      });

      jest.spyOn(Date, "now").mockImplementation(() => 1234567800000);

      const waitForRateLimitSpy = jest
        .spyOn(
          executor as unknown as { waitForRateLimit: () => Promise<void> },
          "waitForRateLimit",
        )
        .mockImplementation(async () => {
          attempt++;
          return Promise.resolve();
        });

      const result = await executor.executeTaskWithRetry(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        {},
        3,
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("Success after retry");
      expect(waitForRateLimitSpy).toHaveBeenCalled();

      waitForRateLimitSpy.mockRestore();
    });

    it("should fail after max retries", async () => {
      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Persistent error"));
          mockChild.emit("close", 1);
        }, 0);

        return mockChild;
      });

      await expect(
        executor.executeTaskWithRetry(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          2,
        ),
      ).rejects.toThrow("Persistent error");
    });
  });

  describe("executeTask", () => {
    it("should execute basic task successfully", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed");
      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "'test task'", "--model", "claude-3-5-sonnet-latest"],
        expect.objectContaining({
          cwd: "/test",
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    });

    it("should handle task with options", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const options: TaskOptions = {
        outputFormat: "json",
      };

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task with options"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task with options");
      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        [
          "-p",
          "'test task'",
          "--model",
          "claude-3-5-sonnet-latest",
          "--output-format",
          "json",
        ],
        expect.objectContaining({
          cwd: "/test",
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    });

    it("should handle command execution failure", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "failing task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stderr?.emit("data", Buffer.from("Command failed"));
        mockChild.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Command failed");
    });
  });

  describe("validateClaudeCommand", () => {
    it("should pass validation with valid model", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const validationPromise = executor.testValidateClaudeCommand(
        "claude-3-5-sonnet-latest",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("success"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await validationPromise;
      expect(result).toBe(true);
    });

    it("should fail validation for invalid model", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const validationPromise =
        executor.testValidateClaudeCommand("invalid-model");

      setTimeout(() => {
        mockChild.stderr?.emit("data", Buffer.from("error"));
        mockChild.emit("close", 1);
      }, 0);

      const result = await validationPromise;
      expect(result).toBe(false);
    });
  });

  describe("formatCommandPreview", () => {
    it("should format simple command", () => {
      const preview = executor.testFormatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        {},
      );

      expect(preview).toContain('cd "/test"');
      expect(preview).toContain("claude");
    });

    it("should format command with options", () => {
      const preview = executor.testFormatCommandPreview(
        "test with spaces",
        "claude-3-5-sonnet-latest",
        "/test",
        { outputFormat: "json" },
      );

      expect(preview).toContain('cd "/test"');
      expect(preview).toContain("claude");
    });

    it("should handle empty working directory", () => {
      const preview = executor.testFormatCommandPreview(
        "test",
        "claude-3-5-sonnet-latest",
        "",
        {},
      );

      expect(preview).toContain("claude");
    });
  });

  describe("task execution flow", () => {
    it("should track execution state correctly", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      expect(executor.isTaskRunning()).toBe(false);

      const resultPromise = executor.executeTask(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed");
      expect(executor.isTaskRunning()).toBe(false);
    });

    it("should handle task cancellation", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "long running task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        executor.cancelCurrentTask();
        mockChild.emit("close", 1, "SIGTERM");
      }, 5);

      const result = await resultPromise;

      expect(result.success).toBe(false);
    });
  });
});
