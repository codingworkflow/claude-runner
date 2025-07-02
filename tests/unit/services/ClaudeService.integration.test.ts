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

jest.mock("../../../src/core/services/ClaudeExecutor");
jest.mock("../../../src/adapters/vscode");
jest.mock("../../../src/core/services/ConfigManager");
jest.mock("../../../src/services/WorkflowService");

import { ClaudeExecutor } from "../../../src/core/services/ClaudeExecutor";
import { VSCodeLogger, VSCodeConfigSource } from "../../../src/adapters/vscode";
import { ConfigManager } from "../../../src/core/services/ConfigManager";

const mockExecutor = {
  executeTask: jest.fn() as jest.MockedFunction<
    (
      task: string,
      model: string,
      workingDirectory: string,
      options?: unknown,
    ) => Promise<TaskResult>
  >,
  executePipeline: jest.fn() as jest.MockedFunction<
    (...args: any[]) => Promise<void>
  >,
  resumePipeline: jest.fn() as jest.MockedFunction<
    (...args: any[]) => Promise<void>
  >,
  cancelCurrentTask: jest.fn(),
  isTaskRunning: jest.fn() as jest.MockedFunction<() => boolean>,
  validateClaudeCommand: jest.fn(),
  formatCommandPreview: jest.fn(),
};

const mockWorkflowService = {
  getExecutionSteps: jest.fn(),
  resolveStepVariables: jest.fn(),
  updateExecutionOutput: jest.fn(),
};

(ClaudeExecutor as jest.MockedClass<typeof ClaudeExecutor>).mockImplementation(
  () => mockExecutor as any,
);
(VSCodeLogger as jest.MockedClass<typeof VSCodeLogger>).mockImplementation(
  () =>
    ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }) as any,
);
(
  VSCodeConfigSource as jest.MockedClass<typeof VSCodeConfigSource>
).mockImplementation(() => ({ get: jest.fn(), set: jest.fn() }) as any);
(ConfigManager as jest.MockedClass<typeof ConfigManager>).mockImplementation(
  () => ({ addSource: jest.fn(), validateModel: jest.fn() }) as any,
);

describe("ClaudeService - Integration Tests", () => {
  let service: ClaudeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClaudeService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("pipeline execution", () => {
    const mockTasks: TaskItem[] = [
      { id: "task1", prompt: "First task", status: "pending" },
      { id: "task2", prompt: "Second task", status: "pending" },
    ];

    it("should execute pipeline with all callbacks", async () => {
      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockExecutor.executePipeline.mockResolvedValue(undefined);

      await service.executePipeline(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
        onProgress,
        onComplete,
        onError,
      );

      expect(mockExecutor.executePipeline).toHaveBeenCalledWith(
        mockTasks,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
        onProgress,
        onComplete,
        onError,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it("should handle pipeline pause and resume flow", async () => {
      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockExecutor.executePipeline.mockImplementation(
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

      mockExecutor.resumePipeline.mockResolvedValue(undefined);
      const resumeResult = await service.resumePipelineExecution(
        pipelines[0].id,
      );
      expect(resumeResult).toBe(true);
    });
  });

  describe("workflow execution", () => {
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

      mockExecutor.executeTask.mockResolvedValue({
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

    it("should handle workflow step failure", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockWorkflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: { prompt: "Test prompt" },
      });

      mockExecutor.executeTask.mockResolvedValue({
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
      expect(mockExecution.status).toBe("failed");
    });

    it("should include session ID when requested", async () => {
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

      mockExecutor.executeTask.mockResolvedValue({
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
        with: { prompt: "Test prompt" },
      };

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: stepWithoutId, index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue(stepWithoutId);

      mockExecutor.executeTask.mockResolvedValue({
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

  describe("service interactions", () => {
    it("should handle concurrent task execution", async () => {
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "concurrent-test",
        success: true,
        output: "Task completed",
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
        expect(result.output).toBe("Task completed");
      });
    });

    it("should maintain state across operations", async () => {
      mockExecutor.isTaskRunning.mockReturnValue(false);
      expect(service.isTaskRunning()).toBe(false);
      expect(service.getPausedPipelines()).toEqual([]);

      await service.pausePipelineExecution();
      const pipelines = service.getPausedPipelines();
      expect(pipelines).toEqual([]);
    });
  });
});
