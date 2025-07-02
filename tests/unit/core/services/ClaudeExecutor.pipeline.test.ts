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
  public testResumePipeline(
    tasks: TaskItem[],
    model: string,
    cwd: string,
  ): Promise<void> {
    return this.resumePipeline(tasks, model, cwd);
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

describe("ClaudeExecutor - Pipeline Orchestration", () => {
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

  describe("executePipeline", () => {
    it("should execute simple pipeline successfully", async () => {
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
      expect(tasks[0].results).toBe("Task 1 completed");
      expect(tasks[1].results).toBe("Task 2 completed");
    });

    it("should handle pipeline failure and stop execution", async () => {
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
            mockChild.stderr?.emit("data", Buffer.from("Task 1 failed"));
            mockChild.emit("close", 1);
          } else {
            mockChild.stdout?.emit("data", Buffer.from("Task 2 completed"));
            mockChild.emit("close", 0);
          }
          taskIndex++;
        }, 0);

        return mockChild;
      });

      let errorCalled = false;

      await executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
        {},
        undefined,
        undefined,
        (_error) => {
          errorCalled = true;
        },
      );

      expect(errorCalled).toBe(true);
      expect(tasks[0].status).toBe("error");
      expect(tasks[1].status).toBe("pending");
    });

    it("should handle pipeline with parallel tasks", async () => {
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
        {
          id: "task-3",
          name: "Task 3",
          prompt: "Third task",
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

      expect(tasks[0].status).toBe("completed");
      expect(tasks[1].status).toBe("completed");
      expect(tasks[2].status).toBe("completed");
    });
  });

  describe("resumePipeline", () => {
    it("should resume from first pending task", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task-1",
          name: "Task 1",
          prompt: "Completed task",
          status: "completed",
          results: "Already done",
        },
        {
          id: "task-2",
          name: "Task 2",
          prompt: "Pending task",
          status: "pending",
          results: "",
        },
        {
          id: "task-3",
          name: "Task 3",
          prompt: "Another pending task",
          status: "pending",
          results: "",
        },
      ];

      let taskIndex = 0;
      mockSpawn.mockImplementation(() => {
        const mockChild = createMockChildProcess();

        setTimeout(() => {
          taskIndex++;
          mockChild.stdout?.emit(
            "data",
            Buffer.from(`Resumed task ${taskIndex + 1} completed`),
          );
          mockChild.emit("close", 0);
        }, 0);

        return mockChild;
      });

      await executor.testResumePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(tasks[0].status).toBe("completed");
      expect(tasks[0].results).toBe("Already done");
      expect(tasks[1].status).toBe("completed");
      expect(tasks[2].status).toBe("completed");
      expect(tasks[1].results).toBe("Resumed task 2 completed");
    });

    it("should handle empty pipeline", async () => {
      const tasks: TaskItem[] = [];

      await expect(
        executor.testResumePipeline(tasks, "claude-3-5-sonnet-latest", "/test"),
      ).resolves.not.toThrow();
    });

    it("should handle all completed tasks", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task-1",
          name: "Task 1",
          prompt: "Completed task",
          status: "completed",
          results: "Done",
        },
        {
          id: "task-2",
          name: "Task 2",
          prompt: "Another completed task",
          status: "completed",
          results: "Also done",
        },
      ];

      await executor.testResumePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe("task cancellation", () => {
    it("should handle task cancellation during execution", async () => {
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

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      let errorCalled = false;

      const pipelinePromise = executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
        {},
        undefined,
        undefined,
        () => {
          errorCalled = true;
        },
      );

      setTimeout(() => {
        executor.cancelCurrentTask();
        mockChild.emit("close", 1, "SIGTERM");
      }, 5);

      await pipelinePromise;
      expect(errorCalled).toBe(true);
    });
  });

  describe("pipeline state management", () => {
    it("should track task execution state", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task-1",
          name: "Task 1",
          prompt: "Test task",
          status: "pending",
          results: "",
        },
      ];

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      expect(executor.isTaskRunning()).toBe(false);

      const pipelinePromise = executor.executePipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      await pipelinePromise;

      expect(executor.isTaskRunning()).toBe(false);
    });

    it("should handle basic pipeline execution", async () => {
      const tasks1: TaskItem[] = [
        {
          id: "task-1",
          name: "Task 1",
          prompt: "First pipeline task",
          status: "pending",
          results: "",
        },
      ];

      const tasks2: TaskItem[] = [
        {
          id: "task-2",
          name: "Task 2",
          prompt: "Second pipeline task",
          status: "pending",
          results: "",
        },
      ];

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      await executor.executePipeline(
        tasks1,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(tasks1[0].status).toBe("completed");

      setTimeout(() => {
        mockChild.stdout?.emit("data", Buffer.from("Task completed"));
        mockChild.emit("close", 0);
      }, 0);

      await executor.executePipeline(
        tasks2,
        "claude-3-5-sonnet-latest",
        "/test",
      );

      expect(tasks2[0].status).toBe("completed");
    });
  });
});
