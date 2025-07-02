import * as vscode from "vscode";
import {
  RunnerController,
  ControllerCallbacks,
} from "../../../src/controllers/RunnerController";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ClaudeService } from "../../../src/services/ClaudeService";
import { TerminalService } from "../../../src/services/TerminalService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import { PipelineService } from "../../../src/services/PipelineService";
import { UsageReportService } from "../../../src/services/UsageReportService";
import { ClaudeVersionService } from "../../../src/services/ClaudeVersionService";
import { LogsService } from "../../../src/services/LogsService";
import { ClaudeDetectionService } from "../../../src/services/ClaudeDetectionService";
import { TaskItem } from "../../../src/core/models/Task";
import { RunnerCommand, UIState } from "../../../src/types/runner";
import {
  ClaudeWorkflow,
  WorkflowExecution,
} from "../../../src/types/WorkflowTypes";

// Mock all VSCode APIs
jest.mock("vscode", () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showOpenDialog: jest.fn(),
  },
  workspace: {
    workspaceFolders: [],
    onDidChangeWorkspaceFolders: jest.fn(),
  },
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path })),
  },
}));

// Mock all services
jest.mock("../../../src/services/ClaudeCodeService");
jest.mock("../../../src/services/ClaudeService");
jest.mock("../../../src/services/TerminalService");
jest.mock("../../../src/services/ConfigurationService");
jest.mock("../../../src/services/PipelineService");
jest.mock("../../../src/services/UsageReportService");
jest.mock("../../../src/services/ClaudeVersionService");
jest.mock("../../../src/services/LogsService");
jest.mock("../../../src/services/ClaudeDetectionService");
jest.mock("../../../src/services/CommandsService");
jest.mock("../../../src/models/ClaudeModels", () => ({
  getModelIds: jest.fn(() => [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
  ]),
}));

