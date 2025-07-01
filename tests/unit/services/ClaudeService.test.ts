import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

import { ClaudeService } from "../../../src/services/ClaudeService";
import { TaskItem, TaskResult } from "../../../src/core/models/Task";
import { WorkflowExecution } from "../../../src/types/WorkflowTypes";
import { WorkflowService } from "../../../src/services/WorkflowService";

// Mock all dependencies
jest.mock("../../../src/core/services/ClaudeExecutor");
jest.mock("../../../src/adapters/vscode");
jest.mock("../../../src/core/services/ConfigManager");
jest.mock("../../../src/services/ClaudeDetectionService");
jest.mock("../../../src/services/WorkflowService");

// Import mocked modules
import { ClaudeExecutor } from "../../../src/core/services/ClaudeExecutor";
import { VSCodeLogger, VSCodeConfigSource } from "../../../src/adapters/vscode";
import { ConfigManager } from "../../../src/core/services/ConfigManager";
import { ClaudeDetectionService } from "../../../src/services/ClaudeDetectionService";

// Create typed mock objects with explicit any typing for jest compatibility
const mockClaudeExecutor = {
  executeTask: jest.fn() as any,
  executePipeline: jest.fn() as any,
  resumePipeline: jest.fn() as any,
  cancelCurrentTask: jest.fn() as any,
  isTaskRunning: jest.fn() as any,
  validateClaudeCommand: jest.fn() as any,
  formatCommandPreview: jest.fn() as any,
};

const mockConfigManager = {
  addSource: jest.fn() as any,
  validateModel: jest.fn() as any,
};

const mockWorkflowService = {
  getExecutionSteps: jest.fn() as any,
  resolveStepVariables: jest.fn() as any,
  updateExecutionOutput: jest.fn() as any,
};

// Mock implementations
const MockedClaudeExecutor = ClaudeExecutor as jest.MockedClass<
  typeof ClaudeExecutor
>;
const MockedVSCodeLogger = VSCodeLogger as jest.MockedClass<
  typeof VSCodeLogger
>;
const MockedVSCodeConfigSource = VSCodeConfigSource as jest.MockedClass<
  typeof VSCodeConfigSource
>;
const MockedConfigManager = ConfigManager as jest.MockedClass<
  typeof ConfigManager
>;
const MockedClaudeDetectionService = ClaudeDetectionService as jest.Mocked<
  typeof ClaudeDetectionService
>;
const MockedWorkflowService = WorkflowService as jest.MockedClass<
  typeof WorkflowService
>;

// Setup constructor implementations
MockedClaudeExecutor.mockImplementation(() => mockClaudeExecutor as any);
MockedVSCodeLogger.mockImplementation(() => ({}) as any);
MockedVSCodeConfigSource.mockImplementation(() => ({}) as any);
MockedConfigManager.mockImplementation(() => mockConfigManager as any);
MockedWorkflowService.mockImplementation(() => mockWorkflowService as any);

