import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

import {
  WorkflowJsonLogger,
  JsonLogFormat,
} from "../../../src/services/WorkflowJsonLogger";
import {
  WorkflowState,
  WorkflowStepResult,
} from "../../../src/services/WorkflowStateService";
import { IFileSystem } from "../../../src/core/interfaces/IFileSystem";
import { ILogger } from "../../../src/core/interfaces/ILogger";
import { WorkflowExecution } from "../../../src/types/WorkflowTypes";

// Mock factories to avoid recreating complex objects
const createMockFileSystem = (): jest.Mocked<IFileSystem> => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  exists: jest.fn(),
  mkdir: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
});

const createMockLogger = (): jest.Mocked<ILogger> => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

const createMockWorkflowExecution = (): WorkflowExecution => ({
  workflow: {
    name: "Test Workflow",
    jobs: {
      pipeline: {
        name: "Pipeline Job",
        steps: [
          {
            id: "step1",
            name: "First Step",
            uses: "claude-pipeline-action",
            with: {
              prompt: "Test prompt",
              output_session: true,
              resume_session: "session1",
            },
          },
          {
            id: "step2",
            name: "Second Step",
            uses: "claude-pipeline-action",
            with: {
              prompt: "Test prompt 2",
              output_session: false,
            },
          },
        ],
      },
    },
  },
  inputs: {},
  outputs: {},
  currentStep: 0,
  status: "running",
});

const createMockWorkflowState = (
  execution: WorkflowExecution,
): WorkflowState => ({
  executionId: "test-execution-id",
  workflowPath: "/workspace/workflows/test.yml",
  workflowName: "Test Workflow",
  startTime: "2023-01-01T10:00:00.000Z",
  currentStep: 0,
  totalSteps: 2,
  status: "running",
  sessionMappings: {},
  completedSteps: [],
  execution,
  canResume: true,
});

