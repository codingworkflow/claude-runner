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
import { RunnerCommand } from "../../../src/types/runner";

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

jest.mock("../../../src/services/ClaudeCodeService");
jest.mock("../../../src/services/ClaudeService");
jest.mock("../../../src/services/TerminalService");
jest.mock("../../../src/services/ConfigurationService");
jest.mock("../../../src/services/PipelineService");
jest.mock("../../../src/services/UsageReportService");
jest.mock("../../../src/services/ClaudeVersionService");
jest.mock("../../../src/services/LogsService");
jest.mock("../../../src/services/CommandsService");

describe("RunnerController - Command Handling", () => {
  let controller: RunnerController;
  let mockContext: jest.Mocked<vscode.ExtensionContext>;
  let mockClaudeCodeService: jest.Mocked<ClaudeCodeService>;
  let mockTerminalService: jest.Mocked<TerminalService>;
  let mockConfigService: jest.Mocked<ConfigurationService>;
  let mockPipelineService: jest.Mocked<PipelineService>;

  const createMockTask = (id: string, prompt: string): TaskItem => ({
    id,
    prompt,
    status: "pending",
    name: `Task ${id}`,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      globalState: {
        get: jest.fn(() => ({ isInstalled: true, version: "1.0.0" })),
        update: jest.fn(),
      },
      workspaceState: {
        get: jest.fn(() => "chat"),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<vscode.ExtensionContext>;

    mockClaudeCodeService = {
      runTask: jest.fn(),
      runTaskPipeline: jest.fn(),
      cancelCurrentTask: jest.fn(),
      isTaskRunning: jest.fn(() => false),
      getCurrentExecutionId: jest.fn(() => null),
      pauseWorkflowExecution: jest.fn(),
      resumeWorkflowExecution: jest.fn(),
      pausePipelineExecution: jest.fn(),
      resumePipelineExecution: jest.fn(),
      deleteWorkflowState: jest.fn(),
      executeCommand: jest.fn(),
      getResumableWorkflows: jest.fn(() => Promise.resolve([])),
    } as unknown as jest.Mocked<ClaudeCodeService>;

    mockTerminalService = {
      runInteractive: jest.fn(),
    } as unknown as jest.Mocked<TerminalService>;

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

    mockPipelineService = {
      setRootPath: jest.fn(),
      listPipelines: jest.fn(() => Promise.resolve([])),
      discoverWorkflowFiles: jest.fn(() => Promise.resolve([])),
      savePipeline: jest.fn(),
      loadPipeline: jest.fn(),
      loadWorkflowFromFile: jest.fn(),
      workflowToTaskItems: jest.fn(() => []),
    } as unknown as jest.Mocked<PipelineService>;

    controller = new RunnerController(
      mockContext,
      mockClaudeCodeService,
      {} as ClaudeService,
      mockTerminalService,
      mockConfigService,
      mockPipelineService,
      {} as UsageReportService,
      {} as ClaudeVersionService,
      {} as LogsService,
    );
  });

  describe("Interactive Commands", () => {
    it("should handle startInteractive command", async () => {
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

    it("should handle startInteractive without prompt", async () => {
      const command: RunnerCommand = { kind: "startInteractive" };

      mockTerminalService.runInteractive.mockResolvedValue(
        {} as vscode.Terminal,
      );

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockTerminalService.runInteractive).toHaveBeenCalledWith(
        "claude-3-5-sonnet-20241022",
        "/test/path",
        false,
        undefined,
      );
    });

    it("should handle startInteractive errors", async () => {
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
  });

  describe("Task Execution Commands", () => {
    it("should handle runTask command", async () => {
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

    it("should handle runTasks command", async () => {
      const tasks = [createMockTask("1", "task 1")];
      const command: RunnerCommand = {
        kind: "runTasks",
        tasks,
        outputFormat: "text",
      };

      mockClaudeCodeService.runTaskPipeline.mockResolvedValue(undefined);

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.runTaskPipeline).toHaveBeenCalledWith(
        tasks,
        "claude-3-5-sonnet-20241022",
        "/test/path",
        expect.objectContaining({
          outputFormat: "text",
        }),
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        undefined,
      );
    });

    it("should handle cancelTask command", async () => {
      const command: RunnerCommand = { kind: "cancelTask" };

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.cancelCurrentTask).toHaveBeenCalled();
    });

    it("should handle cancelTask errors", async () => {
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
  });

  describe("Workflow Control Commands", () => {
    it("should handle pauseWorkflow command", async () => {
      const command: RunnerCommand = {
        kind: "pauseWorkflow",
        executionId: "exec-1",
      };

      const mockPausedState = {
        executionId: "exec-1",
        workflowPath: "/test/workflow.yml",
        workflowName: "test-workflow",
        startTime: "2024-01-01T00:00:00Z",
        currentStep: 1,
        totalSteps: 3,
        status: "paused" as const,
        sessionMappings: {},
        completedSteps: [],
        execution: {} as any,
        canResume: true,
      };

      mockClaudeCodeService.pauseWorkflowExecution.mockResolvedValue(
        mockPausedState,
      );

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.pauseWorkflowExecution).toHaveBeenCalledWith(
        "exec-1",
      );
    });

    it("should handle resumeWorkflow command", async () => {
      const command: RunnerCommand = {
        kind: "resumeWorkflow",
        executionId: "exec-1",
      };

      const mockResumedState = {
        executionId: "exec-1",
        workflowPath: "/test/workflow.yml",
        workflowName: "test-workflow",
        startTime: "2024-01-01T00:00:00Z",
        currentStep: 2,
        totalSteps: 3,
        status: "running" as const,
        sessionMappings: {},
        completedSteps: [],
        execution: {} as any,
        canResume: true,
      };

      mockClaudeCodeService.resumeWorkflowExecution.mockResolvedValue(
        mockResumedState,
      );

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        mockClaudeCodeService.resumeWorkflowExecution,
      ).toHaveBeenCalledWith("exec-1");
    });

    it("should handle pausePipeline command", async () => {
      const command: RunnerCommand = { kind: "pausePipeline" };

      mockClaudeCodeService.pausePipelineExecution.mockResolvedValue(
        "pipeline-1",
      );

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.pausePipelineExecution).toHaveBeenCalled();
    });

    it("should handle resumePipeline command", async () => {
      const command: RunnerCommand = {
        kind: "resumePipeline",
        pipelineId: "pipeline-1",
      };

      mockClaudeCodeService.resumePipelineExecution.mockResolvedValue(true);

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        mockClaudeCodeService.resumePipelineExecution,
      ).toHaveBeenCalledWith("pipeline-1");
    });

    it("should handle getResumableWorkflows command", async () => {
      const command: RunnerCommand = { kind: "getResumableWorkflows" };

      const mockWorkflows = [
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
      ];

      mockClaudeCodeService.getResumableWorkflows.mockResolvedValue(
        mockWorkflows,
      );

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClaudeCodeService.getResumableWorkflows).toHaveBeenCalled();
    });

    it("should handle deleteWorkflowState command", async () => {
      const command: RunnerCommand = {
        kind: "deleteWorkflowState",
        executionId: "exec-1",
      };

      mockClaudeCodeService.deleteWorkflowState.mockResolvedValue();

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

  describe("Configuration Commands", () => {
    it("should handle updateModel command", () => {
      const command: RunnerCommand = {
        kind: "updateModel",
        model: "claude-3-5-haiku-20241022",
      };

      controller.send(command);

      const state = controller.getCurrentState();
      expect(state.model).toBe("claude-3-5-haiku-20241022");
    });

    it("should prevent model change when task is running", () => {
      mockClaudeCodeService.isTaskRunning.mockReturnValue(true);

      const command: RunnerCommand = {
        kind: "updateModel",
        model: "claude-3-5-haiku-20241022",
      };

      controller.send(command);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Cannot change model while a task is running. Please cancel the current task first.",
      );

      const state = controller.getCurrentState();
      expect(state.model).toBe("claude-3-5-sonnet-20241022");
    });

    it("should handle updateRootPath command", async () => {
      const command: RunnerCommand = {
        kind: "updateRootPath",
        path: "/new/path",
      };

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.setRootPath).toHaveBeenCalledWith("/new/path");
      const state = controller.getCurrentState();
      expect(state.rootPath).toBe("/new/path");
    });

    it("should handle updateAllowAllTools command", () => {
      const command: RunnerCommand = {
        kind: "updateAllowAllTools",
        allow: true,
      };

      controller.send(command);

      const state = controller.getCurrentState();
      expect(state.allowAllTools).toBe(true);
    });

    it("should handle updateActiveTab command", () => {
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

    it("should handle updateChatPrompt command", () => {
      const command: RunnerCommand = {
        kind: "updateChatPrompt",
        prompt: "test prompt",
      };

      controller.send(command);

      const state = controller.getCurrentState();
      expect(state.chatPrompt).toBe("test prompt");
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
  });

  describe("Pipeline Management Commands", () => {
    it("should handle savePipeline command", async () => {
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

    it("should handle loadPipeline command", async () => {
      const command: RunnerCommand = {
        kind: "loadPipeline",
        name: "test-pipeline",
      };

      const mockWorkflow = { name: "test-pipeline", jobs: {} };
      const mockTasks = [createMockTask("1", "Test task")];

      mockPipelineService.loadPipeline.mockResolvedValue(mockWorkflow);
      mockPipelineService.workflowToTaskItems.mockReturnValue(mockTasks);

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.loadPipeline).toHaveBeenCalledWith(
        "test-pipeline",
      );
    });

    it("should handle loadWorkflow command", async () => {
      const command: RunnerCommand = {
        kind: "loadWorkflow",
        workflowId: "/.github/workflows/test.yml",
      };

      const mockWorkflow = { name: "test-workflow", jobs: {} };
      const mockTasks = [createMockTask("1", "Workflow task")];

      mockPipelineService.loadWorkflowFromFile.mockResolvedValue(mockWorkflow);
      mockPipelineService.workflowToTaskItems.mockReturnValue(mockTasks);

      controller.send(command);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.loadWorkflowFromFile).toHaveBeenCalledWith(
        "/.github/workflows/test.yml",
      );
    });

    it("should handle pipelineAddTask command", () => {
      const newTask = createMockTask("new-task", "New task");
      const command: RunnerCommand = {
        kind: "pipelineAddTask",
        newTask,
      };

      controller.send(command);

      const state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].prompt).toBe("New task");
    });

    it("should handle pipelineRemoveTask command", () => {
      const task = createMockTask("task-1", "Task to remove");

      controller.send({ kind: "pipelineAddTask", newTask: task });
      controller.send({ kind: "pipelineRemoveTask", taskId: task.id });

      const state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(0);
    });

    it("should handle pipelineClearAll command", () => {
      const task1 = createMockTask("task-1", "Task 1");
      const task2 = createMockTask("task-2", "Task 2");

      controller.send({ kind: "pipelineAddTask", newTask: task1 });
      controller.send({ kind: "pipelineAddTask", newTask: task2 });
      controller.send({ kind: "pipelineClearAll" });

      const state = controller.getCurrentState();
      expect(state.tasks).toHaveLength(0);
    });

    it("should handle pipelineUpdateTaskField command", () => {
      const task = createMockTask("task-1", "Original prompt");

      controller.send({ kind: "pipelineAddTask", newTask: task });
      controller.send({
        kind: "pipelineUpdateTaskField",
        taskId: task.id,
        field: "prompt",
        value: "Updated prompt",
      });

      const state = controller.getCurrentState();
      expect(state.tasks[0].prompt).toBe("Updated prompt");
    });
  });

  describe("Unknown Command Handling", () => {
    it("should handle unknown commands gracefully", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      const command = { kind: "unknownCommand" } as unknown as RunnerCommand;

      controller.send(command);

      expect(consoleSpy).toHaveBeenCalledWith("Unknown command:", command);
      consoleSpy.mockRestore();
    });

    it("should handle webviewError command", () => {
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
});
