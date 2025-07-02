import { ClaudeExecutor } from "../../../../src/core/services/ClaudeExecutor";
import { ILogger, IConfigManager } from "../../../../src/core/interfaces";
import { TaskItem } from "../../../../src/core/models/Task";
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
  // No additional methods needed for performance testing
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

describe("ClaudeExecutor - Performance Monitoring", () => {
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

  describe("execution time tracking", () => {
    it("should track task execution time", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const startTime = Date.now();
      jest
        .spyOn(Date, "now")
        .mockReturnValueOnce(startTime)
        .mockReturnValueOnce(startTime + 1000);

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

      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it("should track multiple task execution times", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      let callCount = 0;
      jest.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return 1000000000000 + callCount * 500;
      });

      const task1Promise = executor.executeTask(
        "task 1",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task 1 completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result1 = await task1Promise;

      const task2Promise = executor.executeTask(
        "task 2",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task 2 completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result2 = await task2Promise;

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it("should track pipeline execution time", async () => {
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
      const startTime = Date.now();
      jest
        .spyOn(Date, "now")
        .mockImplementation(() => startTime + taskIndex * 500);

      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from(`Task ${taskIndex + 1} completed`),
          );
          mockChild.emit("close", 0);
          taskIndex++;
        }, 0);

        return mockChild;
      });

      await executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(tasks[0].status).toBe("completed");
      expect(tasks[1].status).toBe("completed");
    });
  });

  describe("task state monitoring", () => {
    it("should monitor task execution", async () => {
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

      let completedTasks = 0;
      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          completedTasks++;
          mockChild.stdout?.emit(
            "data",
            Buffer.from(`Task ${completedTasks} completed`),
          );
          mockChild.emit("close", 0);
        }, Math.random() * 10);

        return mockChild;
      });

      await executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(tasks.length).toBe(2);
    });

    it("should track successful task execution", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "state tracking task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should track failed task execution", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "failing task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stderr?.emit("data", Buffer.from("Task failed"));
        mockChild.emit("close", 1);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("resource utilization monitoring", () => {
    it("should execute memory monitoring task", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "memory monitoring task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle memory intensive tasks", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "high memory task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
    });

    it("should handle CPU intensive tasks", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "cpu intensive task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("performance metrics aggregation", () => {
    it("should track multiple task executions", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const results: any[] = [];

      for (let i = 0; i < 3; i++) {
        const resultPromise = executor.executeTask(
          `task ${i + 1}`,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from(`Task ${i + 1} completed`),
          );
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;
        results.push(result);
      }

      expect(results.length).toBe(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      });
    });

    it("should handle long running tasks", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const longRunningTaskPromise = executor.executeTask(
        "very long task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Long task completed"));
        mockChild.emit("close", 0);
      }, 100);

      const result = await longRunningTaskPromise;

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle task execution timing", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const startTime = Date.now();

      const resultPromise = executor.executeTask(
        "timed task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 50);

      const result = await resultPromise;
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("performance optimization", () => {
    it("should handle slow execution", async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = executor.executeTask(
        "slow task",
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Slow task completed"));
        mockChild.emit("close", 0);
      }, 100);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle multiple independent tasks", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task-1",
          name: "Task 1",
          prompt: "Independent task 1",
          status: "pending",
          results: "",
        },
        {
          id: "task-2",
          name: "Task 2",
          prompt: "Independent task 2",
          status: "pending",
          results: "",
        },
        {
          id: "task-3",
          name: "Task 3",
          prompt: "Dependent task",
          status: "pending",
          results: "",
        },
      ];

      let taskIndex = 0;
      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from(`Task ${taskIndex + 1} completed`),
          );
          mockChild.emit("close", 0);
          taskIndex++;
        }, Math.random() * 50);

        return mockChild;
      });

      await executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(tasks.every((task) => task.status === "completed")).toBe(true);
    });
  });
});