describe("WorkflowJsonLogger", () => {
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockLogger: jest.Mocked<ILogger>;
  let logger: WorkflowJsonLogger;
  let mockWorkflowState: WorkflowState;
  let mockWorkflowExecution: WorkflowExecution;

  beforeEach(() => {
    mockFileSystem = createMockFileSystem();
    mockLogger = createMockLogger();
    logger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
    mockWorkflowExecution = createMockWorkflowExecution();
    mockWorkflowState = createMockWorkflowState(mockWorkflowExecution);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("initializeLog", () => {
    it("should initialize log with correct structure and path", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      const workflowPath = "/workspace/workflows/test-workflow.yml";

      await logger.initializeLog(mockWorkflowState, workflowPath);

      expect(logger.getLogFilePath()).toBe(
        "/workspace/workflows/test-workflow.json",
      );

      const currentLog = logger.getCurrentLog();
      expect(currentLog).toBeDefined();
      expect(currentLog?.workflow_name).toBe("Test Workflow");
      expect(currentLog?.workflow_file).toBe("test-workflow.yml");
      expect(currentLog?.execution_id).toMatch(/^\d{8}-\d{6}$/);
      expect(currentLog?.status).toBe("running");
      expect(currentLog?.last_completed_step).toBe(-1);
      expect(currentLog?.total_steps).toBe(2);
      expect(currentLog?.steps).toEqual([]);
    });

    it("should create log directory if it doesn't exist", async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      const workflowPath = "/workspace/workflows/test-workflow.yml";

      await logger.initializeLog(mockWorkflowState, workflowPath);

      expect(mockFileSystem.mkdir).toHaveBeenCalledWith(
        "/workspace/workflows",
        { recursive: true },
      );
    });

    it("should generate execution ID in correct format (YYYYMMDD-HHMMSS)", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      const mockDate = new Date("2023-05-15T14:30:45.123Z");
      jest.spyOn(global, "Date").mockImplementation((...args: unknown[]) => {
        if (args.length === 0) {
          return mockDate;
        }
        return new (Date as unknown as new (...args: unknown[]) => Date)(
          ...args,
        );
      });

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.execution_id).toBe("20230515-143045");

      jest.restoreAllMocks();
    });

    it("should use workflow base name if workflow name is empty", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      const workflowStateWithEmptyName = {
        ...mockWorkflowState,
        execution: {
          ...mockWorkflowExecution,
          workflow: {
            ...mockWorkflowExecution.workflow,
            name: "",
          },
        },
      };

      await logger.initializeLog(
        workflowStateWithEmptyName,
        "/workspace/my-workflow.yml",
      );

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.workflow_name).toBe("my-workflow");
    });

    it("should handle empty jobs gracefully", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      const workflowStateEmptyJobs = {
        ...mockWorkflowState,
        execution: {
          ...mockWorkflowExecution,
          workflow: {
            name: "Empty Workflow",
            jobs: {},
          },
        },
      };

      await logger.initializeLog(workflowStateEmptyJobs, "/workspace/test.yml");

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.total_steps).toBe(0);
    });

    it("should write initial log file", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        "/workspace/test.json",
        expect.stringContaining('"workflow_name": "Test Workflow"'),
      );
    });

    it("should handle file system errors gracefully", async () => {
      mockFileSystem.exists.mockRejectedValue(new Error("File system error"));

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to initialize workflow JSON log",
        expect.any(Error),
      );
    });
  });

  describe("updateStepProgress", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
      jest.clearAllMocks();
    });

    it("should add completed step to log with correct data", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        sessionId: "session-123",
        outputSession: true,
        status: "completed",
        startTime: "2023-01-01T10:00:00.000Z",
        endTime: "2023-01-01T10:05:00.000Z",
        output: "Step completed successfully",
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(1);

      const logStep = currentLog?.steps[0];
      expect(logStep).toEqual({
        step_index: 0,
        step_id: "step1",
        step_name: "First Step",
        status: "completed",
        start_time: "2023-01-01T10:00:00.000Z",
        end_time: "2023-01-01T10:05:00.000Z",
        duration_ms: 300000,
        output: "Step completed successfully",
        session_id: "session-123",
        output_session: true,
        resume_session: "session1",
      });

      expect(currentLog?.last_completed_step).toBe(0);
    });

    it("should add failed step to log", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 1,
        stepId: "step2",
        sessionId: "session-456",
        outputSession: false,
        status: "failed",
        startTime: "2023-01-01T10:05:00.000Z",
        endTime: "2023-01-01T10:06:00.000Z",
        output: "Step failed with error",
        error: "Something went wrong",
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      const logStep = currentLog?.steps[0];
      expect(logStep?.status).toBe("failed");
      expect(logStep?.step_name).toBe("Second Step");
      expect(logStep?.output_session).toBe(false);
      expect(logStep?.resume_session).toBeUndefined();
    });

    it("should not add running or pending steps to log", async () => {
      const runningStep: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "running",
        outputSession: false,
      };

      await logger.updateStepProgress(runningStep, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(0);
    });

    it("should use default step name when not available in workflow", async () => {
      const workflowWithoutStepName = {
        ...mockWorkflowState,
        execution: {
          ...mockWorkflowExecution,
          workflow: {
            name: "Test",
            jobs: {
              pipeline: {
                steps: [{ id: "step1", uses: "action" }],
              },
            },
          },
        },
      };

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, workflowWithoutStepName);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.step_name).toBe("Step 1");
    });

    it("should calculate duration correctly", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        startTime: "2023-01-01T10:00:00.000Z",
        endTime: "2023-01-01T10:02:30.500Z",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.duration_ms).toBe(150500);
    });

    it("should use current time when start/end times are missing", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.start_time).toBeDefined();
      expect(currentLog?.steps[0]?.end_time).toBeDefined();
      expect(currentLog?.steps[0]?.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should update workflow status based on workflow state", async () => {
      const completedWorkflowState = {
        ...mockWorkflowState,
        status: "completed" as const,
      };

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, completedWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.status).toBe("completed");
    });

    it("should update workflow status to paused when step is paused", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "paused",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.status).toBe("paused");
    });

    it("should do nothing if log is not initialized", async () => {
      const uninitializedLogger = new WorkflowJsonLogger(
        mockFileSystem,
        mockLogger,
      );

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await uninitializedLogger.updateStepProgress(
        stepResult,
        mockWorkflowState,
      );

      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      // Create fresh logger for this test
      const errorLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
      await errorLogger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      mockFileSystem.writeFile.mockRejectedValue(new Error("Write error"));
      jest.clearAllMocks(); // Clear mocks from initialization

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await errorLogger.updateStepProgress(stepResult, mockWorkflowState);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to write workflow JSON log file",
        expect.any(Error),
      );
    });

    it("should update last_update_time on every call", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "running",
        outputSession: false,
      };

      const originalTime = logger.getCurrentLog()?.last_update_time;

      // Mock Date to ensure time difference
      const mockDate = new Date("2023-01-01T10:10:00.000Z");
      jest.spyOn(global, "Date").mockImplementation((...args: unknown[]) => {
        if (args.length === 0) {
          return mockDate;
        }
        return new (Date as unknown as new (...args: unknown[]) => Date)(
          ...args,
        );
      });

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.last_update_time).toBe("2023-01-01T10:10:00.000Z");
      expect(currentLog?.last_update_time).not.toBe(originalTime);

      jest.restoreAllMocks();
    });
  });

  describe("updateWorkflowStatus", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
      jest.clearAllMocks();
    });

    it("should update workflow status and last_update_time", async () => {
      const originalTime = logger.getCurrentLog()?.last_update_time;

      // Mock Date to ensure time difference
      const mockDate = new Date("2023-01-01T10:05:00.000Z");
      jest.spyOn(global, "Date").mockImplementation((...args: unknown[]) => {
        if (args.length === 0) {
          return mockDate;
        }
        return new (Date as unknown as new (...args: unknown[]) => Date)(
          ...args,
        );
      });

      await logger.updateWorkflowStatus("completed");

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.status).toBe("completed");
      expect(currentLog?.last_update_time).toBe("2023-01-01T10:05:00.000Z");
      expect(currentLog?.last_update_time).not.toBe(originalTime);
      expect(mockFileSystem.writeFile).toHaveBeenCalled();

      jest.restoreAllMocks();
    });

    it("should handle all valid status values", async () => {
      const statuses: Array<"running" | "paused" | "completed" | "failed"> = [
        "running",
        "paused",
        "completed",
        "failed",
      ];

      for (const status of statuses) {
        await logger.updateWorkflowStatus(status);
        const currentLog = logger.getCurrentLog();
        expect(currentLog?.status).toBe(status);
      }
    });

    it("should do nothing if log is not initialized", async () => {
      const uninitializedLogger = new WorkflowJsonLogger(
        mockFileSystem,
        mockLogger,
      );

      await uninitializedLogger.updateWorkflowStatus("completed");

      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      // Create fresh logger for this test
      const errorLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
      await errorLogger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      mockFileSystem.writeFile.mockRejectedValue(new Error("Write error"));
      jest.clearAllMocks(); // Clear mocks from initialization

      await errorLogger.updateWorkflowStatus("failed");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to write workflow JSON log file",
        expect.any(Error),
      );
    });
  });

  describe("getLogFilePath", () => {
    it("should return undefined when not initialized", () => {
      expect(logger.getLogFilePath()).toBeUndefined();
    });

    it("should return correct path after initialization", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      expect(logger.getLogFilePath()).toBe("/workspace/test.json");
    });
  });

  describe("getCurrentLog", () => {
    it("should return undefined when not initialized", () => {
      expect(logger.getCurrentLog()).toBeUndefined();
    });

    it("should return log structure after initialization", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      const currentLog = logger.getCurrentLog();
      expect(currentLog).toBeDefined();
      expect(currentLog?.workflow_name).toBe("Test Workflow");
    });
  });

  describe("finalize", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
      jest.clearAllMocks();
    });

    it("should change running status to completed", async () => {
      const currentLog = logger.getCurrentLog();
      if (currentLog) {
        currentLog.status = "running";
      }

      await logger.finalize();

      expect(currentLog?.status).toBe("completed");
      expect(mockFileSystem.writeFile).toHaveBeenCalled();
    });

    it("should not change non-running status", async () => {
      const currentLog = logger.getCurrentLog();
      if (currentLog) {
        currentLog.status = "failed";
      }

      await logger.finalize();

      expect(currentLog?.status).toBe("failed");
    });

    it("should do nothing if log is not initialized", async () => {
      const uninitializedLogger = new WorkflowJsonLogger(
        mockFileSystem,
        mockLogger,
      );

      await uninitializedLogger.finalize();

      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
    });

    it("should clear log file path and current log", () => {
      expect(logger.getLogFilePath()).toBeDefined();
      expect(logger.getCurrentLog()).toBeDefined();

      logger.cleanup();

      expect(logger.getLogFilePath()).toBeUndefined();
      expect(logger.getCurrentLog()).toBeUndefined();
    });
  });

  describe("JSON serialization and format validation", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
      jest.clearAllMocks();
    });

    it("should write valid JSON with proper formatting", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        startTime: "2023-01-01T10:00:00.000Z",
        endTime: "2023-01-01T10:05:00.000Z",
        output: "Test output",
        sessionId: "session-123",
        outputSession: true,
      };

      jest.clearAllMocks(); // Clear setup mocks
      await logger.updateStepProgress(stepResult, mockWorkflowState);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/^\{[\s\S]*\}$/),
      );

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      expect(() => JSON.parse(jsonContent)).not.toThrow();

      const parsedLog = JSON.parse(jsonContent) as JsonLogFormat;
      expect(parsedLog.workflow_name).toBe("Test Workflow");
      expect(parsedLog.steps).toHaveLength(1);
      expect(parsedLog.steps[0].step_index).toBe(0);
    });

    it("should handle special characters in output", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        output: 'Output with "quotes", \n newlines, and \t tabs',
        outputSession: false,
      };

      jest.clearAllMocks(); // Clear setup mocks
      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      expect(() => JSON.parse(jsonContent)).not.toThrow();

      const parsedLog = JSON.parse(jsonContent) as JsonLogFormat;
      expect(parsedLog.steps[0].output).toBe(
        'Output with "quotes", \n newlines, and \t tabs',
      );
    });

    it("should format JSON with proper indentation", async () => {
      jest.clearAllMocks(); // Clear setup mocks
      await logger.updateWorkflowStatus("running");

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      expect(jsonContent).toContain('  "workflow_name"');
      expect(jsonContent).toContain('  "status"');
    });
  });

  describe("log file management", () => {
    it("should generate correct log file path for different workflow paths", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      const testCases = [
        {
          workflowPath: "/workspace/workflows/deploy.yml",
          expectedLogPath: "/workspace/workflows/deploy.json",
        },
        {
          workflowPath: "/home/user/my-workflow.yaml",
          expectedLogPath: "/home/user/my-workflow.json",
        },
        {
          workflowPath: "/tmp/test",
          expectedLogPath: "/tmp/test.json",
        },
      ];

      for (const testCase of testCases) {
        const newLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
        await newLogger.initializeLog(mockWorkflowState, testCase.workflowPath);
        expect(newLogger.getLogFilePath()).toBe(testCase.expectedLogPath);
      }
    });

    it("should handle workflow paths with no extension", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      await logger.initializeLog(mockWorkflowState, "/workspace/workflow");

      expect(logger.getLogFilePath()).toBe("/workspace/workflow.json");
    });

    it("should create log in same directory as workflow file", async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      const workflowPath = "/deeply/nested/folder/structure/workflow.yml";

      await logger.initializeLog(mockWorkflowState, workflowPath);

      expect(logger.getLogFilePath()).toBe(
        "/deeply/nested/folder/structure/workflow.json",
      );
    });
  });

  describe("error handling and recovery", () => {
    it("should continue working after file system errors during initialization", async () => {
      mockFileSystem.exists.mockRejectedValue(new Error("Permission denied"));

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      expect(mockLogger.error).toHaveBeenCalled();
      expect(logger.getCurrentLog()).toBeUndefined();
    });

    it("should continue working after write errors", async () => {
      // Create fresh logger for this test
      const errorLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
      await errorLogger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      mockFileSystem.writeFile.mockRejectedValue(new Error("Disk full"));
      jest.clearAllMocks(); // Clear the mock from initialization

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await errorLogger.updateStepProgress(stepResult, mockWorkflowState);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to write workflow JSON log file",
        expect.any(Error),
      );

      const currentLog = errorLogger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(1);
    });

    it("should handle non-Error objects in catch blocks", async () => {
      mockFileSystem.exists.mockRejectedValue("String error");

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to initialize workflow JSON log",
        expect.any(Error),
      );
    });

    it("should log write errors for file operations", async () => {
      // Create fresh logger for this test
      const errorLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
      await errorLogger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      mockFileSystem.writeFile.mockRejectedValue(new Error("Write failed"));
      jest.clearAllMocks(); // Clear the mock from initialization

      await errorLogger.updateWorkflowStatus("completed");
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to write workflow JSON log file",
        expect.any(Error),
      );

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await errorLogger.updateStepProgress(stepResult, mockWorkflowState);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to write workflow JSON log file",
        expect.any(Error),
      );
    });

    it("should handle directory creation errors during initialization", async () => {
      mockFileSystem.exists.mockResolvedValue(false);
      mockFileSystem.mkdir.mockRejectedValue(
        new Error("Cannot create directory"),
      );

      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to initialize workflow JSON log",
        expect.any(Error),
      );
    });

    it("should handle workflow state with missing jobs structure", async () => {
      const workflowWithMissingJobs = {
        ...mockWorkflowState,
        execution: {
          ...mockWorkflowExecution,
          workflow: {
            name: "Incomplete Workflow",
            jobs: {},
          },
        },
      };

      mockFileSystem.exists.mockResolvedValue(true);

      await logger.initializeLog(
        workflowWithMissingJobs,
        "/workspace/test.yml",
      );

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.total_steps).toBe(0);
    });

    it("should handle corrupted state gracefully through normal operations", async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");

      // Simulate filesystem corruption by making writeFile fail
      mockFileSystem.writeFile.mockRejectedValueOnce(
        new Error("Filesystem corruption"),
      );

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      // Should handle filesystem errors gracefully without throwing
      await expect(
        logger.updateStepProgress(stepResult, mockWorkflowState),
      ).resolves.not.toThrow();

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to write workflow JSON log file",
        expect.any(Error),
      );
    });
  });

  describe("log data serialization and deserialization", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
      jest.clearAllMocks();
    });

    it("should serialize complex data structures correctly", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        startTime: "2023-01-01T10:00:00.000Z",
        endTime: "2023-01-01T10:05:00.000Z",
        output: JSON.stringify({
          nested: {
            object: "value",
            array: [1, 2, 3],
            boolean: true,
            null: null,
          },
        }),
        sessionId: "session-123",
        outputSession: true,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      expect(() => JSON.parse(jsonContent)).not.toThrow();

      const parsedLog = JSON.parse(jsonContent) as JsonLogFormat;
      const parsedOutput = JSON.parse(parsedLog.steps[0].output);
      expect(parsedOutput.nested.object).toBe("value");
      expect(parsedOutput.nested.array).toEqual([1, 2, 3]);
      expect(parsedOutput.nested.boolean).toBe(true);
      expect(parsedOutput.nested.null).toBeNull();
    });

    it("should handle unicode characters in output", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        output: "Unicode: 🚀 中文 العربية ñáéíóú àèìòù",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      const parsedLog = JSON.parse(jsonContent) as JsonLogFormat;
      expect(parsedLog.steps[0].output).toBe(
        "Unicode: 🚀 中文 العربية ñáéíóú àèìòù",
      );
    });

    it("should preserve numeric precision in duration calculations", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        startTime: "2023-01-01T10:00:00.123Z",
        endTime: "2023-01-01T10:00:01.456Z",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.duration_ms).toBe(1333);
    });

    it("should handle very large output strings", async () => {
      const largeOutput = "x".repeat(100000);
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        output: largeOutput,
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      const parsedLog = JSON.parse(jsonContent) as JsonLogFormat;
      expect(parsedLog.steps[0].output).toBe(largeOutput);
    });

    it("should serialize dates consistently across different timezones", async () => {
      const originalTimezone = process.env.TZ;

      try {
        process.env.TZ = "UTC";
        const utcLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
        await utcLogger.initializeLog(
          mockWorkflowState,
          "/workspace/test-utc.yml",
        );
        const utcLog = utcLogger.getCurrentLog();

        process.env.TZ = "America/New_York";
        const estLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
        await estLogger.initializeLog(
          mockWorkflowState,
          "/workspace/test-est.yml",
        );
        const estLog = estLogger.getCurrentLog();

        // Both should produce ISO string format regardless of timezone
        expect(utcLog?.start_time).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        );
        expect(estLog?.start_time).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        );
      } finally {
        process.env.TZ = originalTimezone;
      }
    });

    it("should handle null and undefined values appropriately", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        output: undefined,
        sessionId: null as unknown as string,
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      const parsedLog = JSON.parse(jsonContent) as JsonLogFormat;
      expect(parsedLog.steps[0].output).toBe("");
      expect(parsedLog.steps[0].session_id).toBe("");
    });

    it("should maintain consistent field ordering in serialized JSON", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const writeCall = mockFileSystem.writeFile.mock.calls[0];
      const jsonContent = writeCall[1];

      // Check that main fields appear in expected order
      const fieldOrder = [
        "workflow_name",
        "workflow_file",
        "execution_id",
        "start_time",
        "last_update_time",
        "status",
        "last_completed_step",
        "total_steps",
        "steps",
      ];

      let lastIndex = -1;
      for (const field of fieldOrder) {
        const currentIndex = jsonContent.indexOf(`"${field}"`);
        expect(currentIndex).toBeGreaterThan(lastIndex);
        lastIndex = currentIndex;
      }
    });
  });

  describe("log file management and rotation", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
      jest.clearAllMocks();
    });

    it("should handle concurrent log file access", async () => {
      const stepResult1: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      const stepResult2: WorkflowStepResult = {
        stepIndex: 1,
        stepId: "step2",
        status: "completed",
        outputSession: false,
      };

      // Simulate concurrent updates
      const promises = [
        logger.updateStepProgress(stepResult1, mockWorkflowState),
        logger.updateStepProgress(stepResult2, mockWorkflowState),
        logger.updateWorkflowStatus("running"),
      ];

      await Promise.all(promises);

      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(3);
      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(2);
    });

    it("should handle file system permissions gracefully", async () => {
      mockFileSystem.writeFile.mockRejectedValue(
        new Error("EACCES: permission denied"),
      );

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to write workflow JSON log file",
        expect.any(Error),
      );

      // Log should still be updated in memory
      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(1);
    });

    it("should manage log file size efficiently", async () => {
      // Add multiple steps to test file size handling
      for (let i = 0; i < 100; i++) {
        const stepResult: WorkflowStepResult = {
          stepIndex: i,
          stepId: `step${i}`,
          status: "completed",
          output: `Output for step ${i}`.repeat(100),
          outputSession: false,
        };

        await logger.updateStepProgress(stepResult, mockWorkflowState);
      }

      const writeCall = mockFileSystem.writeFile.mock.calls[99];
      const jsonContent = writeCall[1];

      // Verify the JSON is still valid despite large size
      expect(() => JSON.parse(jsonContent)).not.toThrow();

      const parsedLog = JSON.parse(jsonContent) as JsonLogFormat;
      expect(parsedLog.steps).toHaveLength(100);
    });

    it("should preserve log integrity across multiple operations", async () => {
      // Perform a series of operations that modify the log
      const operations = [
        () => logger.updateWorkflowStatus("running"),
        () =>
          logger.updateStepProgress(
            {
              stepIndex: 0,
              stepId: "step1",
              status: "completed",
              outputSession: false,
            },
            mockWorkflowState,
          ),
        () => logger.updateWorkflowStatus("paused"),
        () =>
          logger.updateStepProgress(
            {
              stepIndex: 1,
              stepId: "step2",
              status: "failed",
              error: "Test error",
              outputSession: false,
            },
            mockWorkflowState,
          ),
        () => logger.updateWorkflowStatus("failed"),
      ];

      for (const operation of operations) {
        await operation();
      }

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.status).toBe("failed");
      expect(currentLog?.steps).toHaveLength(2);
      expect(currentLog?.steps[0]?.status).toBe("completed");
      expect(currentLog?.steps[1]?.status).toBe("failed");
      expect(currentLog?.last_completed_step).toBe(0);
    });

    it("should handle log cleanup and reinitialization", async () => {
      // Add some data to the log
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        outputSession: false,
      };
      await logger.updateStepProgress(stepResult, mockWorkflowState);

      // Cleanup
      logger.cleanup();
      expect(logger.getCurrentLog()).toBeUndefined();
      expect(logger.getLogFilePath()).toBeUndefined();

      // Reinitialize
      await logger.initializeLog(mockWorkflowState, "/workspace/new-test.yml");

      const newLog = logger.getCurrentLog();
      expect(newLog).toBeDefined();
      expect(newLog?.steps).toHaveLength(0);
      expect(logger.getLogFilePath()).toBe("/workspace/new-test.json");
    });

    it("should handle log file path changes", async () => {
      const originalPath = logger.getLogFilePath();
      expect(originalPath).toBe("/workspace/test.json");

      // Cleanup and reinitialize with different path
      logger.cleanup();
      await logger.initializeLog(
        mockWorkflowState,
        "/different/path/workflow.yml",
      );

      const newPath = logger.getLogFilePath();
      expect(newPath).toBe("/different/path/workflow.json");
      expect(newPath).not.toBe(originalPath);
    });
  });

  describe("edge cases and boundary conditions", () => {
    beforeEach(async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      await logger.initializeLog(mockWorkflowState, "/workspace/test.yml");
      jest.clearAllMocks();
    });

    it("should handle zero-duration steps", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        startTime: "2023-01-01T10:00:00.000Z",
        endTime: "2023-01-01T10:00:00.000Z",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.duration_ms).toBe(0);
    });

    it("should handle negative duration gracefully", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        status: "completed",
        startTime: "2023-01-01T10:00:01.000Z",
        endTime: "2023-01-01T10:00:00.000Z", // End before start
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.duration_ms).toBe(-1000);
    });

    it("should handle maximum step index values", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: Number.MAX_SAFE_INTEGER,
        stepId: "max-step",
        status: "completed",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.step_index).toBe(Number.MAX_SAFE_INTEGER);
      expect(currentLog?.last_completed_step).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("should handle empty step IDs and names", async () => {
      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "",
        status: "completed",
        outputSession: false,
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps[0]?.step_id).toBe("");
      expect(currentLog?.steps[0]?.step_name).toBe("First Step");
    });

    it("should handle workflow with no steps", async () => {
      const emptyWorkflowState = {
        ...mockWorkflowState,
        execution: {
          ...mockWorkflowExecution,
          workflow: {
            name: "Empty Workflow",
            jobs: {
              pipeline: {
                steps: [],
              },
            },
          },
        },
      };

      const emptyLogger = new WorkflowJsonLogger(mockFileSystem, mockLogger);
      await emptyLogger.initializeLog(
        emptyWorkflowState,
        "/workspace/empty.yml",
      );

      const currentLog = emptyLogger.getCurrentLog();
      expect(currentLog?.total_steps).toBe(0);
      expect(currentLog?.steps).toEqual([]);
    });

    it("should handle rapid sequential updates", async () => {
      const updates = Array.from({ length: 50 }, (_, i) => ({
        stepIndex: i,
        stepId: `step${i}`,
        status: "completed" as const,
        outputSession: false,
      }));

      for (const stepResult of updates) {
        await logger.updateStepProgress(stepResult, mockWorkflowState);
      }

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(50);
      expect(currentLog?.last_completed_step).toBe(49);
    });
  });

  describe("Session Variable Resolution", () => {
    it("should resolve session template variables in resume_session", async () => {
      const mockFileSystem = createMockFileSystem();
      const mockLogger = createMockLogger();
      const logger = new WorkflowJsonLogger(mockFileSystem, mockLogger);

      const mockWorkflowExecution: WorkflowExecution = {
        workflow: {
          name: "Test Workflow",
          jobs: {
            pipeline: {
              name: "Pipeline Job",
              steps: [
                {
                  id: "step1",
                  name: "First Step",
                  uses: "claude-pipeline-action",
                  with: {
                    prompt: "Test prompt",
                    output_session: true,
                  },
                },
                {
                  id: "step2",
                  name: "Second Step",
                  uses: "claude-pipeline-action",
                  with: {
                    prompt: "Test prompt 2",
                    resume_session: "${{ steps.step1.outputs.session_id }}",
                  },
                },
              ],
            },
          },
        },
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const mockWorkflowState: WorkflowState = {
        executionId: "test-execution-id",
        workflowPath: "/test/workflow.yml",
        workflowName: "Test Workflow",
        startTime: new Date().toISOString(),
        currentStep: 1,
        totalSteps: 2,
        status: "running",
        sessionMappings: { step1: "session-abc-123" },
        completedSteps: [],
        execution: mockWorkflowExecution,
        canResume: true,
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.mkdir.mockResolvedValue(undefined);
      mockFileSystem.writeFile.mockResolvedValue(undefined);

      await logger.initializeLog(mockWorkflowState, "/test/workflow.yml");

      const stepResult: WorkflowStepResult = {
        stepIndex: 1,
        stepId: "step2",
        sessionId: "session-abc-123",
        outputSession: false,
        status: "completed",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: "Step 2 completed",
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(1);

      const loggedStep = currentLog?.steps[0];
      expect(loggedStep?.resume_session).toBe("session-abc-123");
      expect(loggedStep?.resume_session).not.toBe(
        "${{ steps.step1.outputs.session_id }}",
      );
    });

    it("should handle multiple session variables in resume_session", async () => {
      const mockFileSystem = createMockFileSystem();
      const mockLogger = createMockLogger();
      const logger = new WorkflowJsonLogger(mockFileSystem, mockLogger);

      const mockWorkflowExecution: WorkflowExecution = {
        workflow: {
          name: "Test Workflow",
          jobs: {
            pipeline: {
              name: "Pipeline Job",
              steps: [
                {
                  id: "step1",
                  name: "First Step",
                  uses: "claude-pipeline-action",
                  with: {
                    prompt: "Test prompt",
                    output_session: true,
                  },
                },
                {
                  id: "step2",
                  name: "Second Step",
                  uses: "claude-pipeline-action",
                  with: {
                    prompt: "Test prompt 2",
                    resume_session: "${{ steps.step0.outputs.session_id }}",
                  },
                },
              ],
            },
          },
        },
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const mockWorkflowState: WorkflowState = {
        executionId: "test-execution-id",
        workflowPath: "/test/workflow.yml",
        workflowName: "Test Workflow",
        startTime: new Date().toISOString(),
        currentStep: 1,
        totalSteps: 2,
        status: "running",
        sessionMappings: { step0: "session-xyz-456" },
        completedSteps: [],
        execution: mockWorkflowExecution,
        canResume: true,
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.mkdir.mockResolvedValue(undefined);
      mockFileSystem.writeFile.mockResolvedValue(undefined);

      await logger.initializeLog(mockWorkflowState, "/test/workflow.yml");

      const stepResult: WorkflowStepResult = {
        stepIndex: 1,
        stepId: "step2",
        sessionId: "session-xyz-456",
        outputSession: false,
        status: "completed",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: "Step 2 completed",
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(1);

      const loggedStep = currentLog?.steps[0];
      expect(loggedStep?.resume_session).toBe("session-xyz-456");
    });

    it("should leave unresolved session variables unchanged when no mapping exists", async () => {
      const mockFileSystem = createMockFileSystem();
      const mockLogger = createMockLogger();
      const logger = new WorkflowJsonLogger(mockFileSystem, mockLogger);

      const mockWorkflowExecution: WorkflowExecution = {
        workflow: {
          name: "Test Workflow",
          jobs: {
            pipeline: {
              name: "Pipeline Job",
              steps: [
                {
                  id: "step1",
                  name: "First Step",
                  uses: "claude-pipeline-action",
                  with: {
                    prompt: "Test prompt",
                    resume_session:
                      "${{ steps.nonexistent.outputs.session_id }}",
                  },
                },
              ],
            },
          },
        },
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const mockWorkflowState: WorkflowState = {
        executionId: "test-execution-id",
        workflowPath: "/test/workflow.yml",
        workflowName: "Test Workflow",
        startTime: new Date().toISOString(),
        currentStep: 0,
        totalSteps: 1,
        status: "running",
        sessionMappings: {},
        completedSteps: [],
        execution: mockWorkflowExecution,
        canResume: true,
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.mkdir.mockResolvedValue(undefined);
      mockFileSystem.writeFile.mockResolvedValue(undefined);

      await logger.initializeLog(mockWorkflowState, "/test/workflow.yml");

      const stepResult: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step1",
        sessionId: "session-test-789",
        outputSession: false,
        status: "completed",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: "Step 1 completed",
      };

      await logger.updateStepProgress(stepResult, mockWorkflowState);

      const currentLog = logger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(1);

      const loggedStep = currentLog?.steps[0];
      expect(loggedStep?.resume_session).toBe(
        "${{ steps.nonexistent.outputs.session_id }}",
      );
    });
  });
});
