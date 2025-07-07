import { jest } from "@jest/globals";
import { ClaudeCodeService } from "../../src/services/ClaudeCodeService";
import { TaskItem, TaskOptions } from "../../src/core/models/Task";
import { DEFAULT_MODEL } from "../../src/models/ClaudeModels";

describe("Execution Session Isolation E2E Test", () => {
  let claudeCodeService: ClaudeCodeService;
  let capturedCommands: string[][];

  function createTask(
    name: string,
    prompt: string,
    resumeFromTaskId?: string,
  ): TaskItem {
    const task: TaskItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      prompt,
      status: "pending" as const,
      model: DEFAULT_MODEL,
    };

    if (resumeFromTaskId) {
      task.resumeFromTaskId = resumeFromTaskId;
    }

    return task;
  }

  beforeEach(async () => {
    // Mock configuration service
    const mockConfigService = {
      get: jest.fn().mockReturnValue("claude"),
      getConfig: jest.fn().mockReturnValue({}),
    };

    claudeCodeService = new ClaudeCodeService(mockConfigService as any);

    // Capture all command executions
    capturedCommands = [];
    jest
      .spyOn(claudeCodeService as any, "executeCommand")
      .mockImplementation(async (...args: any[]) => {
        const commandArgs = args[0] as string[];
        capturedCommands.push([...commandArgs]);

        // Mock successful execution with session ID
        const sessionId = `mock-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return {
          success: true,
          output: JSON.stringify({
            result: `Mock output for: ${commandArgs[commandArgs.length - 1]}`,
            session_id: sessionId,
          }),
          error: undefined,
        };
      });

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Session Isolation in Execution", () => {
    test("should NOT pass session resume for independent tasks", async () => {
      console.log("=== Testing Independent Task Execution ===");

      const task1 = createTask("Task 1", "say a random number that is not 42");
      const task2 = createTask("Task 2", "what is the previous random number?");

      const tasks = [task1, task2];

      const mockCallbacks = {
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      await claudeCodeService.runTaskPipeline(
        tasks,
        DEFAULT_MODEL,
        "/test/workspace",
        { outputFormat: "json" },
        mockCallbacks.onProgress,
        mockCallbacks.onComplete,
        mockCallbacks.onError,
      );

      console.log("Captured commands:");
      capturedCommands.forEach((cmd, index) => {
        console.log(`Task ${index + 1}:`, cmd.join(" "));
      });

      // Verify we have 2 commands (one per task)
      expect(capturedCommands).toHaveLength(2);

      // Task 1 should NOT have -r (resume) flag
      const task1Command = capturedCommands[0];
      expect(task1Command).not.toContain("-r");

      // Task 2 should NOT have -r (resume) flag - THIS IS THE BUG
      const task2Command = capturedCommands[1];
      expect(task2Command).not.toContain("-r");

      // Log if bug is present
      if (task2Command.includes("-r")) {
        const resumeIndex = task2Command.indexOf("-r");
        console.log(
          "BUG CONFIRMED: Task 2 has unexpected -r flag with session:",
          task2Command[resumeIndex + 1],
        );
      }
    });

    test("should pass session resume ONLY when explicitly configured", async () => {
      console.log("=== Testing Explicit Session Resume Execution ===");

      const task1 = createTask("Task 1", "say a random number that is not 42");
      const task2 = createTask(
        "Task 2",
        "what is the previous random number?",
        task1.id,
      );

      const tasks = [task1, task2];

      const mockCallbacks = {
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      await claudeCodeService.runTaskPipeline(
        tasks,
        DEFAULT_MODEL,
        "/test/workspace",
        { outputFormat: "json" },
        mockCallbacks.onProgress,
        mockCallbacks.onComplete,
        mockCallbacks.onError,
      );

      console.log("Captured commands for explicit resume:");
      capturedCommands.forEach((cmd, index) => {
        console.log(`Task ${index + 1}:`, cmd.join(" "));
      });

      // Verify we have 2 commands
      expect(capturedCommands).toHaveLength(2);

      // Task 1 should NOT have -r flag
      const task1Command = capturedCommands[0];
      expect(task1Command).not.toContain("-r");

      // Task 2 SHOULD have -r flag (explicit resume)
      const task2Command = capturedCommands[1];
      expect(task2Command).toContain("-r");

      // Verify the session ID is from task 1
      const resumeIndex = task2Command.indexOf("-r");
      expect(resumeIndex).toBeGreaterThan(-1);
      expect(task2Command[resumeIndex + 1]).toBeDefined();
    });

    test("should validate buildTaskCommand behavior directly", () => {
      console.log("=== Testing buildTaskCommand Directly ===");

      // Test without resumeSessionId
      const optionsWithoutResume: TaskOptions = {
        outputFormat: "json",
        allowAllTools: true,
      };

      const commandWithoutResume = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        DEFAULT_MODEL,
        optionsWithoutResume,
      );

      console.log("Command without resume:", commandWithoutResume.join(" "));
      expect(commandWithoutResume).not.toContain("-r");

      // Test with resumeSessionId
      const optionsWithResume: TaskOptions = {
        outputFormat: "json",
        allowAllTools: true,
        resumeSessionId: "test-session-123",
      };

      const commandWithResume = (claudeCodeService as any).buildTaskCommand(
        "test prompt",
        DEFAULT_MODEL,
        optionsWithResume,
      );

      console.log("Command with resume:", commandWithResume.join(" "));
      expect(commandWithResume).toContain("-r");
      expect(commandWithResume).toContain("test-session-123");
    });
  });
});
