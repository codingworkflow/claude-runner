import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import {
  ClaudeCodeService,
  CommandResult,
} from "../../src/services/ClaudeCodeService";
import { WorkflowService } from "../../src/services/WorkflowService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { ClaudeWorkflow } from "../../src/types/WorkflowTypes";

describe("Workflow Execution Integration", () => {
  let claudeService: ClaudeCodeService;
  let workflowService: WorkflowService;
  let configService: ConfigurationService;
  let executeCommandStub: sinon.SinonStub;

  const mockWorkspaceFolder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.file("/test/workspace"),
    name: "test-workspace",
    index: 0,
  };

  beforeEach(() => {
    configService = new ConfigurationService();
    claudeService = new ClaudeCodeService(configService);
    workflowService = new WorkflowService(mockWorkspaceFolder);

    // Stub the executeCommand method
    executeCommandStub = sinon.stub(claudeService, "executeCommand");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("executeWorkflow", () => {
    it("should execute a simple workflow", async () => {
      const workflow: ClaudeWorkflow = {
        name: "Simple Workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "task1",
                name: "First Task",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Analyze the project structure",
                  model: "claude-3-5-sonnet-latest",
                  allow_all_tools: true,
                },
              },
            ],
          },
        },
      };

      // Mock successful command execution
      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({
          session_id: "sess_123",
          result: "Project analyzed successfully",
        }),
        exitCode: 0,
      } as CommandResult);

      const execution = workflowService.createExecution(workflow, {});
      const stepProgress: Array<{
        stepId: string;
        status: string;
        output?: unknown;
      }> = [];

      await claudeService.executeWorkflow(
        execution,
        workflowService,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        (stepId, status, output) => {
          stepProgress.push({ stepId, status, output });
        },
        () => {},
        (error) => {
          assert.fail(`Workflow failed: ${error}`);
        },
      );

      // Verify execution
      assert.strictEqual(stepProgress.length, 2);
      assert.strictEqual(stepProgress[0].stepId, "task1");
      assert.strictEqual(stepProgress[0].status, "running");
      assert.strictEqual(stepProgress[1].stepId, "task1");
      assert.strictEqual(stepProgress[1].status, "completed");
      assert.strictEqual(
        (stepProgress[1].output as any).result,
        "Project analyzed successfully",
      );

      // Verify command was called correctly
      assert.ok(executeCommandStub.calledOnce);
      const [args, cwd] = executeCommandStub.firstCall.args;
      assert.ok(args.includes("claude"));
      assert.ok(args.includes("-p"));
      assert.ok(args.includes("--model"));
      assert.ok(args.includes("claude-3-5-sonnet-latest"));
      assert.ok(args.includes("--output-format"));
      assert.ok(args.includes("json"));
      assert.strictEqual(cwd, "/test/workspace");
    });

    it("should handle workflow with session chaining", async () => {
      const workflow: ClaudeWorkflow = {
        name: "Chained Workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "analyze",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Analyze the code",
                  output_session: true,
                },
              },
              {
                id: "implement",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Implement changes",
                  resume_session: "${{ steps.analyze.outputs.session_id }}",
                },
              },
            ],
          },
        },
      };

      // Mock command executions
      executeCommandStub
        .onFirstCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_abc",
            result: "Analysis complete",
          }),
          exitCode: 0,
        })
        .onSecondCall()
        .resolves({
          success: true,
          output: JSON.stringify({
            session_id: "sess_def",
            result: "Implementation complete",
          }),
          exitCode: 0,
        });

      const execution = workflowService.createExecution(workflow, {});
      const completedSteps: string[] = [];

      await claudeService.executeWorkflow(
        execution,
        workflowService,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        (stepId, status) => {
          if (status === "completed") {
            completedSteps.push(stepId);
          }
        },
        () => {},
        (error) => {
          assert.fail(`Workflow failed: ${error}`);
        },
      );

      // Verify both steps completed
      assert.deepStrictEqual(completedSteps, ["analyze", "implement"]);

      // Verify session chaining
      assert.strictEqual(executeCommandStub.callCount, 2);
      const secondCallArgs = executeCommandStub.secondCall.args[0];
      assert.ok(secondCallArgs.includes("-r"));
      assert.ok(secondCallArgs.includes("sess_abc"));

      // Verify execution outputs
      assert.strictEqual(execution.outputs.analyze?.session_id, "sess_abc");
      assert.strictEqual(
        execution.outputs.analyze?.result,
        "Analysis complete",
      );
    });

    it("should resolve workflow inputs", async () => {
      const workflow: ClaudeWorkflow = {
        name: "Input Workflow",
        on: {
          workflow_dispatch: {
            inputs: {
              task_description: {
                description: "Task to perform",
                required: true,
              },
            },
          },
        },
        jobs: {
          main: {
            steps: [
              {
                id: "task",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Please ${{ inputs.task_description }}",
                },
              },
            ],
          },
        },
      };

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({ result: "Task completed" }),
        exitCode: 0,
      });

      const execution = workflowService.createExecution(workflow, {
        task_description: "refactor the authentication module",
      });

      await claudeService.executeWorkflow(
        execution,
        workflowService,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        () => {},
        () => {},
        () => {},
      );

      // Verify input was resolved in command
      const args = executeCommandStub.firstCall.args[0];
      const promptIndex = args.indexOf("-p") + 1;
      assert.ok(
        args[promptIndex].includes("refactor the authentication module"),
      );
    });

    it("should handle workflow failure", async () => {
      const workflow: ClaudeWorkflow = {
        name: "Failing Workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "fail",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "This will fail",
                },
              },
            ],
          },
        },
      };

      executeCommandStub.resolves({
        success: false,
        output: "",
        error: "Command execution failed",
        exitCode: 1,
      });

      const execution = workflowService.createExecution(workflow, {});
      let errorMessage = "";

      await claudeService.executeWorkflow(
        execution,
        workflowService,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        () => {},
        () => {
          assert.fail("Should not complete successfully");
        },
        (error) => {
          errorMessage = error;
        },
      );

      assert.strictEqual(errorMessage, "Command execution failed");
      assert.strictEqual(execution.status, "failed");
    });

    it("should support workflow cancellation", async () => {
      const workflow: ClaudeWorkflow = {
        name: "Cancellable Workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "step1",
                uses: "anthropics/claude-pipeline-action@v1",
                with: { prompt: "Step 1" },
              },
              {
                id: "step2",
                uses: "anthropics/claude-pipeline-action@v1",
                with: { prompt: "Step 2" },
              },
            ],
          },
        },
      };

      let callCount = 0;
      executeCommandStub.callsFake(async () => {
        callCount++;
        if (callCount === 1) {
          // Cancel after first step
          claudeService.cancelWorkflow();
          return {
            success: true,
            output: JSON.stringify({ result: "Step 1 done" }),
            exitCode: 0,
          };
        }
        assert.fail("Should not execute second step");
      });

      const execution = workflowService.createExecution(workflow, {});

      await claudeService.executeWorkflow(
        execution,
        workflowService,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        () => {},
        () => {},
        () => {},
      );

      assert.strictEqual(callCount, 1);
    });

    it("should handle environment variables", async () => {
      const workflow: ClaudeWorkflow = {
        name: "Env Workflow",
        env: {
          PROJECT_NAME: "TestProject",
        },
        jobs: {
          main: {
            env: {
              TASK_TYPE: "refactor",
            },
            steps: [
              {
                id: "task",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt:
                    "Work on ${{ env.PROJECT_NAME }} - ${{ env.TASK_TYPE }}",
                },
              },
            ],
          },
        },
      };

      executeCommandStub.resolves({
        success: true,
        output: JSON.stringify({ result: "Done" }),
        exitCode: 0,
      });

      const execution = workflowService.createExecution(workflow, {});

      await claudeService.executeWorkflow(
        execution,
        workflowService,
        "claude-3-5-sonnet-latest",
        "/test/workspace",
        () => {},
        () => {},
        () => {},
      );

      const args = executeCommandStub.firstCall.args[0];
      const promptIndex = args.indexOf("-p") + 1;
      assert.ok(args[promptIndex].includes("TestProject"));
      assert.ok(args[promptIndex].includes("refactor"));
    });
  });
});
