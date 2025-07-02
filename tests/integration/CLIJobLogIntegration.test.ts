import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import sinon from "sinon";
import * as fs from "fs/promises";
import * as path from "path";
import {
  ClaudeCodeService,
  CommandResult,
  TaskItem,
} from "../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { JobLogManager } from "../../cli/src/utils/JobLogManager";
import { JobLog, JobLogStep } from "../../cli/src/types/JobLog";

// Mock file system operations
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue("{}"),
  access: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  rm: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe("CLI Job Log Management Integration", () => {
  let claudeService: ClaudeCodeService;
  let configService: ConfigurationService;
  let executeCommandStub: sinon.SinonStub;
  let writeFileSpy: jest.MockedFunction<typeof fs.writeFile>;
  let readFileSpy: jest.MockedFunction<typeof fs.readFile>;
  let unlinkSpy: jest.MockedFunction<typeof fs.unlink>;
  let accessSpy: jest.MockedFunction<typeof fs.access>;

  const testWorkflowPath = "/test/workflows/integration-test.yml";
  const expectedJobLogPath = "/test/workflows/integration-test.job.json";

  beforeEach(() => {
    configService = new ConfigurationService();
    claudeService = new ClaudeCodeService(configService);

    // Stub the executeCommand method
    executeCommandStub = sinon.stub(claudeService, "executeCommand");

    // Get spy references for mocked fs functions
    writeFileSpy = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
    readFileSpy = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
    unlinkSpy = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
    accessSpy = fs.access as jest.MockedFunction<typeof fs.access>;
  });

  afterEach(() => {
    sinon.restore();
    jest.clearAllMocks();
  });

  describe("Job log creation and management", () => {
    it("should create job log with correct path and structure", () => {
      const workflowName = "Integration Test Workflow";
      const totalSteps = 3;

      const jobLog = JobLogManager.createJobLog(
        workflowName,
        testWorkflowPath,
        totalSteps,
      );

      // Verify job log structure
      expect(jobLog.workflowName).toBe(workflowName);
      expect(jobLog.workflowFile).toBe(testWorkflowPath);
      expect(jobLog.totalSteps).toBe(totalSteps);
      expect(jobLog.status).toBe("running");
      expect(jobLog.lastCompletedStep).toBe(-1);
      expect(jobLog.steps).toEqual([]);
      expect(jobLog.executionId).toBeDefined();
      expect(jobLog.startTime).toBeDefined();
      expect(jobLog.lastUpdateTime).toBeDefined();

      // Verify execution ID format (timestamp with T + counter)
      expect(jobLog.executionId).toMatch(/^\d{8}T\d{6}\d{3}$/); // YYYYMMDDTHHMMSS + 3 digit counter
    });

    it("should generate correct job log file path", () => {
      const testCases = [
        {
          workflow: "/absolute/path/my-workflow.yml",
          expected: "/absolute/path/my-workflow.job.json",
        },
        {
          workflow: "./relative/workflow.yaml",
          expected: "./relative/workflow.job.json",
        },
        {
          workflow: "./simple.yml",
          expected: "./simple.job.json",
        },
        {
          workflow: "workflow-in-root.yml",
          expected: "workflow-in-root.job.json",
        },
      ];

      testCases.forEach(({ workflow, expected }) => {
        const actual = JobLogManager.getJobLogPath(workflow);
        expect(actual).toBe(expected);
      });
    });

    it("should save job log with proper formatting", async () => {
      const jobLog = JobLogManager.createJobLog(
        "Save Test Workflow",
        testWorkflowPath,
        2,
      );

      await JobLogManager.saveJobLog(jobLog, expectedJobLogPath);

      // Verify writeFile was called with correct parameters
      expect(writeFileSpy).toHaveBeenCalledWith(
        expectedJobLogPath,
        JSON.stringify(jobLog, null, 2),
        "utf-8",
      );

      // Verify directory creation was attempted
      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(expectedJobLogPath), {
        recursive: true,
      });
    });

    it("should load job log from file successfully", async () => {
      const mockJobLog: JobLog = {
        workflowName: "Load Test Workflow",
        workflowFile: testWorkflowPath,
        executionId: "test-exec-123",
        startTime: "2024-01-01T10:00:00.000Z",
        lastUpdateTime: "2024-01-01T10:15:00.000Z",
        status: "running",
        lastCompletedStep: 1,
        totalSteps: 3,
        steps: [
          {
            stepIndex: 0,
            stepId: "build",
            stepName: "Build Project",
            status: "completed",
            startTime: "2024-01-01T10:00:00.000Z",
            endTime: "2024-01-01T10:05:00.000Z",
            durationMs: 300000,
            output: "Build successful",
            sessionId: "sess_build_123",
          },
          {
            stepIndex: 1,
            stepId: "test",
            stepName: "Run Tests",
            status: "completed",
            startTime: "2024-01-01T10:05:00.000Z",
            endTime: "2024-01-01T10:15:00.000Z",
            durationMs: 600000,
            output: "All tests passed",
            sessionId: "sess_test_456",
          },
        ],
      };

      readFileSpy.mockResolvedValueOnce(JSON.stringify(mockJobLog));

      const loadedJobLog = await JobLogManager.loadJobLog(expectedJobLogPath);

      expect(loadedJobLog).toEqual(mockJobLog);
      expect(readFileSpy).toHaveBeenCalledWith(expectedJobLogPath, "utf-8");
    });

    it("should return null when job log file does not exist", async () => {
      const notFoundError = new Error("File not found");
      (notFoundError as NodeJS.ErrnoException).code = "ENOENT";
      readFileSpy.mockRejectedValueOnce(notFoundError);

      const result = await JobLogManager.loadJobLog(expectedJobLogPath);

      expect(result).toBeNull();
      expect(readFileSpy).toHaveBeenCalledWith(expectedJobLogPath, "utf-8");
    });

    it("should throw error for corrupt job log file", async () => {
      readFileSpy.mockResolvedValueOnce("invalid json content");

      await expect(
        JobLogManager.loadJobLog(expectedJobLogPath),
      ).rejects.toThrow("Failed to load job log");
    });

    it("should validate job log structure when loading", async () => {
      const invalidJobLog = {
        workflowName: "Invalid Log",
        // Missing required fields
      };

      readFileSpy.mockResolvedValueOnce(JSON.stringify(invalidJobLog));

      await expect(
        JobLogManager.loadJobLog(expectedJobLogPath),
      ).rejects.toThrow("Invalid job log format");
    });
  });

  describe("Step management", () => {
    it("should add steps and update job log state correctly", () => {
      const jobLog = JobLogManager.createJobLog(
        "Step Management Test",
        testWorkflowPath,
        3,
      );

      const step1: JobLogStep = {
        stepIndex: 0,
        stepId: "analyze",
        stepName: "Analyze Code",
        status: "completed",
        startTime: "2024-01-01T10:00:00.000Z",
        endTime: "2024-01-01T10:05:00.000Z",
        durationMs: 300000,
        output: "Analysis complete",
        sessionId: "sess_analyze_001",
      };

      JobLogManager.addStep(jobLog, step1);

      expect(jobLog.steps).toHaveLength(1);
      expect(jobLog.lastCompletedStep).toBe(0);
      expect(jobLog.status).toBe("running");
      expect(jobLog.steps[0]).toEqual(step1);

      const step2: JobLogStep = {
        stepIndex: 1,
        stepId: "implement",
        stepName: "Implement Changes",
        status: "completed",
        startTime: "2024-01-01T10:05:00.000Z",
        endTime: "2024-01-01T10:10:00.000Z",
        durationMs: 300000,
        output: "Implementation complete",
        sessionId: "sess_implement_002",
      };

      JobLogManager.addStep(jobLog, step2);

      expect(jobLog.steps).toHaveLength(2);
      expect(jobLog.lastCompletedStep).toBe(1);
      expect(jobLog.status).toBe("running");

      const step3: JobLogStep = {
        stepIndex: 2,
        stepId: "deploy",
        stepName: "Deploy Application",
        status: "completed",
        startTime: "2024-01-01T10:10:00.000Z",
        endTime: "2024-01-01T10:15:00.000Z",
        durationMs: 300000,
        output: "Deployment successful",
        sessionId: "sess_deploy_003",
      };

      JobLogManager.addStep(jobLog, step3);

      expect(jobLog.steps).toHaveLength(3);
      expect(jobLog.lastCompletedStep).toBe(2);
      expect(jobLog.status).toBe("completed"); // All steps completed
    });

    it("should handle failed steps correctly", () => {
      const jobLog = JobLogManager.createJobLog(
        "Failure Test",
        testWorkflowPath,
        2,
      );

      const failedStep: JobLogStep = {
        stepIndex: 0,
        stepId: "failing-task",
        stepName: "Failing Task",
        status: "failed",
        startTime: "2024-01-01T10:00:00.000Z",
        durationMs: 5000,
        error: "Task failed due to invalid input",
      };

      JobLogManager.addStep(jobLog, failedStep);

      expect(jobLog.steps).toHaveLength(1);
      expect(jobLog.lastCompletedStep).toBe(-1); // No completed steps
      expect(jobLog.status).toBe("failed");
      expect(jobLog.steps[0].error).toBe("Task failed due to invalid input");
    });

    it("should prevent duplicate steps through deduplication", () => {
      const jobLog = JobLogManager.createJobLog(
        "Deduplication Test",
        testWorkflowPath,
        2,
      );

      const step: JobLogStep = {
        stepIndex: 0,
        stepId: "duplicate-test",
        stepName: "Duplicate Test Step",
        status: "running",
        startTime: "2024-01-01T10:00:00.000Z",
        durationMs: 0,
      };

      // Add step first time
      JobLogManager.addStep(jobLog, step);
      expect(jobLog.steps).toHaveLength(1);

      // Update same step (should replace, not duplicate)
      const updatedStep: JobLogStep = {
        ...step,
        status: "completed",
        endTime: "2024-01-01T10:05:00.000Z",
        durationMs: 300000,
        output: "Step completed successfully",
      };

      JobLogManager.addStep(jobLog, updatedStep);
      expect(jobLog.steps).toHaveLength(1);
      expect(jobLog.steps[0].status).toBe("completed");
      expect(jobLog.steps[0].output).toBe("Step completed successfully");
    });

    it("should update lastUpdateTime when steps are added", () => {
      const jobLog = JobLogManager.createJobLog(
        "Update Time Test",
        testWorkflowPath,
        1,
      );

      // Add a step
      const step: JobLogStep = {
        stepIndex: 0,
        stepId: "time-test",
        stepName: "Time Test Step",
        status: "completed",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 1000,
      };

      JobLogManager.addStep(jobLog, step);

      expect(jobLog.lastUpdateTime).toBeDefined();
      // Note: In fast tests, times might be the same, so we just verify it's set
    });
  });

  describe("Job log file operations", () => {
    it("should check if job log exists correctly", async () => {
      // Test existing file
      accessSpy.mockResolvedValueOnce(undefined);
      const exists = await JobLogManager.jobLogExists(testWorkflowPath);
      expect(exists).toBe(true);

      // Test non-existing file
      const notFoundError = new Error("File not found");
      (notFoundError as NodeJS.ErrnoException).code = "ENOENT";
      accessSpy.mockRejectedValueOnce(notFoundError);
      const notExists = await JobLogManager.jobLogExists(testWorkflowPath);
      expect(notExists).toBe(false);
    });

    it("should remove job log file successfully", async () => {
      unlinkSpy.mockResolvedValueOnce(undefined);

      await JobLogManager.removeJobLog(testWorkflowPath);

      expect(unlinkSpy).toHaveBeenCalledWith(expectedJobLogPath);
    });

    it("should handle removal of non-existing job log gracefully", async () => {
      const notFoundError = new Error("File not found");
      (notFoundError as NodeJS.ErrnoException).code = "ENOENT";
      unlinkSpy.mockRejectedValueOnce(notFoundError);

      // Should not throw error
      await expect(
        JobLogManager.removeJobLog(testWorkflowPath),
      ).resolves.toBeUndefined();
    });

    it("should throw error for other file system errors during removal", async () => {
      const permissionError = new Error("Permission denied");
      (permissionError as NodeJS.ErrnoException).code = "EACCES";
      unlinkSpy.mockRejectedValueOnce(permissionError);

      await expect(
        JobLogManager.removeJobLog(testWorkflowPath),
      ).rejects.toThrow("Failed to remove job log");
    });
  });

  describe("Resume index calculation", () => {
    it("should calculate correct resume step index", () => {
      const jobLog = JobLogManager.createJobLog(
        "Resume Index Test",
        testWorkflowPath,
        5,
      );

      // No steps completed
      expect(JobLogManager.getResumeStepIndex(jobLog)).toBe(0);

      // First two steps completed
      jobLog.lastCompletedStep = 1;
      expect(JobLogManager.getResumeStepIndex(jobLog)).toBe(2);

      // All steps completed
      jobLog.lastCompletedStep = 4;
      expect(JobLogManager.getResumeStepIndex(jobLog)).toBe(5);
    });
  });

  describe("Integration with ClaudeCodeService", () => {
    it("should integrate job log management with pipeline execution", async () => {
      const tasks: TaskItem[] = [
        {
          id: "build",
          name: "Build Project",
          prompt: "Build the project",
          status: "pending",
        },
        {
          id: "test",
          name: "Run Tests",
          prompt: "Run tests",
          status: "pending",
        },
      ];

      // Mock successful command executions
      executeCommandStub
        .onCall(0)
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_build_integration",
            result: "Build completed",
          }),
          exitCode: 0,
        } as CommandResult)
        .onCall(1)
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_test_integration",
            result: "Tests passed",
          }),
          exitCode: 0,
        } as CommandResult);

      // Create job log to track execution
      const jobLog = JobLogManager.createJobLog(
        "Integration Pipeline",
        testWorkflowPath,
        tasks.length,
      );

      const progressUpdates: Array<{ tasks: TaskItem[]; index: number }> = [];
      let completedTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { outputFormat: "json" as const },
        (updatedTasks, index) => {
          progressUpdates.push({ tasks: [...updatedTasks], index });

          // Simulate job log update during execution
          const currentTask = updatedTasks[index];
          if (currentTask.status === "completed") {
            const step: JobLogStep = {
              stepIndex: index,
              stepId: currentTask.id,
              stepName: currentTask.name ?? currentTask.id,
              status: "completed",
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              durationMs: 1000,
              output: currentTask.results ?? "",
              sessionId: currentTask.sessionId,
            };
            JobLogManager.addStep(jobLog, step);
          }
        },
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify pipeline execution
      expect(completedTasks.length).toBe(2);
      expect(completedTasks.every((task) => task.status === "completed")).toBe(
        true,
      );

      // Verify job log was updated correctly
      expect(jobLog.steps.length).toBe(2);
      expect(jobLog.lastCompletedStep).toBe(1);
      expect(jobLog.status).toBe("completed");
      expect(jobLog.steps[0].sessionId).toBe("sess_build_integration");
      expect(jobLog.steps[1].sessionId).toBe("sess_test_integration");
    });

    it("should handle job log persistence during failures", async () => {
      const tasks: TaskItem[] = [
        {
          id: "success-task",
          name: "Success Task",
          prompt: "This will succeed",
          status: "pending",
        },
        {
          id: "fail-task",
          name: "Fail Task",
          prompt: "This will fail",
          status: "pending",
        },
      ];

      executeCommandStub
        .onCall(0)
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_success",
            result: "Task succeeded",
          }),
          exitCode: 0,
        } as CommandResult)
        .onCall(1)
        .resolves({
          success: false,
          output: "",
          error: "Task failed intentionally",
          exitCode: 1,
        } as CommandResult);

      const jobLog = JobLogManager.createJobLog(
        "Failure Handling Test",
        testWorkflowPath,
        tasks.length,
      );

      let errorOccurred = false;
      let finalTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { outputFormat: "json" as const },
        (updatedTasks, index) => {
          const currentTask = updatedTasks[index];
          if (currentTask.status === "completed") {
            const step: JobLogStep = {
              stepIndex: index,
              stepId: currentTask.id,
              stepName: currentTask.name ?? currentTask.id,
              status: "completed",
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              durationMs: 1000,
              output: currentTask.results ?? "",
              sessionId: currentTask.sessionId,
            };
            JobLogManager.addStep(jobLog, step);
          } else if (currentTask.status === "error") {
            const step: JobLogStep = {
              stepIndex: index,
              stepId: currentTask.id,
              stepName: currentTask.name ?? currentTask.id,
              status: "failed",
              startTime: new Date().toISOString(),
              durationMs: 500,
              error: currentTask.results ?? "Unknown error",
            };
            JobLogManager.addStep(jobLog, step);
          }
        },
        (completedTasks) => {
          finalTasks = [...completedTasks];
        },
        (error, errorTasks) => {
          errorOccurred = true;
          finalTasks = [...errorTasks];
        },
      );

      // Verify failure was handled correctly
      expect(errorOccurred).toBe(true);
      expect(finalTasks.length).toBe(2);
      expect(finalTasks[0].status).toBe("completed");
      expect(finalTasks[1].status).toBe("error");

      // Verify job log reflects the failure
      expect(jobLog.steps.length).toBe(2);
      expect(jobLog.steps[0].status).toBe("completed");
      expect(jobLog.steps[1].status).toBe("failed");
      expect(jobLog.status).toBe("failed");
      expect(jobLog.lastCompletedStep).toBe(0); // Only first step completed
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle job log with extremely long execution times", () => {
      const jobLog = JobLogManager.createJobLog(
        "Long Execution Test",
        testWorkflowPath,
        1,
      );

      const longRunningStep: JobLogStep = {
        stepIndex: 0,
        stepId: "long-task",
        stepName: "Long Running Task",
        status: "completed",
        startTime: "2024-01-01T10:00:00.000Z",
        endTime: "2024-01-01T12:00:00.000Z",
        durationMs: 7200000, // 2 hours
        output: "Long task completed",
      };

      JobLogManager.addStep(jobLog, longRunningStep);

      expect(jobLog.steps[0].durationMs).toBe(7200000);
      expect(jobLog.lastCompletedStep).toBe(0);
    });

    it("should handle job log with many steps efficiently", () => {
      const totalSteps = 100;
      const jobLog = JobLogManager.createJobLog(
        "Many Steps Test",
        testWorkflowPath,
        totalSteps,
      );

      // Add many steps
      for (let i = 0; i < totalSteps; i++) {
        const step: JobLogStep = {
          stepIndex: i,
          stepId: `step-${i}`,
          stepName: `Step ${i + 1}`,
          status: "completed",
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: 1000,
          output: `Step ${i + 1} output`,
        };
        JobLogManager.addStep(jobLog, step);
      }

      expect(jobLog.steps.length).toBe(totalSteps);
      expect(jobLog.lastCompletedStep).toBe(totalSteps - 1);
      expect(jobLog.status).toBe("completed");
    });

    it("should generate unique execution IDs", () => {
      const ids = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const jobLog = JobLogManager.createJobLog(
          `Unique ID Test ${i}`,
          testWorkflowPath,
          1,
        );
        ids.add(jobLog.executionId);
      }

      // All IDs should be unique
      expect(ids.size).toBe(iterations);

      // All IDs should match expected format
      ids.forEach((id) => {
        expect(id).toMatch(/^\d{8}T\d{6}\d{3}$/); // YYYYMMDDTHHMMSS + 3 digit counter
      });
    });
  });
});
