import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import { WorkflowJsonLogger } from "../../src/services/WorkflowJsonLogger";
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";

// E2E Test: Session Continuity using real service integration
describe("Session Continuity E2E Tests", () => {
  let tempDir: string;
  let fixturesPath: string;
  let pipelineService: PipelineService;
  let workflowJsonLogger: WorkflowJsonLogger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "session-continuity-e2e-"),
    );
    fixturesPath = path.join(__dirname, "../fixtures");

    // Real services - no mocking (following guidelines)
    const mockContext = {
      extensionPath: "/test",
      globalStorageUri: { fsPath: "/tmp/test-storage" },
    };

    jest
      .spyOn(PipelineService.prototype as any, "ensureDirectories")
      .mockImplementation(() => Promise.resolve());

    pipelineService = new PipelineService(mockContext as any);

    const fileSystem = new VSCodeFileSystem();
    const logger = new VSCodeLogger();
    workflowJsonLogger = new WorkflowJsonLogger(fileSystem, logger);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Helper to execute step with real script execution
  async function executeStep(
    stepIndex: number,
    workflow: any,
    tasks: any[],
    previousSessionId?: string,
  ) {
    const task = tasks[stepIndex];
    const job = Object.values(workflow.jobs)[0] as any;
    const step = job.steps.find((s: any) => s.id === task.id);

    console.log(`📋 Executing step ${stepIndex + 1}: ${task.name}`);

    if (step?.with && (step.with as any).run) {
      const { spawn } = require("child_process"); // eslint-disable-line @typescript-eslint/no-var-requires
      const scriptPath = (step.with as any).run;

      // Build arguments - add -r parameter if this step should resume a session
      const args = [scriptPath];
      if (previousSessionId && (step.with as any).resume_session) {
        args.push("-r", previousSessionId);
        console.log(`🔗 Resuming with session ID: ${previousSessionId}`);
      }

      const result = await new Promise<{
        success: boolean;
        output: string;
        exitCode: number;
      }>((resolve) => {
        const child = spawn("bash", args, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: process.cwd(),
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        child.on("close", (code: number) => {
          resolve({
            success: code === 0,
            output: stdout.trim() || stderr.trim(),
            exitCode: code,
          });
        });
      });

      // Parse JSON output from Claude-format script
      const parsedOutput = JSON.parse(result.output);
      const sessionId = parsedOutput.session_id;

      if (result.success) {
        console.log(
          `✅ Step ${stepIndex + 1} completed. Session ID: ${sessionId}`,
        );
        return {
          success: true,
          sessionId,
          parsedOutput,
          output: result.output,
        };
      } else {
        throw new Error(
          `Step failed: ${parsedOutput.error || "Unknown error"}`,
        );
      }
    }

    throw new Error("No script to execute");
  }

  describe("Cross-Step Session Continuity", () => {
    test("should maintain session continuity across multiple steps", async () => {
      // Use existing fixture instead of inline workflow content
      const workflowPath = path.join(
        fixturesPath,
        "workflows/three-step-execution.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");
      const workflowFile = path.join(tempDir, "three-step-execution.yml");
      await fs.writeFile(workflowFile, content);

      const workflow = WorkflowParser.parseYaml(content);
      const tasks = pipelineService.workflowToTaskItems(workflow);

      expect(tasks).toHaveLength(3);
      console.log("🚀 Starting session continuity test with 3 steps...");

      // Initialize workflow execution and logging
      const workflowExecution = {
        workflow: workflow,
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running" as any,
      };

      const mockWorkflowState = {
        executionId: `session-continuity-${Date.now()}`,
        workflowPath: workflowFile,
        workflowName: workflow.name,
        startTime: new Date().toISOString(),
        currentStep: 0,
        totalSteps: 3,
        status: "running" as any,
        sessionMappings: {},
        completedSteps: [],
        execution: workflowExecution,
        canResume: true,
      };

      await workflowJsonLogger.initializeLog(
        mockWorkflowState,
        workflowFile,
        false,
      );

      // STEP 1: Execute initial step (creates session)
      console.log("\n📋 === EXECUTING STEP 1 (INITIAL SESSION) ===");
      const step1Result = await executeStep(0, workflow, tasks);
      expect(step1Result.success).toBe(true);

      const initialSessionId = step1Result.sessionId;
      console.log(`🔑 Initial session created: ${initialSessionId}`);

      // STEP 2: Execute second step (continues session)
      console.log("\n📋 === EXECUTING STEP 2 (SESSION CONTINUATION) ===");
      const step2Result = await executeStep(
        1,
        workflow,
        tasks,
        initialSessionId,
      );
      expect(step2Result.success).toBe(true);
      expect(step2Result.sessionId).toBe(initialSessionId);
      console.log(`🔗 Session continuity maintained: ${step2Result.sessionId}`);

      // STEP 3: Execute third step (continues session)
      console.log("\n📋 === EXECUTING STEP 3 (FINAL CONTINUATION) ===");
      const step3Result = await executeStep(
        2,
        workflow,
        tasks,
        initialSessionId,
      );
      expect(step3Result.success).toBe(true);
      expect(step3Result.sessionId).toBe(initialSessionId);
      console.log(
        `🔗 Final session continuity maintained: ${step3Result.sessionId}`,
      );

      // VERIFICATION: All steps used the same session ID
      const sessionIds = [
        step1Result.sessionId,
        step2Result.sessionId,
        step3Result.sessionId,
      ];
      expect(sessionIds.every((id) => id === initialSessionId)).toBe(true);

      console.log("✅ SESSION CONTINUITY VERIFICATION PASSED:");
      console.log("   - Step 1 created initial session");
      console.log("   - Step 2 continued with same session");
      console.log("   - Step 3 maintained session continuity");
      console.log(`   - Session chain: [${sessionIds.join(", ")}]`);
      console.log(`   - All steps used session: ${initialSessionId}`);
    }, 20000);

    test("should handle session reference validation", async () => {
      // Use existing fixture to test session reference parsing
      const workflowPath = path.join(
        fixturesPath,
        "workflows/three-step-execution.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");

      const workflow = WorkflowParser.parseYaml(content);
      const tasks = pipelineService.workflowToTaskItems(workflow);

      console.log("🚀 Starting session reference validation test...");

      // Test that the workflow parses correctly with simple reference format
      expect(tasks).toHaveLength(3);

      // Verify session reference parsing
      const step2 = workflow.jobs.test.steps[1];
      const step3 = workflow.jobs.test.steps[2];

      expect(step2.with?.resume_session).toBe("step1");
      expect(step3.with?.resume_session).toBe("step2");

      console.log("✅ Session reference format validated:");
      console.log(`   - Step 2 references: ${step2.with?.resume_session}`);
      console.log(`   - Step 3 references: ${step3.with?.resume_session}`);

      // Execute first step to create session
      const step1Result = await executeStep(0, workflow, tasks);
      expect(step1Result.success).toBe(true);

      const sessionId = step1Result.sessionId;
      console.log(`🔑 Session created: ${sessionId}`);

      // Execute second step with session reference
      const step2Result = await executeStep(1, workflow, tasks, sessionId);
      expect(step2Result.success).toBe(true);
      expect(step2Result.sessionId).toBe(sessionId);

      // Execute third step to test continued session reference
      const step3Result = await executeStep(2, workflow, tasks, sessionId);
      expect(step3Result.success).toBe(true);
      expect(step3Result.sessionId).toBe(sessionId);

      console.log("✅ Session reference validation passed:");
      console.log(`   - Created session: ${sessionId}`);
      console.log(`   - Step 2 session: ${step2Result.sessionId}`);
      console.log(`   - Step 3 session: ${step3Result.sessionId}`);
      console.log(
        `   - Session continuity: ${sessionId === step2Result.sessionId && sessionId === step3Result.sessionId}`,
      );
    });
  });
});
