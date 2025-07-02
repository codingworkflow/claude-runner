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

// Create typed mock objects
const mockClaudeExecutor = {
  executeTask: jest.fn() as jest.MockedFunction<
    (
      task: string,
      model: string,
      workingDirectory: string,
      options?: unknown,
    ) => Promise<TaskResult>
  >,
  executeTaskWithRetry: jest.fn() as jest.MockedFunction<
    (
      task: string,
      model: string,
      workingDirectory: string,
      options?: unknown,
    ) => Promise<TaskResult>
  >,
  executePipeline: jest.fn() as jest.MockedFunction<
    (
      tasks: TaskItem[],
      model: string,
      workingDirectory: string,
      options?: unknown,
      onProgress?: unknown,
      onComplete?: unknown,
      onError?: unknown,
      pauseHandler?: unknown,
      onPausedHandler?: unknown,
    ) => Promise<void>
  >,
  resumePipeline: jest.fn() as jest.MockedFunction<
    (
      tasks: TaskItem[],
      model: string,
      workingDirectory: string,
      options?: unknown,
      onProgress?: unknown,
      onComplete?: unknown,
      onError?: unknown,
      pauseHandler?: unknown,
      onPausedHandler?: unknown,
    ) => Promise<void>
  >,
  cancelCurrentTask: jest.fn() as jest.MockedFunction<() => void>,
  isTaskRunning: jest.fn() as jest.MockedFunction<() => boolean>,
  validateClaudeCommand: jest.fn() as jest.MockedFunction<
    (model: string) => Promise<boolean>
  >,
  formatCommandPreview: jest.fn() as jest.MockedFunction<
    (
      task: string,
      model: string,
      workingDirectory: string,
      options?: unknown,
    ) => string
  >,
};

const mockConfigManager = {
  addSource: jest.fn() as jest.MockedFunction<(source: unknown) => void>,
  get: jest.fn() as jest.MockedFunction<(key: string) => Promise<unknown>>,
  set: jest.fn() as jest.MockedFunction<
    (key: string, value: unknown) => Promise<void>
  >,
  validateModel: jest.fn() as jest.MockedFunction<(model: string) => boolean>,
  validatePath: jest.fn() as jest.MockedFunction<(path: string) => boolean>,
};