describe("ClaudeService", () => {
  let service: ClaudeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClaudeService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with VSCode adapters and executor", () => {
      expect(MockedVSCodeLogger).toHaveBeenCalled();
      expect(MockedVSCodeConfigSource).toHaveBeenCalled();
      expect(mockConfigManager.addSource).toHaveBeenCalled();
      expect(MockedClaudeExecutor).toHaveBeenCalledWith(
        expect.any(Object),
        mockConfigManager,
      );
    });
  });

  describe("checkInstallation", () => {
    it("should check Claude installation and succeed when found", async () => {
      MockedClaudeDetectionService.detectClaude.mockResolvedValue({
        isInstalled: true,
        version: "Claude 1.0.0",
        shell: "bash",
      });

      await expect(service.checkInstallation()).resolves.toBeUndefined();
      expect(MockedClaudeDetectionService.detectClaude).toHaveBeenCalledWith(
        "auto",
      );
    });

    it("should throw error when Claude is not installed", async () => {
      MockedClaudeDetectionService.detectClaude.mockResolvedValue({
        isInstalled: false,
        error: "Command not found",
      });

      await expect(service.checkInstallation()).rejects.toThrow(
        "Claude Code CLI not found in PATH. Please install Claude Code.",
      );
    });

    it("should handle detection service errors", async () => {
      MockedClaudeDetectionService.detectClaude.mockRejectedValue(
        new Error("Detection failed"),
      );

      await expect(service.checkInstallation()).rejects.toThrow(
        "Detection failed",
      );
    });
  });

  describe("executeTask", () => {
    const mockTaskResult: TaskResult = {
      taskId: "test-task",
      success: true,
      output: "Task completed",
      executionTimeMs: 1000,
    };

    it("should execute task with correct parameters", async () => {
      mockClaudeExecutor.executeTask.mockResolvedValue(mockTaskResult);

      const result = await service.executeTask(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );

      expect(mockClaudeExecutor.executeTask).toHaveBeenCalledWith(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );
      expect(result).toEqual(mockTaskResult);
    });

    it("should execute task with default options", async () => {
      mockClaudeExecutor.executeTask.mockResolvedValue(mockTaskResult);

      const result = await service.executeTask(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );

      expect(mockClaudeExecutor.executeTask).toHaveBeenCalledWith(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        {},
      );
      expect(result).toEqual(mockTaskResult);
    });

    it("should handle task execution errors", async () => {
      const error = new Error("Execution failed");
      mockClaudeExecutor.executeTask.mockRejectedValue(error);

      await expect(
        service.executeTask(
          "test prompt",
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).rejects.toThrow("Execution failed");
    });
  });

  describe("executePipeline", () => {
    const mockTasks: TaskItem[] = [
      {
        id: "task1",
        prompt: "First task",
        status: "pending",
      },
      {
        id: "task2",
        prompt: "Second task",
        status: "pending",
      },
    ];

    it("should execute pipeline with all parameters", async () => {
      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockClaudeExecutor.executePipeline.mockResolvedValue(undefined);

      await service.executePipeline(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
        onProgress,
        onComplete,
        onError,
      );

      expect(mockClaudeExecutor.executePipeline).toHaveBeenCalledWith(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
        onProgress,
        onComplete,
        onError,
        expect.any(Function), // pauseHandler
        expect.any(Function), // onPausedHandler
      );
    });

    it("should execute pipeline with default options", async () => {
      mockClaudeExecutor.executePipeline.mockResolvedValue(undefined);

      await service.executePipeline(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );

      expect(mockClaudeExecutor.executePipeline).toHaveBeenCalledWith(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        {},
        undefined,
        undefined,
        undefined,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it("should handle pipeline execution errors", async () => {
      const error = new Error("Pipeline failed");
      mockClaudeExecutor.executePipeline.mockRejectedValue(error);

      await expect(
        service.executePipeline(
          mockTasks,
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).rejects.toThrow("Pipeline failed");
    });
  });

  describe("executeWorkflow", () => {
    const mockWorkflow = {
      name: "test-workflow",
      jobs: {
        "test-job": {
          steps: [
            {
              id: "step1",
              uses: "claude-pipeline-action",
              with: {
                prompt: "Test prompt",
                model: "claude-3-5-sonnet-20241022",
                allow_all_tools: true,
              },
            },
          ],
        },
      },
    };

    const mockExecution: WorkflowExecution = {
      workflow: mockWorkflow,
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "pending",
    };

    it("should execute workflow successfully", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockWorkflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: {
          prompt: "Test prompt",
          model: "claude-3-5-sonnet-20241022",
          allow_all_tools: true,
        },
      });

      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "step1",
        success: true,
        output: "Step completed",
        executionTimeMs: 1000,
        sessionId: "session-123",
      });

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onStepProgress).toHaveBeenCalledWith("step1", "running");
      expect(onStepProgress).toHaveBeenCalledWith("step1", "completed", {
        result: "Step completed",
      });
      expect(onComplete).toHaveBeenCalled();
      expect(mockExecution.status).toBe("completed");
    });

    it("should handle workflow execution errors", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockWorkflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: {
          prompt: "Test prompt",
          model: "claude-3-5-sonnet-20241022",
        },
      });

      mockClaudeExecutor.executeTask.mockRejectedValue(
        new Error("Task failed"),
      );

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onStepProgress).toHaveBeenCalledWith("step1", "running");
      expect(onStepProgress).toHaveBeenCalledWith("step1", "failed", {
        result: "Task failed",
      });
      expect(onError).toHaveBeenCalledWith("Task failed");
      expect(mockExecution.status).toBe("failed");
      expect(mockExecution.error).toBe("Task failed");
    });

    it("should handle step with failed task result", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockWorkflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: {
          prompt: "Test prompt",
        },
      });

      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "step1",
        success: false,
        output: "",
        error: "Task execution failed",
        executionTimeMs: 1000,
      });

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onStepProgress).toHaveBeenCalledWith("step1", "failed", {
        result: "Task execution failed",
      });
      expect(onError).toHaveBeenCalledWith("Task execution failed");
    });

    it("should include session ID in output when requested", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockWorkflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: {
          prompt: "Test prompt",
          output_session: true,
        },
      });

      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "step1",
        success: true,
        output: "Step completed",
        executionTimeMs: 1000,
        sessionId: "session-123",
      });

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onStepProgress).toHaveBeenCalledWith("step1", "completed", {
        result: "Step completed",
        session_id: "session-123",
      });
    });

    it("should generate step ID when not provided", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const stepWithoutId = {
        uses: "claude-pipeline-action",
        with: {
          prompt: "Test prompt",
        },
      };

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: stepWithoutId, index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue(stepWithoutId);

      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "step-0",
        success: true,
        output: "Step completed",
        executionTimeMs: 1000,
      });

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onStepProgress).toHaveBeenCalledWith("step-0", "running");
      expect(onStepProgress).toHaveBeenCalledWith("step-0", "completed", {
        result: "Step completed",
      });
    });
  });

  describe("task management", () => {
    it("should cancel current task", () => {
      service.cancelCurrentTask();
      expect(mockClaudeExecutor.cancelCurrentTask).toHaveBeenCalled();
    });

    it("should check if task is running", () => {
      mockClaudeExecutor.isTaskRunning.mockReturnValue(true);
      expect(service.isTaskRunning()).toBe(true);

      mockClaudeExecutor.isTaskRunning.mockReturnValue(false);
      expect(service.isTaskRunning()).toBe(false);
    });
  });

  describe("command validation", () => {
    it("should validate Claude command", async () => {
      mockClaudeExecutor.validateClaudeCommand.mockResolvedValue(true);

      const result = await service.validateClaudeCommand(
        "claude-3-5-sonnet-20241022",
      );

      expect(mockClaudeExecutor.validateClaudeCommand).toHaveBeenCalledWith(
        "claude-3-5-sonnet-20241022",
      );
      expect(result).toBe(true);
    });

    it("should format command preview", () => {
      const mockPreview =
        "claude --model claude-3-5-sonnet-20241022 --prompt 'test'";
      mockClaudeExecutor.formatCommandPreview.mockReturnValue(mockPreview);

      const result = service.formatCommandPreview(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );

      expect(mockClaudeExecutor.formatCommandPreview).toHaveBeenCalledWith(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );
      expect(result).toBe(mockPreview);
    });
  });

  describe("model validation", () => {
    it("should validate auto model", () => {
      expect(service.isValidModelId("auto")).toBe(true);
    });

    it("should validate model using config manager", () => {
      mockConfigManager.validateModel.mockReturnValue(true);
      expect(service.isValidModelId("claude-3-5-sonnet-20241022")).toBe(true);

      mockConfigManager.validateModel.mockReturnValue(false);
      expect(service.isValidModelId("invalid-model")).toBe(false);

      expect(mockConfigManager.validateModel).toHaveBeenCalledWith(
        "claude-3-5-sonnet-20241022",
      );
      expect(mockConfigManager.validateModel).toHaveBeenCalledWith(
        "invalid-model",
      );
    });
  });

  describe("pipeline pause/resume", () => {
    it("should pause pipeline execution", async () => {
      const pipelineId = await service.pausePipelineExecution();

      expect(pipelineId).toMatch(/^pipeline-\d+-[a-z0-9]{9}$/);
    });

    it("should resume pipeline execution successfully", async () => {
      // First pause a pipeline to set up the state
      await service.pausePipelineExecution();

      // Mock the onPipelinePaused callback to store pipeline data
      const mockTasks: TaskItem[] = [
        { id: "task1", prompt: "Task 1", status: "pending" },
        { id: "task2", prompt: "Task 2", status: "pending" },
      ];
      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      // Simulate pipeline being paused by calling the internal method
      const pausedId = "pipeline-123-abc";
      (service as any).pausedPipelines.set(pausedId, {
        tasks: mockTasks,
        currentIndex: 1,
        resetTime: Date.now(),
        onProgress,
        onComplete,
        onError,
      });

      mockClaudeExecutor.resumePipeline.mockResolvedValue(undefined);

      const result = await service.resumePipelineExecution(pausedId);

      expect(result).toBe(true);
      expect(mockClaudeExecutor.resumePipeline).toHaveBeenCalledWith(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "./",
        {},
        onProgress,
        onComplete,
        onError,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it("should fail to resume non-existent pipeline", async () => {
      const result = await service.resumePipelineExecution("non-existent-id");
      expect(result).toBe(false);
    });

    it("should get paused pipelines list", () => {
      const mockData = {
        tasks: [{ id: "task1", prompt: "Task 1", status: "pending" as const }],
        currentIndex: 0,
        resetTime: 1234567890,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      (service as any).pausedPipelines.set("pipeline-123", mockData);

      const pipelines = service.getPausedPipelines();

      expect(pipelines).toEqual([
        {
          id: "pipeline-123",
          pausedAt: 1234567890,
          taskCount: 1,
        },
      ]);
    });

    it("should handle pipeline pause callback correctly", async () => {
      const mockTasks: TaskItem[] = [
        { id: "task1", prompt: "Task 1", status: "pending" },
      ];
      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      // Call the private method through pipeline execution
      mockClaudeExecutor.executePipeline.mockImplementation(
        async (
          tasks,
          model,
          workingDir,
          options,
          onProgressCb,
          onCompleteCb,
          onErrorCb,
          pauseHandler,
          onPausedHandler,
        ) => {
          // Simulate a pause
          if (typeof onPausedHandler === "function") {
            onPausedHandler(mockTasks, 0);
          }
        },
      );

      await service.executePipeline(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        {},
        onProgress,
        onComplete,
        onError,
      );

      const pipelines = service.getPausedPipelines();
      expect(pipelines.length).toBe(1);
      expect(pipelines[0].taskCount).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should handle string errors in workflow execution", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const mockExecution: WorkflowExecution = {
        workflow: {
          name: "test",
          jobs: {
            "test-job": {
              steps: [
                {
                  id: "step1",
                  uses: "claude-pipeline-action",
                  with: { prompt: "test" },
                },
              ],
            },
          },
        },
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "pending",
      };

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockExecution.workflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: { prompt: "test" },
      });

      // Simulate a non-Error rejection
      mockClaudeExecutor.executeTask.mockRejectedValue("String error");

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onError).toHaveBeenCalledWith("String error");
      expect(mockExecution.error).toBe("String error");
    });

    it("should handle errors in workflow service methods", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const mockExecution: WorkflowExecution = {
        workflow: {
          name: "test",
          jobs: {},
        },
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "pending",
      };

      mockWorkflowService.getExecutionSteps.mockImplementation(() => {
        throw new Error("Workflow service error");
      });

      // The getExecutionSteps call is outside the try-catch in the current implementation,
      // so it will throw directly
      await expect(
        service.executeWorkflow(
          mockExecution,
          mockWorkflowService as any,
          "claude-3-5-sonnet-20241022",
          "/workspace",
          onStepProgress,
          onComplete,
          onError,
        ),
      ).rejects.toThrow("Workflow service error");
    });

    it("should handle executor validation errors gracefully", async () => {
      mockClaudeExecutor.validateClaudeCommand.mockRejectedValue(
        new Error("Validation service unavailable"),
      );

      await expect(
        service.validateClaudeCommand("claude-3-5-sonnet-20241022"),
      ).rejects.toThrow("Validation service unavailable");
    });

    it("should handle executor command preview errors", () => {
      mockClaudeExecutor.formatCommandPreview.mockImplementation(() => {
        throw new Error("Preview generation failed");
      });

      expect(() =>
        service.formatCommandPreview(
          "test",
          "claude-3-5-sonnet-20241022",
          "/workspace",
          {},
        ),
      ).toThrow("Preview generation failed");
    });

    it("should handle config manager errors in model validation", () => {
      mockConfigManager.validateModel.mockImplementation(() => {
        throw new Error("Config validation error");
      });

      expect(() => service.isValidModelId("test-model")).toThrow(
        "Config validation error",
      );
    });

    it("should handle task result without error message", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const mockExecution: WorkflowExecution = {
        workflow: {
          name: "test",
          jobs: {
            "test-job": {
              steps: [
                {
                  id: "step1",
                  uses: "claude-pipeline-action",
                  with: { prompt: "test" },
                },
              ],
            },
          },
        },
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "pending",
      };

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockExecution.workflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: { prompt: "test" },
      });

      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "step1",
        success: false,
        output: "",
        executionTimeMs: 1000,
      });

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onError).toHaveBeenCalledWith("Task execution failed");
      expect(mockExecution.error).toBe("Task execution failed");
    });
  });

  describe("service lifecycle", () => {
    it("should maintain internal state correctly", () => {
      expect(service.isTaskRunning()).toBeDefined();
      expect(service.getPausedPipelines()).toEqual([]);
    });

    it("should handle multiple concurrent operations", async () => {
      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "concurrent-test",
        success: true,
        output: "Concurrent execution",
        executionTimeMs: 500,
      });

      const promises = [
        service.executeTask(
          "task1",
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
        service.executeTask(
          "task2",
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
        service.executeTask(
          "task3",
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.output).toBe("Concurrent execution");
      });
    });

    it("should handle service initialization with proper dependency injection", () => {
      new ClaudeService();

      expect(MockedVSCodeLogger).toHaveBeenCalled();
      expect(MockedVSCodeConfigSource).toHaveBeenCalled();
      expect(MockedConfigManager).toHaveBeenCalled();
      expect(MockedClaudeExecutor).toHaveBeenCalled();
    });

    it("should handle pause flag state changes correctly", async () => {
      // Initial state should be false
      expect((service as any).pauseAfterCurrentTask).toBe(false);

      // After pause request, flag should be true
      await service.pausePipelineExecution();
      expect((service as any).pauseAfterCurrentTask).toBe(true);

      // Simulate pipeline pause callback which should reset the flag
      const mockTasks: TaskItem[] = [
        { id: "task1", prompt: "Task 1", status: "pending" },
      ];

      (service as any).onPipelinePaused(
        mockTasks,
        0,
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );
      expect((service as any).pauseAfterCurrentTask).toBe(false);
    });

    it("should clean up paused pipeline data after resume", async () => {
      const pipelineId = "test-pipeline-123";
      const mockData = {
        tasks: [{ id: "task1", prompt: "Task 1", status: "pending" as const }],
        currentIndex: 0,
        resetTime: Date.now(),
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Add pipeline data
      (service as any).pausedPipelines.set(pipelineId, mockData);
      expect(service.getPausedPipelines()).toHaveLength(1);

      // Resume should clean up the data
      mockClaudeExecutor.resumePipeline.mockResolvedValue(undefined);
      const result = await service.resumePipelineExecution(pipelineId);

      expect(result).toBe(true);
      expect(service.getPausedPipelines()).toHaveLength(0);
    });
  });

  describe("configuration and initialization", () => {
    it("should properly initialize with all required components", () => {
      expect(MockedVSCodeLogger).toHaveBeenCalledTimes(1);
      expect(MockedVSCodeConfigSource).toHaveBeenCalledTimes(1);
      expect(mockConfigManager.addSource).toHaveBeenCalledWith(
        expect.any(Object),
      );
      expect(MockedClaudeExecutor).toHaveBeenCalledWith(
        expect.any(Object),
        mockConfigManager,
      );
    });

    it("should handle complex task options correctly", async () => {
      const complexOptions = {
        allowAllTools: true,
        outputFormat: "json" as const,
        workingDirectory: "/custom/path",
        resumeSessionId: "session-123",
        timeout: 30000,
      };

      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "complex-task",
        success: true,
        output: "Complex task completed",
        executionTimeMs: 2000,
      });

      await service.executeTask(
        "complex prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        complexOptions,
      );

      expect(mockClaudeExecutor.executeTask).toHaveBeenCalledWith(
        "complex prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        complexOptions,
      );
    });

    it("should handle workflow with complex step configuration", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      const complexWorkflow = {
        name: "complex-workflow",
        jobs: {
          "complex-job": {
            steps: [
              {
                id: "complex-step",
                uses: "claude-pipeline-action",
                with: {
                  prompt: "Complex prompt with ${{ variables }}",
                  model: "claude-3-5-sonnet-20241022",
                  allow_all_tools: true,
                  working_directory: "/custom/workspace",
                  resume_session: "session-456",
                  output_session: true,
                },
              },
            ],
          },
        },
      };

      const mockExecution: WorkflowExecution = {
        workflow: complexWorkflow,
        inputs: { variable: "test-value" },
        outputs: {},
        currentStep: 0,
        status: "pending",
      };

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: complexWorkflow.jobs["complex-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "complex-step",
        uses: "claude-pipeline-action",
        with: {
          prompt: "Complex prompt with test-value",
          model: "claude-3-5-sonnet-20241022",
          allow_all_tools: true,
          working_directory: "/custom/workspace",
          resume_session: "session-456",
          output_session: true,
        },
      });

      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "complex-step",
        success: true,
        output: "Complex step completed",
        executionTimeMs: 3000,
        sessionId: "new-session-789",
      });

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as any,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(mockClaudeExecutor.executeTask).toHaveBeenCalledWith(
        "Complex prompt with test-value",
        "claude-3-5-sonnet-20241022",
        "/custom/workspace",
        {
          allowAllTools: true,
          outputFormat: "json",
          workingDirectory: "/custom/workspace",
          resumeSessionId: "session-456",
        },
      );

      expect(onStepProgress).toHaveBeenCalledWith("complex-step", "completed", {
        result: "Complex step completed",
        session_id: "new-session-789",
      });
    });
  });
});
