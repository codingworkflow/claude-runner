import { WorkflowEngine } from "../../../../src/core/services/WorkflowEngine";
import { WorkflowParser } from "../../../../src/core/services/WorkflowParser";
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
import { TaskResult } from "../../../../src/core/models/Task";

jest.mock("../../../../src/core/services/WorkflowParser");
jest.mock("../../../../src/core/services/ClaudeExecutor");
jest.mock("../../../../src/services/WorkflowStateService");
jest.mock("../../../../src/services/WorkflowJsonLogger");

describe("WorkflowEngine - Execution", () => {
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
              prompt: "Test prompt ${{ inputs.param1 }}",
              model: "auto",
              allow_all_tools: true,
            },
          } as ClaudeStep,
          {
            id: "step2",
            uses: "claude-pipeline-action",
            with: {
              prompt: "Second step ${{ steps.step1.outputs.result }}",
              output_session: true,
            },
          } as ClaudeStep,
        ],
      },
    },
    inputs: {
      param1: {
        description: "Test parameter",
        required: true,
        type: "string",
        default: "default-value",
      },
    },
    env: {
      ENV_VAR: "test-value",
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

  describe("executeWorkflow", () => {
    let mockExecution: WorkflowExecution;
    let onStepProgress: jest.Mock;
    let onComplete: jest.Mock;
    let onError: jest.Mock;

    beforeEach(() => {
      mockExecution = workflowEngine.createExecution(mockWorkflow, {
        param1: "test-input",
      });
      onStepProgress = jest.fn();
      onComplete = jest.fn();
      onError = jest.fn();
    });

    describe("successful execution", () => {
      it("should execute workflow steps in sequence", async () => {
        const mockTaskResult: TaskResult = {
          taskId: "task-123",
          success: true,
          output: '{"result": "Step completed"}',
          sessionId: "session-123",
          executionTimeMs: 1000,
        };

        mockExecutor.executeTask.mockResolvedValue(mockTaskResult);
        mockWorkflowStateService.createWorkflowState.mockResolvedValue(
          mockWorkflowState,
        );
        mockWorkflowStateService.createStepResult.mockReturnValue({
          stepIndex: 0,
          stepId: "step1",
          status: "running",
          outputSession: false,
        } as WorkflowStepResult);
        mockWorkflowStateService.completeStepResult.mockReturnValue({
          stepIndex: 0,
          stepId: "step1",
          status: "completed",
          outputSession: false,
        } as WorkflowStepResult);

        const result = await workflowEngine.executeWorkflow(
          mockExecution,
          { model: "claude-3" },
          onStepProgress,
          onComplete,
          onError,
          "/test/workflow.yml",
        );

        expect(result.success).toBe(true);
        expect(result.workflowId).toBe("test-workflow");
        expect(result.stepsExecuted).toBe(2);
        expect(mockExecutor.executeTask).toHaveBeenCalledTimes(2);
        expect(onComplete).toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
      });

      it("should resolve variables in step prompts", async () => {
        const mockTaskResult: TaskResult = {
          taskId: "task-123",
          success: true,
          output: '{"result": "First step result"}',
          executionTimeMs: 1000,
        };

        mockExecutor.executeTask.mockResolvedValue(mockTaskResult);
        mockWorkflowStateService.createWorkflowState.mockResolvedValue(
          mockWorkflowState,
        );
        mockWorkflowStateService.createStepResult.mockReturnValue(
          {} as WorkflowStepResult,
        );
        mockWorkflowStateService.completeStepResult.mockReturnValue(
          {} as WorkflowStepResult,
        );
        (WorkflowParser.resolveVariables as jest.Mock)
          .mockReturnValueOnce("Test prompt test-input")
          .mockReturnValueOnce("Second step First step result");

        await workflowEngine.executeWorkflow(mockExecution, {}, onStepProgress);

        expect(WorkflowParser.resolveVariables).toHaveBeenCalledWith(
          "Test prompt ${{ inputs.param1 }}",
          expect.objectContaining({
            inputs: { param1: "test-input" },
            env: { ENV_VAR: "test-value" },
          }),
        );
      });

      it("should handle session output correctly", async () => {
        const mockTaskResult: TaskResult = {
          taskId: "task-123",
          success: true,
          output: '{"result": "Step with session"}',
          sessionId: "session-456",
          executionTimeMs: 1000,
        };

        mockExecutor.executeTask.mockResolvedValue(mockTaskResult);
        mockWorkflowStateService.createWorkflowState.mockResolvedValue(
          mockWorkflowState,
        );
        mockWorkflowStateService.createStepResult.mockReturnValue(
          {} as WorkflowStepResult,
        );
        mockWorkflowStateService.completeStepResult.mockReturnValue(
          {} as WorkflowStepResult,
        );

        await workflowEngine.executeWorkflow(mockExecution, {}, onStepProgress);

        expect(onStepProgress).toHaveBeenCalledWith(
          "step2",
          "completed",
          expect.objectContaining({
            session_id: "session-456",
          }),
        );
      });

      it("should track execution time", async () => {
        mockExecutor.executeTask.mockResolvedValue({
          taskId: "task-123",
          success: true,
          output: '{"result": "Done"}',
          executionTimeMs: 1000,
        });

        const result = await workflowEngine.executeWorkflow(mockExecution, {});

        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.executionTimeMs).toBeLessThan(10000);
      });

      it("should execute without state service when not available", async () => {
        const engineWithoutState = new WorkflowEngine(
          mockLogger,
          mockFileSystem,
          mockExecutor,
        );

        mockExecutor.executeTask.mockResolvedValue({
          taskId: "task-123",
          success: true,
          output: '{"result": "Done"}',
          executionTimeMs: 1000,
        });

        const testExecution = workflowEngine.createExecution(mockWorkflow, {});
        const result = await engineWithoutState.executeWorkflow(
          testExecution,
          {},
        );

        expect(result.success).toBe(true);
        expect(
          mockWorkflowStateService.createWorkflowState,
        ).not.toHaveBeenCalled();
      });
    });

    describe("step progress tracking", () => {
      it("should track workflow status transitions", async () => {
        mockExecutor.executeTask.mockResolvedValue({
          taskId: "task-123",
          success: true,
          output: '{"result": "Done"}',
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

        const testExecution = workflowEngine.createExecution(mockWorkflow, {});
        await workflowEngine.executeWorkflow(testExecution, {});

        expect(testExecution.status).toBe("completed");
      });

      it("should update step progress through all states", async () => {
        mockExecutor.executeTask.mockResolvedValue({
          taskId: "task-123",
          success: true,
          output: '{"result": "Done"}',
          executionTimeMs: 1000,
        });

        await workflowEngine.executeWorkflow(mockExecution, {}, onStepProgress);

        expect(onStepProgress).toHaveBeenCalledWith("step1", "running");
        expect(onStepProgress).toHaveBeenCalledWith(
          "step1",
          "completed",
          expect.any(Object),
        );
        expect(onStepProgress).toHaveBeenCalledWith("step2", "running");
        expect(onStepProgress).toHaveBeenCalledWith(
          "step2",
          "completed",
          expect.any(Object),
        );
      });

      it("should transition workflow from pending to running to completed", async () => {
        const statusTestExecution = workflowEngine.createExecution(
          mockWorkflow,
          { param1: "test-input" },
        );
        const statusTransitions: string[] = [];

        mockExecutor.executeTask.mockImplementation(async () => {
          statusTransitions.push(statusTestExecution.status);
          return {
            taskId: "task-123",
            success: true,
            output: '{"result": "Done"}',
            executionTimeMs: 1000,
          };
        });

        expect(statusTestExecution.status).toBe("pending");

        await workflowEngine.executeWorkflow(statusTestExecution, {});

        expect(statusTransitions).toContain("running");
        expect(statusTestExecution.status).toBe("completed");
      });
    });

    describe("workflow state persistence", () => {
      it("should initialize workflow state when service is available", async () => {
        mockExecutor.executeTask.mockResolvedValue({
          taskId: "task-123",
          success: true,
          output: '{"result": "Done"}',
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

        const testExecution = workflowEngine.createExecution(mockWorkflow, {});
        await workflowEngine.executeWorkflow(
          testExecution,
          {},
          undefined,
          undefined,
          undefined,
          "/test/workflow.yml",
        );

        expect(
          mockWorkflowStateService.createWorkflowState,
        ).toHaveBeenCalledWith(testExecution, "/test/workflow.yml");
        expect(mockWorkflowJsonLogger.initializeLog).toHaveBeenCalledWith(
          mockWorkflowState,
          "/test/workflow.yml",
          false,
        );
      });

      it("should create step checkpoints during execution", async () => {
        mockExecutor.executeTask.mockResolvedValue({
          taskId: "task-123",
          success: true,
          output: '{"result": "Step completed"}',
          executionTimeMs: 1000,
        });
        mockWorkflowStateService.createWorkflowState.mockResolvedValue(
          mockWorkflowState,
        );
        const mockStepResult = {
          stepIndex: 0,
          stepId: "step1",
          status: "running",
          outputSession: false,
        } as WorkflowStepResult;
        mockWorkflowStateService.createStepResult.mockReturnValue(
          mockStepResult,
        );
        mockWorkflowStateService.completeStepResult.mockReturnValue({
          ...mockStepResult,
          status: "completed",
        } as WorkflowStepResult);
        mockWorkflowStateService.updateWorkflowProgress.mockResolvedValue(
          mockWorkflowState,
        );

        const testExecution = workflowEngine.createExecution(mockWorkflow, {});
        await workflowEngine.executeWorkflow(
          testExecution,
          {},
          undefined,
          undefined,
          undefined,
          "/test/workflow.yml",
        );

        expect(mockWorkflowStateService.createStepResult).toHaveBeenCalledTimes(
          5,
        );
        expect(
          mockWorkflowStateService.updateWorkflowProgress,
        ).toHaveBeenCalledWith(mockWorkflowState.executionId, mockStepResult);
      });

      it("should handle JSON logger failures gracefully", async () => {
        mockExecutor.executeTask.mockResolvedValue({
          taskId: "task-123",
          success: true,
          output: '{"result": "Done"}',
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
        mockWorkflowStateService.updateWorkflowProgress.mockResolvedValue(
          mockWorkflowState,
        );

        mockWorkflowJsonLogger.initializeLog.mockResolvedValue(undefined);
        mockWorkflowJsonLogger.updateStepProgress.mockResolvedValue(undefined);
        mockWorkflowJsonLogger.updateWorkflowStatus.mockResolvedValue(
          undefined,
        );
        mockWorkflowJsonLogger.finalize.mockResolvedValue(undefined);

        const testExecution = workflowEngine.createExecution(mockWorkflow, {});
        const result = await workflowEngine.executeWorkflow(
          testExecution,
          {},
          undefined,
          undefined,
          undefined,
          "/test/workflow.yml",
        );

        expect(result.success).toBe(true);
        expect(mockWorkflowJsonLogger.cleanup).toHaveBeenCalled();
      });
    });
  });

  describe("resumeWorkflow", () => {
    it("should resume workflow from saved state", async () => {
      const testExecution = workflowEngine.createExecution(mockWorkflow, {
        param1: "test-input",
      });
      const resumedState: WorkflowState = {
        ...mockWorkflowState,
        currentStep: 1,
        canResume: true,
        execution: testExecution,
        completedSteps: [
          {
            stepIndex: 0,
            stepId: "step1",
            status: "completed",
            sessionId: "session-123",
            outputSession: true,
          } as WorkflowStepResult,
        ],
        sessionMappings: { step1: "session-123" },
      };

      mockWorkflowStateService.getWorkflowState.mockResolvedValue(resumedState);
      mockWorkflowStateService.resumeWorkflow.mockResolvedValue(resumedState);
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Resumed step"}',
        executionTimeMs: 1000,
      });

      const result = await workflowEngine.resumeWorkflow("exec-123", {});

      expect(result.success).toBe(true);
      expect(mockWorkflowStateService.getWorkflowState).toHaveBeenCalledWith(
        "exec-123",
      );
      expect(mockWorkflowStateService.resumeWorkflow).toHaveBeenCalledWith(
        "exec-123",
      );
      expect(mockExecutor.executeTask).toHaveBeenCalledTimes(1);
    });

    it("should throw error when workflow cannot be resumed", async () => {
      const nonResumableState = { ...mockWorkflowState, canResume: false };
      mockWorkflowStateService.getWorkflowState.mockResolvedValue(
        nonResumableState,
      );

      await expect(
        workflowEngine.resumeWorkflow("exec-123", {}),
      ).rejects.toThrow("Cannot resume workflow: exec-123");
    });

    it("should throw error when workflow state service is not available", async () => {
      const engineWithoutState = new WorkflowEngine(
        mockLogger,
        mockFileSystem,
        mockExecutor,
      );

      await expect(
        engineWithoutState.resumeWorkflow("exec-123", {}),
      ).rejects.toThrow(
        "WorkflowStateService not available for resume operation",
      );
    });

    it("should restore session mappings to execution outputs", async () => {
      const testExecution = workflowEngine.createExecution(mockWorkflow, {
        param1: "test-input",
      });
      const resumedState: WorkflowState = {
        ...mockWorkflowState,
        currentStep: 1,
        canResume: true,
        execution: testExecution,
        completedSteps: [
          {
            stepIndex: 0,
            stepId: "step1",
            status: "completed",
            outputSession: false,
          } as WorkflowStepResult,
        ],
        sessionMappings: { step1: "session-123" },
      };

      mockWorkflowStateService.getWorkflowState.mockResolvedValue(resumedState);
      mockWorkflowStateService.resumeWorkflow.mockResolvedValue(resumedState);
      mockWorkflowStateService.createStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockWorkflowStateService.completeStepResult.mockReturnValue(
        {} as WorkflowStepResult,
      );
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      await workflowEngine.resumeWorkflow("exec-123", {});

      expect(resumedState.execution.outputs.step1).toEqual({
        session_id: "session-123",
      });
    });
  });

  describe("pauseCurrentWorkflow", () => {
    it("should pause current workflow execution", async () => {
      const pausedState = { ...mockWorkflowState, status: "paused" as const };
      mockWorkflowStateService.pauseWorkflow.mockResolvedValue(pausedState);

      let resolveExecutor: (value: TaskResult) => void = () => {};
      const executorPromise = new Promise<TaskResult>((resolve) => {
        resolveExecutor = resolve;
      });

      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockExecutor.executeTask.mockReturnValue(
        executorPromise as Promise<TaskResult>,
      );

      const testExecution = workflowEngine.createExecution(mockWorkflow, {});
      const executionPromise = workflowEngine.executeWorkflow(
        testExecution,
        {},
        undefined,
        undefined,
        undefined,
        "/test/workflow.yml",
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await workflowEngine.pauseCurrentWorkflow();

      expect(result).toBe("exec-123");
      expect(mockWorkflowStateService.pauseWorkflow).toHaveBeenCalledWith(
        "exec-123",
        "manual",
      );

      resolveExecutor({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      await executionPromise;
    });

    it("should return null when no current workflow", async () => {
      const result = await workflowEngine.pauseCurrentWorkflow();

      expect(result).toBeNull();
      expect(mockWorkflowStateService.pauseWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentWorkflowExecutionId", () => {
    it("should return current workflow execution ID", async () => {
      let resolveExecutor: (value: TaskResult) => void = () => {};
      const executorPromise = new Promise<TaskResult>((resolve) => {
        resolveExecutor = resolve;
      });

      mockWorkflowStateService.createWorkflowState.mockResolvedValue(
        mockWorkflowState,
      );
      mockExecutor.executeTask.mockReturnValue(
        executorPromise as Promise<TaskResult>,
      );

      const testExecution = workflowEngine.createExecution(mockWorkflow, {});
      const executionPromise = workflowEngine.executeWorkflow(
        testExecution,
        {},
        undefined,
        undefined,
        undefined,
        "/test/workflow.yml",
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const executionId = workflowEngine.getCurrentWorkflowExecutionId();
      expect(executionId).toBe("exec-123");

      resolveExecutor({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      await executionPromise;
    });

    it("should return null when no current workflow", () => {
      const result = workflowEngine.getCurrentWorkflowExecutionId();

      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle workflow with no Claude steps", async () => {
      const workflowWithoutClaude: ClaudeWorkflow = {
        name: "no-claude-workflow",
        jobs: {
          "regular-job": {
            steps: [
              { run: "echo 'regular step 1'" },
              { run: "echo 'regular step 2'" },
            ],
          },
        },
      };

      const execution = workflowEngine.createExecution(
        workflowWithoutClaude,
        {},
      );
      const result = await workflowEngine.executeWorkflow(execution, {});

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(0);
      expect(mockExecutor.executeTask).not.toHaveBeenCalled();
    });

    it("should handle missing step IDs gracefully", async () => {
      const workflowWithoutIds: ClaudeWorkflow = {
        name: "no-ids-workflow",
        jobs: {
          job: {
            steps: [
              {
                uses: "claude-pipeline-action",
                with: { prompt: "Step without ID" },
              } as ClaudeStep,
            ],
          },
        },
      };

      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      const execution = workflowEngine.createExecution(workflowWithoutIds, {});
      const onStepProgress = jest.fn();

      await workflowEngine.executeWorkflow(execution, {}, onStepProgress);

      expect(onStepProgress).toHaveBeenCalledWith("step-0", "running");
      expect(onStepProgress).toHaveBeenCalledWith(
        "step-0",
        "completed",
        expect.any(Object),
      );
    });

    it("should handle malformed JSON output", async () => {
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: "not-valid-json",
        executionTimeMs: 1000,
      });

      const testExecution = workflowEngine.createExecution(mockWorkflow, {
        param1: "test-input",
      });
      const result = await workflowEngine.executeWorkflow(testExecution, {});

      expect(result.success).toBe(true);
      expect((result.outputs.step1 as { result: string }).result).toBe(
        "not-valid-json",
      );
    });
  });
});
