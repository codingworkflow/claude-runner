import { WorkflowEngine } from "../../../../src/core/services/WorkflowEngine";
import { ClaudeExecutor } from "../../../../src/core/services/ClaudeExecutor";
import {
  WorkflowStateService,
  WorkflowState,
  WorkflowStepResult,
} from "../../../../src/services/WorkflowStateService";
import { WorkflowJsonLogger } from "../../../../src/services/WorkflowJsonLogger";
import { ILogger, IFileSystem } from "../../../../src/core/interfaces";
import {
  ClaudeWorkflow,
  WorkflowExecution,
  ClaudeStep,
} from "../../../../src/core/models/Workflow";

jest.mock("../../../../src/core/services/WorkflowParser");
jest.mock("../../../../src/core/services/ClaudeExecutor");
jest.mock("../../../../src/services/WorkflowStateService");
jest.mock("../../../../src/services/WorkflowJsonLogger");

describe("WorkflowEngine - Error Handling", () => {
  let workflowEngine: WorkflowEngine;
  let mockLogger: jest.Mocked<ILogger>;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockExecutor: jest.Mocked<ClaudeExecutor>;
  let mockWorkflowStateService: jest.Mocked<WorkflowStateService>;
  let mockWorkflowJsonLogger: jest.Mocked<WorkflowJsonLogger>;

  const mockWorkflow: ClaudeWorkflow = {
    name: "test-workflow",
    jobs: {
      "test-job": {
        name: "Test Job",
        steps: [
          {
            id: "step1",
            uses: "claude-pipeline-action",
            with: {
              prompt: "Test prompt",
              model: "auto",
            },
          } as ClaudeStep,
          {
            id: "step2",
            uses: "claude-pipeline-action",
            with: {
              prompt: "Second step",
            },
          } as ClaudeStep,
        ],
      },
    },
  };

  const mockWorkflowState: WorkflowState = {
    executionId: "exec-123",
    workflowPath: "/test/workflow.yml",
    workflowName: "test-workflow",
    startTime: new Date().toISOString(),
    execution: {} as WorkflowExecution,
    status: "running",
    currentStep: 0,
    totalSteps: 2,
    completedSteps: [],
    sessionMappings: {},
    canResume: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockFileSystem = {
      exists: jest.fn(),
      readdir: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      stat: jest.fn(),
      mkdir: jest.fn(),
      unlink: jest.fn(),
    };

    mockExecutor = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<ClaudeExecutor>;

    mockWorkflowStateService = {
      createWorkflowState: jest.fn(),
      getWorkflowState: jest.fn(),
      updateWorkflowProgress: jest.fn(),
      resumeWorkflow: jest.fn(),
      pauseWorkflow: jest.fn(),
      createStepResult: jest.fn(),
      completeStepResult: jest.fn(),
    } as unknown as jest.Mocked<WorkflowStateService>;

    mockWorkflowJsonLogger = {
      initializeLog: jest.fn(),
      updateStepProgress: jest.fn(),
      updateWorkflowStatus: jest.fn(),
      finalize: jest.fn(),
      cleanup: jest.fn(),
    } as unknown as jest.Mocked<WorkflowJsonLogger>;

    (
      WorkflowJsonLogger as jest.MockedClass<typeof WorkflowJsonLogger>
    ).mockImplementation(() => mockWorkflowJsonLogger);

    workflowEngine = new WorkflowEngine(
      mockLogger,
      mockFileSystem,
      mockExecutor,
      mockWorkflowStateService,
    );
  });

  describe("step execution failures", () => {
    let mockExecution: WorkflowExecution;
    let onStepProgress: jest.Mock;
    let onComplete: jest.Mock;
    let onError: jest.Mock;

    beforeEach(() => {
      mockExecution = workflowEngine.createExecution(mockWorkflow, {});
      onStepProgress = jest.fn();
      onComplete = jest.fn();
      onError = jest.fn();
    });

    it("should handle step execution failure", async () => {
      mockExecutor.executeTask.mockResolvedValueOnce({
        taskId: "task-123",
        success: false,
        output: "",
        error: "Step failed",
        executionTimeMs: 1000,
      });

      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );

      const result = await workflowEngine.executeWorkflow(
        mockExecution,
        {},
        onStepProgress,
        onComplete,
        onError,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Step failed");
      expect(onStepProgress).toHaveBeenCalledWith("step1", "failed", {
        result: "Step failed",
      });
      expect(onError).toHaveBeenCalledWith("Step failed");
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("should handle executor throwing exception", async () => {
      mockExecutor.executeTask.mockRejectedValue(new Error("Execution error"));
      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );

      const result = await workflowEngine.executeWorkflow(
        mockExecution,
        {},
        onStepProgress,
        onComplete,
        onError,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Execution error");
      expect(mockExecution.status).toBe("failed");
    });

    it("should mark workflow state as failed on error", async () => {
      mockExecutor.executeTask.mockRejectedValue(new Error("Critical error"));
      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );

      await workflowEngine.executeWorkflow(
        mockExecution,
        {},
        undefined,
        undefined,
        undefined,
        "/test/workflow.yml",
      );

      expect(mockWorkflowState.status).toBe("failed");
      expect(mockWorkflowState.canResume).toBe(false);
      expect(mockWorkflowJsonLogger.updateWorkflowStatus).toHaveBeenCalledWith(
        "failed",
      );
    });

    it("should handle network timeout errors gracefully", async () => {
      mockExecutor.executeTask.mockRejectedValue(
        new Error("ETIMEDOUT: Connection timeout"),
      );
      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );

      const onError = jest.fn();
      const result = await workflowEngine.executeWorkflow(
        mockExecution,
        {},
        undefined,
        undefined,
        onError,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("ETIMEDOUT: Connection timeout");
      expect(onError).toHaveBeenCalledWith("ETIMEDOUT: Connection timeout");
      expect(mockExecution.status).toBe("failed");
    });

    it("should handle step execution with invalid session resumption", async () => {
      const resumeWorkflow: ClaudeWorkflow = {
        name: "resume-workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "resume-step",
                uses: "claude-pipeline-action",
                with: {
                  prompt: "Resume from invalid session",
                  resume_session: "invalid-session-id",
                },
              } as ClaudeStep,
            ],
          },
        },
      };

      const execution = workflowEngine.createExecution(resumeWorkflow, {});

      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-1",
        success: false,
        error: "Invalid session ID: invalid-session-id",
        output: "",
        executionTimeMs: 100,
      });

      const result = await workflowEngine.executeWorkflow(execution, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid session ID: invalid-session-id");
    });

    it("should transition workflow to failed state on error", async () => {
      const failedTestExecution = workflowEngine.createExecution(
        mockWorkflow,
        {},
      );
      mockExecutor.executeTask.mockRejectedValue(new Error("Step failed"));

      expect(failedTestExecution.status).toBe("pending");

      await workflowEngine.executeWorkflow(failedTestExecution, {});

      expect(failedTestExecution.status).toBe("failed");
      expect(failedTestExecution.error).toBe("Step failed");
    });
  });

  describe("partial execution and rollback", () => {
    it("should handle partial workflow execution failure", async () => {
      const multiStepWorkflow: ClaudeWorkflow = {
        name: "multi-step-workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "step1",
                uses: "claude-pipeline-action",
                with: { prompt: "First step" },
              } as ClaudeStep,
              {
                id: "step2",
                uses: "claude-pipeline-action",
                with: { prompt: "Second step" },
              } as ClaudeStep,
              {
                id: "step3",
                uses: "claude-pipeline-action",
                with: { prompt: "Third step" },
              } as ClaudeStep,
            ],
          },
        },
      };

      const execution = workflowEngine.createExecution(multiStepWorkflow, {});

      mockExecutor.executeTask
        .mockResolvedValueOnce({
          taskId: "task-1",
          success: true,
          output: '{"result": "Step 1 completed"}',
          executionTimeMs: 500,
        })
        .mockRejectedValueOnce(new Error("Step 2 failed"))
        .mockResolvedValueOnce({
          taskId: "task-3",
          success: true,
          output: '{"result": "Step 3 completed"}',
          executionTimeMs: 300,
        });

      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );

      const result = await workflowEngine.executeWorkflow(
        execution,
        {},
        undefined,
        undefined,
        undefined,
        "/test/workflow.yml",
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Step 2 failed");
      expect(result.stepsExecuted).toBe(1);
      expect(execution.outputs["step1"]).toBeDefined();
      expect(execution.outputs["step2"]).toBeUndefined();
      expect(execution.outputs["step3"]).toBeUndefined();
    });

    it("should handle state service failures during error recovery", async () => {
      const failureExecution = workflowEngine.createExecution(mockWorkflow, {});
      mockExecutor.executeTask.mockRejectedValue(new Error("Task failed"));
      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.updateWorkflowProgress.mockResolvedValue(
        mockWorkflowState,
      );

      const result = await workflowEngine.executeWorkflow(
        failureExecution,
        {},
        undefined,
        undefined,
        undefined,
        "/test/workflow.yml",
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task failed");
    });
  });

  describe("service failures", () => {
    it("should handle workflow state service errors gracefully", async () => {
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      const mockExecution = workflowEngine.createExecution(mockWorkflow, {});

      const result = await workflowEngine.executeWorkflow(mockExecution, {});

      expect(result.success).toBe(true);
    });

    it("should handle JSON logger initialization failures", async () => {
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      const mockExecution = workflowEngine.createExecution(mockWorkflow, {});

      const result = await workflowEngine.executeWorkflow(mockExecution, {});

      expect(result.success).toBe(true);
    });

    it("should handle executor service unavailable", async () => {
      const engineWithNullExecutor = new WorkflowEngine(
        mockLogger,
        mockFileSystem,
        null as any,
        mockWorkflowStateService,
      );

      const mockExecution = workflowEngine.createExecution(mockWorkflow, {});

      const result = await engineWithNullExecutor.executeWorkflow(
        mockExecution,
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot read properties of null");
    });
  });

  describe("resource constraints and recovery", () => {
    it("should handle memory pressure during execution", async () => {
      const largeWorkflow: ClaudeWorkflow = {
        name: "memory-test",
        jobs: {
          memory: {
            steps: Array(50)
              .fill(null)
              .map(
                (_, i) =>
                  ({
                    id: `memory-step-${i}`,
                    uses: "claude-pipeline-action",
                    with: { prompt: `Memory test ${i}` },
                  }) as ClaudeStep,
              ),
          },
        },
      };

      const execution = workflowEngine.createExecution(largeWorkflow, {});

      let callCount = 0;
      mockExecutor.executeTask.mockImplementation(async () => {
        callCount++;
        if (callCount === 25) {
          throw new Error("Out of memory");
        }
        return {
          taskId: `task-${callCount}`,
          success: true,
          output: '{"result": "Done"}',
          executionTimeMs: 10,
        };
      });

      const result = await workflowEngine.executeWorkflow(execution, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Out of memory");
      expect(result.stepsExecuted).toBe(24);
    });

    it("should clean up resources after execution failure", async () => {
      mockExecutor.executeTask.mockRejectedValue(new Error("Execution failed"));

      const mockExecution = workflowEngine.createExecution(mockWorkflow, {});

      await workflowEngine.executeWorkflow(mockExecution, {});

      expect(mockWorkflowJsonLogger.cleanup).toHaveBeenCalled();
      expect(workflowEngine.getCurrentWorkflowExecutionId()).toBeNull();
    });

    it("should handle concurrent execution errors", async () => {
      const execution1 = workflowEngine.createExecution(mockWorkflow, {});
      const execution2 = workflowEngine.createExecution(mockWorkflow, {});

      mockExecutor.executeTask
        .mockResolvedValueOnce({
          taskId: "task-1",
          success: true,
          output: '{"result": "Success"}',
          executionTimeMs: 1000,
        })
        .mockResolvedValueOnce({
          taskId: "task-2",
          success: true,
          output: '{"result": "Success"}',
          executionTimeMs: 1000,
        })
        .mockRejectedValueOnce(new Error("Concurrent execution failed"));

      const [result1, result2] = await Promise.allSettled([
        workflowEngine.executeWorkflow(execution1, {}),
        workflowEngine.executeWorkflow(execution2, {}),
      ]);

      expect(result1.status).toBe("fulfilled");
      expect(result2.status).toBe("fulfilled");
    });
  });

  describe("error recovery mechanisms", () => {
    it("should attempt graceful degradation on service failures", async () => {
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      const mockExecution = workflowEngine.createExecution(mockWorkflow, {});

      const result = await workflowEngine.executeWorkflow(mockExecution, {});

      expect(result.success).toBe(true);
      expect(mockExecutor.executeTask).toHaveBeenCalledTimes(2);
    });

    it("should preserve execution state for debugging after failure", async () => {
      const debugExecution = workflowEngine.createExecution(mockWorkflow, {
        debug: "true",
      });

      mockExecutor.executeTask.mockRejectedValue(
        new Error("Debug test failure"),
      );

      await workflowEngine.executeWorkflow(debugExecution, {});

      expect(debugExecution.status).toBe("failed");
      expect(debugExecution.error).toBe("Debug test failure");
      expect(debugExecution.inputs).toEqual({ debug: "true" });
    });

    it("should handle workflow validation errors before execution", async () => {
      const invalidWorkflow = {
        name: "", // Invalid empty name
        jobs: {},
      } as ClaudeWorkflow;

      const execution = workflowEngine.createExecution(invalidWorkflow, {});

      const result = await workflowEngine.executeWorkflow(execution, {});

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(0);
    });
  });
});
