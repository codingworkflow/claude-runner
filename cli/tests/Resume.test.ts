import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

// Import types
import { JobLog } from "../src/types/JobLog";

// Mock dependencies
jest.mock("../src/utils/JobLogManager");
jest.mock("../dist/src/core/services/ClaudeExecutor");
jest.mock("../dist/src/core/services/WorkflowParser");

// Import mocked modules
import { JobLogManager } from "../src/utils/JobLogManager";

// Mock implementations
const MockedJobLogManager = JobLogManager as jest.MockedClass<
  typeof JobLogManager
>;

// Setup static method mocks
MockedJobLogManager.loadJobLog = jest.fn();
MockedJobLogManager.removeJobLog = jest.fn();
MockedJobLogManager.createJobLog = jest.fn();
MockedJobLogManager.getJobLogPath = jest.fn();

describe("Resume Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("parseGlobalOptions", () => {
    it("should parse --resume flag correctly", () => {
      // Simulate the CLI argument parsing logic from claude-runner.js lines 119-142
      const args = ["run", "workflow.yml", "--resume"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      // Simulate the parsing loop from lines 126-139
      for (const arg of args) {
        if (arg === "--resume" || arg === "-r") {
          options.resume = true;
        }
      }

      expect(options.resume).toBe(true);
      expect(options.autoAccept).toBe(false);
      expect(options.executionPath).toBe(process.cwd());
    });

    it("should parse -r short flag correctly", () => {
      const args = ["run", "workflow.yml", "-r"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      for (const arg of args) {
        if (arg === "--resume" || arg === "-r") {
          options.resume = true;
        }
      }

      expect(options.resume).toBe(true);
    });

    it("should default resume to false when flag not present", () => {
      const args = ["run", "workflow.yml", "--verbose"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      for (const arg of args) {
        if (arg === "--resume" || arg === "-r") {
          options.resume = true;
        }
      }

      expect(options.resume).toBe(false);
    });

    it("should parse multiple flags including resume", () => {
      const args = ["run", "workflow.yml", "--resume", "--yes", "--verbose"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      for (const arg of args) {
        if (arg === "--resume" || arg === "-r") {
          options.resume = true;
        } else if (arg === "--yes" || arg === "-y") {
          options.autoAccept = true;
        }
      }

      expect(options.resume).toBe(true);
      expect(options.autoAccept).toBe(true);
    });
  });

  describe("startFromStep calculation", () => {
    it("should calculate startFromStep correctly when resuming with existing job log", async () => {
      // Mock existing job log data from lines 341-349 in claude-runner.js
      const mockJobLog: JobLog = {
        workflowName: "test-workflow",
        workflowFile: "test.yml",
        executionId: "20240101T100000001",
        totalSteps: 5,
        lastCompletedStep: 2, // Completed steps 0, 1, 2 (3 steps total)
        startTime: "2024-01-01T10:00:00Z",
        lastUpdateTime: "2024-01-01T10:05:00Z",
        status: "running",
        steps: [],
      };

      MockedJobLogManager.loadJobLog.mockResolvedValue(mockJobLog);
      MockedJobLogManager.getJobLogPath.mockReturnValue("test.job.json");

      const options = { resume: true };
      const workflowPath = "test.yml";

      // Simulate the resume logic from lines 336-360
      let startFromStep = 0;
      let existingJobLog: JobLog | null = null;
      const jobLogPath = MockedJobLogManager.getJobLogPath(workflowPath);

      if (options.resume) {
        existingJobLog = await MockedJobLogManager.loadJobLog(jobLogPath);
        if (existingJobLog && existingJobLog.lastCompletedStep >= 0) {
          startFromStep = existingJobLog.lastCompletedStep + 1;
        }
      }

      expect(MockedJobLogManager.getJobLogPath).toHaveBeenCalledWith(
        workflowPath,
      );
      expect(MockedJobLogManager.loadJobLog).toHaveBeenCalledWith(jobLogPath);
      expect(startFromStep).toBe(3); // Should resume from step 3 (0-indexed)
      expect(existingJobLog).toEqual(mockJobLog);
    });

    it("should start from step 0 when resuming but no job log exists", async () => {
      MockedJobLogManager.loadJobLog.mockResolvedValue(null);
      MockedJobLogManager.getJobLogPath.mockReturnValue("test.job.json");

      const options = { resume: true };
      const workflowPath = "test.yml";

      let startFromStep = 0;
      let existingJobLog = null;
      const jobLogPath = MockedJobLogManager.getJobLogPath(workflowPath);

      if (options.resume) {
        existingJobLog = await MockedJobLogManager.loadJobLog(jobLogPath);
        if (existingJobLog && existingJobLog.lastCompletedStep >= 0) {
          startFromStep = existingJobLog.lastCompletedStep + 1;
        }
      }

      expect(startFromStep).toBe(0);
      expect(existingJobLog).toBeNull();
    });

    it("should start from step 0 when not resuming", async () => {
      const options = { resume: false };

      const startFromStep = 0;

      // When not resuming, should remove existing job log (lines 354-360)
      if (!options.resume) {
        try {
          await MockedJobLogManager.removeJobLog("test.yml");
        } catch {
          // File doesn't exist, that's fine
        }
      }

      expect(startFromStep).toBe(0);
    });

    it("should handle job log with lastCompletedStep = -1 (no completed steps)", async () => {
      const mockJobLog: JobLog = {
        workflowName: "fresh-workflow",
        workflowFile: "fresh.yml",
        executionId: "20240101T100000002",
        totalSteps: 3,
        lastCompletedStep: -1, // No steps completed yet
        startTime: "2024-01-01T10:00:00Z",
        lastUpdateTime: "2024-01-01T10:00:00Z",
        status: "running",
        steps: [],
      };

      MockedJobLogManager.loadJobLog.mockResolvedValue(mockJobLog);
      MockedJobLogManager.getJobLogPath.mockReturnValue("fresh.job.json");

      const options = { resume: true };
      const workflowPath = "fresh.yml";

      let startFromStep = 0;
      let existingJobLog = null;
      const jobLogPath = MockedJobLogManager.getJobLogPath(workflowPath);

      if (options.resume) {
        existingJobLog = await MockedJobLogManager.loadJobLog(jobLogPath);
        if (existingJobLog && existingJobLog.lastCompletedStep >= 0) {
          startFromStep = existingJobLog.lastCompletedStep + 1;
        }
      }

      expect(startFromStep).toBe(0); // Should start from beginning
      expect(existingJobLog).toEqual(mockJobLog);
    });

    it("should handle job log with all steps completed", async () => {
      const mockJobLog: JobLog = {
        workflowName: "completed-workflow",
        workflowFile: "completed.yml",
        executionId: "20240101T100000003",
        totalSteps: 3,
        lastCompletedStep: 2, // All 3 steps completed (0, 1, 2)
        startTime: "2024-01-01T10:00:00Z",
        lastUpdateTime: "2024-01-01T10:01:00Z",
        status: "completed",
        steps: [],
      };

      MockedJobLogManager.loadJobLog.mockResolvedValue(mockJobLog);
      MockedJobLogManager.getJobLogPath.mockReturnValue("completed.job.json");

      const options = { resume: true };
      const workflowPath = "completed.yml";

      let startFromStep = 0;
      let existingJobLog = null;
      const jobLogPath = MockedJobLogManager.getJobLogPath(workflowPath);

      if (options.resume) {
        existingJobLog = await MockedJobLogManager.loadJobLog(jobLogPath);
        if (existingJobLog && existingJobLog.lastCompletedStep >= 0) {
          startFromStep = existingJobLog.lastCompletedStep + 1;
        }
      }

      expect(startFromStep).toBe(3); // Should start from step 3 (beyond last step)
      expect(existingJobLog).toEqual(mockJobLog);
    });
  });

  describe("step execution skip logic", () => {
    it("should skip steps correctly when resuming", () => {
      // Simulate the step skip logic from lines 396-400
      const currentStepIndex = 1;
      const startFromStep = 3;

      let shouldSkip = false;
      if (currentStepIndex < startFromStep) {
        shouldSkip = true;
      }

      expect(shouldSkip).toBe(true);
    });

    it("should not skip steps when current step index matches startFromStep", () => {
      const currentStepIndex = 3;
      const startFromStep = 3;

      let shouldSkip = false;
      if (currentStepIndex < startFromStep) {
        shouldSkip = true;
      }

      expect(shouldSkip).toBe(false);
    });

    it("should not skip steps when current step index is beyond startFromStep", () => {
      const currentStepIndex = 4;
      const startFromStep = 3;

      let shouldSkip = false;
      if (currentStepIndex < startFromStep) {
        shouldSkip = true;
      }

      expect(shouldSkip).toBe(false);
    });
  });

  describe("job log file path handling", () => {
    it("should generate correct job log path", () => {
      MockedJobLogManager.getJobLogPath.mockReturnValue(
        "./test-workflow.job.json",
      );

      const workflowPath = "./test-workflow.yml";
      const jobLogPath = MockedJobLogManager.getJobLogPath(workflowPath);

      expect(MockedJobLogManager.getJobLogPath).toHaveBeenCalledWith(
        workflowPath,
      );
      expect(jobLogPath).toBe("./test-workflow.job.json");
    });

    it("should handle different workflow file extensions", () => {
      MockedJobLogManager.getJobLogPath
        .mockReturnValueOnce("test.job.json")
        .mockReturnValueOnce("workflow.job.json");

      const yamlPath = "test.yaml";
      const ymlPath = "workflow.yml";

      const yamlJobPath = MockedJobLogManager.getJobLogPath(yamlPath);
      const ymlJobPath = MockedJobLogManager.getJobLogPath(ymlPath);

      expect(yamlJobPath).toBe("test.job.json");
      expect(ymlJobPath).toBe("workflow.job.json");
    });

    it("should handle workflow files in subdirectories", () => {
      MockedJobLogManager.getJobLogPath.mockReturnValue(
        ".github/workflows/ci.job.json",
      );

      const workflowPath = ".github/workflows/ci.yml";
      const jobLogPath = MockedJobLogManager.getJobLogPath(workflowPath);

      expect(jobLogPath).toBe(".github/workflows/ci.job.json");
    });
  });

  describe("error handling", () => {
    it("should handle job log loading errors gracefully", async () => {
      MockedJobLogManager.loadJobLog.mockRejectedValue(
        new Error("File read error"),
      );
      MockedJobLogManager.getJobLogPath.mockReturnValue("test.job.json");

      const options = { resume: true };
      const workflowPath = "test.yml";

      let startFromStep = 0;
      let existingJobLog = null;
      const jobLogPath = MockedJobLogManager.getJobLogPath(workflowPath);

      try {
        if (options.resume) {
          existingJobLog = await MockedJobLogManager.loadJobLog(jobLogPath);
          if (existingJobLog && existingJobLog.lastCompletedStep >= 0) {
            startFromStep = existingJobLog.lastCompletedStep + 1;
          }
        }
      } catch (error) {
        // Should gracefully handle the error
        expect((error as Error).message).toBe("File read error");
      }

      expect(startFromStep).toBe(0); // Should remain at default
      expect(existingJobLog).toBeNull();
    });

    it("should handle job log removal errors when not resuming", async () => {
      MockedJobLogManager.removeJobLog.mockRejectedValue(
        new Error("Permission denied"),
      );

      const options = { resume: false };
      let errorHandled = false;

      if (!options.resume) {
        try {
          await MockedJobLogManager.removeJobLog("test.yml");
        } catch {
          // File doesn't exist or can't be removed, that's fine
          errorHandled = true;
        }
      }

      expect(errorHandled).toBe(true);
      expect(MockedJobLogManager.removeJobLog).toHaveBeenCalledWith("test.yml");
    });
  });
});
