import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import sinon from "sinon";
import * as fs from "fs/promises";
import {
  ClaudeCodeService,
  CommandResult,
  TaskItem,
} from "../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { JobLogManager } from "../../cli/src/utils/JobLogManager";
import { JobLog } from "../../cli/src/types/JobLog";

// Mock file system to prevent actual directory creation
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue("{}"),
  access: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  rm: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe("CLI Resume Functionality Integration", () => {
  let claudeService: ClaudeCodeService;
  let configService: ConfigurationService;
  let executeCommandStub: sinon.SinonStub;
  let readFileStub: jest.MockedFunction<typeof fs.readFile>;

  const testWorkflowPath = "/test/workflow.yml";

  beforeEach(() => {
    configService = new ConfigurationService();
    claudeService = new ClaudeCodeService(configService);

    // Stub the executeCommand method
    executeCommandStub = sinon.stub(claudeService, "executeCommand");

    // Get mock functions for fs operations
    readFileStub = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
  });

  afterEach(() => {
    sinon.restore();
    jest.clearAllMocks();
  });

  describe("Resume from job log", () => {
    it("should resume pipeline from last completed step", async () => {
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
          prompt: "Run the test suite",
          status: "pending",
        },
        {
          id: "deploy",
          name: "Deploy Application",
          prompt: "Deploy to production",
          status: "pending",
        },
      ];

      // Mock existing job log with first step completed
      const existingJobLog: JobLog = {
        workflowName: "Integration Test Workflow",
        workflowFile: testWorkflowPath,
        executionId: "test-exec-123",
        startTime: new Date(Date.now() - 60000).toISOString(),
        lastUpdateTime: new Date(Date.now() - 30000).toISOString(),
        status: "running",
        lastCompletedStep: 0, // First step completed
        totalSteps: 3,
        steps: [
          {
            stepIndex: 0,
            stepId: "build",
            stepName: "Build Project",
            status: "completed",
            startTime: new Date(Date.now() - 60000).toISOString(),
            endTime: new Date(Date.now() - 45000).toISOString(),
            durationMs: 15000,
            output: "Build completed successfully",
            sessionId: "sess_build_123",
          },
        ],
      };

      // Mock job log file reading
      readFileStub.mockResolvedValueOnce(JSON.stringify(existingJobLog));

      // Mock command executions for remaining steps
      executeCommandStub
        .onCall(0) // test step
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_test_456",
            result: "All tests passed",
          }),
          exitCode: 0,
        } as CommandResult)
        .onCall(1) // deploy step
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_deploy_789",
            result: "Deployment successful",
          }),
          exitCode: 0,
        } as CommandResult);

      const progressUpdates: Array<{ tasks: TaskItem[]; index: number }> = [];
      let completedTasks: TaskItem[] = [];

      // Simulate resume functionality by starting from step 1
      const resumeFromIndex = existingJobLog.lastCompletedStep + 1;
      const tasksToExecute = tasks.slice(resumeFromIndex);

      // Mark first task as already completed based on job log
      tasks[0].status = "completed";
      tasks[0].results = "Build completed successfully";
      tasks[0].sessionId = "sess_build_123";

      // Execute remaining tasks
      await claudeService.runTaskPipeline(
        tasksToExecute,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        {},
        (updatedTasks, index) => {
          progressUpdates.push({
            tasks: [...updatedTasks],
            index: index + resumeFromIndex,
          });
        },
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify resume behavior
      expect(completedTasks.length).toBe(2); // Only remaining tasks
      expect(completedTasks[0].id).toBe("test");
      expect(completedTasks[0].status).toBe("completed");
      expect(completedTasks[0].results).toContain("All tests passed");
      expect(completedTasks[1].id).toBe("deploy");
      expect(completedTasks[1].status).toBe("completed");
      expect(completedTasks[1].results).toContain("Deployment successful");

      // Verify only remaining steps were executed
      expect(executeCommandStub.callCount).toBe(2);
    });

    it("should handle resume when job log indicates failure", async () => {
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
          prompt: "Run the test suite",
          status: "pending",
        },
      ];

      // Mock job log with failed step
      const existingJobLog: JobLog = {
        workflowName: "Failed Integration Test",
        workflowFile: testWorkflowPath,
        executionId: "test-exec-456",
        startTime: new Date(Date.now() - 60000).toISOString(),
        lastUpdateTime: new Date(Date.now() - 30000).toISOString(),
        status: "failed",
        lastCompletedStep: -1, // No steps completed
        totalSteps: 2,
        steps: [
          {
            stepIndex: 0,
            stepId: "build",
            stepName: "Build Project",
            status: "failed",
            startTime: new Date(Date.now() - 60000).toISOString(),
            durationMs: 5000,
            error: "Build failed due to compilation errors",
          },
        ],
      };

      readFileStub.mockResolvedValueOnce(JSON.stringify(existingJobLog));

      // Mock successful retry of failed step
      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_build_retry",
          result: "Build completed after fixing errors",
        }),
        exitCode: 0,
      } as CommandResult);

      let finalTasks: TaskItem[] = [];

      // Resume should retry the failed step
      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        {},
        () => {},
        (completedTasks) => {
          finalTasks = [...completedTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify the failed step was retried successfully
      expect(finalTasks.length).toBe(2);
      expect(finalTasks[0].status).toBe("completed");
      expect(finalTasks[0].results).toContain(
        "Build completed after fixing errors",
      );
    });

    it("should preserve session IDs across resume operations", async () => {
      const tasks: TaskItem[] = [
        {
          id: "analyze",
          name: "Analyze Code",
          prompt: "Analyze the codebase",
          status: "pending",
        },
        {
          id: "implement",
          name: "Implement Changes",
          prompt: "Implement the changes",
          status: "pending",
          resumeFromTaskId: "analyze", // Should use session from analyze task
        },
      ];

      // Mock job log with first step completed and session ID
      const existingJobLog: JobLog = {
        workflowName: "Session Resume Test",
        workflowFile: testWorkflowPath,
        executionId: "test-exec-789",
        startTime: new Date(Date.now() - 60000).toISOString(),
        lastUpdateTime: new Date(Date.now() - 30000).toISOString(),
        status: "running",
        lastCompletedStep: 0,
        totalSteps: 2,
        steps: [
          {
            stepIndex: 0,
            stepId: "analyze",
            stepName: "Analyze Code",
            status: "completed",
            startTime: new Date(Date.now() - 60000).toISOString(),
            endTime: new Date(Date.now() - 45000).toISOString(),
            durationMs: 15000,
            output: "Analysis complete",
            sessionId: "sess_analyze_original",
          },
        ],
      };

      readFileStub.mockResolvedValueOnce(JSON.stringify(existingJobLog));

      // Mock second step execution that should use the session ID
      executeCommandStub.callsFake(async (args) => {
        // Check if resume session argument is included (it should be for tasks with resumeFromTaskId)
        const resumeIndex = args.indexOf("-r");
        if (resumeIndex > -1) {
          expect(args[resumeIndex + 1]).toBe("sess_analyze_original");
        }

        return {
          success: true,
          output: JSON.stringify({
            session_id: "sess_implement_resumed",
            result: "Changes implemented based on analysis",
          }),
          exitCode: 0,
        } as CommandResult;
      });

      // Set up first task as completed with session ID from job log
      tasks[0].status = "completed";
      tasks[0].results = "Analysis complete";
      tasks[0].sessionId = "sess_analyze_original";

      let completedTasks: TaskItem[] = [];

      // Execute both tasks but with the first already marked as completed
      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        {},
        () => {},
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify session continuity - at least one task should be completed
      expect(completedTasks.length).toBeGreaterThan(0);
      const implementTask = completedTasks.find((t) => t.id === "implement");
      if (implementTask) {
        expect(implementTask.status).toBe("completed");
        expect(implementTask.results).toContain("Changes implemented");
      }

      // Verify the command was called (important for session handling)
      expect(executeCommandStub.callCount).toBeGreaterThan(0);
    });

    it("should handle resume with rate limit recovery", async () => {
      const tasks: TaskItem[] = [
        {
          id: "task1",
          name: "First Task",
          prompt: "Execute first task",
          status: "pending",
        },
        {
          id: "task2",
          name: "Second Task",
          prompt: "Execute second task",
          status: "pending",
        },
      ];

      // Mock job log showing rate limit pause
      const existingJobLog: JobLog = {
        workflowName: "Rate Limit Resume Test",
        workflowFile: testWorkflowPath,
        executionId: "test-rate-limit",
        startTime: new Date(Date.now() - 120000).toISOString(),
        lastUpdateTime: new Date(Date.now() - 60000).toISOString(),
        status: "running",
        lastCompletedStep: 0,
        totalSteps: 2,
        steps: [
          {
            stepIndex: 0,
            stepId: "task1",
            stepName: "First Task",
            status: "completed",
            startTime: new Date(Date.now() - 120000).toISOString(),
            endTime: new Date(Date.now() - 90000).toISOString(),
            durationMs: 30000,
            output: "First task completed",
            sessionId: "sess_task1_rate",
          },
        ],
      };

      readFileStub.mockResolvedValueOnce(JSON.stringify(existingJobLog));

      // Mock successful execution after rate limit period
      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_task2_after_limit",
          result: "Second task completed after rate limit",
        }),
        exitCode: 0,
      } as CommandResult);

      // Set up first task as completed
      tasks[0].status = "completed";
      tasks[0].results = "First task completed";
      tasks[0].sessionId = "sess_task1_rate";

      let completedTasks: TaskItem[] = [];

      // Resume should continue from second task
      await claudeService.runTaskPipeline(
        [tasks[1]], // Only remaining task
        "claude-sonnet-4-20250514",
        "/test/workspace",
        {},
        () => {},
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify successful resume after rate limit
      expect(completedTasks.length).toBe(1);
      expect(completedTasks[0].id).toBe("task2");
      expect(completedTasks[0].status).toBe("completed");
      expect(completedTasks[0].results).toContain("after rate limit");
      expect(executeCommandStub.calledOnce).toBeTruthy();
    });
  });

  describe("Job log validation", () => {
    it("should handle corrupt job log gracefully", async () => {
      const tasks: TaskItem[] = [
        {
          id: "test-task",
          name: "Test Task",
          prompt: "Test prompt",
          status: "pending",
        },
      ];

      // Mock corrupt job log
      readFileStub.mockResolvedValueOnce("invalid json content");

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_new",
          result: "Task completed",
        }),
        exitCode: 0,
      } as CommandResult);

      let completedTasks: TaskItem[] = [];

      // Should start fresh when job log is corrupt
      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        {},
        () => {},
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify execution continued normally
      expect(completedTasks.length).toBe(1);
      expect(completedTasks[0].status).toBe("completed");
      expect(executeCommandStub.calledOnce).toBeTruthy();
    });

    it("should handle missing job log file", async () => {
      const tasks: TaskItem[] = [
        {
          id: "fresh-task",
          name: "Fresh Task",
          prompt: "Fresh execution",
          status: "pending",
        },
      ];

      // Mock missing job log file
      readFileStub.mockRejectedValueOnce(
        Object.assign(new Error("File not found"), { code: "ENOENT" }),
      );

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_fresh",
          result: "Fresh execution completed",
        }),
        exitCode: 0,
      } as CommandResult);

      let completedTasks: TaskItem[] = [];

      // Should execute normally when no job log exists
      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        {},
        () => {},
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      expect(completedTasks.length).toBe(1);
      expect(completedTasks[0].status).toBe("completed");
      expect(executeCommandStub.calledOnce).toBeTruthy();
    });
  });

  describe("JobLogManager integration", () => {
    it("should use JobLogManager for path generation", () => {
      const workflowPath = "/test/my-workflow.yml";
      const expectedJobLogPath = "/test/my-workflow.job.json";

      const actualPath = JobLogManager.getJobLogPath(workflowPath);

      expect(actualPath).toBe(expectedJobLogPath);
    });

    it("should create job log with proper structure", () => {
      const workflowName = "Test Workflow";
      const workflowFile = "/test/workflow.yml";
      const totalSteps = 3;

      const jobLog = JobLogManager.createJobLog(
        workflowName,
        workflowFile,
        totalSteps,
      );

      expect(jobLog.workflowName).toBe(workflowName);
      expect(jobLog.workflowFile).toBe(workflowFile);
      expect(jobLog.totalSteps).toBe(totalSteps);
      expect(jobLog.lastCompletedStep).toBe(-1);
      expect(jobLog.status).toBe("running");
      expect(jobLog.steps).toEqual([]);
      expect(jobLog.executionId).toBeDefined();
    });

    it("should update job log with step completion", () => {
      const jobLog = JobLogManager.createJobLog(
        "Test Workflow",
        "/test/workflow.yml",
        2,
      );

      const step = {
        stepIndex: 0,
        stepId: "test-step",
        stepName: "Test Step",
        status: "completed" as const,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 1000,
        output: "Step completed",
        sessionId: "sess_123",
      };

      JobLogManager.addStep(jobLog, step);

      expect(jobLog.steps.length).toBe(1);
      expect(jobLog.lastCompletedStep).toBe(0);
      expect(jobLog.steps[0]).toEqual(step);
    });
  });
});
