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

describe("WorkflowEngine", () => {
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

  const mockExecution: WorkflowExecution = {
    workflow: mockWorkflow,
    inputs: { param1: "test-input" },
    outputs: {},
    currentStep: 0,
    status: "pending",
  };

  const mockWorkflowState: WorkflowState = {
    executionId: "exec-123",
    workflowPath: "/test/workflow.yml",
    workflowName: "test-workflow",
    startTime: new Date().toISOString(),
    execution: mockExecution,
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

  describe("Workflow File Management", () => {
    describe("listWorkflows", () => {
      it("should return empty array when directory does not exist", async () => {
        mockFileSystem.exists.mockResolvedValue(false);

        const result = await workflowEngine.listWorkflows("/non-existent");

        expect(result).toEqual([]);
        expect(mockFileSystem.exists).toHaveBeenCalledWith("/non-existent");
      });

      it("should list and parse claude workflow files", async () => {
        const mockFiles = [
          "claude-test.yml",
          "claude-prod.yaml",
          "other-file.txt",
        ];
        const mockStats = {
          birthtime: new Date("2023-01-01"),
          mtime: new Date("2023-01-02"),
          isDirectory: false,
          size: 1024,
        };

        mockFileSystem.exists.mockResolvedValue(true);
        mockFileSystem.readdir.mockResolvedValue(mockFiles);
        mockFileSystem.stat.mockResolvedValue(mockStats);
        mockFileSystem.readFile.mockResolvedValue("workflow-content");
        (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

        const result = await workflowEngine.listWorkflows("/workflows");

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
          id: "claude-test",
          name: "test-workflow",
          description: undefined, // Will be undefined as mockWorkflow.inputs.description.default is undefined
          created: mockStats.birthtime,
          modified: mockStats.mtime,
          path: "/workflows/claude-test.yml",
        });
        expect(WorkflowParser.parseYaml).toHaveBeenCalledTimes(2);
      });

      it("should handle parse errors gracefully", async () => {
        const mockFiles = ["claude-test.yml", "claude-invalid.yml"];
        const mockStats = {
          birthtime: new Date(),
          mtime: new Date(),
          isDirectory: false,
          size: 1024,
        };

        mockFileSystem.exists.mockResolvedValue(true);
        mockFileSystem.readdir.mockResolvedValue(mockFiles);
        mockFileSystem.stat.mockResolvedValue(mockStats);
        mockFileSystem.readFile.mockResolvedValue("content");
        (WorkflowParser.parseYaml as jest.Mock)
          .mockReturnValueOnce(mockWorkflow)
          .mockImplementationOnce(() => {
            throw new Error("Parse error");
          });

        const result = await workflowEngine.listWorkflows("/workflows");

        expect(result).toHaveLength(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
          "Failed to parse workflow claude-invalid.yml",
          expect.any(Error),
        );
      });

      it("should sort workflows by modification time descending", async () => {
        const mockFiles = ["claude-old.yml", "claude-new.yml"];
        const oldStats = {
          birthtime: new Date("2023-01-01"),
          mtime: new Date("2023-01-01"),
          isDirectory: false,
          size: 1024,
        };
        const newStats = {
          birthtime: new Date("2023-01-02"),
          mtime: new Date("2023-01-03"),
          isDirectory: false,
          size: 1024,
        };

        mockFileSystem.exists.mockResolvedValue(true);
        mockFileSystem.readdir.mockResolvedValue(mockFiles);
        mockFileSystem.stat
          .mockResolvedValueOnce(oldStats)
          .mockResolvedValueOnce(newStats);
        mockFileSystem.readFile.mockResolvedValue("content");
        (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

        const result = await workflowEngine.listWorkflows("/workflows");

        expect(result[0].id).toBe("claude-new");
        expect(result[1].id).toBe("claude-old");
      });
    });

    describe("loadWorkflow", () => {
      it("should load and parse workflow from file", async () => {
        mockFileSystem.readFile.mockResolvedValue("workflow-content");
        (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

        const result = await workflowEngine.loadWorkflow("/test/workflow.yml");

        expect(result).toBe(mockWorkflow);
        expect(mockFileSystem.readFile).toHaveBeenCalledWith(
          "/test/workflow.yml",
        );
        expect(WorkflowParser.parseYaml).toHaveBeenCalledWith(
          "workflow-content",
        );
      });
    });

    describe("saveWorkflow", () => {
      it("should serialize and save workflow to file", async () => {
        (WorkflowParser.toYaml as jest.Mock).mockReturnValue(
          "serialized-content",
        );

        await workflowEngine.saveWorkflow("/test/workflow.yml", mockWorkflow);

        expect(WorkflowParser.toYaml).toHaveBeenCalledWith(mockWorkflow);
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          "/test/workflow.yml",
          "serialized-content",
        );
      });
    });

    describe("validateWorkflow", () => {
      it("should return valid for correct workflow", async () => {
        mockFileSystem.readFile.mockResolvedValue("valid-content");
        (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

        const result =
          await workflowEngine.validateWorkflow("/test/workflow.yml");

        expect(result).toEqual({ valid: true, errors: [] });
      });

      it("should return invalid with errors for malformed workflow", async () => {
        mockFileSystem.readFile.mockResolvedValue("invalid-content");
        (WorkflowParser.parseYaml as jest.Mock).mockImplementation(() => {
          throw new Error("Invalid YAML");
        });

        const result =
          await workflowEngine.validateWorkflow("/test/workflow.yml");

        expect(result).toEqual({ valid: false, errors: ["Invalid YAML"] });
      });
    });
  });

  describe("Workflow Execution Engine", () => {
    describe("createExecution", () => {
      it("should create workflow execution context", () => {
        const inputs = { param1: "test-value" };

        const result = workflowEngine.createExecution(mockWorkflow, inputs);

        expect(result).toMatchObject({
          workflow: mockWorkflow,
          inputs,
          outputs: {},
          currentStep: 0,
          status: "pending",
        });
      });
    });

    describe("executeWorkflow", () => {
      let onStepProgress: jest.Mock;
      let onComplete: jest.Mock;
      let onError: jest.Mock;

      beforeEach(() => {
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
          mockWorkflowStateService.updateWorkflowProgress.mockResolvedValue(
            mockWorkflowState,
          );

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

          await workflowEngine.executeWorkflow(
            mockExecution,
            {},
            onStepProgress,
          );

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

          await workflowEngine.executeWorkflow(
            mockExecution,
            {},
            onStepProgress,
          );

          expect(onStepProgress).toHaveBeenCalledWith(
            "step2",
            "completed",
            expect.objectContaining({
              session_id: "session-456",
            }),
          );
        });

        it("should track execution time", async () => {
          const startTime = Date.now();
          mockExecutor.executeTask.mockResolvedValue({
            taskId: "task-123",
            success: true,
            output: '{"result": "Done"}',
            executionTimeMs: 1000,
          });

          const result = await workflowEngine.executeWorkflow(
            mockExecution,
            {},
          );

          expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
          expect(result.executionTimeMs).toBeLessThan(
            Date.now() - startTime + 100,
          );
        });

        it("should handle complex workflow with multiple jobs and dependencies", async () => {
          const complexWorkflow: ClaudeWorkflow = {
            name: "complex-workflow",
            jobs: {
              setup: {
                steps: [
                  {
                    id: "setup-step",
                    uses: "claude-pipeline-action",
                    with: { prompt: "Setup the environment" },
                  } as ClaudeStep,
                ],
              },
              main: {
                steps: [
                  {
                    id: "main-step",
                    uses: "claude-pipeline-action",
                    with: {
                      prompt:
                        "Main task using ${{ steps.setup-step.outputs.result }}",
                      resume_session:
                        "${{ steps.setup-step.outputs.session_id }}",
                    },
                  } as ClaudeStep,
                ],
              },
            },
          };

          const complexExecution = workflowEngine.createExecution(
            complexWorkflow,
            {},
          );

          mockExecutor.executeTask
            .mockResolvedValueOnce({
              taskId: "task-1",
              success: true,
              output: '{"result": "Environment ready"}',
              sessionId: "session-setup",
              executionTimeMs: 500,
            })
            .mockResolvedValueOnce({
              taskId: "task-2",
              success: true,
              output: '{"result": "Main task completed"}',
              sessionId: "session-main",
              executionTimeMs: 800,
            });

          const result = await workflowEngine.executeWorkflow(
            complexExecution,
            {},
          );

          expect(result.success).toBe(true);
          expect(result.stepsExecuted).toBe(2);
          expect(complexExecution.outputs["setup-step"]).toBeDefined();
          expect(complexExecution.outputs["main-step"]).toBeDefined();
        });

        it("should handle workflow with conditional steps", async () => {
          const conditionalWorkflow: ClaudeWorkflow = {
            name: "conditional-workflow",
            jobs: {
              conditional: {
                steps: [
                  {
                    id: "check-step",
                    uses: "claude-pipeline-action",
                    with: { prompt: "Check condition" },
                  } as ClaudeStep,
                  {
                    id: "action-step",
                    uses: "claude-pipeline-action",
                    with: {
                      prompt:
                        "Execute if condition is true: ${{ steps.check-step.outputs.result }}",
                    },
                  } as ClaudeStep,
                ],
              },
            },
          };

          const conditionalExecution = workflowEngine.createExecution(
            conditionalWorkflow,
            {},
          );

          mockExecutor.executeTask
            .mockResolvedValueOnce({
              taskId: "task-1",
              success: true,
              output: '{"result": "condition_true"}',
              executionTimeMs: 300,
            })
            .mockResolvedValueOnce({
              taskId: "task-2",
              success: true,
              output: '{"result": "Action executed"}',
              executionTimeMs: 400,
            });

          const result = await workflowEngine.executeWorkflow(
            conditionalExecution,
            {},
          );

          expect(result.success).toBe(true);
          expect(result.stepsExecuted).toBe(2);
        });

        it("should handle workflow with custom working directories", async () => {
          const workflowWithDirs: ClaudeWorkflow = {
            name: "dirs-workflow",
            jobs: {
              build: {
                steps: [
                  {
                    id: "build-step",
                    uses: "claude-pipeline-action",
                    with: {
                      prompt: "Build in custom directory",
                      working_directory: "/custom/build/path",
                    },
                  } as ClaudeStep,
                ],
              },
            },
          };

          const execution = workflowEngine.createExecution(
            workflowWithDirs,
            {},
          );

          mockExecutor.executeTask.mockResolvedValue({
            taskId: "task-1",
            success: true,
            output: '{"result": "Built successfully"}',
            executionTimeMs: 1000,
          });

          (WorkflowParser.resolveVariables as jest.Mock)
            .mockReturnValueOnce("Build in custom directory")
            .mockReturnValueOnce("/custom/build/path");

          await workflowEngine.executeWorkflow(execution, {
            workingDirectory: "/default",
          });

          expect(mockExecutor.executeTask).toHaveBeenCalledWith(
            "Build in custom directory",
            "auto",
            "/default",
            expect.objectContaining({
              workingDirectory: "/custom/build/path",
            }),
          );
        });
      });

      describe("error handling and rollback", () => {
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
          mockExecutor.executeTask.mockRejectedValue(
            new Error("Execution error"),
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
          mockExecutor.executeTask.mockRejectedValue(
            new Error("Critical error"),
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
          expect(
            mockWorkflowJsonLogger.updateWorkflowStatus,
          ).toHaveBeenCalledWith("failed");
        });

        it("should handle partial workflow execution failure and rollback state", async () => {
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

          const execution = workflowEngine.createExecution(
            multiStepWorkflow,
            {},
          );

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

        it("should handle state service failures during error recovery", async () => {
          const failureExecution = workflowEngine.createExecution(
            mockWorkflow,
            { param1: "test-input" },
          );
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
      });

      describe("state transitions", () => {
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

          await workflowEngine.executeWorkflow(mockExecution, {});

          expect(mockExecution.status).toBe("completed");
        });

        it("should update step progress through all states", async () => {
          mockExecutor.executeTask.mockResolvedValue({
            taskId: "task-123",
            success: true,
            output: '{"result": "Done"}',
            executionTimeMs: 1000,
          });

          await workflowEngine.executeWorkflow(
            mockExecution,
            {},
            onStepProgress,
          );

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

        it("should transition workflow to failed state on error", async () => {
          const failedTestExecution = workflowEngine.createExecution(
            mockWorkflow,
            { param1: "test-input" },
          );
          mockExecutor.executeTask.mockRejectedValue(new Error("Step failed"));

          expect(failedTestExecution.status).toBe("pending");

          await workflowEngine.executeWorkflow(failedTestExecution, {});

          expect(failedTestExecution.status).toBe("failed");
          expect(failedTestExecution.error).toBe("Step failed");
        });

        it("should track step state transitions with persistence", async () => {
          const stepTransitions: Array<{ stepId: string; status: string }> = [];

          const onStepProgress = jest.fn((stepId, status) => {
            stepTransitions.push({ stepId, status });
          });

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

          await workflowEngine.executeWorkflow(
            mockExecution,
            {},
            onStepProgress,
            undefined,
            undefined,
            "/test/workflow.yml",
          );

          expect(stepTransitions).toEqual([
            { stepId: "step1", status: "running" },
            { stepId: "step1", status: "completed" },
            { stepId: "step2", status: "running" },
            { stepId: "step2", status: "completed" },
          ]);
        });

        it("should handle workflow state transitions during pause/resume cycles", async () => {
          const pausableWorkflow: ClaudeWorkflow = {
            name: "pausable-workflow",
            jobs: {
              main: {
                steps: [
                  {
                    id: "pausable-step",
                    uses: "claude-pipeline-action",
                    with: { prompt: "Long running task" },
                  } as ClaudeStep,
                ],
              },
            },
          };

          const execution = workflowEngine.createExecution(
            pausableWorkflow,
            {},
          );
          const pausedState = {
            ...mockWorkflowState,
            status: "paused" as const,
          };

          mockWorkflowStateService.createWorkflowState.mockResolvedValue(
            mockWorkflowState,
          );
          mockWorkflowStateService.pauseWorkflow.mockResolvedValue(pausedState);
          mockWorkflowStateService.getWorkflowState.mockResolvedValue(
            pausedState,
          );
          mockWorkflowStateService.resumeWorkflow.mockResolvedValue({
            ...pausedState,
            status: "running",
            canResume: true,
          });
          mockWorkflowStateService.createStepResult.mockReturnValue(
            {} as WorkflowStepResult,
          );
          mockWorkflowStateService.completeStepResult.mockReturnValue(
            {} as WorkflowStepResult,
          );

          let resolveExecutor: (value: TaskResult) => void = () => {};
          const executorPromise = new Promise<TaskResult>((resolve) => {
            resolveExecutor = resolve;
          });
          mockExecutor.executeTask.mockReturnValue(
            executorPromise as Promise<TaskResult>,
          );

          const executionPromise = workflowEngine.executeWorkflow(
            execution,
            {},
            undefined,
            undefined,
            undefined,
            "/test/workflow.yml",
          );

          await new Promise((resolve) => setTimeout(resolve, 10));

          expect(execution.status).toBe("running");

          const pauseResult = await workflowEngine.pauseCurrentWorkflow();
          expect(pauseResult).toBe("exec-123");

          resolveExecutor({
            taskId: "task-123",
            success: true,
            output: '{"result": "Completed after pause"}',
            executionTimeMs: 2000,
          });

          await executionPromise;
        });

        it("should maintain workflow state consistency across multiple operations", async () => {
          const freshExecution = workflowEngine.createExecution(mockWorkflow, {
            param1: "test-input",
          });
          const stateSnapshots: Array<{
            operation: string;
            status: string;
            currentStep: number;
          }> = [];

          mockExecutor.executeTask.mockImplementation(async () => {
            stateSnapshots.push({
              operation: "during_execution",
              status: freshExecution.status,
              currentStep: freshExecution.currentStep,
            });
            return {
              taskId: "task-123",
              success: true,
              output: '{"result": "Done"}',
              executionTimeMs: 500,
            };
          });

          stateSnapshots.push({
            operation: "before_execution",
            status: freshExecution.status,
            currentStep: freshExecution.currentStep,
          });

          await workflowEngine.executeWorkflow(freshExecution, {});

          stateSnapshots.push({
            operation: "after_execution",
            status: freshExecution.status,
            currentStep: freshExecution.currentStep,
          });

          expect(stateSnapshots).toEqual([
            {
              operation: "before_execution",
              status: "pending",
              currentStep: 0,
            },
            {
              operation: "during_execution",
              status: "running",
              currentStep: 0,
            },
            {
              operation: "during_execution",
              status: "running",
              currentStep: 0,
            },
            {
              operation: "after_execution",
              status: "completed",
              currentStep: 0,
            },
          ]);
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

          await workflowEngine.executeWorkflow(
            mockExecution,
            {},
            undefined,
            undefined,
            undefined,
            "/test/workflow.yml",
          );

          expect(
            mockWorkflowStateService.createWorkflowState,
          ).toHaveBeenCalledWith(mockExecution, "/test/workflow.yml");
          expect(mockWorkflowJsonLogger.initializeLog).toHaveBeenCalledWith(
            mockWorkflowState,
            "/test/workflow.yml",
          );
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

          const result = await engineWithoutState.executeWorkflow(
            mockExecution,
            {},
          );

          expect(result.success).toBe(true);
          expect(
            mockWorkflowStateService.createWorkflowState,
          ).not.toHaveBeenCalled();
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

          await workflowEngine.executeWorkflow(
            mockExecution,
            {},
            undefined,
            undefined,
            undefined,
            "/test/workflow.yml",
          );

          expect(
            mockWorkflowStateService.createStepResult,
          ).toHaveBeenCalledTimes(5);
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
          mockWorkflowJsonLogger.updateStepProgress.mockResolvedValue(
            undefined,
          );
          mockWorkflowJsonLogger.updateWorkflowStatus.mockResolvedValue(
            undefined,
          );
          mockWorkflowJsonLogger.finalize.mockResolvedValue(undefined);

          const result = await workflowEngine.executeWorkflow(
            mockExecution,
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
        const resumedState: WorkflowState = {
          ...mockWorkflowState,
          currentStep: 1,
          canResume: true,
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

        mockWorkflowStateService.getWorkflowState.mockResolvedValue(
          resumedState,
        );
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
        const resumedState: WorkflowState = {
          ...mockWorkflowState,
          currentStep: 1,
          canResume: true,
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

        mockWorkflowStateService.getWorkflowState.mockResolvedValue(
          resumedState,
        );
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
          result: '{"result": "Done"}',
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

        // Set current workflow state
        mockWorkflowStateService.createWorkflowState.mockResolvedValue(
          mockWorkflowState,
        );
        mockExecutor.executeTask.mockReturnValue(
          executorPromise as Promise<TaskResult>,
        );

        const executionPromise = workflowEngine.executeWorkflow(
          mockExecution,
          {},
          undefined,
          undefined,
          undefined,
          "/test/workflow.yml",
        );

        // Wait for workflow state to be created
        await new Promise((resolve) => setTimeout(resolve, 10));

        const result = await workflowEngine.pauseCurrentWorkflow();

        expect(result).toBe("exec-123");
        expect(mockWorkflowStateService.pauseWorkflow).toHaveBeenCalledWith(
          "exec-123",
          "manual",
        );

        // Resolve the executor promise to allow test to complete
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

        // Start workflow execution to set current state
        const executionPromise = workflowEngine.executeWorkflow(
          mockExecution,
          {},
          undefined,
          undefined,
          undefined,
          "/test/workflow.yml",
        );

        // Wait for workflow state to be created
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Check during execution
        const executionId = workflowEngine.getCurrentWorkflowExecutionId();
        expect(executionId).toBe("exec-123");

        // Resolve the executor promise to allow test to complete
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
  });

  describe("Step Processing and Sequencing", () => {
    describe("getExecutionSteps", () => {
      it("should extract Claude steps in execution order", () => {
        const complexWorkflow: ClaudeWorkflow = {
          name: "complex-workflow",
          jobs: {
            job1: {
              steps: [
                { run: "echo 'regular step'" },
                {
                  id: "claude-step-1",
                  uses: "claude-pipeline-action",
                  with: { prompt: "First Claude step" },
                } as ClaudeStep,
              ],
            },
            job2: {
              steps: [
                {
                  id: "claude-step-2",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Second Claude step" },
                } as ClaudeStep,
              ],
            },
          },
        };

        // Access private method through type assertion for testing
        const steps = (
          workflowEngine as unknown as {
            getExecutionSteps: (workflow: ClaudeWorkflow) => unknown[];
          }
        ).getExecutionSteps(complexWorkflow);

        expect(steps).toHaveLength(2);
        expect(steps[0]).toMatchObject({
          jobName: "job1",
          step: expect.objectContaining({ id: "claude-step-1" }),
          index: 1,
        });
        expect(steps[1]).toMatchObject({
          jobName: "job2",
          step: expect.objectContaining({ id: "claude-step-2" }),
          index: 0,
        });
      });
    });

    describe("resolveStepVariables", () => {
      it("should resolve input variables in step prompt", () => {
        const step: ClaudeStep = {
          uses: "claude-pipeline-action",
          with: {
            prompt: "Hello ${{ inputs.name }}",
            model: "${{ inputs.model }}",
          },
        };

        const execution: WorkflowExecution = {
          workflow: mockWorkflow,
          inputs: { name: "World", model: "claude-3" },
          outputs: {},
          currentStep: 0,
          status: "pending",
        };

        (WorkflowParser.resolveVariables as jest.Mock)
          .mockReturnValueOnce("Hello World")
          .mockReturnValueOnce("claude-3");

        const result = (
          workflowEngine as unknown as {
            resolveStepVariables: (
              step: ClaudeStep,
              execution: WorkflowExecution,
            ) => ClaudeStep;
          }
        ).resolveStepVariables(step, execution);

        expect(result.with.prompt).toBe("Hello World");
        expect(result.with.model).toBe("claude-3");
      });

      it("should resolve step output references", () => {
        const step: ClaudeStep = {
          uses: "claude-pipeline-action",
          with: {
            prompt: "Previous result: ${{ steps.step1.outputs.result }}",
          },
        };

        const execution: WorkflowExecution = {
          workflow: mockWorkflow,
          inputs: {},
          outputs: {
            step1: { result: "Previous step output" },
          },
          currentStep: 1,
          status: "running",
        };

        (WorkflowParser.resolveVariables as jest.Mock).mockReturnValue(
          "Previous result: Previous step output",
        );

        (
          workflowEngine as unknown as {
            resolveStepVariables: (
              step: ClaudeStep,
              execution: WorkflowExecution,
            ) => ClaudeStep;
          }
        ).resolveStepVariables(step, execution);

        expect(WorkflowParser.resolveVariables).toHaveBeenCalledWith(
          "Previous result: ${{ steps.step1.outputs.result }}",
          expect.objectContaining({
            inputs: {},
            env: { ENV_VAR: "test-value" },
            steps: {
              step1: { outputs: { result: "Previous step output" } },
            },
          }),
        );
      });

      it("should resolve environment variables", () => {
        const step: ClaudeStep = {
          uses: "claude-pipeline-action",
          with: {
            prompt: "Using env: ${{ env.TEST_VAR }}",
            working_directory: "${{ env.WORK_DIR }}",
          },
        };

        const workflowWithEnv: ClaudeWorkflow = {
          ...mockWorkflow,
          env: { TEST_VAR: "test-value", WORK_DIR: "/workspace" },
        };

        const execution: WorkflowExecution = {
          workflow: workflowWithEnv,
          inputs: {},
          outputs: {},
          currentStep: 0,
          status: "pending",
        };

        (WorkflowParser.resolveVariables as jest.Mock)
          .mockReturnValueOnce("Using env: test-value")
          .mockReturnValueOnce("/workspace");

        (
          workflowEngine as unknown as {
            resolveStepVariables: (
              step: ClaudeStep,
              execution: WorkflowExecution,
            ) => ClaudeStep;
          }
        ).resolveStepVariables(step, execution);
      });

      it("should handle complex variable resolution with nested references", () => {
        const step: ClaudeStep = {
          uses: "claude-pipeline-action",
          with: {
            prompt:
              "Process ${{ inputs.data }} with ${{ env.CONFIG }} using ${{ steps.setup.outputs.result }}",
            model: "${{ inputs.model }}",
            working_directory: "${{ env.WORKSPACE }}/${{ inputs.project }}",
          },
        };

        const execution: WorkflowExecution = {
          workflow: {
            ...mockWorkflow,
            env: { CONFIG: "production", WORKSPACE: "/workspace" },
          },
          inputs: {
            data: "user-data",
            model: "claude-3",
            project: "my-project",
          },
          outputs: {
            setup: { result: "setup-complete" },
          },
          currentStep: 1,
          status: "running",
        };

        (WorkflowParser.resolveVariables as jest.Mock)
          .mockReturnValueOnce(
            "Process user-data with production using setup-complete",
          )
          .mockReturnValueOnce("claude-3")
          .mockReturnValueOnce("/workspace/my-project");

        const result = (
          workflowEngine as unknown as {
            resolveStepVariables: (
              step: ClaudeStep,
              execution: WorkflowExecution,
            ) => ClaudeStep;
          }
        ).resolveStepVariables(step, execution);

        expect(result.with.prompt).toBe(
          "Process user-data with production using setup-complete",
        );
        expect(result.with.model).toBe("claude-3");
        expect(result.with.working_directory).toBe("/workspace/my-project");
      });

      it("should preserve non-string values during variable resolution", () => {
        const step: ClaudeStep = {
          uses: "claude-pipeline-action",
          with: {
            prompt: "Test prompt",
            allow_all_tools: true,
            output_session: false,
            timeout: 30000,
          },
        };

        const execution: WorkflowExecution = {
          workflow: mockWorkflow,
          inputs: {},
          outputs: {},
          currentStep: 0,
          status: "pending",
        };

        (WorkflowParser.resolveVariables as jest.Mock).mockReturnValue(
          "Test prompt",
        );

        const result = (
          workflowEngine as unknown as {
            resolveStepVariables: (
              step: ClaudeStep,
              execution: WorkflowExecution,
            ) => ClaudeStep;
          }
        ).resolveStepVariables(step, execution);

        expect(result.with.allow_all_tools).toBe(true);
        expect(result.with.output_session).toBe(false);
        expect(result.with.timeout).toBe(30000);
      });
    });

    describe("step execution ordering and dependencies", () => {
      it("should execute steps in correct order across multiple jobs", async () => {
        const multiJobWorkflow: ClaudeWorkflow = {
          name: "multi-job-workflow",
          jobs: {
            setup: {
              steps: [
                { run: "echo 'setup regular step'" },
                {
                  id: "setup-claude",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Setup environment" },
                } as ClaudeStep,
              ],
            },
            build: {
              steps: [
                {
                  id: "build-claude",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Build application" },
                } as ClaudeStep,
                { run: "echo 'build regular step'" },
              ],
            },
            test: {
              steps: [
                {
                  id: "test-claude",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Run tests" },
                } as ClaudeStep,
              ],
            },
          },
        };

        const execution = workflowEngine.createExecution(multiJobWorkflow, {});
        const executionOrder: string[] = [];

        (WorkflowParser.resolveVariables as jest.Mock)
          .mockReturnValueOnce("Setup environment")
          .mockReturnValueOnce("Build application")
          .mockReturnValueOnce("Run tests");

        mockExecutor.executeTask.mockImplementation(async (prompt) => {
          if (prompt.includes("Setup")) {
            executionOrder.push("setup-claude");
          }
          if (prompt.includes("Build")) {
            executionOrder.push("build-claude");
          }
          if (prompt.includes("Run tests")) {
            executionOrder.push("test-claude");
          }

          return {
            taskId: "task-123",
            success: true,
            output: '{"result": "Done"}',
            executionTimeMs: 100,
          };
        });

        await workflowEngine.executeWorkflow(execution, {});

        expect(executionOrder).toEqual([
          "setup-claude",
          "build-claude",
          "test-claude",
        ]);
      });

      it("should handle step dependencies through output references", async () => {
        const dependencyWorkflow: ClaudeWorkflow = {
          name: "dependency-workflow",
          jobs: {
            pipeline: {
              steps: [
                {
                  id: "step-a",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Generate configuration" },
                } as ClaudeStep,
                {
                  id: "step-b",
                  uses: "claude-pipeline-action",
                  with: {
                    prompt: "Use config: ${{ steps.step-a.outputs.result }}",
                  },
                } as ClaudeStep,
                {
                  id: "step-c",
                  uses: "claude-pipeline-action",
                  with: {
                    prompt:
                      "Final step with A: ${{ steps.step-a.outputs.result }} and B: ${{ steps.step-b.outputs.result }}",
                  },
                } as ClaudeStep,
              ],
            },
          },
        };

        const execution = workflowEngine.createExecution(
          dependencyWorkflow,
          {},
        );

        mockExecutor.executeTask
          .mockResolvedValueOnce({
            taskId: "task-a",
            success: true,
            output: '{"result": "config-data"}',
            executionTimeMs: 100,
          })
          .mockResolvedValueOnce({
            taskId: "task-b",
            success: true,
            output: '{"result": "processed-config"}',
            executionTimeMs: 200,
          })
          .mockResolvedValueOnce({
            taskId: "task-c",
            success: true,
            output: '{"result": "final-result"}',
            executionTimeMs: 150,
          });

        (WorkflowParser.resolveVariables as jest.Mock)
          .mockReturnValueOnce("Generate configuration")
          .mockReturnValueOnce("Use config: config-data")
          .mockReturnValueOnce(
            "Final step with A: config-data and B: processed-config",
          );

        const result = await workflowEngine.executeWorkflow(execution, {});

        expect(result.success).toBe(true);
        expect(result.stepsExecuted).toBe(3);
        expect(execution.outputs["step-a"]).toEqual({
          result: '{"result": "config-data"}',
        });
        expect(execution.outputs["step-b"]).toEqual({
          result: '{"result": "processed-config"}',
        });
        expect(execution.outputs["step-c"]).toEqual({
          result: '{"result": "final-result"}',
        });
      });

      it("should handle parallel step execution simulation", async () => {
        const parallelWorkflow: ClaudeWorkflow = {
          name: "parallel-workflow",
          jobs: {
            "parallel-job": {
              steps: [
                {
                  id: "parallel-step-1",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Independent task 1" },
                } as ClaudeStep,
                {
                  id: "parallel-step-2",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Independent task 2" },
                } as ClaudeStep,
                {
                  id: "parallel-step-3",
                  uses: "claude-pipeline-action",
                  with: { prompt: "Independent task 3" },
                } as ClaudeStep,
              ],
            },
          },
        };

        const execution = workflowEngine.createExecution(parallelWorkflow, {});
        const startTimes: Record<string, number> = {};
        const endTimes: Record<string, number> = {};

        mockExecutor.executeTask.mockImplementation(async (prompt) => {
          const stepId = prompt.includes("1")
            ? "parallel-step-1"
            : prompt.includes("2")
              ? "parallel-step-2"
              : "parallel-step-3";

          startTimes[stepId] = Date.now();

          await new Promise((resolve) => setTimeout(resolve, 50));

          endTimes[stepId] = Date.now();

          return {
            taskId: `task-${stepId}`,
            success: true,
            output: `{"result": "Completed ${stepId}"}`,
            executionTimeMs: 50,
          };
        });

        const result = await workflowEngine.executeWorkflow(execution, {});

        expect(result.success).toBe(true);
        expect(result.stepsExecuted).toBe(3);

        const totalSequentialTime = Object.values(endTimes).reduce(
          (sum, time, index) => {
            return sum + (time - Object.values(startTimes)[index]);
          },
          0,
        );

        expect(totalSequentialTime).toBeGreaterThan(30);
      });
    });
  });

  describe("Performance Optimization", () => {
    it("should handle large workflows efficiently", async () => {
      const largeWorkflow: ClaudeWorkflow = {
        name: "large-workflow",
        jobs: {},
      };

      // Generate 100 jobs with 10 Claude steps each
      for (let i = 0; i < 100; i++) {
        largeWorkflow.jobs[`job-${i}`] = {
          steps: Array(10)
            .fill(null)
            .map(
              (_, j) =>
                ({
                  id: `step-${i}-${j}`,
                  uses: "claude-pipeline-action",
                  with: { prompt: `Step ${i}-${j}` },
                }) as ClaudeStep,
            ),
        };
      }

      const execution = workflowEngine.createExecution(largeWorkflow, {});

      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      const startTime = Date.now();
      const result = await workflowEngine.executeWorkflow(execution, {});
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(1000);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it("should batch state updates for performance", async () => {
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

      await workflowEngine.executeWorkflow(
        mockExecution,
        {},
        undefined,
        undefined,
        undefined,
        "/test/workflow.yml",
      );

      // Should update workflow progress for each step completion
      expect(
        mockWorkflowStateService.updateWorkflowProgress,
      ).toHaveBeenCalledTimes(5); // 2 steps + checkpoints + completion
    });

    it("should clean up resources after execution", async () => {
      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      await workflowEngine.executeWorkflow(mockExecution, {});

      expect(mockWorkflowJsonLogger.cleanup).toHaveBeenCalled();
      expect(workflowEngine.getCurrentWorkflowExecutionId()).toBeNull();
    });

    it("should handle memory efficiently with large outputs", async () => {
      const largeOutput = JSON.stringify({
        result: "Large output " + "x".repeat(1000000), // 1MB+ output
      });

      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: largeOutput,
        executionTimeMs: 1000,
      });

      const result = await workflowEngine.executeWorkflow(mockExecution, {});

      expect(result.success).toBe(true);
      expect((result.outputs.step1 as { result: string }).result).toContain(
        "Large output",
      );
    });

    it("should optimize variable resolution for repeated patterns", async () => {
      const templateWorkflow: ClaudeWorkflow = {
        name: "template-workflow",
        jobs: {
          template: {
            steps: Array(50)
              .fill(null)
              .map(
                (_, i) =>
                  ({
                    id: `template-step-${i}`,
                    uses: "claude-pipeline-action",
                    with: {
                      prompt: `Process item ${i} using ${"$"}{{ inputs.baseConfig }} and ${"$"}{{ env.SHARED_VALUE }}`,
                      model: "${{ inputs.model }}",
                    },
                  }) as ClaudeStep,
              ),
          },
        },
      };

      const execution = workflowEngine.createExecution(templateWorkflow, {
        baseConfig: "shared-config",
        model: "claude-3",
      });

      execution.workflow.env = { SHARED_VALUE: "shared-env-value" };

      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 10,
      });

      const startTime = Date.now();
      const result = await workflowEngine.executeWorkflow(execution, {});
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(50);
      expect(totalTime).toBeLessThan(2000);
    });

    it("should handle workflow execution under resource constraints", async () => {
      const resourceConstrainedWorkflow: ClaudeWorkflow = {
        name: "resource-constrained-workflow",
        jobs: {
          intensive: {
            steps: Array(20)
              .fill(null)
              .map(
                (_, i) =>
                  ({
                    id: `intensive-step-${i}`,
                    uses: "claude-pipeline-action",
                    with: { prompt: `Intensive task ${i}` },
                  }) as ClaudeStep,
              ),
          },
        },
      };

      const execution = workflowEngine.createExecution(
        resourceConstrainedWorkflow,
        {},
      );

      let concurrentExecutions = 0;
      let maxConcurrentExecutions = 0;

      mockExecutor.executeTask.mockImplementation(async () => {
        concurrentExecutions++;
        maxConcurrentExecutions = Math.max(
          maxConcurrentExecutions,
          concurrentExecutions,
        );

        await new Promise((resolve) => setTimeout(resolve, 10));

        concurrentExecutions--;

        return {
          taskId: "task-123",
          success: true,
          output: '{"result": "Done"}',
          executionTimeMs: 10,
        };
      });

      const result = await workflowEngine.executeWorkflow(execution, {});

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(20);
      expect(maxConcurrentExecutions).toBe(1);
    });

    it("should minimize memory footprint during long-running workflows", async () => {
      const longRunningWorkflow: ClaudeWorkflow = {
        name: "long-running-workflow",
        jobs: {
          streaming: {
            steps: Array(10)
              .fill(null)
              .map(
                (_, i) =>
                  ({
                    id: `streaming-step-${i}`,
                    uses: "claude-pipeline-action",
                    with: { prompt: `Stream processing step ${i}` },
                  }) as ClaudeStep,
              ),
          },
        },
      };

      const execution = workflowEngine.createExecution(longRunningWorkflow, {});

      const memorySnapshots: number[] = [];

      mockExecutor.executeTask.mockImplementation(async () => {
        const used = process.memoryUsage();
        memorySnapshots.push(used.heapUsed);

        return {
          taskId: "task-123",
          success: true,
          output: '{"result": "Processed"}',
          executionTimeMs: 100,
        };
      });

      const result = await workflowEngine.executeWorkflow(execution, {});

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(10);

      const memoryGrowth =
        memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0];
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });

    it("should optimize execution time for workflows with many small steps", async () => {
      const microStepWorkflow: ClaudeWorkflow = {
        name: "micro-step-workflow",
        jobs: {
          micro: {
            steps: Array(100)
              .fill(null)
              .map(
                (_, i) =>
                  ({
                    id: `micro-step-${i}`,
                    uses: "claude-pipeline-action",
                    with: { prompt: `Micro task ${i}` },
                  }) as ClaudeStep,
              ),
          },
        },
      };

      const execution = workflowEngine.createExecution(microStepWorkflow, {});

      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Quick"}',
        executionTimeMs: 1,
      });

      const startTime = Date.now();
      const result = await workflowEngine.executeWorkflow(execution, {});
      const overheadTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(100);
      expect(overheadTime).toBeLessThan(1000);
      expect(overheadTime / result.stepsExecuted).toBeLessThan(5);
    });
  });

  describe("Edge Cases and Error Scenarios", () => {
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

      const result = await workflowEngine.executeWorkflow(mockExecution, {});

      expect(result.success).toBe(true);
      expect((result.outputs.step1 as { result: string }).result).toBe(
        "not-valid-json",
      );
    });

    it("should handle concurrent workflow executions", async () => {
      const execution1 = workflowEngine.createExecution(mockWorkflow, {
        param1: "test1",
      });
      const execution2 = workflowEngine.createExecution(mockWorkflow, {
        param1: "test2",
      });

      mockExecutor.executeTask.mockResolvedValue({
        taskId: "task-123",
        success: true,
        output: '{"result": "Done"}',
        executionTimeMs: 1000,
      });

      const [result1, result2] = await Promise.all([
        workflowEngine.executeWorkflow(execution1, {}),
        workflowEngine.executeWorkflow(execution2, {}),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(execution1.inputs.param1).toBe("test1");
      expect(execution2.inputs.param1).toBe("test2");
    });
  });
});
