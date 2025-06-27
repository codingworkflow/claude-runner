import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import sinon from "sinon";
import {
  ClaudeCodeService,
  CommandResult,
  TaskItem,
} from "../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../src/services/ConfigurationService";

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

describe("Conditional Workflow Execution Integration", () => {
  let claudeService: ClaudeCodeService;
  let configService: ConfigurationService;
  let executeCommandStub: sinon.SinonStub;

  beforeEach(() => {
    configService = new ConfigurationService();
    claudeService = new ClaudeCodeService(configService);

    // Stub the executeCommand method
    executeCommandStub = sinon.stub(claudeService, "executeCommand");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("Task Pipeline Conditional Execution", () => {
    it("should execute tasks with condition 'on_success' after successful task", async () => {
      const tasks: TaskItem[] = [
        {
          id: "build",
          name: "Build Project",
          prompt: "Build the project",
          status: "pending",
        },
        {
          id: "deploy",
          name: "Deploy to Production",
          prompt: "Deploy the application",
          status: "pending",
          condition: "on_success",
        },
      ];

      // Mock successful command executions
      executeCommandStub
        .onFirstCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_build",
            result: "Build successful",
          }),
          exitCode: 0,
        } as CommandResult)
        .onSecondCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_deploy",
            result: "Deployment successful",
          }),
          exitCode: 0,
        } as CommandResult);

      const completedTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        {},
        () => {},

        (finalTasks) => {
          completedTasks.push(...finalTasks);
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify both tasks executed successfully
      expect(completedTasks.length).toBe(2);
      expect(completedTasks[0].status).toBe("completed");
      expect(completedTasks[0].results).toContain("Build successful");
      expect(completedTasks[1].status).toBe("completed");
      expect(completedTasks[1].results).toContain("Deployment successful");
      expect(executeCommandStub.callCount).toBe(2);
    });

    it("should skip task with condition 'on_success' after failed task", async () => {
      const tasks: TaskItem[] = [
        {
          id: "build",
          name: "Build Project",
          prompt: "Build the project",
          status: "pending",
        },
        {
          id: "deploy",
          name: "Deploy to Production",
          prompt: "Deploy the application",
          status: "pending",
          condition: "on_success",
        },
      ];

      // Mock failed build
      executeCommandStub.resolves({
        success: false,
        output: "",
        error: "Build failed",
        exitCode: 1,
      } as CommandResult);

      let finalTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        {},
        () => {},
        (completedTasks) => {
          finalTasks = [...completedTasks];
        },
        (error, errorTasks) => {
          finalTasks = [...errorTasks];
        },
      );

      // Verify build failed and deploy was skipped due to condition
      expect(finalTasks.length).toBe(2);
      expect(finalTasks[0].status).toBe("error");
      expect(finalTasks[0].results).toBe("Build failed");
      expect(finalTasks[1].status).toBe("skipped"); // Deploy should be skipped due to on_success condition
      expect(finalTasks[1].skipReason).toContain(
        "Condition 'on_success' not met",
      );
      expect(executeCommandStub.callCount).toBe(1);
    });

    it("should execute task with condition 'on_failure' after failed task", async () => {
      const tasks: TaskItem[] = [
        {
          id: "build",
          name: "Build Project",
          prompt: "Build the project",
          status: "pending",
        },
        {
          id: "cleanup",
          name: "Cleanup on Failure",
          prompt: "Clean up failed build artifacts",
          status: "pending",
          condition: "on_failure",
        },
      ];

      // Mock failed build and successful cleanup
      executeCommandStub
        .onFirstCall()
        .resolves({
          success: false,
          output: "",
          error: "Build failed",
          exitCode: 1,
        } as CommandResult)
        .onSecondCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_cleanup",
            result: "Cleanup completed",
          }),
          exitCode: 0,
        } as CommandResult);

      const progressUpdates: Array<{ tasks: TaskItem[]; index: number }> = [];
      let finalTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        {},
        (updatedTasks, index) => {
          progressUpdates.push({ tasks: [...updatedTasks], index });
        },
        (completedTasks) => {
          finalTasks = [...completedTasks];
        },
        (error, errorTasks) => {
          // Pipeline should complete even after initial error
          finalTasks = [...errorTasks];
        },
      );

      // Verify cleanup task executed after build failure
      expect(finalTasks.length).toBe(2);
      expect(finalTasks[0].status).toBe("error");
      expect(finalTasks[0].results).toBe("Build failed");
      expect(finalTasks[1].status).toBe("completed");
      expect(finalTasks[1].results).toContain("Cleanup completed");
      expect(executeCommandStub.callCount).toBe(2);
    });

    it("should execute task with condition 'always' regardless of previous task status", async () => {
      const tasks: TaskItem[] = [
        {
          id: "build",
          name: "Build Project",
          prompt: "Build the project",
          status: "pending",
        },
        {
          id: "notify",
          name: "Send Notification",
          prompt: "Send build notification",
          status: "pending",
          condition: "always",
        },
      ];

      // Mock failed build and successful notification
      executeCommandStub
        .onFirstCall()
        .resolves({
          success: false,
          output: "",
          error: "Build failed",
          exitCode: 1,
        } as CommandResult)
        .onSecondCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_notify",
            result: "Notification sent",
          }),
          exitCode: 0,
        } as CommandResult);

      let finalTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        {},
        () => {},
        (completedTasks) => {
          finalTasks = [...completedTasks];
        },
        (error, errorTasks) => {
          // Pipeline should complete even after initial error
          finalTasks = [...errorTasks];
        },
      );

      // Verify notification task executed despite build failure
      expect(finalTasks.length).toBe(2);
      expect(finalTasks[0].status).toBe("error");
      expect(finalTasks[0].results).toBe("Build failed");
      expect(finalTasks[1].status).toBe("completed");
      expect(finalTasks[1].results).toContain("Notification sent");
      expect(executeCommandStub.callCount).toBe(2);
    });

    it("should execute task with check command that passes", async () => {
      const tasks: TaskItem[] = [
        {
          id: "setup",
          name: "Setup Environment",
          prompt: "Setup the environment",
          status: "pending",
        },
        {
          id: "test",
          name: "Run Tests",
          prompt: "Run test suite",
          status: "pending",
          check: "test -f package.json",
          condition: "on_success",
        },
      ];

      // Mock successful setup and check command
      executeCommandStub
        .onFirstCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_setup",
            result: "Setup complete",
          }),
          exitCode: 0,
        } as CommandResult)
        .onSecondCall()
        .resolves({
          success: true,
          output: "",
          exitCode: 0,
        } as CommandResult) // Check command passes
        .onThirdCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_test",
            result: "Tests passed",
          }),
          exitCode: 0,
        } as CommandResult);

      let finalTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-3-5-sonnet-latest",
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

      // Verify both tasks executed
      expect(finalTasks.length).toBe(2);
      expect(finalTasks[0].status).toBe("completed");
      expect(finalTasks[0].results).toContain("Setup complete");
      expect(finalTasks[1].status).toBe("completed");
      expect(finalTasks[1].results).toContain("Tests passed");
      expect(executeCommandStub.callCount).toBe(3); // setup + check + test
    });

    it("should skip task with check command that fails", async () => {
      const tasks: TaskItem[] = [
        {
          id: "setup",
          name: "Setup Environment",
          prompt: "Setup the environment",
          status: "pending",
        },
        {
          id: "test",
          name: "Run Tests",
          prompt: "Run test suite",
          status: "pending",
          check: "test -f nonexistent-file.json",
          condition: "on_success",
        },
      ];

      // Mock successful setup and failing check command
      executeCommandStub
        .onFirstCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_setup",
            result: "Setup complete",
          }),
          exitCode: 0,
        } as CommandResult)
        .onSecondCall()
        .resolves({
          success: false,
          output: "",
          error: "File not found",
          exitCode: 1,
        } as CommandResult); // Check command fails

      let finalTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-3-5-sonnet-latest",
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

      // Verify only setup task executed
      expect(finalTasks.length).toBe(2);
      expect(finalTasks[0].status).toBe("completed");
      expect(finalTasks[0].results).toContain("Setup complete");
      expect(finalTasks[1].status).toBe("skipped");
      expect(finalTasks[1].skipReason).toContain("Check command failed");
      expect(executeCommandStub.callCount).toBe(2); // setup + check
    });
  });

  describe("evaluateCondition method", () => {
    it("should return true for 'always' condition", async () => {
      const result = await claudeService.evaluateCondition(
        undefined,
        "always",
        false,
        "/test/workspace",
      );

      expect(result.shouldRun).toBe(true);
    });

    it("should return true for 'on_success' condition after successful step", async () => {
      const result = await claudeService.evaluateCondition(
        undefined,
        "on_success",
        true,
        "/test/workspace",
      );

      expect(result.shouldRun).toBe(true);
    });

    it("should return false for 'on_success' condition after failed step", async () => {
      const result = await claudeService.evaluateCondition(
        undefined,
        "on_success",
        false,
        "/test/workspace",
      );

      expect(result.shouldRun).toBe(false);
      expect(result.reason).toContain("Condition 'on_success' not met");
    });

    it("should return true for 'on_failure' condition after failed step", async () => {
      const result = await claudeService.evaluateCondition(
        undefined,
        "on_failure",
        false,
        "/test/workspace",
      );

      expect(result.shouldRun).toBe(true);
    });

    it("should return false for 'on_failure' condition after successful step", async () => {
      const result = await claudeService.evaluateCondition(
        undefined,
        "on_failure",
        true,
        "/test/workspace",
      );

      expect(result.shouldRun).toBe(false);
      expect(result.reason).toContain("Condition 'on_failure' not met");
    });

    it("should execute check command and return result", async () => {
      executeCommandStub.resolves({
        success: true,
        output: "",
        exitCode: 0,
      } as CommandResult);

      const result = await claudeService.evaluateCondition(
        "echo test",
        "on_success",
        true,
        "/test/workspace",
      );

      expect(result.shouldRun).toBe(true);
      expect(executeCommandStub.calledWith(["echo", "test"])).toBe(true);
    });

    it("should return false when check command fails", async () => {
      executeCommandStub.resolves({
        success: false,
        output: "",
        error: "Command failed",
        exitCode: 1,
      } as CommandResult);

      const result = await claudeService.evaluateCondition(
        "test -f missing-file",
        "on_success",
        true,
        "/test/workspace",
      );

      expect(result.shouldRun).toBe(false);
      expect(result.reason).toContain("Check command failed");
    });
  });
});
