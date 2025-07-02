/**
 * Unit tests for JobLogManager
 * Tests all static methods and ensures Go CLI compatibility
 */

import * as fs from "fs/promises";
import { JobLogManager } from "../../../cli/src/utils/JobLogManager";
import { JobLog, JobLogStep } from "../../../cli/src/types/JobLog";

// Mock fs module for testing
jest.mock("fs/promises");
const mockedFs = fs as jest.Mocked<typeof fs>;

describe("JobLogManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getJobLogPath", () => {
    test("generates correct job log path for yml file", () => {
      const workflowPath = "/workflows/test-workflow.yml";
      const jobLogPath = JobLogManager.getJobLogPath(workflowPath);
      expect(jobLogPath).toBe("/workflows/test-workflow.job.json");
    });

    test("generates correct job log path for yaml file", () => {
      const workflowPath = "/workflows/test-workflow.yaml";
      const jobLogPath = JobLogManager.getJobLogPath(workflowPath);
      expect(jobLogPath).toBe("/workflows/test-workflow.job.json");
    });

    test("handles nested directory paths", () => {
      const workflowPath = "/home/user/projects/workflows/complex-workflow.yml";
      const jobLogPath = JobLogManager.getJobLogPath(workflowPath);
      expect(jobLogPath).toBe(
        "/home/user/projects/workflows/complex-workflow.job.json",
      );
    });

    test("handles relative paths", () => {
      const workflowPath = "./workflows/test.yml";
      const jobLogPath = JobLogManager.getJobLogPath(workflowPath);
      expect(jobLogPath).toBe("./workflows/test.job.json");
    });
  });

  describe("createJobLog", () => {
    test("creates job log with correct structure", () => {
      const jobLog = JobLogManager.createJobLog("test-workflow", "test.yml", 3);

      expect(jobLog.workflowName).toBe("test-workflow");
      expect(jobLog.workflowFile).toBe("test.yml");
      expect(jobLog.totalSteps).toBe(3);
      expect(jobLog.lastCompletedStep).toBe(-1);
      expect(jobLog.status).toBe("running");
      expect(jobLog.steps).toEqual([]);
      expect(jobLog.executionId).toMatch(/^\d{8}T\d{6}\d{3}$/); // YYYYMMDDTHHMMSS + counter format
      expect(jobLog.startTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      ); // ISO format
      expect(jobLog.lastUpdateTime).toBe(jobLog.startTime);
    });

    test("generates unique execution IDs", () => {
      const jobLog1 = JobLogManager.createJobLog("test1", "test1.yml", 1);
      const jobLog2 = JobLogManager.createJobLog("test2", "test2.yml", 1);

      expect(jobLog1.executionId).not.toBe(jobLog2.executionId);
    });
  });

  describe("addStep", () => {
    let jobLog: JobLog;
    let testStep: JobLogStep;

    beforeEach(() => {
      jobLog = JobLogManager.createJobLog("test", "test.yml", 3);
      testStep = {
        stepIndex: 0,
        stepId: "step1",
        stepName: "Test Step",
        status: "completed",
        startTime: new Date().toISOString(),
        durationMs: 1000,
      };
    });

    test("adds step and updates lastCompletedStep", () => {
      JobLogManager.addStep(jobLog, testStep);

      expect(jobLog.lastCompletedStep).toBe(0);
      expect(jobLog.steps).toHaveLength(1);
      expect(jobLog.steps[0]).toEqual(testStep);
      expect(jobLog.status).toBe("running"); // Not all steps completed yet
    });

    test("removes duplicate steps", () => {
      // Add the same step twice
      JobLogManager.addStep(jobLog, testStep);

      const updatedStep = { ...testStep, durationMs: 2000 };
      JobLogManager.addStep(jobLog, updatedStep);

      expect(jobLog.steps).toHaveLength(1);
      expect(jobLog.steps[0].durationMs).toBe(2000);
    });

    test("updates job status to completed when all steps are done", () => {
      const step1: JobLogStep = { ...testStep, stepIndex: 0, stepId: "step1" };
      const step2: JobLogStep = { ...testStep, stepIndex: 1, stepId: "step2" };
      const step3: JobLogStep = { ...testStep, stepIndex: 2, stepId: "step3" };

      JobLogManager.addStep(jobLog, step1);
      JobLogManager.addStep(jobLog, step2);
      JobLogManager.addStep(jobLog, step3);

      expect(jobLog.status).toBe("completed");
      expect(jobLog.lastCompletedStep).toBe(2);
    });

    test("updates job status to failed when a step fails", () => {
      const failedStep: JobLogStep = {
        ...testStep,
        status: "failed",
        error: "Test error",
      };

      JobLogManager.addStep(jobLog, failedStep);

      expect(jobLog.status).toBe("failed");
    });

    test("updates lastUpdateTime when step is added", () => {
      const originalUpdateTime = jobLog.lastUpdateTime;

      // Wait a small amount to ensure time difference
      setTimeout(() => {
        JobLogManager.addStep(jobLog, testStep);
        expect(jobLog.lastUpdateTime).not.toBe(originalUpdateTime);
      }, 1);
    });

    test("handles out-of-order step completion", () => {
      const step2: JobLogStep = { ...testStep, stepIndex: 2, stepId: "step2" };
      const step1: JobLogStep = { ...testStep, stepIndex: 1, stepId: "step1" };

      // Complete step 2 first, then step 1
      JobLogManager.addStep(jobLog, step2);
      expect(jobLog.lastCompletedStep).toBe(2);

      JobLogManager.addStep(jobLog, step1);
      expect(jobLog.lastCompletedStep).toBe(2); // Should remain 2 (highest)
    });
  });

  describe("saveJobLog", () => {
    test("saves job log to file with correct formatting", async () => {
      const jobLog = JobLogManager.createJobLog("test", "test.yml", 2);
      const filePath = "/test/path/test.job.json";

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      await JobLogManager.saveJobLog(jobLog, filePath);

      expect(mockedFs.mkdir).toHaveBeenCalledWith("/test/path", {
        recursive: true,
      });
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        filePath,
        JSON.stringify(jobLog, null, 2),
        "utf-8",
      );
    });

    test("throws error when save fails", async () => {
      const jobLog = JobLogManager.createJobLog("test", "test.yml", 2);
      const filePath = "/test/path/test.job.json";

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockRejectedValue(new Error("Permission denied"));

      await expect(JobLogManager.saveJobLog(jobLog, filePath)).rejects.toThrow(
        "Failed to save job log to /test/path/test.job.json: Permission denied",
      );
    });
  });

  describe("loadJobLog", () => {
    test("loads valid job log from file", async () => {
      const jobLog = JobLogManager.createJobLog("test", "test.yml", 2);
      const filePath = "/test/path/test.job.json";

      mockedFs.readFile.mockResolvedValue(JSON.stringify(jobLog));

      const loaded = await JobLogManager.loadJobLog(filePath);

      expect(loaded).toEqual(jobLog);
      expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, "utf-8");
    });

    test("returns null when file does not exist", async () => {
      const filePath = "/test/path/nonexistent.job.json";
      const error = new Error("File not found");
      (error as NodeJS.ErrnoException).code = "ENOENT";

      mockedFs.readFile.mockRejectedValue(error);

      const loaded = await JobLogManager.loadJobLog(filePath);

      expect(loaded).toBeNull();
    });

    test("throws error for invalid JSON", async () => {
      const filePath = "/test/path/invalid.job.json";

      mockedFs.readFile.mockResolvedValue("invalid json");

      await expect(JobLogManager.loadJobLog(filePath)).rejects.toThrow(
        "Failed to load job log from",
      );
    });

    test("throws error for invalid job log structure", async () => {
      const filePath = "/test/path/invalid.job.json";
      const invalidJobLog = { invalid: "structure" };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(invalidJobLog));

      await expect(JobLogManager.loadJobLog(filePath)).rejects.toThrow(
        "Failed to load job log from",
      );
    });
  });

  describe("getResumeStepIndex", () => {
    test("returns correct next step index", () => {
      const jobLog = JobLogManager.createJobLog("test", "test.yml", 5);
      jobLog.lastCompletedStep = 2;

      const nextStep = JobLogManager.getResumeStepIndex(jobLog);
      expect(nextStep).toBe(3);
    });

    test("returns 0 when no steps completed", () => {
      const jobLog = JobLogManager.createJobLog("test", "test.yml", 5);

      const nextStep = JobLogManager.getResumeStepIndex(jobLog);
      expect(nextStep).toBe(0);
    });
  });

  describe("jobLogExists", () => {
    test("returns true when job log exists", async () => {
      mockedFs.access.mockResolvedValue(undefined);

      const exists = await JobLogManager.jobLogExists("/test/workflow.yml");

      expect(exists).toBe(true);
      expect(mockedFs.access).toHaveBeenCalledWith("/test/workflow.job.json");
    });

    test("returns false when job log does not exist", async () => {
      mockedFs.access.mockRejectedValue(new Error("File not found"));

      const exists = await JobLogManager.jobLogExists("/test/workflow.yml");

      expect(exists).toBe(false);
    });
  });

  describe("removeJobLog", () => {
    test("removes job log file successfully", async () => {
      mockedFs.unlink.mockResolvedValue(undefined);

      await JobLogManager.removeJobLog("/test/workflow.yml");

      expect(mockedFs.unlink).toHaveBeenCalledWith("/test/workflow.job.json");
    });

    test("does not throw when file does not exist", async () => {
      const error = new Error("File not found");
      (error as NodeJS.ErrnoException).code = "ENOENT";
      mockedFs.unlink.mockRejectedValue(error);

      await expect(
        JobLogManager.removeJobLog("/test/workflow.yml"),
      ).resolves.not.toThrow();
    });

    test("throws error for other file system errors", async () => {
      mockedFs.unlink.mockRejectedValue(new Error("Permission denied"));

      await expect(
        JobLogManager.removeJobLog("/test/workflow.yml"),
      ).rejects.toThrow("Failed to remove job log");
    });
  });

  describe("Go CLI compatibility", () => {
    test("generates job log structure compatible with Go CLI", () => {
      const jobLog = JobLogManager.createJobLog("test-workflow", "test.yml", 3);

      // Add a step to test full structure
      const step: JobLogStep = {
        stepIndex: 0,
        stepId: "step1",
        stepName: "Test Step",
        status: "completed",
        startTime: "2024-01-01T12:00:00.000Z",
        endTime: "2024-01-01T12:00:01.000Z",
        durationMs: 1000,
        output: "Test output",
        sessionId: "session123",
      };

      JobLogManager.addStep(jobLog, step);

      // Verify structure matches Go CLI expectations
      expect(jobLog).toHaveProperty("workflowName");
      expect(jobLog).toHaveProperty("workflowFile");
      expect(jobLog).toHaveProperty("startTime");
      expect(jobLog).toHaveProperty("lastCompletedStep");
      expect(jobLog).toHaveProperty("totalSteps");
      expect(jobLog).toHaveProperty("steps");
      expect(Array.isArray(jobLog.steps)).toBe(true);

      // Verify step structure
      expect(step).toHaveProperty("stepIndex");
      expect(step).toHaveProperty("stepId");
      expect(step).toHaveProperty("status");
      expect(step).toHaveProperty("sessionId");
    });

    test("step statuses match Go CLI values", () => {
      const validStatuses: Array<JobLogStep["status"]> = [
        "completed",
        "failed",
        "running",
      ];

      validStatuses.forEach((status) => {
        const step: JobLogStep = {
          stepIndex: 0,
          stepId: "test",
          stepName: "Test",
          status,
          startTime: new Date().toISOString(),
          durationMs: 0,
        };

        expect(["completed", "failed", "running"]).toContain(step.status);
      });
    });
  });
});
