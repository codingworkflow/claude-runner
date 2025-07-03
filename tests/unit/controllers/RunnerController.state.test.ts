import * as vscode from "vscode";
import { RunnerController } from "../../../src/controllers/RunnerController";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ClaudeService } from "../../../src/services/ClaudeService";
import { TerminalService } from "../../../src/services/TerminalService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import { PipelineService } from "../../../src/services/PipelineService";
import { UsageReportService } from "../../../src/services/UsageReportService";
import { ClaudeVersionService } from "../../../src/services/ClaudeVersionService";
import { LogsService } from "../../../src/services/LogsService";
import { TaskItem } from "../../../src/core/models/Task";
import { RunnerCommand, UIState } from "../../../src/types/runner";

jest.mock("vscode", () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace/path" } }],
    onDidChangeWorkspaceFolders: jest.fn(),
  },
}));

jest.mock("../../../src/services/ClaudeCodeService");
jest.mock("../../../src/services/ClaudeService");
jest.mock("../../../src/services/TerminalService");
jest.mock("../../../src/services/ConfigurationService");
jest.mock("../../../src/services/PipelineService");
jest.mock("../../../src/services/UsageReportService");
jest.mock("../../../src/services/ClaudeVersionService");
jest.mock("../../../src/services/LogsService");
jest.mock("../../../src/services/CommandsService");