const mockWorkflowService = {
  getExecutionSteps: jest.fn() as jest.MockedFunction<
    (workflow: unknown) => unknown[]
  >,
  resolveStepVariables: jest.fn() as jest.MockedFunction<
    (step: unknown, inputs: unknown, outputs: unknown) => unknown
  >,
  updateExecutionOutput: jest.fn() as jest.MockedFunction<
    (execution: unknown, stepId: string, output: unknown) => void
  >,
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
// @ts-expect-error - Mock implementation for testing
MockedClaudeExecutor.mockImplementation(() => mockClaudeExecutor);
MockedVSCodeLogger.mockImplementation(() => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
MockedVSCodeConfigSource.mockImplementation(
  () =>
    ({
      get: jest.fn(),
      set: jest.fn(),
    }) as unknown as jest.Mocked<VSCodeConfigSource>,
);
// @ts-expect-error - Mock implementation for testing
MockedConfigManager.mockImplementation(() => mockConfigManager);
// @ts-expect-error - Mock implementation for testing
MockedWorkflowService.mockImplementation(() => mockWorkflowService);

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
        mockWorkflowService as unknown as WorkflowService,
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
        mockWorkflowService as unknown as WorkflowService,
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
        mockWorkflowService as unknown as WorkflowService,
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
        mockWorkflowService as unknown as WorkflowService,
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
        mockWorkflowService as unknown as WorkflowService,
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
      // @ts-expect-error - accessing private property for testing
      service.pausedPipelines.set(pausedId, {
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

      // @ts-expect-error - accessing private property for testing
      service.pausedPipelines.set("pipeline-123", mockData);

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

  describe("retry mechanisms", () => {
    it("should handle retry logic through executor", async () => {
      // Reset mock before configuring specific behavior
      mockClaudeExecutor.executeTask.mockReset();
      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "retry-test",
        success: true,
        output: "Task succeeded",
        executionTimeMs: 2000,
      });

      const result = await service.executeTask(
        "retry test",
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task succeeded");
      expect(mockClaudeExecutor.executeTask).toHaveBeenCalledWith(
        "retry test",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        {},
      );
    });

    it("should handle pipeline retry scenarios", async () => {
      const mockTasks: TaskItem[] = [
        { id: "task1", prompt: "First task", status: "pending" },
      ];

      mockClaudeExecutor.executePipeline
        .mockRejectedValueOnce(new Error("Pipeline temporary failure"))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.executePipeline(
          mockTasks,
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).rejects.toThrow("Pipeline temporary failure");

      await expect(
        service.executePipeline(
          mockTasks,
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).resolves.toBeUndefined();
    });

    it("should handle API timeout scenarios", async () => {
      // Reset mock before configuring specific behavior
      mockClaudeExecutor.executeTask.mockReset();
      mockClaudeExecutor.executeTask.mockRejectedValue(
        new Error("Request timeout"),
      );

      await expect(
        service.executeTask(
          "timeout test",
          "claude-3-5-sonnet-20241022",
          "/workspace",
          { allowAllTools: false },
        ),
      ).rejects.toThrow("Request timeout");
    });

    it("should handle network connectivity issues", async () => {
      mockClaudeExecutor.executeTask.mockRejectedValue(
        new Error("Network unreachable"),
      );

      await expect(
        service.executeTask(
          "network test",
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).rejects.toThrow("Network unreachable");
    });
  });

  describe("API communication", () => {
    it("should handle successful API responses", async () => {
      const mockResponse: TaskResult = {
        taskId: "test-123",
        success: true,
        output: "API response received",
        executionTimeMs: 1500,
        sessionId: "session-456",
      };

      mockClaudeExecutor.executeTask.mockResolvedValue(mockResponse);

      const result = await service.executeTask(
        "API test",
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );

      expect(result).toEqual(mockResponse);
      expect(result.sessionId).toBe("session-456");
    });

    it("should handle API error responses", async () => {
      const mockErrorResponse: TaskResult = {
        taskId: "error-123",
        success: false,
        output: "",
        error: "API error: Invalid model",
        executionTimeMs: 500,
      };

      mockClaudeExecutor.executeTask.mockResolvedValue(mockErrorResponse);

      const result = await service.executeTask(
        "error test",
        "invalid-model",
        "/workspace",
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("API error: Invalid model");
    });

    it("should handle malformed API responses", async () => {
      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "malformed-123",
        success: true,
        output: null as unknown as string,
        executionTimeMs: 1000,
      });

      const result = await service.executeTask(
        "malformed test",
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );

      expect(result.taskId).toBe("malformed-123");
      expect(result.success).toBe(true);
    });

    it("should handle API rate limiting", async () => {
      mockClaudeExecutor.executeTask.mockRejectedValue(
        new Error("Rate limit exceeded"),
      );

      await expect(
        service.executeTask(
          "rate limit test",
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).rejects.toThrow("Rate limit exceeded");
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
        mockWorkflowService as unknown as WorkflowService,
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
          mockWorkflowService as unknown as WorkflowService,
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
        mockWorkflowService as unknown as WorkflowService,
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

  describe("advanced service lifecycle", () => {
    it("should handle service initialization errors gracefully", () => {
      MockedVSCodeLogger.mockImplementation(() => {
        throw new Error("Logger initialization failed");
      });

      expect(() => new ClaudeService()).toThrow("Logger initialization failed");

      // @ts-expect-error - Mock implementation for testing
      MockedVSCodeLogger.mockImplementation(() => ({}));
    });

    it("should handle config source initialization errors", () => {
      MockedVSCodeConfigSource.mockImplementation(() => {
        throw new Error("Config source initialization failed");
      });

      expect(() => new ClaudeService()).toThrow(
        "Config source initialization failed",
      );

      // @ts-expect-error - Mock implementation for testing
      MockedVSCodeConfigSource.mockImplementation(() => ({}));
    });

    it("should handle executor initialization errors", () => {
      MockedClaudeExecutor.mockImplementation(() => {
        throw new Error("Executor initialization failed");
      });

      expect(() => new ClaudeService()).toThrow(
        "Executor initialization failed",
      );

      // @ts-expect-error - Mock implementation for testing
      MockedClaudeExecutor.mockImplementation(() => mockClaudeExecutor);
    });

    it("should maintain state integrity across operations", async () => {
      expect(service.isTaskRunning()).toBeDefined();
      expect(service.getPausedPipelines()).toEqual([]);

      await service.pausePipelineExecution();
      // @ts-expect-error - accessing private property for testing
      expect(service.pauseAfterCurrentTask).toBe(true);

      service.cancelCurrentTask();
      expect(mockClaudeExecutor.cancelCurrentTask).toHaveBeenCalled();
    });

    it("should handle service disposal and cleanup", () => {
      const initialPipelineCount = service.getPausedPipelines().length;

      // @ts-expect-error - accessing private property for testing
      service.pausedPipelines.set("test-cleanup", {
        tasks: [],
        currentIndex: 0,
        resetTime: Date.now(),
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      });

      expect(service.getPausedPipelines().length).toBeGreaterThan(
        initialPipelineCount,
      );

      // @ts-expect-error - accessing private property for testing
      service.pausedPipelines.clear();
      expect(service.getPausedPipelines()).toEqual([]);
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
      // @ts-expect-error - accessing private property for testing
      expect(service.pauseAfterCurrentTask).toBe(false);

      // After pause request, flag should be true
      await service.pausePipelineExecution();
      // @ts-expect-error - accessing private property for testing
      expect(service.pauseAfterCurrentTask).toBe(true);

      // Simulate pipeline pause callback which should reset the flag
      const mockTasks: TaskItem[] = [
        { id: "task1", prompt: "Task 1", status: "pending" },
      ];

      // @ts-expect-error - accessing private method for testing
      service.onPipelinePaused(mockTasks, 0, jest.fn(), jest.fn(), jest.fn());
      // @ts-expect-error - accessing private property for testing
      expect(service.pauseAfterCurrentTask).toBe(false);
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
      // @ts-expect-error - accessing private property for testing
      service.pausedPipelines.set(pipelineId, mockData);
      expect(service.getPausedPipelines()).toHaveLength(1);

      // Resume should clean up the data
      mockClaudeExecutor.resumePipeline.mockResolvedValue(undefined);
      const result = await service.resumePipelineExecution(pipelineId);

      expect(result).toBe(true);
      expect(service.getPausedPipelines()).toHaveLength(0);
    });
  });

  describe("advanced configuration scenarios", () => {
    it("should handle configuration source failures", () => {
      mockConfigManager.addSource.mockImplementation(() => {
        throw new Error("Failed to add config source");
      });

      expect(() => new ClaudeService()).toThrow("Failed to add config source");

      mockConfigManager.addSource.mockImplementation(() => {});
    });

    it("should validate different model configurations", () => {
      const testCases = [
        { model: "auto", expected: true },
        {
          model: "claude-3-5-sonnet-20241022",
          configResult: true,
          expected: true,
        },
        { model: "claude-3-opus-20240229", configResult: true, expected: true },
        { model: "invalid-model", configResult: false, expected: false },
        { model: "", configResult: false, expected: false },
      ];

      testCases.forEach(({ model, configResult, expected }) => {
        if (configResult !== undefined) {
          mockConfigManager.validateModel.mockReturnValue(configResult);
        }

        const result = service.isValidModelId(model);
        expect(result).toBe(expected);
      });
    });

    it("should handle config manager validation errors", () => {
      mockConfigManager.validateModel.mockImplementation(() => {
        throw new Error("Config validation service unavailable");
      });

      expect(() => service.isValidModelId("test-model")).toThrow(
        "Config validation service unavailable",
      );

      mockConfigManager.validateModel.mockImplementation(() => true);
    });

    it("should handle complex initialization dependencies", () => {
      let loggerCallCount = 0;
      let configSourceCallCount = 0;
      let configManagerCallCount = 0;
      let executorCallCount = 0;

      // @ts-expect-error - Mock implementation for testing
      MockedVSCodeLogger.mockImplementation(() => {
        loggerCallCount++;
        return {};
      });

      // @ts-expect-error - Mock implementation for testing
      MockedVSCodeConfigSource.mockImplementation(() => {
        configSourceCallCount++;
        return {};
      });

      // @ts-expect-error - Mock implementation for testing
      MockedConfigManager.mockImplementation(() => {
        configManagerCallCount++;
        return mockConfigManager;
      });

      // @ts-expect-error - Mock implementation for testing
      MockedClaudeExecutor.mockImplementation(() => {
        executorCallCount++;
        return mockClaudeExecutor;
      });

      new ClaudeService();

      expect(loggerCallCount).toBe(1);
      expect(configSourceCallCount).toBe(1);
      expect(configManagerCallCount).toBe(1);
      expect(executorCallCount).toBe(1);
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
        mockWorkflowService as unknown as WorkflowService,
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

  describe("core service wrapper functionality", () => {
    it("should properly wrap executor methods", () => {
      const methods = [
        "executeTask",
        "executePipeline",
        "cancelCurrentTask",
        "isTaskRunning",
        "validateClaudeCommand",
        "formatCommandPreview",
      ];

      methods.forEach((method) => {
        expect(
          typeof (service as unknown as Record<string, unknown>)[method],
        ).toBe("function");
      });
    });

    it("should delegate calls to executor correctly", async () => {
      mockClaudeExecutor.executeTask.mockResolvedValue({
        taskId: "delegation-test",
        success: true,
        output: "Delegated successfully",
        executionTimeMs: 1000,
      });

      await service.executeTask(
        "test task",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );
      expect(mockClaudeExecutor.executeTask).toHaveBeenCalledWith(
        "test task",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );

      service.cancelCurrentTask();
      expect(mockClaudeExecutor.cancelCurrentTask).toHaveBeenCalled();

      mockClaudeExecutor.isTaskRunning.mockReturnValue(true);
      expect(service.isTaskRunning()).toBe(true);
    });

    it("should maintain executor state consistency", () => {
      mockClaudeExecutor.isTaskRunning.mockReturnValue(false);
      expect(service.isTaskRunning()).toBe(false);

      mockClaudeExecutor.isTaskRunning.mockReturnValue(true);
      expect(service.isTaskRunning()).toBe(true);
    });

    it("should handle executor method failures gracefully", async () => {
      mockClaudeExecutor.validateClaudeCommand.mockRejectedValue(
        new Error("Validation failed"),
      );

      await expect(
        service.validateClaudeCommand("claude-3-5-sonnet-20241022"),
      ).rejects.toThrow("Validation failed");

      mockClaudeExecutor.formatCommandPreview.mockImplementation(() => {
        throw new Error("Preview failed");
      });

      expect(() =>
        service.formatCommandPreview(
          "test",
          "claude-3-5-sonnet-20241022",
          "/workspace",
          {},
        ),
      ).toThrow("Preview failed");
    });
  });

  describe("service state management", () => {
    it("should manage pause state correctly", async () => {
      // @ts-expect-error - accessing private property for testing
      expect(service.pauseAfterCurrentTask).toBe(false);

      const pipelineId = await service.pausePipelineExecution();
      // @ts-expect-error - accessing private property for testing
      expect(service.pauseAfterCurrentTask).toBe(true);
      expect(pipelineId).toMatch(/^pipeline-\d+-[a-z0-9]{9}$/);

      // Simulate pipeline pause callback
      // @ts-expect-error - accessing private method for testing
      service.onPipelinePaused(
        [{ id: "task1", prompt: "Test", status: "pending" }],
        0,
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );
      // @ts-expect-error - accessing private property for testing
      expect(service.pauseAfterCurrentTask).toBe(false);
    });

    it("should manage paused pipelines map correctly", () => {
      const initialCount = service.getPausedPipelines().length;

      // @ts-expect-error - accessing private property for testing
      service.pausedPipelines.set("test-id-1", {
        tasks: [{ id: "task1", prompt: "Task 1", status: "pending" }],
        currentIndex: 0,
        resetTime: 1000,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      });

      // @ts-expect-error - accessing private property for testing
      service.pausedPipelines.set("test-id-2", {
        tasks: [{ id: "task2", prompt: "Task 2", status: "pending" }],
        currentIndex: 1,
        resetTime: 2000,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      });

      const pipelines = service.getPausedPipelines();
      expect(pipelines.length).toBe(initialCount + 2);
      expect(pipelines.find((p) => p.id === "test-id-1")).toEqual({
        id: "test-id-1",
        pausedAt: 1000,
        taskCount: 1,
      });
      expect(pipelines.find((p) => p.id === "test-id-2")).toEqual({
        id: "test-id-2",
        pausedAt: 2000,
        taskCount: 1,
      });
    });

    it("should handle pipeline ID generation uniqueness", async () => {
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        const id = await service.pausePipelineExecution();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
      expect(ids.size).toBe(10);
    });
  });
});
