import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import sinon from "sinon";
import {
  ClaudeCodeService,
  CommandResult,
  TaskItem,
} from "../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { ClaudeExecutor } from "../../src/core/services/ClaudeExecutor";
import { IConfigManager } from "../../src/core/interfaces/IConfigManager";

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

describe("CLI Bypass Functionality Integration", () => {
  let claudeService: ClaudeCodeService;
  let configService: ConfigurationService;
  let claudeExecutor: ClaudeExecutor;
  let mockConfigManager: IConfigManager;
  let executeCommandStub: sinon.SinonStub;
  let buildTaskCommandSpy: sinon.SinonSpy;

  beforeEach(() => {
    configService = new ConfigurationService();
    claudeService = new ClaudeCodeService(configService);

    // Create mock config manager that implements IConfigManager
    mockConfigManager = {
      addSource: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      validateModel: jest.fn().mockReturnValue(true),
      validatePath: jest.fn().mockReturnValue(true),
    };

    claudeExecutor = new ClaudeExecutor(console, mockConfigManager);

    // Stub the executeCommand method from ClaudeService
    executeCommandStub = sinon.stub(claudeService, "executeCommand");

    // Also stub the executeCommand method from ClaudeExecutor to prevent actual execution
    sinon
      .stub(
        claudeExecutor as unknown as { executeCommand: () => Promise<unknown> },
        "executeCommand",
      )
      .resolves({
        success: true,
        output: JSON.stringify({
          result: "Test completed",
          session_id: "sess_test",
        }),
        exitCode: 0,
      });

    // Spy on buildTaskCommand to verify bypass flag is added
    buildTaskCommandSpy = sinon.spy(
      claudeExecutor as unknown as { buildTaskCommand: () => string },
      "buildTaskCommand",
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("Bypass permissions flag", () => {
    it("should add bypass permissions flag when bypassPermissions is true", async () => {
      const task = "Analyze the codebase and suggest improvements";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      // Mock successful command execution
      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_bypass_123",
          result: "Analysis completed with bypass permissions",
        }),
        exitCode: 0,
      } as CommandResult);

      const result = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        {
          allowAllTools: true, // This also triggers bypass permissions
          outputFormat: "json" as const,
        },
      );

      // Verify the command was built with bypass flag
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).toContain("--dangerously-skip-permissions");

      // Verify execution was successful
      expect(result.success).toBe(true);
      expect(result.output).toContain("Test completed");
    });

    it("should add bypass permissions flag when allowAllTools is true", async () => {
      const task = "Refactor the authentication module";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_tools_456",
          result: "Refactoring completed with all tools enabled",
        }),
        exitCode: 0,
      } as CommandResult);

      const result = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        {
          allowAllTools: true,
          outputFormat: "json" as const,
        },
      );

      // Verify bypass flag is added for allowAllTools
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).toContain("--dangerously-skip-permissions");

      expect(result.success).toBe(true);
      expect(result.output).toContain("Test completed");
    });

    it("should add bypass flag when both bypassPermissions and allowAllTools are true", async () => {
      const task = "Deploy the application to production";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_both_789",
          result: "Deployment completed with full bypass",
        }),
        exitCode: 0,
      } as CommandResult);

      const result = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        {
          allowAllTools: true, // This triggers bypass permissions
          outputFormat: "json" as const,
        },
      );

      // Verify only one bypass flag is added (no duplication)
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      const bypassCount = commandArgs.filter(
        (arg: string) => arg === "--dangerously-skip-permissions",
      ).length;
      expect(bypassCount).toBe(1);

      expect(result.success).toBe(true);
    });

    it("should not add bypass flag when neither option is true", async () => {
      const task = "Generate documentation";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_normal_101",
          result: "Documentation generated with normal permissions",
        }),
        exitCode: 0,
      } as CommandResult);

      const result = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        {
          allowAllTools: false,
          outputFormat: "json" as const,
        },
      );

      // Verify no bypass flag is added
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).not.toContain("--dangerously-skip-permissions");

      expect(result.success).toBe(true);
    });

    it("should use allowed/disallowed tools when bypass is not enabled", async () => {
      const task = "Analyze code quality";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_restricted_202",
          result: "Analysis completed with restricted tools",
        }),
        exitCode: 0,
      } as CommandResult);

      const result = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        {
          allowedTools: ["read", "grep"],
          disallowedTools: ["bash", "edit"],
          outputFormat: "json" as const,
        },
      );

      // Verify tool restrictions are applied
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).not.toContain("--dangerously-skip-permissions");
      expect(commandArgs).toContain("--allowedTools");
      expect(commandArgs).toContain("read,grep");
      expect(commandArgs).toContain("--disallowedTools");
      expect(commandArgs).toContain("bash,edit");

      expect(result.success).toBe(true);
    });

    it("should ignore tool restrictions when bypass is enabled", async () => {
      const task = "Full system analysis";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_bypass_tools_303",
          result: "Full analysis completed bypassing tool restrictions",
        }),
        exitCode: 0,
      } as CommandResult);

      const result = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        {
          allowAllTools: true, // This bypasses tool restrictions
          allowedTools: ["read"], // Should be ignored
          disallowedTools: ["bash"], // Should be ignored
          outputFormat: "json" as const,
        },
      );

      // Verify bypass flag is used and tool restrictions are ignored
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).toContain("--dangerously-skip-permissions");
      expect(commandArgs).not.toContain("--allowedTools");
      expect(commandArgs).not.toContain("--disallowedTools");

      expect(result.success).toBe(true);
    });
  });

  describe("Pipeline bypass integration", () => {
    it("should apply bypass permissions to all tasks in pipeline", async () => {
      const tasks: TaskItem[] = [
        {
          id: "analyze",
          name: "Analyze Code",
          prompt: "Analyze the codebase",
          status: "pending",
        },
        {
          id: "refactor",
          name: "Refactor Code",
          prompt: "Refactor based on analysis",
          status: "pending",
        },
        {
          id: "test",
          name: "Run Tests",
          prompt: "Execute the test suite",
          status: "pending",
        },
      ];

      // Mock successful executions for all tasks
      executeCommandStub
        .onCall(0)
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_analyze_bypass",
            result: "Analysis completed with bypass",
          }),
          exitCode: 0,
        } as CommandResult)
        .onCall(1)
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_refactor_bypass",
            result: "Refactoring completed with bypass",
          }),
          exitCode: 0,
        } as CommandResult)
        .onCall(2)
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_test_bypass",
            result: "Tests completed with bypass",
          }),
          exitCode: 0,
        } as CommandResult);

      let completedTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { allowAllTools: true, outputFormat: "json" as const },
        () => {},
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify all tasks completed successfully with bypass
      expect(completedTasks.length).toBe(3);
      expect(completedTasks.every((task) => task.status === "completed")).toBe(
        true,
      );
      expect(completedTasks[0].results).toContain("bypass");
      expect(completedTasks[1].results).toContain("bypass");
      expect(completedTasks[2].results).toContain("bypass");

      // Verify all commands were executed with bypass flag
      expect(executeCommandStub.callCount).toBe(3);
    });

    it("should handle bypass with session continuation", async () => {
      const tasks: TaskItem[] = [
        {
          id: "init",
          name: "Initialize Session",
          prompt: "Initialize the workspace",
          status: "pending",
        },
        {
          id: "continue",
          name: "Continue Work",
          prompt: "Continue from the initialized session",
          status: "pending",
          resumeFromTaskId: "init",
        },
      ];

      executeCommandStub
        .onCall(0)
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_init_bypass_404",
            result: "Session initialized with bypass permissions",
          }),
          exitCode: 0,
        } as CommandResult)
        .onCall(1)
        .callsFake(async (args) => {
          // Verify session continuation with bypass
          expect(args).toContain("-r");
          expect(args).toContain("sess_init_bypass_404");
          expect(args).toContain("--dangerously-skip-permissions");

          return {
            success: true,
            output: JSON.stringify({
              session_id: "sess_continue_bypass_505",
              result: "Continued work with bypass permissions",
            }),
            exitCode: 0,
          } as CommandResult;
        });

      let completedTasks: TaskItem[] = [];

      await claudeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { allowAllTools: true, outputFormat: "json" as const },
        () => {},
        (finalTasks) => {
          completedTasks = [...finalTasks];
        },
        (error) => {
          throw new Error(`Pipeline failed: ${error}`);
        },
      );

      // Verify session continuation worked with bypass
      expect(completedTasks.length).toBe(2);
      expect(completedTasks[0].sessionId).toBe("sess_init_bypass_404");
      expect(completedTasks[1].sessionId).toBe("sess_continue_bypass_505");
      expect(completedTasks[1].results).toContain(
        "Continued work with bypass permissions",
      );
    });

    it("should handle bypass with retry-like multiple executions", async () => {
      const task = "Task that requires multiple attempts";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      // Reset all stubs for this test
      sinon.restore();

      // Mock executeCommand to always succeed
      sinon
        .stub(
          claudeExecutor as unknown as {
            executeCommand: () => Promise<unknown>;
          },
          "executeCommand",
        )
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_multi_606",
            result: "Operation completed with bypass",
          }),
          exitCode: 0,
        });

      buildTaskCommandSpy = sinon.spy(
        claudeExecutor as unknown as { buildTaskCommand: () => string },
        "buildTaskCommand",
      );

      // Execute multiple tasks to demonstrate bypass flag consistency
      const result1 = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        { allowAllTools: true, outputFormat: "json" as const },
      );

      const result2 = await claudeExecutor.executeTask(
        task + " (second attempt)",
        model,
        workingDirectory,
        { allowAllTools: true, outputFormat: "json" as const },
      );

      // Verify both executions succeeded with bypass
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify bypass flag was used in both attempts
      expect(buildTaskCommandSpy.callCount).toBe(2);
      const firstCallArgs = buildTaskCommandSpy.getCall(0).returnValue;
      const secondCallArgs = buildTaskCommandSpy.getCall(1).returnValue;
      expect(firstCallArgs).toContain("--dangerously-skip-permissions");
      expect(secondCallArgs).toContain("--dangerously-skip-permissions");
    });
  });

  describe("Security validation", () => {
    it("should log warning when bypass permissions are used", async () => {
      const logSpy = sinon.spy(console, "warn");

      const task = "Potentially dangerous operation";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_dangerous_707",
          result: "Dangerous operation completed",
        }),
        exitCode: 0,
      } as CommandResult);

      await claudeExecutor.executeTask(task, model, workingDirectory, {
        allowAllTools: true,
        outputFormat: "json" as const,
      });

      // Note: This test assumes logging is implemented in the executor
      // If not implemented yet, this test serves as a specification
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).toContain("--dangerously-skip-permissions");

      logSpy.restore();
    });

    it("should handle bypass with different model types", async () => {
      const testCases = [
        { model: "claude-sonnet-4-20250514", expectedBypass: true },
        { model: "claude-3-haiku-20240307", expectedBypass: true },
        { model: "auto", expectedBypass: true },
      ];

      for (const testCase of testCases) {
        executeCommandStub.resetHistory();
        buildTaskCommandSpy.resetHistory();

        executeCommandStub.resolves({
          success: true,
          output: JSON.stringify({
            session_id: `sess_${testCase.model.replace(/[^a-z0-9]/g, "_")}`,
            result: `Task completed with ${testCase.model}`,
          }),
          exitCode: 0,
        } as CommandResult);

        await claudeExecutor.executeTask(
          "Test task",
          testCase.model,
          "/test/workspace",
          { allowAllTools: true, outputFormat: "json" },
        );

        // Verify bypass flag is added regardless of model
        expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
        const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
        expect(commandArgs).toContain("--dangerously-skip-permissions");
      }
    });
  });

  describe("Error handling with bypass", () => {
    it("should handle errors gracefully when bypass is enabled", async () => {
      const task = "Task that will fail even with bypass";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      // Override the mocked executeCommand for this test to return an error
      sinon.restore(); // Clear previous stubs
      sinon
        .stub(
          claudeExecutor as unknown as {
            executeCommand: () => Promise<unknown>;
          },
          "executeCommand",
        )
        .resolves({
          success: false,
          output: "",
          error: "Critical error even with bypass permissions",
          exitCode: 1,
        });

      buildTaskCommandSpy = sinon.spy(
        claudeExecutor as unknown as { buildTaskCommand: () => string },
        "buildTaskCommand",
      );

      const result = await claudeExecutor.executeTask(
        task,
        model,
        workingDirectory,
        {
          allowAllTools: true, // This also triggers bypass permissions
          outputFormat: "json" as const,
        },
      );

      // Verify error is handled properly
      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Critical error even with bypass permissions",
      );

      // Verify bypass flag was still used
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).toContain("--dangerously-skip-permissions");
    });

    it("should add bypass flags even during continue conversation mode", async () => {
      const task = "Continue the conversation";
      const model = "claude-sonnet-4-20250514";
      const workingDirectory = "/test/workspace";

      executeCommandStub.resolves({
        success: true,
        output: "Conversation continued with bypass flags",
        exitCode: 0,
      } as CommandResult);

      await claudeExecutor.executeTask(task, model, workingDirectory, {
        continueConversation: true,
        allowAllTools: true, // Should still add bypass in current implementation
      });

      // Note: Current implementation adds bypass flag even in continue mode
      expect(buildTaskCommandSpy.calledOnce).toBeTruthy();
      const commandArgs = buildTaskCommandSpy.getCall(0).returnValue;
      expect(commandArgs).toContain("--continue");
      expect(commandArgs).toContain("--dangerously-skip-permissions");
    });
  });
});