describe("RunnerController - State Management", () => {
  let controller: RunnerController;
  let mockContext: jest.Mocked<vscode.ExtensionContext>;
  let mockClaudeCodeService: jest.Mocked<ClaudeCodeService>;
  let mockConfigService: jest.Mocked<ConfigurationService>;

  const createMockTask = (
    id: string,
    prompt: string,
    status: TaskItem["status"] = "pending",
  ): TaskItem => ({
    id,
    prompt,
    status,
    name: `Task ${id}`,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      globalState: {
        get: jest.fn((key: string) => {
          if (key === "claude.detected") {
            return { isInstalled: true, version: "1.0.0" };
          }
          if (key === "claude.parallelTasks") {
            return 2;
          }
          return undefined;
        }),
        update: jest.fn(),
      },
      workspaceState: {
        get: jest.fn(() => "chat"),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<vscode.ExtensionContext>;

    mockClaudeCodeService = {
      isTaskRunning: jest.fn(() => false),
      getCurrentExecutionId: jest.fn(() => null),
      isWorkflowPaused: jest.fn(() => false),
      getPausedPipelines: jest.fn(() => []),
      getResumableWorkflows: jest.fn(() => Promise.resolve([])),
      runTask: jest.fn(),
      runTaskPipeline: jest.fn(),
      pausePipelineExecution: jest.fn(),
      resumePipelineExecution: jest.fn(),
    } as unknown as jest.Mocked<ClaudeCodeService>;

    mockConfigService = {
      getConfiguration: jest.fn(() => ({
        defaultModel: "claude-3-5-sonnet-20241022",
        defaultRootPath: "/test/path",
        allowAllTools: false,
        outputFormat: "json",
        maxTurns: 10,
        showVerboseOutput: false,
        terminalName: "Claude Interactive",
        autoOpenTerminal: true,
      })),
      updateConfiguration: jest.fn(),
    } as unknown as jest.Mocked<ConfigurationService>;

    controller = new RunnerController(
      mockContext,
      mockClaudeCodeService,
      {} as ClaudeService,
      {} as TerminalService,
      mockConfigService,
      {
        setRootPath: jest.fn(),
        listPipelines: jest.fn(() => Promise.resolve([])),
        discoverWorkflowFiles: jest.fn(() => Promise.resolve([])),
      } as unknown as PipelineService,
      {} as UsageReportService,
      {} as ClaudeVersionService,
      {} as LogsService,
    );
  });

  describe("Initial State", () => {
    it("should initialize with correct default state", () => {
      const state = controller.getCurrentState();

      expect(state.model).toBe("claude-3-5-sonnet-20241022");
      expect(state.rootPath).toBe("/test/path");
      expect(state.allowAllTools).toBe(false);
      expect(state.parallelTasksCount).toBe(2);
      expect(state.activeTab).toBe("chat");
      expect(state.status).toBe("idle");
      expect(state.claudeInstalled).toBe(true);
      expect(state.claudeVersion).toBe("1.0.0");
      expect(state.tasks).toEqual([]);
      expect(state.taskCompleted).toBe(false);
      expect(state.taskError).toBe(false);
    });

    it("should initialize with workspace path when no config path", () => {
      const emptyConfigService = {
        getConfiguration: jest.fn(() => ({
          defaultModel: "claude-3-5-sonnet-20241022",
          defaultRootPath: null,
          allowAllTools: false,
          outputFormat: "json",
          maxTurns: 10,
          showVerboseOutput: false,
          terminalName: "Claude Interactive",
          autoOpenTerminal: true,
        })),
        updateConfiguration: jest.fn(),
      } as unknown as jest.Mocked<ConfigurationService>;

      const newController = new RunnerController(
        mockContext,
        mockClaudeCodeService,
        {} as ClaudeService,
        {} as TerminalService,
        emptyConfigService,
        {
          setRootPath: jest.fn(),
          listPipelines: jest.fn(() => Promise.resolve([])),
          discoverWorkflowFiles: jest.fn(() => Promise.resolve([])),
        } as unknown as PipelineService,
        {} as UsageReportService,
        {} as ClaudeVersionService,
        {} as LogsService,
      );

      const state = newController.getCurrentState();
      expect(state.rootPath).toBe("/workspace/path");
    });
  });

  describe("State Updates", () => {
    it("should update state reactively", () => {
      const stateUpdates: UIState[] = [];
      controller.state$.subscribe((state) => stateUpdates.push(state));

      const command: RunnerCommand = {
        kind: "updateModel",
        model: "claude-3-5-haiku-20241022",
      };
      controller.send(command);

      expect(stateUpdates).toHaveLength(2); // Initial + update
      expect(stateUpdates[1].model).toBe("claude-3-5-haiku-20241022");
    });

    it("should maintain state consistency across multiple updates", () => {
      const operations = [
        { kind: "updateModel" as const, model: "claude-3-5-haiku-20241022" },
        { kind: "updateAllowAllTools" as const, allow: true },
        { kind: "updateOutputFormat" as const, format: "text" as const },
        { kind: "updateActiveTab" as const, tab: "pipeline" as const },
      ];

      operations.forEach((cmd) => controller.send(cmd));

      const finalState = controller.getCurrentState();
      expect(finalState.model).toBe("claude-3-5-haiku-20241022");
      expect(finalState.allowAllTools).toBe(true);
      expect(finalState.outputFormat).toBe("text");
      expect(finalState.activeTab).toBe("pipeline");
    });

    it("should handle concurrent state updates correctly", () => {
      const task1 = createMockTask("task1", "Task 1");
      const task2 = createMockTask("task2", "Task 2");

      controller.send({ kind: "pipelineAddTask", newTask: task1 });
      controller.send({ kind: "pipelineAddTask", newTask: task2 });
      controller.send({ kind: "updateOutputFormat", format: "json" });

      const state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(2);
      expect(state.outputFormat).toBe("json");
    });
  });

  describe("Task State Management", () => {
    it("should handle task completion state correctly", async () => {
      const command: RunnerCommand = { kind: "runTask", task: "test task" };

      mockClaudeCodeService.runTask.mockResolvedValue("Success result");

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.taskCompleted).toBe(true);
      expect(state.taskError).toBe(false);
      expect(state.lastTaskResults).toBe("Success result");
    });

    it("should handle task error state correctly", async () => {
      const command: RunnerCommand = { kind: "runTask", task: "test task" };

      mockClaudeCodeService.runTask.mockRejectedValue(new Error("Task failed"));

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.taskCompleted).toBe(true);
      expect(state.taskError).toBe(true);
      expect(state.lastTaskResults).toBe("Error: Error: Task failed");
    });

    it("should update task execution state during pipeline execution", async () => {
      const tasks = [createMockTask("1", "task 1")];
      const command: RunnerCommand = {
        kind: "runTasks",
        tasks,
        outputFormat: "json",
      };

      mockClaudeCodeService.runTaskPipeline.mockImplementation(
        async (_tasks, _model, _rootPath, _options, onProgress, onComplete) => {
          // Simulate progress
          const updatedTasks = tasks.map((t) => ({
            ...t,
            status: "running" as const,
          }));
          await onProgress(updatedTasks, 0);

          // Simulate completion
          const completedTasks = tasks.map((t) => ({
            ...t,
            status: "completed" as const,
          }));
          await onComplete(completedTasks);
        },
      );

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const finalState = controller.getCurrentState();
      expect(finalState.status).toBe("idle");
      expect(finalState.taskCompleted).toBe(true);
      expect(finalState.taskError).toBe(false);
    });

    it("should reset completion state when adding new tasks", async () => {
      // Set completion state
      const runCommand: RunnerCommand = { kind: "runTask", task: "test" };
      mockClaudeCodeService.runTask.mockResolvedValue("result");
      controller.send(runCommand);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const stateAfterRun = controller.getCurrentState();
      expect(stateAfterRun.taskCompleted).toBe(true);

      // Add new task - should reset completion state
      const newTask = createMockTask("new-task", "New task");
      const addCommand: RunnerCommand = { kind: "pipelineAddTask", newTask };
      controller.send(addCommand);

      const stateAfterAdd = controller.getCurrentState();
      expect(stateAfterAdd.taskCompleted).toBe(false);
      expect(stateAfterAdd.taskError).toBe(false);
      expect(stateAfterAdd.currentTaskIndex).toBeUndefined();
    });
  });

  describe("Pause/Resume State", () => {
    it("should handle pause/resume state correctly", async () => {
      const command: RunnerCommand = { kind: "pausePipeline" };

      mockClaudeCodeService.pausePipelineExecution.mockResolvedValue(
        "pipeline-1",
      );

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.isPaused).toBe(true);
    });

    it("should update pause/resume state from service data", async () => {
      mockClaudeCodeService.isWorkflowPaused.mockReturnValue(true);
      mockClaudeCodeService.getPausedPipelines.mockReturnValue([
        {
          pipelineId: "pipeline-1",
          tasks: [],
          currentIndex: 0,
          pausedAt: Date.now(),
        },
      ]);
      mockClaudeCodeService.getResumableWorkflows.mockResolvedValue([
        {
          executionId: "exec-1",
          workflowPath: "/path/to/workflow",
          workflowName: "workflow-1",
          startTime: "2024-01-01T00:00:00Z",
          currentStep: 1,
          totalSteps: 3,
          status: "paused" as const,
          sessionMappings: {},
          completedSteps: [],
          execution: {} as any,
          canResume: true,
        },
      ]);

      await controller.refreshPauseResumeState();

      const state = controller.getCurrentState();
      expect(state.isPaused).toBe(true);
      expect(state.pausedPipelines).toHaveLength(1);
      expect(state.resumableWorkflows).toHaveLength(1);
    });
  });

  describe("Pipeline State Management", () => {
    it("should handle pipeline task operations", () => {
      const newTask = createMockTask("new-task", "New task");
      const addCommand: RunnerCommand = { kind: "pipelineAddTask", newTask };

      controller.send(addCommand);

      let state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].prompt).toBe("New task");

      const removeCommand: RunnerCommand = {
        kind: "pipelineRemoveTask",
        taskId: newTask.id,
      };
      controller.send(removeCommand);

      state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(0);
    });

    it("should handle task field updates", () => {
      const task = createMockTask("task-1", "Original prompt");
      const addCommand: RunnerCommand = {
        kind: "pipelineAddTask",
        newTask: task,
      };
      controller.send(addCommand);

      const updateCommand: RunnerCommand = {
        kind: "pipelineUpdateTaskField",
        taskId: task.id,
        field: "prompt",
        value: "Updated prompt",
      };
      controller.send(updateCommand);

      const state = controller.getCurrentState();
      expect(state.tasks[0].prompt).toBe("Updated prompt");
    });

    it("should handle duplicate ID generation when adding tasks", () => {
      const existingTask = createMockTask("existing-task", "Existing task");
      const addExistingCommand: RunnerCommand = {
        kind: "pipelineAddTask",
        newTask: existingTask,
      };
      controller.send(addExistingCommand);

      // Add task with same ID - should generate new unique ID
      const duplicateTask = createMockTask("existing-task", "Duplicate task");
      const addDuplicateCommand: RunnerCommand = {
        kind: "pipelineAddTask",
        newTask: duplicateTask,
      };
      controller.send(addDuplicateCommand);

      const state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(2);
      expect(state.tasks[0].id).toBe("existing-task");
      expect(state.tasks[1].id).not.toBe("existing-task");
      expect(state.tasks[1].id).toMatch(/^task_\d+_[a-z0-9]+$/);
    });
  });

  describe("Tab State Persistence", () => {
    it("should persist active tab state", () => {
      const command: RunnerCommand = {
        kind: "updateActiveTab",
        tab: "pipeline",
      };

      controller.send(command);

      expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
        "lastActiveTab",
        "pipeline",
      );

      const state = controller.getCurrentState();
      expect(state.activeTab).toBe("pipeline");
    });
  });

  describe("Configuration State", () => {
    it("should prevent state changes during task execution", () => {
      mockClaudeCodeService.isTaskRunning.mockReturnValue(true);

      const command: RunnerCommand = {
        kind: "updateModel",
        model: "new-model",
      };
      controller.send(command);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Cannot change model while a task is running. Please cancel the current task first.",
      );

      const state = controller.getCurrentState();
      expect(state.model).toBe("claude-3-5-sonnet-20241022"); // Should remain unchanged
    });
  });

  describe("Error Recovery", () => {
    it("should preserve critical state during error recovery", async () => {
      // Set up initial state
      controller.send({
        kind: "updateModel",
        model: "claude-3-5-haiku-20241022",
      });
      controller.send({ kind: "updateAllowAllTools", allow: true });

      const preErrorState = controller.getCurrentState();

      // Trigger operation that should preserve state on error
      mockClaudeCodeService.runTask.mockRejectedValue(new Error("Task failed"));
      controller.send({ kind: "runTask", task: "failing task" });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const postErrorState = controller.getCurrentState();

      // Core configuration should be preserved
      expect(postErrorState.model).toBe(preErrorState.model);
      expect(postErrorState.allowAllTools).toBe(preErrorState.allowAllTools);
      expect(postErrorState.rootPath).toBe(preErrorState.rootPath);

      // Only task-specific state should change
      expect(postErrorState.taskError).toBe(true);
      expect(postErrorState.taskCompleted).toBe(true);
    });

    it("should handle invalid operations gracefully", () => {
      // Test that controller handles edge cases without throwing
      const task = createMockTask("recovery-task", "Recovery task");
      expect(() => {
        controller.send({ kind: "pipelineAddTask", newTask: task });
      }).not.toThrow();

      const state = controller.getCurrentState();
      expect(Array.isArray(state.tasks)).toBe(true);
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe("recovery-task");
    });
  });

  describe("Memory Management", () => {
    it("should handle memory management during long-running operations", () => {
      // Test that controller can handle many subscriptions and state updates
      const subscriptions = Array.from({ length: 10 }, () =>
        controller.state$.subscribe(() => {}),
      );

      // Execute many state updates
      for (let i = 0; i < 50; i++) {
        controller.send({ kind: "updateChatPrompt", prompt: `prompt ${i}` });
      }

      // Verify final state is consistent
      const finalState = controller.getCurrentState();
      expect(finalState.chatPrompt).toBe("prompt 49");

      // Clean up subscriptions
      subscriptions.forEach((sub) => sub.unsubscribe());

      // Verify controller still functions normally after cleanup
      controller.send({ kind: "updateChatPrompt", prompt: "after cleanup" });
      const postCleanupState = controller.getCurrentState();
      expect(postCleanupState.chatPrompt).toBe("after cleanup");
    });
  });

  describe("Public Interface Methods", () => {
    it("should toggle advanced tabs", () => {
      const initialState = controller.getCurrentState();
      expect(initialState.showAdvancedTabs).toBe(false);

      controller.toggleAdvancedTabs();

      const updatedState = controller.getCurrentState();
      expect(updatedState.showAdvancedTabs).toBe(true);
    });

    it("should update Claude status", () => {
      controller.updateClaudeStatus(true, "3.0.0");

      const state = controller.getCurrentState();
      expect(state.claudeInstalled).toBe(true);
      expect(state.claudeVersionAvailable).toBe(true);
      expect(state.claudeVersion).toBe("3.0.0");
      expect(state.claudeVersionLoading).toBe(false);
      expect(state.claudeVersionError).toBeUndefined();
    });

    it("should provide access to available models", () => {
      const models = controller.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it("should provide task running status", () => {
      mockClaudeCodeService.isTaskRunning.mockReturnValue(true);
      expect(controller.isTaskRunning()).toBe(true);

      mockClaudeCodeService.isTaskRunning.mockReturnValue(false);
      expect(controller.isTaskRunning()).toBe(false);
    });
  });
});
