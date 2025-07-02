import {
  TaskItem,
  TaskOptions,
  TaskResult,
  CommandResult,
  ExecutionOptions,
  WorkflowOptions,
  WorkflowResult,
  ConditionType,
} from "../../../../src/core/models/Task";

describe("Task Model", () => {
  describe("TaskItem validation and operations", () => {
    it("should create a valid TaskItem with required fields", () => {
      const task: TaskItem = {
        id: "task-1",
        prompt: "Test prompt",
        status: "pending",
      };

      expect(task.id).toBe("task-1");
      expect(task.prompt).toBe("Test prompt");
      expect(task.status).toBe("pending");
    });

    it("should create a TaskItem with all optional fields", () => {
      const task: TaskItem = {
        id: "task-1",
        name: "Test Task",
        prompt: "Test prompt",
        resumeFromTaskId: "prev-task",
        status: "running",
        results: "Task results",
        sessionId: "session-123",
        model: "claude-3-sonnet",
        dependsOn: ["task-0"],
        continueFrom: "checkpoint-1",
        pausedUntil: 1640995200000,
        check: "test command",
        condition: "on_success",
        skipReason: "Dependency failed",
      };

      expect(task.name).toBe("Test Task");
      expect(task.resumeFromTaskId).toBe("prev-task");
      expect(task.results).toBe("Task results");
      expect(task.sessionId).toBe("session-123");
      expect(task.model).toBe("claude-3-sonnet");
      expect(task.dependsOn).toEqual(["task-0"]);
      expect(task.continueFrom).toBe("checkpoint-1");
      expect(task.pausedUntil).toBe(1640995200000);
      expect(task.check).toBe("test command");
      expect(task.condition).toBe("on_success");
      expect(task.skipReason).toBe("Dependency failed");
    });
  });

  describe("Task state management and transitions", () => {
    it("should support all valid task statuses", () => {
      const validStatuses: TaskItem["status"][] = [
        "pending",
        "running",
        "completed",
        "error",
        "paused",
        "skipped",
      ];

      validStatuses.forEach((status) => {
        const task: TaskItem = {
          id: "task-1",
          prompt: "Test",
          status,
        };
        expect(task.status).toBe(status);
      });
    });

    it("should handle status transitions", () => {
      let task: TaskItem = {
        id: "task-1",
        prompt: "Test",
        status: "pending",
      };

      task = { ...task, status: "running" };
      expect(task.status).toBe("running");

      task = { ...task, status: "completed", results: "Success" };
      expect(task.status).toBe("completed");
      expect(task.results).toBe("Success");
    });

    it("should handle error state with results", () => {
      const task: TaskItem = {
        id: "task-1",
        prompt: "Test",
        status: "error",
        results: "Command failed with error",
      };

      expect(task.status).toBe("error");
      expect(task.results).toBe("Command failed with error");
    });

    it("should handle paused state with pausedUntil timestamp", () => {
      const pauseTime = Date.now() + 3600000; // 1 hour from now
      const task: TaskItem = {
        id: "task-1",
        prompt: "Test",
        status: "paused",
        pausedUntil: pauseTime,
      };

      expect(task.status).toBe("paused");
      expect(task.pausedUntil).toBe(pauseTime);
    });

    it("should handle skipped state with skip reason", () => {
      const task: TaskItem = {
        id: "task-1",
        prompt: "Test",
        status: "skipped",
        skipReason: "Dependency task failed",
      };

      expect(task.status).toBe("skipped");
      expect(task.skipReason).toBe("Dependency task failed");
    });
  });

  describe("Task serialization and deserialization", () => {
    it("should serialize TaskItem to JSON", () => {
      const task: TaskItem = {
        id: "task-1",
        name: "Test Task",
        prompt: "Test prompt",
        status: "completed",
        results: "Success",
        sessionId: "session-123",
        model: "claude-3-sonnet",
        dependsOn: ["task-0"],
      };

      const serialized = JSON.stringify(task);
      const parsed = JSON.parse(serialized);

      expect(parsed.id).toBe(task.id);
      expect(parsed.name).toBe(task.name);
      expect(parsed.prompt).toBe(task.prompt);
      expect(parsed.status).toBe(task.status);
      expect(parsed.results).toBe(task.results);
      expect(parsed.sessionId).toBe(task.sessionId);
      expect(parsed.model).toBe(task.model);
      expect(parsed.dependsOn).toEqual(task.dependsOn);
    });

    it("should deserialize JSON to TaskItem", () => {
      const taskData = {
        id: "task-1",
        prompt: "Test prompt",
        status: "pending" as const,
        dependsOn: ["task-0"],
        condition: "on_success" as ConditionType,
      };

      const serialized = JSON.stringify(taskData);
      const deserialized: TaskItem = JSON.parse(serialized);

      expect(deserialized).toEqual(taskData);
      expect(deserialized.dependsOn).toEqual(["task-0"]);
      expect(deserialized.condition).toBe("on_success");
    });

    it("should handle null values in serialization", () => {
      const task: TaskItem = {
        id: "task-1",
        prompt: "Test",
        status: "pending",
        continueFrom: null,
      };

      const serialized = JSON.stringify(task);
      const deserialized: TaskItem = JSON.parse(serialized);

      expect(deserialized.continueFrom).toBeNull();
    });

    it("should preserve timestamp values", () => {
      const timestamp = 1640995200000;
      const task: TaskItem = {
        id: "task-1",
        prompt: "Test",
        status: "paused",
        pausedUntil: timestamp,
      };

      const serialized = JSON.stringify(task);
      const deserialized: TaskItem = JSON.parse(serialized);

      expect(deserialized.pausedUntil).toBe(timestamp);
    });
  });

  describe("Task relationship and dependency handling", () => {
    it("should handle task dependencies", () => {
      const task: TaskItem = {
        id: "task-2",
        prompt: "Dependent task",
        status: "pending",
        dependsOn: ["task-1"],
      };

      expect(task.dependsOn).toEqual(["task-1"]);
      expect(Array.isArray(task.dependsOn)).toBe(true);
    });

    it("should handle multiple dependencies", () => {
      const task: TaskItem = {
        id: "task-3",
        prompt: "Multi-dependent task",
        status: "pending",
        dependsOn: ["task-1", "task-2"],
      };

      expect(task.dependsOn).toHaveLength(2);
      expect(task.dependsOn).toContain("task-1");
      expect(task.dependsOn).toContain("task-2");
    });

    it("should handle empty dependencies array", () => {
      const task: TaskItem = {
        id: "task-1",
        prompt: "Independent task",
        status: "pending",
        dependsOn: [],
      };

      expect(task.dependsOn).toEqual([]);
      expect(task.dependsOn).toHaveLength(0);
    });

    it("should handle task continuation from checkpoint", () => {
      const task: TaskItem = {
        id: "task-1",
        prompt: "Resumable task",
        status: "running",
        continueFrom: "checkpoint-abc123",
      };

      expect(task.continueFrom).toBe("checkpoint-abc123");
    });

    it("should handle resume from previous task", () => {
      const task: TaskItem = {
        id: "task-2",
        prompt: "Resume task",
        status: "pending",
        resumeFromTaskId: "task-1",
      };

      expect(task.resumeFromTaskId).toBe("task-1");
    });

    it("should support condition-based execution", () => {
      const onSuccessTask: TaskItem = {
        id: "task-2",
        prompt: "Run on success",
        status: "pending",
        dependsOn: ["task-1"],
        condition: "on_success",
      };

      const onFailureTask: TaskItem = {
        id: "task-3",
        prompt: "Run on failure",
        status: "pending",
        dependsOn: ["task-1"],
        condition: "on_failure",
      };

      const alwaysTask: TaskItem = {
        id: "task-4",
        prompt: "Always run",
        status: "pending",
        dependsOn: ["task-1"],
        condition: "always",
      };

      expect(onSuccessTask.condition).toBe("on_success");
      expect(onFailureTask.condition).toBe("on_failure");
      expect(alwaysTask.condition).toBe("always");
    });
  });

  describe("Task error handling and validation", () => {
    it("should validate required fields", () => {
      const invalidTask = {
        // Missing required id and prompt
        status: "pending",
      };

      // TypeScript should catch this at compile time
      // This test validates the interface structure
      expect(() => {
        const task: TaskItem = invalidTask as any;
        expect(task.id).toBeUndefined();
        expect(task.prompt).toBeUndefined();
      }).not.toThrow();
    });

    it("should handle invalid status gracefully in runtime", () => {
      const taskWithInvalidStatus = {
        id: "task-1",
        prompt: "Test",
        status: "invalid-status" as any,
      };

      expect(taskWithInvalidStatus.status).toBe("invalid-status");
    });

    it("should validate ConditionType values", () => {
      const validConditions: ConditionType[] = [
        "on_success",
        "on_failure",
        "always",
      ];

      validConditions.forEach((condition) => {
        const task: TaskItem = {
          id: "task-1",
          prompt: "Test",
          status: "pending",
          condition,
        };
        expect(task.condition).toBe(condition);
      });
    });

    it("should handle TaskResult error scenarios", () => {
      const errorResult: TaskResult = {
        taskId: "task-1",
        success: false,
        output: "Command output",
        error: "Command failed with exit code 1",
        executionTimeMs: 1500,
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toBe("Command failed with exit code 1");
      expect(errorResult.executionTimeMs).toBe(1500);
    });

    it("should handle CommandResult with error", () => {
      const commandResult: CommandResult = {
        success: false,
        output: "Error output",
        error: "Process failed",
        exitCode: 1,
        sessionId: "session-123",
      };

      expect(commandResult.success).toBe(false);
      expect(commandResult.error).toBe("Process failed");
      expect(commandResult.exitCode).toBe(1);
    });

    it("should validate WorkflowResult structure", () => {
      const workflowResult: WorkflowResult = {
        workflowId: "workflow-1",
        success: false,
        outputs: { result: "partial" },
        error: "Step 3 failed",
        executionTimeMs: 5000,
        stepsExecuted: 2,
      };

      expect(workflowResult.success).toBe(false);
      expect(workflowResult.error).toBe("Step 3 failed");
      expect(workflowResult.stepsExecuted).toBe(2);
      expect(workflowResult.outputs).toEqual({ result: "partial" });
    });
  });

  describe("Task options and configuration", () => {
    it("should handle TaskOptions with all fields", () => {
      const options: TaskOptions = {
        allowAllTools: true,
        bypassPermissions: false,
        outputFormat: "json",
        maxTurns: 10,
        verbose: true,
        systemPrompt: "You are a helpful assistant",
        appendSystemPrompt: "Additional instructions",
        continueConversation: true,
        resumeSessionId: "session-123",
        allowedTools: ["bash", "edit"],
        disallowedTools: ["web"],
        mcpConfig: "config.json",
        permissionPromptTool: "ask",
        workingDirectory: "/workspace",
      };

      expect(options.allowAllTools).toBe(true);
      expect(options.outputFormat).toBe("json");
      expect(options.maxTurns).toBe(10);
      expect(options.allowedTools).toEqual(["bash", "edit"]);
      expect(options.disallowedTools).toEqual(["web"]);
      expect(options.workingDirectory).toBe("/workspace");
    });

    it("should handle ExecutionOptions", () => {
      const execOptions: ExecutionOptions = {
        model: "claude-3-sonnet",
        workingDirectory: "/project",
        parallelTasks: 3,
        timeoutMs: 30000,
      };

      expect(execOptions.model).toBe("claude-3-sonnet");
      expect(execOptions.parallelTasks).toBe(3);
      expect(execOptions.timeoutMs).toBe(30000);
    });

    it("should handle WorkflowOptions extending ExecutionOptions", () => {
      const workflowOptions: WorkflowOptions = {
        model: "claude-3-sonnet",
        parallelTasks: 2,
        inputs: { param1: "value1", param2: "value2" },
        environment: { NODE_ENV: "test", DEBUG: "true" },
      };

      expect(workflowOptions.model).toBe("claude-3-sonnet");
      expect(workflowOptions.parallelTasks).toBe(2);
      expect(workflowOptions.inputs).toEqual({
        param1: "value1",
        param2: "value2",
      });
      expect(workflowOptions.environment).toEqual({
        NODE_ENV: "test",
        DEBUG: "true",
      });
    });

    it("should handle empty options objects", () => {
      const emptyTaskOptions: TaskOptions = {};
      const emptyExecOptions: ExecutionOptions = {};
      const emptyWorkflowOptions: WorkflowOptions = {};

      expect(Object.keys(emptyTaskOptions)).toHaveLength(0);
      expect(Object.keys(emptyExecOptions)).toHaveLength(0);
      expect(Object.keys(emptyWorkflowOptions)).toHaveLength(0);
    });
  });

  describe("Task result structures", () => {
    it("should create successful TaskResult", () => {
      const result: TaskResult = {
        taskId: "task-1",
        success: true,
        output: "Task completed successfully",
        sessionId: "session-123",
        executionTimeMs: 2500,
      };

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed successfully");
      expect(result.sessionId).toBe("session-123");
      expect(result.executionTimeMs).toBe(2500);
      expect(result.error).toBeUndefined();
    });

    it("should create successful CommandResult", () => {
      const result: CommandResult = {
        success: true,
        output: "Command executed",
        exitCode: 0,
        sessionId: "session-123",
      };

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it("should create successful WorkflowResult", () => {
      const result: WorkflowResult = {
        workflowId: "workflow-1",
        success: true,
        outputs: {
          file_created: "/tmp/output.txt",
          records_processed: 100,
        },
        executionTimeMs: 10000,
        stepsExecuted: 5,
      };

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(5);
      expect(result.outputs.records_processed).toBe(100);
      expect(result.error).toBeUndefined();
    });
  });
});
