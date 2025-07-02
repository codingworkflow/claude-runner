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
import { CommandsService } from "../../../src/services/CommandsService";
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
jest.mock("../../../src/services/ClaudeDetectionService");
jest.mock("../../../src/services/CommandsService");

describe("RunnerController - Service Integration", () => {
  let controller: RunnerController;
  let mockContext: jest.Mocked<vscode.ExtensionContext>;
  let mockClaudeCodeService: jest.Mocked<ClaudeCodeService>;
  let mockTerminalService: jest.Mocked<TerminalService>;
  let mockConfigService: jest.Mocked<ConfigurationService>;
  let mockPipelineService: jest.Mocked<PipelineService>;
  let mockUsageReportService: jest.Mocked<UsageReportService>;
  let mockLogsService: jest.Mocked<LogsService>;

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
      isWorkflowPaused: jest.fn(() => false),
      getPausedPipelines: jest.fn(() => []),
      getResumableWorkflows: jest.fn(() => Promise.resolve([])),
      pauseWorkflowExecution: jest.fn(),
      resumeWorkflowExecution: jest.fn(),
      pausePipelineExecution: jest.fn(),
      resumePipelineExecution: jest.fn(),
      deleteWorkflowState: jest.fn(),
      executeCommand: jest.fn(),
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
      listPipelines: jest.fn(() => Promise.resolve(["pipeline1", "pipeline2"])),
      discoverWorkflowFiles: jest.fn(() =>
        Promise.resolve([
          { name: "workflow1", path: "/workflows/workflow1.yml" },
        ]),
      ),
      savePipeline: jest.fn(),
      loadPipeline: jest.fn(),
      loadWorkflowFromFile: jest.fn(),
      workflowToTaskItems: jest.fn(() => []),
      deletePipeline: jest.fn(),
    } as unknown as jest.Mocked<PipelineService>;

    mockUsageReportService = {
      generateReport: jest.fn(),
    } as unknown as jest.Mocked<UsageReportService>;

    mockLogsService = {
      listProjects: jest.fn(),
      listConversations: jest.fn(),
      loadConversation: jest.fn(),
    } as unknown as jest.Mocked<LogsService>;

    controller = new RunnerController(
      mockContext,
      mockClaudeCodeService,
      {} as ClaudeService,
      mockTerminalService,
      mockConfigService,
      mockPipelineService,
      mockUsageReportService,
      {} as ClaudeVersionService,
      mockLogsService,
    );
  });

  describe("Service Lifecycle Management", () => {
    it("should properly initialize and set up service dependencies", async () => {
      // Verify initial service setup calls were made
      expect(mockPipelineService.setRootPath).toHaveBeenCalledWith(
        "/test/path",
      );
      expect(vscode.workspace.onDidChangeWorkspaceFolders).toHaveBeenCalled();

      // Wait for initial async operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockPipelineService.listPipelines).toHaveBeenCalled();
      expect(mockPipelineService.discoverWorkflowFiles).toHaveBeenCalled();
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

  describe("Service Coordination", () => {
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
  });

  describe("Error Handling and Recovery", () => {
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
  });

  describe("Complex Workflow Integration", () => {
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

    it("should handle pipeline execution with pause detection", async () => {
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
  });

  describe("External Service Integration", () => {
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

    it("should handle Claude detection errors gracefully", async () => {
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

    it("should handle commands service integration", async () => {
      jest.spyOn(CommandsService.prototype, "scanCommands").mockResolvedValue({
        globalCommands: [
          {
            name: "global1",
            path: "/global/cmd1.md",
            description: "Global command 1",
            isProject: false,
          },
        ],
        projectCommands: [
          {
            name: "project1",
            path: "/project/cmd1.md",
            description: "Project command 1",
            isProject: true,
          },
        ],
      });

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
        globalCommands: [
          {
            name: "global1",
            path: "/global/cmd1.md",
            description: "Global command 1",
            isProject: false,
          },
        ],
        projectCommands: [
          {
            name: "project1",
            path: "/project/cmd1.md",
            description: "Project command 1",
            isProject: true,
          },
        ],
      });
    });
  });

  describe("End-to-End Workflow", () => {
    it("should handle comprehensive end-to-end workflow", async () => {
      // Simulate complete user workflow: configure -> add tasks -> execute -> complete
      const stateChanges: any[] = [];
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
  });

  describe("Workspace Integration", () => {
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
});