describe("RunnerController", () => {
  let controller: RunnerController;
  let mockContext: jest.Mocked<vscode.ExtensionContext>;
  let mockClaudeCodeService: jest.Mocked<ClaudeCodeService>;
  let mockClaudeService: jest.Mocked<ClaudeService>;
  let mockTerminalService: jest.Mocked<TerminalService>;
  let mockConfigService: jest.Mocked<ConfigurationService>;
  let mockPipelineService: jest.Mocked<PipelineService>;
  let mockUsageReportService: jest.Mocked<UsageReportService>;
  let mockClaudeVersionService: jest.Mocked<ClaudeVersionService>;
  let mockLogsService: jest.Mocked<LogsService>;

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

  const createMockWorkflow = (): ClaudeWorkflow => ({
    name: "test-workflow",
    jobs: {
      pipeline: {
        "runs-on": "ubuntu-latest",
        steps: [
          {
            name: "step1",
            uses: "claude-pipeline-action@v1",
            with: {
              prompt: "Test step 1",
            },
          },
          {
            name: "step2",
            uses: "claude-pipeline-action@v1",
            with: {
              prompt: "Test step 2",
            },
          },
        ],
      },
    },
  });

  const createMockWorkflowExecution = (): WorkflowExecution => ({
    workflow: createMockWorkflow(),
    inputs: {},
    outputs: {},
    currentStep: 0,
    status: "pending",
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock VSCode extension context
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

    // Mock all services using partial mocks
    mockClaudeCodeService = {
      runTask: jest.fn(),
      runTaskPipeline: jest.fn(),
      cancelCurrentTask: jest.fn(),
      isTaskRunning: jest.fn(),
      getCurrentExecutionId: jest.fn(),
      isWorkflowPaused: jest.fn(),
      getPausedPipelines: jest.fn(),
      getResumableWorkflows: jest.fn(),
      pauseWorkflowExecution: jest.fn(),
      resumeWorkflowExecution: jest.fn(),
      pausePipelineExecution: jest.fn(),
      resumePipelineExecution: jest.fn(),
      deleteWorkflowState: jest.fn(),
      executeCommand: jest.fn(),
    } as unknown as jest.Mocked<ClaudeCodeService>;

    mockClaudeService = {} as unknown as jest.Mocked<ClaudeService>;

    mockTerminalService = {
      runInteractive: jest.fn(),
    } as unknown as jest.Mocked<TerminalService>;

    mockConfigService = {
      getConfiguration: jest.fn(),
      updateConfiguration: jest.fn(),
    } as unknown as jest.Mocked<ConfigurationService>;

    mockPipelineService = {
      setRootPath: jest.fn(),
      listPipelines: jest.fn(),
      discoverWorkflowFiles: jest.fn(),
      savePipeline: jest.fn(),
      loadPipeline: jest.fn(),
      loadWorkflowFromFile: jest.fn(),
      workflowToTaskItems: jest.fn(),
      deletePipeline: jest.fn(),
    } as unknown as jest.Mocked<PipelineService>;

    mockUsageReportService = {
      generateReport: jest.fn(),
    } as unknown as jest.Mocked<UsageReportService>;

    mockClaudeVersionService =
      {} as unknown as jest.Mocked<ClaudeVersionService>;

    mockLogsService = {
      listProjects: jest.fn(),
      listConversations: jest.fn(),
      loadConversation: jest.fn(),
    } as unknown as jest.Mocked<LogsService>;

    // Set up default mock implementations
    mockConfigService.getConfiguration.mockReturnValue({
      defaultModel: "claude-3-5-sonnet-20241022",
      defaultRootPath: "/test/path",
      allowAllTools: false,
      outputFormat: "json",
      maxTurns: 10,
      showVerboseOutput: false,
      terminalName: "Claude Interactive",
      autoOpenTerminal: true,
    });

    mockClaudeCodeService.isTaskRunning.mockReturnValue(false);
    mockClaudeCodeService.getCurrentExecutionId.mockReturnValue(null);
    mockClaudeCodeService.isWorkflowPaused.mockReturnValue(false);
    mockClaudeCodeService.getPausedPipelines.mockReturnValue([]);
    mockClaudeCodeService.getResumableWorkflows.mockResolvedValue([]);

    mockPipelineService.listPipelines.mockResolvedValue([
      "pipeline1",
      "pipeline2",
    ]);
    mockPipelineService.discoverWorkflowFiles.mockResolvedValue([
      { name: "workflow1", path: "/workflows/workflow1.yml" },
    ]);

    // Create controller instance
    controller = new RunnerController(
      mockContext,
      mockClaudeCodeService,
      mockClaudeService,
      mockTerminalService,
      mockConfigService,
      mockPipelineService,
      mockUsageReportService,
      mockClaudeVersionService,
      mockLogsService,
    );
  });

  describe("Controller Orchestration", () => {
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
    });

    it("should handle getInitialState command", () => {
      const command: RunnerCommand = { kind: "getInitialState" };

      expect(() => controller.send(command)).not.toThrow();
    });

    it("should handle unknown commands gracefully", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      const command = { kind: "unknownCommand" } as unknown as RunnerCommand;

      controller.send(command);

      expect(consoleSpy).toHaveBeenCalledWith("Unknown command:", command);
      consoleSpy.mockRestore();
    });

    it("should provide access to available models", () => {
      const models = controller.getAvailableModels();

      expect(models).toEqual([
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
      ]);
    });

    it("should provide task running status", () => {
      mockClaudeCodeService.isTaskRunning.mockReturnValue(true);

      expect(controller.isTaskRunning()).toBe(true);

      mockClaudeCodeService.isTaskRunning.mockReturnValue(false);

      expect(controller.isTaskRunning()).toBe(false);
    });
  });

  describe("Service Coordination and Lifecycle", () => {
    it("should coordinate terminal service for interactive sessions", async () => {
      const command: RunnerCommand = {
        kind: "startInteractive",
        prompt: "test prompt",
      };

      mockTerminalService.runInteractive.mockResolvedValue(
        {} as vscode.Terminal,
      );

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockTerminalService.runInteractive).toHaveBeenCalledWith(
        "claude-3-5-sonnet-20241022",
        "/test/path",
        false,
        "test prompt",
      );
      expect(mockConfigService.updateConfiguration).toHaveBeenCalledTimes(3);
    });

    it("should coordinate claude code service for task execution", async () => {
      const command: RunnerCommand = {
        kind: "runTask",
        task: "test task",
        outputFormat: "json",
      };

      mockClaudeCodeService.runTask.mockResolvedValue("task result");

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.runTask).toHaveBeenCalledWith(
        "test task",
        "claude-3-5-sonnet-20241022",
        "/test/path",
        {
          allowAllTools: false,
          outputFormat: "json",
        },
      );
    });

    it("should coordinate pipeline service for pipeline operations", async () => {
      const tasks = [createMockTask("1", "task 1")];
      const command: RunnerCommand = {
        kind: "savePipeline",
        name: "test-pipeline",
        description: "Test pipeline",
        tasks,
      };

      mockPipelineService.savePipeline.mockResolvedValue();

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.savePipeline).toHaveBeenCalledWith(
        "test-pipeline",
        "Test pipeline",
        tasks,
        "claude-3-5-sonnet-20241022",
        false,
      );
    });

    it("should coordinate usage report service", async () => {
      const command: RunnerCommand = {
        kind: "requestUsageReport",
        period: "today",
      };

      const mockReport = {
        period: "today" as const,
        startDate: "2024-01-01",
        endDate: "2024-01-01",
        dailyReports: [],
        totals: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 150,
          costUSD: 0.1,
          models: ["claude-3-5-sonnet-20241022"],
        },
      };
      mockUsageReportService.generateReport.mockResolvedValue(mockReport);

      const callbacks: ControllerCallbacks = {
        onUsageReportData: jest.fn(),
      };
      controller.setCallbacks(callbacks);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockUsageReportService.generateReport).toHaveBeenCalledWith(
        "today",
        undefined,
        undefined,
      );
      expect(callbacks.onUsageReportData).toHaveBeenCalledWith(mockReport);
    });

    it("should coordinate logs service", async () => {
      const command: RunnerCommand = { kind: "requestLogProjects" };

      const mockProjects = [
        {
          name: "project1",
          path: "/projects/project1",
          conversationCount: 5,
          lastModified: new Date(),
        },
      ];
      mockLogsService.listProjects.mockResolvedValue(mockProjects);

      const callbacks: ControllerCallbacks = {
        onLogProjectsData: jest.fn(),
      };
      controller.setCallbacks(callbacks);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockLogsService.listProjects).toHaveBeenCalled();
      expect(callbacks.onLogProjectsData).toHaveBeenCalledWith(mockProjects);
    });

    it("should update services when root path changes", async () => {
      const command: RunnerCommand = {
        kind: "updateRootPath",
        path: "/new/path",
      };

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.setRootPath).toHaveBeenCalledWith("/new/path");
      expect(mockPipelineService.listPipelines).toHaveBeenCalled();
      expect(mockPipelineService.discoverWorkflowFiles).toHaveBeenCalled();
    });
  });

  describe("State Management and Synchronization", () => {
    it("should update state reactively", () => {
      const stateUpdates: UIState[] = [];

      controller.state$.subscribe((state) => stateUpdates.push(state));

      const command: RunnerCommand = {
        kind: "updateModel",
        model: "new-model",
      };
      controller.send(command);

      expect(stateUpdates).toHaveLength(2); // Initial + update
      expect(stateUpdates[1].model).toBe("new-model");
    });

    it("should prevent model changes during task execution", () => {
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

  describe("Event Handling and Dispatching", () => {
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

    it("should handle Claude detection refresh", async () => {
      const command: RunnerCommand = { kind: "recheckClaude", shell: "bash" };

      const mockDetectionResult = {
        isInstalled: true,
        version: "2.0.0",
        shell: "bash",
      };

      jest.spyOn(ClaudeDetectionService, "clearCache").mockImplementation();
      jest
        .spyOn(ClaudeDetectionService, "detectClaude")
        .mockResolvedValue(mockDetectionResult);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(ClaudeDetectionService.clearCache).toHaveBeenCalled();
      expect(ClaudeDetectionService.detectClaude).toHaveBeenCalledWith("bash");

      const state = controller.getCurrentState();
      expect(state.claudeVersion).toBe("2.0.0");
      expect(state.claudeInstalled).toBe(true);
    });

    it("should handle workflow pause/resume operations", async () => {
      const pauseCommand: RunnerCommand = {
        kind: "pauseWorkflow",
        executionId: "exec-1",
      };

      const mockPausedState = {
        executionId: "exec-1",
        workflowPath: "/workflows/test.yml",
        workflowName: "test-workflow",
        startTime: "2024-01-01T00:00:00Z",
        currentStep: 1,
        totalSteps: 3,
        status: "paused" as const,
        sessionMappings: {},
        completedSteps: [],
        execution: createMockWorkflowExecution(),
        canResume: true,
      };

      mockClaudeCodeService.pauseWorkflowExecution.mockResolvedValue(
        mockPausedState,
      );

      controller.send(pauseCommand);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.pauseWorkflowExecution).toHaveBeenCalledWith(
        "exec-1",
      );

      let state = controller.getCurrentState();
      expect(state.isPaused).toBe(true);
      expect(state.currentExecutionId).toBe("exec-1");

      // Test resume
      const resumeCommand: RunnerCommand = {
        kind: "resumeWorkflow",
        executionId: "exec-1",
      };

      const mockResumedState = {
        executionId: "exec-1",
        workflowPath: "/workflows/test.yml",
        workflowName: "test-workflow",
        startTime: "2024-01-01T00:00:00Z",
        currentStep: 1,
        totalSteps: 3,
        status: "running" as const,
        sessionMappings: {},
        completedSteps: [],
        execution: createMockWorkflowExecution(),
        canResume: true,
      };

      mockClaudeCodeService.resumeWorkflowExecution.mockResolvedValue(
        mockResumedState,
      );

      controller.send(resumeCommand);

      await new Promise((resolve) => setTimeout(resolve, 0));

      state = controller.getCurrentState();
      expect(state.isPaused).toBe(false);
    });

    it("should handle webview errors", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const command: RunnerCommand = {
        kind: "webviewError",
        error: "Test error",
      };

      controller.send(command);

      expect(consoleSpy).toHaveBeenCalledWith("Webview error:", "Test error");
      consoleSpy.mockRestore();
    });
  });

  describe("Error Propagation and Recovery", () => {
    it("should handle terminal service errors gracefully", async () => {
      const command: RunnerCommand = { kind: "startInteractive" };

      mockTerminalService.runInteractive.mockRejectedValue(
        new Error("Terminal error"),
      );

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to start interactive session: Error: Terminal error",
      );
    });

    it("should handle task cancellation errors", async () => {
      const command: RunnerCommand = { kind: "cancelTask" };

      mockClaudeCodeService.cancelCurrentTask.mockImplementation(() => {
        throw new Error("Cancel failed");
      });

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to cancel task: Error: Cancel failed",
      );
    });

    it("should handle pipeline loading errors", async () => {
      const command: RunnerCommand = {
        kind: "loadPipeline",
        name: "invalid-pipeline",
      };

      mockPipelineService.loadPipeline.mockRejectedValue(
        new Error("Pipeline not found"),
      );

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Unexpected error loading pipeline: Error: Pipeline not found",
      );
    });

    it("should handle usage report errors with callbacks", async () => {
      const command: RunnerCommand = {
        kind: "requestUsageReport",
        period: "today",
      };

      mockUsageReportService.generateReport.mockRejectedValue(
        new Error("Report failed"),
      );

      const callbacks: ControllerCallbacks = {
        onUsageReportError: jest.fn(),
      };
      controller.setCallbacks(callbacks);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(callbacks.onUsageReportError).toHaveBeenCalledWith(
        "Report failed",
      );
    });

    it("should handle parallel tasks count validation", async () => {
      const command: RunnerCommand = {
        kind: "updateParallelTasksCount",
        value: 10,
      };

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to update parallel tasks count: Error: Value must be between 1 and 8",
      );

      // Should revert to cached value
      const state = controller.getCurrentState();
      expect(state.parallelTasksCount).toBe(2); // Original cached value
    });

    it("should handle Claude code service command execution errors", async () => {
      const command: RunnerCommand = {
        kind: "updateParallelTasksCount",
        value: 4,
      };

      mockClaudeCodeService.executeCommand.mockResolvedValue({
        success: false,
        output: "",
        error: "Command failed",
      });

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to update parallel tasks count: Error: Command failed",
      );
    });

    it("should handle pipeline execution errors with proper state cleanup", async () => {
      const tasks = [createMockTask("1", "task 1")];
      const command: RunnerCommand = { kind: "runTasks", tasks };

      mockClaudeCodeService.runTaskPipeline.mockImplementation(
        async (
          _tasks,
          _model,
          _rootPath,
          _options,
          _onProgress,
          _onComplete,
          onError,
        ) => {
          const errorTasks = tasks.map((t) => ({
            ...t,
            status: "error" as const,
          }));
          await onError("Pipeline execution failed", errorTasks);
        },
      );

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.status).toBe("idle");
      expect(state.taskCompleted).toBe(true);
      expect(state.taskError).toBe(true);
      expect(state.lastTaskResults).toBe(
        "Pipeline failed: Pipeline execution failed",
      );
      expect(state.isPaused).toBe(false);
      expect(state.currentTaskIndex).toBeUndefined();
    });

    it("should handle workflow conversion errors", async () => {
      const command: RunnerCommand = {
        kind: "loadPipeline",
        name: "test-workflow",
      };

      const invalidWorkflow = createMockWorkflow();
      mockPipelineService.loadPipeline.mockResolvedValue(invalidWorkflow);
      mockPipelineService.workflowToTaskItems.mockImplementation(() => {
        throw new Error("Invalid workflow format");
      });

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Pipeline 'test-workflow' is invalid: Error: Invalid workflow format",
      );
    });

    it("should handle resumable workflows retrieval errors", async () => {
      const command: RunnerCommand = { kind: "getResumableWorkflows" };

      mockClaudeCodeService.getResumableWorkflows.mockRejectedValue(
        new Error("Failed to get workflows"),
      );

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.resumableWorkflows).toEqual([]);
    });

    it("should maintain Claude installation status on detection errors", async () => {
      // Set initial state as installed
      controller.updateClaudeStatus(true, "1.0.0");

      const command: RunnerCommand = { kind: "recheckClaude" };

      jest
        .spyOn(ClaudeDetectionService, "detectClaude")
        .mockRejectedValue(new Error("Detection failed"));

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.claudeInstalled).toBe(true); // Should not downgrade
      expect(state.claudeVersionAvailable).toBe(false);
      expect(state.claudeVersionError).toBe("Detection failed");
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

    it("should refresh pause/resume state", async () => {
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
          execution: createMockWorkflowExecution(),
          canResume: true,
        },
      ]);

      await controller.refreshPauseResumeState();

      const state = controller.getCurrentState();
      expect(state.isPaused).toBe(true);
      expect(state.pausedPipelines).toHaveLength(1);
      expect(state.resumableWorkflows).toHaveLength(1);
    });

    it("should set callbacks correctly", () => {
      const callbacks: ControllerCallbacks = {
        onUsageReportData: jest.fn(),
        onUsageReportError: jest.fn(),
      };

      controller.setCallbacks(callbacks);

      // Verify callbacks are used (tested indirectly through other tests)
      expect(() => controller.setCallbacks(callbacks)).not.toThrow();
    });
  });

  describe("Advanced Command Coverage", () => {
    it("should handle browseFolder command", async () => {
      const command: RunnerCommand = { kind: "browseFolder" };

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: "/selected/path" },
      ]);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({
        canSelectMany: false,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: "Select Root Directory",
        defaultUri: { fsPath: "/test/path" },
      });

      const state = controller.getCurrentState();
      expect(state.rootPath).toBe("/selected/path");
    });

    it("should handle browseFolder cancellation", async () => {
      const command: RunnerCommand = { kind: "browseFolder" };

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.rootPath).toBe("/test/path"); // Should remain unchanged
    });

    it("should handle loadWorkflow command for workflow files", async () => {
      const command: RunnerCommand = {
        kind: "loadWorkflow",
        workflowId: "/.github/workflows/test.yml",
      };

      const mockWorkflow = createMockWorkflow();
      const mockTasks = [createMockTask("1", "Test task")];

      mockPipelineService.loadWorkflowFromFile.mockResolvedValue(mockWorkflow);
      mockPipelineService.workflowToTaskItems.mockReturnValue(mockTasks);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.loadWorkflowFromFile).toHaveBeenCalledWith(
        "/.github/workflows/test.yml",
      );

      const state = controller.getCurrentState();
      expect(state.tasks).toEqual(mockTasks);
      expect(state.workflowPath).toBe("/.github/workflows/test.yml");
    });

    it("should handle updateChatPrompt command", () => {
      const command: RunnerCommand = {
        kind: "updateChatPrompt",
        prompt: "Test chat prompt",
      };

      controller.send(command);

      const state = controller.getCurrentState();
      expect(state.chatPrompt).toBe("Test chat prompt");
    });

    it("should handle updateShowChatPrompt command", () => {
      const command: RunnerCommand = {
        kind: "updateShowChatPrompt",
        show: true,
      };

      controller.send(command);

      const state = controller.getCurrentState();
      expect(state.showChatPrompt).toBe(true);
    });

    it("should handle updateOutputFormat command", () => {
      const command: RunnerCommand = {
        kind: "updateOutputFormat",
        format: "text",
      };

      controller.send(command);

      const state = controller.getCurrentState();
      expect(state.outputFormat).toBe("text");
    });

    it("should handle requestLogConversations command", async () => {
      const command: RunnerCommand = {
        kind: "requestLogConversations",
        projectName: "test-project",
      };

      const mockConversations = [
        {
          id: "conversation1",
          sessionId: "session1",
          fileName: "conversation1",
          firstTimestamp: "2024-01-01T00:00:00Z",
          lastTimestamp: "2024-01-01T01:00:00Z",
          messageCount: 10,
          filePath: "/conversations/conversation1.md",
        },
      ];
      mockLogsService.listConversations.mockResolvedValue(mockConversations);

      const callbacks: ControllerCallbacks = {
        onLogConversationsData: jest.fn(),
      };
      controller.setCallbacks(callbacks);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockLogsService.listConversations).toHaveBeenCalledWith(
        "test-project",
      );
      expect(callbacks.onLogConversationsData).toHaveBeenCalledWith(
        mockConversations,
      );
    });

    it("should handle requestLogConversation command", async () => {
      const command: RunnerCommand = {
        kind: "requestLogConversation",
        filePath: "/path/to/conversation.md",
      };

      const mockConversationData = {
        info: {
          id: "conversation1",
          sessionId: "session1",
          fileName: "conversation1",
          firstTimestamp: "2024-01-01T00:00:00Z",
          lastTimestamp: "2024-01-01T01:00:00Z",
          messageCount: 2,
          filePath: "/path/to/conversation.md",
        },
        entries: [],
      };
      mockLogsService.loadConversation.mockResolvedValue(mockConversationData);

      const callbacks: ControllerCallbacks = {
        onLogConversationData: jest.fn(),
      };
      controller.setCallbacks(callbacks);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockLogsService.loadConversation).toHaveBeenCalledWith(
        "/path/to/conversation.md",
      );
      expect(callbacks.onLogConversationData).toHaveBeenCalledWith(
        mockConversationData,
      );
    });

    it("should handle deleteWorkflowState command", async () => {
      const command: RunnerCommand = {
        kind: "deleteWorkflowState",
        executionId: "exec-1",
      };

      mockClaudeCodeService.deleteWorkflowState.mockResolvedValue();
      mockClaudeCodeService.getResumableWorkflows.mockResolvedValue([]);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.deleteWorkflowState).toHaveBeenCalledWith(
        "exec-1",
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Workflow state deleted successfully",
      );
    });
  });

  describe("Complex Pipeline Operations", () => {
    it("should handle pipelineAddTask with duplicate ID generation", () => {
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
      expect(state.tasks[1].id).not.toBe("existing-task"); // Should have new generated ID
      expect(state.tasks[1].id).toMatch(/^task_\d+_[a-z0-9]+$/);
    });

    it("should handle pipelineAddTask with completion state reset", async () => {
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

    it("should handle runTasks with no pending tasks", async () => {
      const completedTasks = [createMockTask("1", "task 1", "completed")];
      const command: RunnerCommand = {
        kind: "runTasks",
        tasks: completedTasks,
      };

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "No pending tasks to run. All tasks have been completed or errored.",
      );
      expect(mockClaudeCodeService.runTaskPipeline).not.toHaveBeenCalled();
    });

    it("should handle runTasks with pipeline pause detection", async () => {
      const tasks = [createMockTask("1", "task 1")];
      const command: RunnerCommand = { kind: "runTasks", tasks };

      mockClaudeCodeService.runTaskPipeline.mockImplementation(
        async (_tasks, _model, _rootPath, _options, onProgress) => {
          // Simulate task pause
          const pausedTasks = tasks.map((t) => ({
            ...t,
            status: "paused" as const,
          }));
          await onProgress(pausedTasks, 0);
        },
      );

      mockClaudeCodeService.getPausedPipelines.mockReturnValue([
        {
          pipelineId: "pipeline-1",
          tasks: [],
          currentIndex: 0,
          pausedAt: Date.now(),
        },
      ]);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = controller.getCurrentState();
      expect(state.isPaused).toBe(true);
      expect(state.status).toBe("paused");
      expect(state.pausedPipelines).toHaveLength(1);
    });

    it("should handle loadPipeline from discovered workflows", async () => {
      const command: RunnerCommand = {
        kind: "loadPipeline",
        name: "workflow1",
      };

      // First call returns null (not found in saved pipelines)
      mockPipelineService.loadPipeline.mockResolvedValue(null);

      const mockWorkflow = createMockWorkflow();
      const mockTasks = [createMockTask("1", "Workflow task")];

      mockPipelineService.loadWorkflowFromFile.mockResolvedValue(mockWorkflow);
      mockPipelineService.workflowToTaskItems.mockReturnValue(mockTasks);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.loadPipeline).toHaveBeenCalledWith(
        "workflow1",
      );
      expect(mockPipelineService.loadWorkflowFromFile).toHaveBeenCalledWith(
        "/workflows/workflow1.yml",
      );

      const state = controller.getCurrentState();
      expect(state.tasks).toEqual(mockTasks);
    });

    it("should handle loadPipeline with workflow not found", async () => {
      const command: RunnerCommand = {
        kind: "loadPipeline",
        name: "nonexistent-workflow",
      };

      mockPipelineService.loadPipeline.mockResolvedValue(null);

      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Should not throw or show error - just return silently
      expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });
  });

  describe("Workspace Integration", () => {
    it("should initialize with workspace path when no config path", () => {
      // Mock workspace folders before creating new controller
      const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [{ uri: { fsPath: "/workspace/path" } }],
        writable: true,
      });

      // Create a new mock config service that returns null defaultRootPath
      const emptyConfigService = {
        getConfiguration: jest.fn().mockReturnValue({
          defaultModel: "claude-3-5-sonnet-20241022",
          defaultRootPath: null, // No config path - must be null/undefined for fallback
          allowAllTools: false,
          outputFormat: "json",
          maxTurns: 10,
          showVerboseOutput: false,
          terminalName: "Claude Interactive",
          autoOpenTerminal: true,
        }),
        updateConfiguration: jest.fn(),
      } as unknown as jest.Mocked<ConfigurationService>;

      const newController = new RunnerController(
        mockContext,
        mockClaudeCodeService,
        mockClaudeService,
        mockTerminalService,
        emptyConfigService,
        mockPipelineService,
        mockUsageReportService,
        mockClaudeVersionService,
        mockLogsService,
      );

      const state = newController.getCurrentState();
      expect(state.rootPath).toBe("/workspace/path");

      // Restore original workspace folders
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: originalWorkspaceFolders,
        writable: true,
      });
    });

    it("should handle workspace folder changes", async () => {
      const mockOnDidChange = vscode.workspace
        .onDidChangeWorkspaceFolders as jest.Mock;
      const changeCallback = mockOnDidChange.mock.calls[0][0];

      // Trigger workspace change
      changeCallback();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.listPipelines).toHaveBeenCalled();
      expect(mockPipelineService.discoverWorkflowFiles).toHaveBeenCalled();
    });

    it("should handle initial pipeline loading during construction", async () => {
      // Wait for initial async operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.listPipelines).toHaveBeenCalled();
      expect(mockPipelineService.discoverWorkflowFiles).toHaveBeenCalled();

      const state = controller.getCurrentState();
      expect(state.availablePipelines).toEqual([
        "pipeline1",
        "pipeline2",
        "workflow1",
      ]);
      expect(state.discoveredWorkflows).toEqual([
        { name: "workflow1", path: "/workflows/workflow1.yml" },
      ]);
    });
  });

  describe("Service Lifecycle Management", () => {
    it("should properly initialize and set up service dependencies on construction", () => {
      // Verify initial service setup calls were made
      expect(mockPipelineService.setRootPath).toHaveBeenCalledWith(
        "/test/path",
      );
      expect(vscode.workspace.onDidChangeWorkspaceFolders).toHaveBeenCalled();
    });

    it("should coordinate service lifecycle during root path changes", async () => {
      const command: RunnerCommand = {
        kind: "updateRootPath",
        path: "/new/root/path",
      };

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify all services are updated with new root path
      expect(mockPipelineService.setRootPath).toHaveBeenCalledWith(
        "/new/root/path",
      );
      expect(mockPipelineService.listPipelines).toHaveBeenCalled();
      expect(mockPipelineService.discoverWorkflowFiles).toHaveBeenCalled();

      const state = controller.getCurrentState();
      expect(state.rootPath).toBe("/new/root/path");
    });

    it("should handle service initialization errors gracefully", async () => {
      mockPipelineService.listPipelines.mockRejectedValue(
        new Error("Service error"),
      );
      mockPipelineService.discoverWorkflowFiles.mockRejectedValue(
        new Error("Discovery error"),
      );

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Trigger pipeline loading
      const command: RunnerCommand = {
        kind: "updateRootPath",
        path: "/error/path",
      };
      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load available pipelines:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("State Synchronization Across Services", () => {
    it("should maintain state consistency across multiple service operations", async () => {
      const stateHistory: UIState[] = [];
      controller.state$.subscribe((state) => stateHistory.push(state));

      // Execute multiple operations that should update state
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

      // Verify state changes were emitted in correct order
      expect(stateHistory.length).toBeGreaterThan(operations.length);
    });

    it("should handle concurrent state updates correctly", async () => {
      const task1 = createMockTask("task1", "Task 1");
      const task2 = createMockTask("task2", "Task 2");

      // Add tasks concurrently
      controller.send({ kind: "pipelineAddTask", newTask: task1 });
      controller.send({ kind: "pipelineAddTask", newTask: task2 });
      controller.send({ kind: "updateOutputFormat", format: "json" });

      const state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(2);
      expect(state.outputFormat).toBe("json");
    });

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
  });

  describe("Advanced Error Handling and Recovery", () => {
    it("should handle cascading service failures", async () => {
      mockPipelineService.savePipeline.mockRejectedValue(
        new Error("Save failed"),
      );
      mockPipelineService.listPipelines.mockRejectedValue(
        new Error("List failed"),
      );

      const tasks = [createMockTask("1", "test task")];
      const command: RunnerCommand = {
        kind: "savePipeline",
        name: "test-pipeline",
        description: "Test",
        tasks,
      };

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Failed to save pipeline: Error: Save failed",
      );
    });

    it("should recover from partial state corruption", async () => {
      // Simulate partial state update failure
      const mockStateCorruption = () => {
        const currentState = controller.getCurrentState();
        // Force a state with missing required properties
        (
          controller as unknown as {
            state$: { next: (state: unknown) => void };
          }
        ).state$.next({
          ...currentState,
          tasks: undefined, // Corrupt the tasks array
        });
      };

      mockStateCorruption();

      // Controller should handle the corruption gracefully
      const task = createMockTask("recovery-task", "Recovery task");
      expect(() => {
        controller.send({ kind: "pipelineAddTask", newTask: task });
      }).not.toThrow();

      const state = controller.getCurrentState();
      expect(Array.isArray(state.tasks)).toBe(true);
    });

    it("should handle service timeout scenarios", async () => {
      // Simulate service timeout
      mockClaudeCodeService.runTask.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100),
          ),
      );

      const command: RunnerCommand = { kind: "runTask", task: "timeout task" };
      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const state = controller.getCurrentState();
      expect(state.taskError).toBe(true);
      expect(state.lastTaskResults).toContain("Timeout");
    });

    it("should maintain error isolation between services", async () => {
      // One service fails
      mockUsageReportService.generateReport.mockRejectedValue(
        new Error("Usage service error"),
      );

      // Other service should still work
      mockLogsService.listProjects.mockResolvedValue([]);

      const callbacks: ControllerCallbacks = {
        onUsageReportError: jest.fn(),
        onLogProjectsData: jest.fn(),
      };
      controller.setCallbacks(callbacks);

      // Trigger both operations
      controller.send({ kind: "requestUsageReport", period: "today" });
      controller.send({ kind: "requestLogProjects" });

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Usage service should have failed
      expect(callbacks.onUsageReportError).toHaveBeenCalledWith(
        "Usage service error",
      );

      // Logs service should have succeeded
      expect(callbacks.onLogProjectsData).toHaveBeenCalledWith([]);
    });
  });

  describe("Event System Integration", () => {
    it("should properly dispatch events through callback system", async () => {
      const callbacks: ControllerCallbacks = {
        onUsageReportData: jest.fn(),
        onUsageReportError: jest.fn(),
        onLogProjectsData: jest.fn(),
        onLogConversationsData: jest.fn(),
        onCommandScanResult: jest.fn(),
      };

      controller.setCallbacks(callbacks);

      // Test each callback type
      const mockReport = {
        period: "today" as const,
        startDate: "2024-01-01",
        endDate: "2024-01-01",
        dailyReports: [],
        totals: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 150,
          costUSD: 0.1,
          models: ["claude-3-5-sonnet-20241022"],
        },
      };
      mockUsageReportService.generateReport.mockResolvedValue(mockReport);
      controller.send({ kind: "requestUsageReport", period: "today" });

      mockLogsService.listProjects.mockResolvedValue([]);
      controller.send({ kind: "requestLogProjects" });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(callbacks.onUsageReportData).toHaveBeenCalledWith(mockReport);
      expect(callbacks.onLogProjectsData).toHaveBeenCalledWith([]);
    });

    it("should handle event callback errors gracefully", async () => {
      const faultyCallback = jest.fn().mockImplementation(() => {
        throw new Error("Callback error");
      });

      const callbacks: ControllerCallbacks = {
        onUsageReportData: faultyCallback,
      };
      controller.setCallbacks(callbacks);

      const mockReport = {
        period: "today" as const,
        startDate: "2024-01-01",
        endDate: "2024-01-01",
        dailyReports: [],
        totals: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 150,
          costUSD: 0.1,
          models: ["claude-3-5-sonnet-20241022"],
        },
      };
      mockUsageReportService.generateReport.mockResolvedValue(mockReport);

      // Should not throw even if callback fails
      expect(() => {
        controller.send({ kind: "requestUsageReport", period: "today" });
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(faultyCallback).toHaveBeenCalled();
    });
  });

  describe("Complex Workflow Orchestration", () => {
    it("should handle complex multi-step workflow execution", async () => {
      const tasks = [
        createMockTask("step1", "Step 1"),
        createMockTask("step2", "Step 2"),
        createMockTask("step3", "Step 3"),
      ];

      const executionSteps: string[] = [];

      mockClaudeCodeService.runTaskPipeline.mockImplementation(
        async (_tasks, _model, _rootPath, _options, onProgress, onComplete) => {
          // Simulate step-by-step execution
          for (let i = 0; i < tasks.length; i++) {
            executionSteps.push(`step${i + 1}`);
            const updatedTasks = tasks.map((t, idx) => ({
              ...t,
              status: idx <= i ? ("completed" as const) : ("pending" as const),
            }));
            await onProgress(updatedTasks, i);
          }

          await onComplete(
            tasks.map((t) => ({ ...t, status: "completed" as const })),
          );
        },
      );

      controller.send({ kind: "runTasks", tasks });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(executionSteps).toEqual(["step1", "step2", "step3"]);

      const finalState = controller.getCurrentState();
      expect(finalState.status).toBe("idle");
      expect(finalState.taskCompleted).toBe(true);
      expect(finalState.taskError).toBe(false);
    });

    it("should handle pause and resume workflow cycles", async () => {
      // Test complete pause/resume cycle
      const pauseExecutionId = "test-execution-123";

      mockClaudeCodeService.getCurrentExecutionId.mockReturnValue(
        pauseExecutionId,
      );
      mockClaudeCodeService.pauseWorkflowExecution.mockResolvedValue({
        executionId: pauseExecutionId,
        workflowPath: "/test/workflow.yml",
        workflowName: "test-workflow",
        startTime: "2024-01-01T00:00:00Z",
        currentStep: 1,
        totalSteps: 3,
        status: "paused" as const,
        sessionMappings: {},
        completedSteps: [],
        execution: createMockWorkflowExecution(),
        canResume: true,
      });

      // Pause workflow
      controller.send({ kind: "pauseWorkflow" });
      await new Promise((resolve) => setTimeout(resolve, 0));

      let state = controller.getCurrentState();
      expect(state.isPaused).toBe(true);
      expect(state.currentExecutionId).toBe(pauseExecutionId);

      // Resume workflow
      mockClaudeCodeService.resumeWorkflowExecution.mockResolvedValue({
        executionId: pauseExecutionId,
        workflowPath: "/test/workflow.yml",
        workflowName: "test-workflow",
        startTime: "2024-01-01T00:00:00Z",
        currentStep: 2,
        totalSteps: 3,
        status: "running" as const,
        sessionMappings: {},
        completedSteps: [],
        execution: createMockWorkflowExecution(),
        canResume: true,
      });

      controller.send({
        kind: "resumeWorkflow",
        executionId: pauseExecutionId,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      state = controller.getCurrentState();
      expect(state.isPaused).toBe(false);
      expect(state.currentExecutionId).toBe(pauseExecutionId);
    });
  });

  describe("Commands Service Integration", () => {
    it("should handle scanCommands command", async () => {
      const { CommandsService } = await import(
        "../../../src/services/CommandsService"
      );
      const mockCommandsService = new CommandsService(mockContext);
      mockCommandsService.setRootPath = jest.fn();
      mockCommandsService.scanCommands = jest.fn().mockResolvedValue({
        globalCommands: [{ name: "global1", path: "/global/cmd1.md" }],
        projectCommands: [{ name: "project1", path: "/project/cmd1.md" }],
      });

      // Mock the constructor to return our mock
      jest
        .spyOn(CommandsService.prototype, "setRootPath")
        .mockImplementation(mockCommandsService.setRootPath);
      jest
        .spyOn(CommandsService.prototype, "scanCommands")
        .mockImplementation(mockCommandsService.scanCommands);

      const callbacks: ControllerCallbacks = {
        onCommandScanResult: jest.fn(),
      };
      controller.setCallbacks(callbacks);

      const command: RunnerCommand = {
        kind: "scanCommands",
        rootPath: "/test/root",
      };
      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(callbacks.onCommandScanResult).toHaveBeenCalledWith({
        globalCommands: [{ name: "global1", path: "/global/cmd1.md" }],
        projectCommands: [{ name: "project1", path: "/project/cmd1.md" }],
      });
    });

    it("should handle openFile command", async () => {
      const { CommandsService } = await import(
        "../../../src/services/CommandsService"
      );
      const mockCommandsService = new CommandsService(mockContext);
      mockCommandsService.openCommandFile = jest
        .fn()
        .mockResolvedValue(undefined);

      jest
        .spyOn(CommandsService.prototype, "openCommandFile")
        .mockImplementation(mockCommandsService.openCommandFile);

      const command: RunnerCommand = {
        kind: "openFile",
        path: "/path/to/file.md",
      };
      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockCommandsService.openCommandFile).toHaveBeenCalledWith(
        "/path/to/file.md",
      );
    });

    it("should handle createCommand command", async () => {
      const { CommandsService } = await import(
        "../../../src/services/CommandsService"
      );
      const mockCommandsService = new CommandsService(mockContext);
      mockCommandsService.setRootPath = jest.fn();
      mockCommandsService.createCommand = jest
        .fn()
        .mockResolvedValue(undefined);
      mockCommandsService.scanCommands = jest.fn().mockResolvedValue({
        globalCommands: [],
        projectCommands: [],
      });

      jest
        .spyOn(CommandsService.prototype, "setRootPath")
        .mockImplementation(mockCommandsService.setRootPath);
      jest
        .spyOn(CommandsService.prototype, "createCommand")
        .mockImplementation(mockCommandsService.createCommand);
      jest
        .spyOn(CommandsService.prototype, "scanCommands")
        .mockImplementation(mockCommandsService.scanCommands);

      const command: RunnerCommand = {
        kind: "createCommand",
        name: "test-command",
        isGlobal: true,
        rootPath: "/test/root",
      };
      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockCommandsService.setRootPath).toHaveBeenCalledWith(
        "/test/root",
      );
      expect(mockCommandsService.createCommand).toHaveBeenCalledWith(
        "test-command",
        true,
      );
      expect(mockCommandsService.scanCommands).toHaveBeenCalled();
    });

    it("should handle deleteCommand command with confirmation", async () => {
      const { CommandsService } = await import(
        "../../../src/services/CommandsService"
      );
      const mockCommandsService = new CommandsService(mockContext);
      mockCommandsService.deleteCommand = jest
        .fn()
        .mockResolvedValue(undefined);

      jest
        .spyOn(CommandsService.prototype, "deleteCommand")
        .mockImplementation(mockCommandsService.deleteCommand);

      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        "Delete",
      );

      const command: RunnerCommand = {
        kind: "deleteCommand",
        path: "/path/to/command.md",
      };
      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Are you sure you want to delete the command "command"?',
        { modal: true },
        "Delete",
      );
      expect(mockCommandsService.deleteCommand).toHaveBeenCalledWith(
        "/path/to/command.md",
      );
    });

    it("should handle deleteCommand command cancellation", async () => {
      const { CommandsService } = await import(
        "../../../src/services/CommandsService"
      );
      const mockCommandsService = new CommandsService(mockContext);
      mockCommandsService.deleteCommand = jest
        .fn()
        .mockResolvedValue(undefined);

      jest
        .spyOn(CommandsService.prototype, "deleteCommand")
        .mockImplementation(mockCommandsService.deleteCommand);

      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        undefined,
      ); // User cancelled

      const command: RunnerCommand = {
        kind: "deleteCommand",
        path: "/path/to/command.md",
      };
      controller.send(command);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockCommandsService.deleteCommand).not.toHaveBeenCalled();
    });
  });

  describe("Integration Test Coverage", () => {
    it("should handle comprehensive end-to-end workflow", async () => {
      // Simulate complete user workflow: configure -> add tasks -> execute -> complete
      const stateChanges: Partial<UIState>[] = [];
      controller.state$.subscribe((state) => {
        stateChanges.push({
          model: state.model,
          status: state.status,
          tasks: state.tasks,
          taskCompleted: state.taskCompleted,
          taskError: state.taskError,
        });
      });

      // 1. Configure settings
      controller.send({
        kind: "updateModel",
        model: "claude-3-5-haiku-20241022",
      });
      controller.send({ kind: "updateAllowAllTools", allow: true });
      controller.send({ kind: "updateRootPath", path: "/test/project" });

      // 2. Add pipeline tasks
      const task1 = createMockTask("task1", "Analyze code");
      const task2 = createMockTask("task2", "Generate documentation");
      controller.send({ kind: "pipelineAddTask", newTask: task1 });
      controller.send({ kind: "pipelineAddTask", newTask: task2 });

      // 3. Execute pipeline
      mockClaudeCodeService.runTaskPipeline.mockImplementation(
        async (_tasks, _model, _rootPath, _options, onProgress, onComplete) => {
          const executingTasks = [task1, task2].map((t) => ({
            ...t,
            status: "running" as const,
          }));
          await onProgress(executingTasks, 0);

          const completedTasks = [task1, task2].map((t) => ({
            ...t,
            status: "completed" as const,
          }));
          await onComplete(completedTasks);
        },
      );

      controller.send({ kind: "runTasks", tasks: [task1, task2] });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify end-to-end state progression
      const finalState = controller.getCurrentState();
      expect(finalState.model).toBe("claude-3-5-haiku-20241022");
      expect(finalState.allowAllTools).toBe(true);
      expect(finalState.rootPath).toBe("/test/project");
      expect(finalState.tasks).toHaveLength(2);
      expect(finalState.status).toBe("idle");
      expect(finalState.taskCompleted).toBe(true);
      expect(finalState.taskError).toBe(false);

      // Verify service coordination
      expect(mockPipelineService.setRootPath).toHaveBeenCalledWith(
        "/test/project",
      );
      expect(mockClaudeCodeService.runTaskPipeline).toHaveBeenCalledWith(
        [task1, task2],
        "claude-3-5-haiku-20241022",
        "/test/project",
        expect.objectContaining({ allowAllTools: true }),
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        undefined,
      );

      // Verify multiple state updates occurred
      expect(stateChanges.length).toBeGreaterThan(5);
    });

    it("should maintain service consistency during complex operations", async () => {
      // Test that all services remain in sync during complex multi-step operations
      const complexWorkflow = async () => {
        // Configuration changes
        controller.send({ kind: "updateRootPath", path: "/complex/project" });
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Pipeline operations
        const tasks = Array.from({ length: 5 }, (_, i) =>
          createMockTask(`task${i}`, `Task ${i + 1}`),
        );
        tasks.forEach((task) => {
          controller.send({ kind: "pipelineAddTask", newTask: task });
        });

        // Usage report request
        mockUsageReportService.generateReport.mockResolvedValue({
          period: "week" as const,
          startDate: "2024-01-01",
          endDate: "2024-01-07",
          dailyReports: [],
          totals: {
            inputTokens: 1000,
            outputTokens: 500,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 1500,
            costUSD: 1.5,
            models: ["claude-3-5-sonnet-20241022"],
          },
        });

        const callbacks: ControllerCallbacks = {
          onUsageReportData: jest.fn(),
        };
        controller.setCallbacks(callbacks);

        controller.send({ kind: "requestUsageReport", period: "week" });
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Verify all services were called appropriately
        expect(mockPipelineService.setRootPath).toHaveBeenCalledWith(
          "/complex/project",
        );
        expect(mockUsageReportService.generateReport).toHaveBeenCalledWith(
          "week",
          undefined,
          undefined,
        );
        expect(callbacks.onUsageReportData).toHaveBeenCalled();

        const finalState = controller.getCurrentState();
        expect(finalState.rootPath).toBe("/complex/project");
        expect(finalState.tasks).toHaveLength(5);
      };

      await expect(complexWorkflow()).resolves.not.toThrow();
    });

    it("should handle memory management during long-running operations", () => {
      // Verify that state updates don't cause memory leaks
      const initialSubscriberCount =
        (controller.state$ as unknown as { observers?: unknown[] }).observers
          ?.length ?? 0;

      // Create multiple subscriptions
      const subscriptions = Array.from({ length: 10 }, () =>
        controller.state$.subscribe(() => {}),
      );

      // Execute many state updates
      for (let i = 0; i < 50; i++) {
        controller.send({ kind: "updateChatPrompt", prompt: `prompt ${i}` });
      }

      // Clean up subscriptions
      subscriptions.forEach((sub) => sub.unsubscribe());

      const finalSubscriberCount =
        (controller.state$ as unknown as { observers?: unknown[] }).observers
          ?.length ?? 0;
      expect(finalSubscriberCount).toBe(initialSubscriberCount);
    });
  });
});
