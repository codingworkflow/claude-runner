import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import { WorkflowJsonLogger } from "../../src/services/WorkflowJsonLogger";
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";
import { WorkflowExecution } from "../../src/types/WorkflowTypes";

// E2E Test: Progressive step logging with proper session tracking
describe("Progressive Workflow Logging E2E Tests", () => {
  let tempDir: string;
  let fixturesPath: string;
  let pipelineService: PipelineService;
  let workflowJsonLogger: WorkflowJsonLogger;
  let workflowExecution: WorkflowExecution;
  let logPath: string;
  let workflowFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "progressive-logging-e2e-"),
    );
    fixturesPath = path.join(__dirname, "../fixtures");

    // Real services - no mocking
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

    // Setup workflow file and log path
    workflowFile = path.join(tempDir, "progressive-logging-test.yml");
    logPath = path.join(tempDir, "progressive-logging-test.json");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Helper to execute a single step and update log
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
      // Execute the actual script
      const { spawn } = require("child_process"); // eslint-disable-line @typescript-eslint/no-var-requires
      const scriptPath = (step.with as any).run;

      // Build arguments - add -r parameter if this step should resume a session
      const args = [scriptPath];
      if (previousSessionId && (step.with as any).resume_session) {
        args.push("-r", previousSessionId);
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

        let output = "";
        child.stdout.on("data", (data: Buffer) => {
          output += data.toString();
        });

        child.stderr.on("data", (data: Buffer) => {
          output += data.toString();
        });

        child.on("close", (code: number) => {
          resolve({
            success: code === 0,
            output: output.trim(),
            exitCode: code,
          });
        });
      });

      // Parse JSON output from Claude-format script
      let parsedOutput;
      let sessionId = `session-${task.id}`;

      try {
        parsedOutput = JSON.parse(result.output);
        sessionId = parsedOutput.session_id || sessionId;
        console.log(
          `✅ Step ${stepIndex + 1} completed. Session ID: ${sessionId}`,
        );
      } catch (error) {
        console.log(
          `⚠️  Step ${stepIndex + 1} output not JSON, using raw output`,
        );
        parsedOutput = { content: result.output };
      }

      if (result.success) {
        // Log successful step with session tracking
        const stepResult = {
          stepIndex,
          stepId: task.id,
          sessionId: sessionId,
          outputSession: (step.with as any).output_session || false,
          resumeSession: (step.with as any).resume_session,
          status: "completed" as any,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          output: result.output,
        };

        const mockWorkflowState = {
          executionId: "progressive-test-001",
          workflowPath: workflowFile,
          workflowName: workflow.name,
          startTime: new Date().toISOString(),
          currentStep: stepIndex,
          totalSteps: tasks.length,
          status: "running" as any,
          sessionMappings: {},
          completedSteps: [],
          execution: workflowExecution,
          canResume: true,
        };

        await workflowJsonLogger.updateStepProgress(
          stepResult,
          mockWorkflowState,
        );
        workflowExecution.outputs[task.id] = { result: result.output };

        return {
          success: true,
          sessionId,
          parsedOutput,
          output: result.output,
        };
      } else {
        throw new Error(`Step failed with exit code ${result.exitCode}`);
      }
    }

    throw new Error("No script to execute");
  }

  // Helper to read and verify log state
  async function verifyLogState(
    expectedSteps: number,
    expectedLastCompleted: number,
  ) {
    const actualLogContent = await fs.readFile(logPath, "utf-8");
    const actualLog = JSON.parse(actualLogContent);

    console.log(
      `🔍 Log verification: ${actualLog.steps.length} steps, last_completed: ${actualLog.last_completed_step}`,
    );

    // Critical validations
    expect(actualLog.steps).toHaveLength(expectedSteps);
    expect(actualLog.last_completed_step).toBe(expectedLastCompleted);

    return actualLog;
  }

  describe("Progressive Step Logging with Session Tracking", () => {
    test("should progressively log steps: 1 step → 2 steps → 3 steps with correct last_completed_step", async () => {
      // Load workflow
      const workflowPath = path.join(
        fixturesPath,
        "workflows/progressive-logging-test.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");
      await fs.writeFile(workflowFile, content);

      const workflow = WorkflowParser.parseYaml(content);
      const tasks = pipelineService.workflowToTaskItems(workflow);

      expect(tasks).toHaveLength(3);
      console.log("🚀 Starting progressive workflow execution with 3 steps...");

      // Initialize workflow execution and logging
      workflowExecution = {
        workflow: workflow,
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const mockWorkflowState = {
        executionId: "progressive-test-001",
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

      // STEP 1: Execute first step
      console.log("\n📋 === EXECUTING STEP 1 ===");
      const step1Result = await executeStep(0, workflow, tasks);

      // VERIFY: 1 step logged, last_completed = 0
      let logState = await verifyLogState(1, 0);
      expect(logState.steps[0].step_id).toBe("step1");
      expect(logState.steps[0].status).toBe("completed");
      expect(logState.steps[0].session_id).toBeDefined();
      expect(logState.steps[0].output_session).toBe(true);

      // Extract session ID from step 1 output (dynamically)
      const step1Output = JSON.parse(step1Result.output);
      const sessionId = step1Output.session_id;
      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^claude-session-\d+-[a-f0-9]+$/);
      expect(step1Output.result).toContain("Step 1 completed successfully");

      console.log(`🔑 Step 1 created session ID: ${sessionId}`);

      console.log("✅ STEP 1 VERIFIED: 1 step logged, last_completed = 0");

      // STEP 2: Execute second step with session continuity
      console.log("\n📋 === EXECUTING STEP 2 ===");
      const step2Result = await executeStep(1, workflow, tasks, sessionId);

      // VERIFY: 2 steps logged, last_completed = 1
      logState = await verifyLogState(2, 1);
      expect(logState.steps[1].step_id).toBe("step2");
      expect(logState.steps[1].status).toBe("completed");
      expect(logState.steps[1].resume_session).toBe("step1");

      // Verify session continuity - should be SAME session ID
      const step2Output = JSON.parse(step2Result.output);
      expect(step2Output.session_id).toBe(sessionId);
      expect(step2Output.result).toContain("Step 2 completed successfully");

      console.log(`🔗 Step 2 continued session ID: ${step2Output.session_id}`);

      console.log(
        "✅ STEP 2 VERIFIED: 2 steps logged, last_completed = 1, session continuity correct",
      );

      // STEP 3: Execute third step with session continuity
      console.log("\n📋 === EXECUTING STEP 3 ===");
      const step3Result = await executeStep(2, workflow, tasks, sessionId);

      // VERIFY: 3 steps logged, last_completed = 2
      logState = await verifyLogState(3, 2);
      expect(logState.steps[2].step_id).toBe("step3");
      expect(logState.steps[2].status).toBe("completed");
      expect(logState.steps[2].resume_session).toBe("step2");

      // Verify final session continuity - should be SAME session ID
      const step3Output = JSON.parse(step3Result.output);
      expect(step3Output.session_id).toBe(sessionId);
      expect(step3Output.result).toContain("Step 3 completed successfully");

      console.log(`🔗 Step 3 continued session ID: ${step3Output.session_id}`);

      console.log(
        "✅ STEP 3 VERIFIED: 3 steps logged, last_completed = 2, full session chain correct",
      );

      // FINAL VERIFICATION: Complete session chain - all steps should have SAME session ID
      const sessionChain = [
        logState.steps[0].session_id,
        logState.steps[1].session_id,
        logState.steps[2].session_id,
      ];

      console.log("🔗 Session chain:", sessionChain);
      expect(sessionChain).toEqual([sessionId, sessionId, sessionId]);
      expect(sessionChain.every((id) => id === sessionId)).toBe(true);

      // Verify resume references match session IDs
      expect(logState.steps[1].resume_session).toBe("step1"); // References step ID
      expect(logState.steps[2].resume_session).toBe("step2"); // References step ID

      console.log("✅ COMPLETE VERIFICATION PASSED:");
      console.log("   - Progressive step logging: 1 → 2 → 3 steps");
      console.log("   - Last completed step tracking: 0 → 1 → 2");
      console.log("   - Session ID continuity maintained");
      console.log("   - Claude-format JSON output preserved");
      console.log("   - Resume session references correct");
    }, 20000); // 20s timeout for real execution

    test("should handle resume scenario: execute 2 steps, resume, execute step 3", async () => {
      // This test simulates: run 2 steps → pause → resume → complete step 3
      const workflowPath = path.join(
        fixturesPath,
        "workflows/progressive-logging-test.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");
      await fs.writeFile(workflowFile, content);

      const workflow = WorkflowParser.parseYaml(content);
      const tasks = pipelineService.workflowToTaskItems(workflow);

      // PHASE 1: Execute first 2 steps
      console.log("\n🚀 PHASE 1: Execute steps 1-2, then pause");

      workflowExecution = {
        workflow: workflow,
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const initialWorkflowState = {
        executionId: "resume-test-001",
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
        initialWorkflowState,
        workflowFile,
        false,
      );

      // Execute step 1
      const resumeStep1Result = await executeStep(0, workflow, tasks);
      let logState = await verifyLogState(1, 0);

      // Extract session ID for continuity
      const resumeSessionId = JSON.parse(resumeStep1Result.output).session_id;
      console.log(`🔑 Resume test session ID: ${resumeSessionId}`);

      // Execute step 2 with session continuity
      await executeStep(1, workflow, tasks, resumeSessionId);
      logState = await verifyLogState(2, 1);

      // Mark as paused
      await workflowJsonLogger.updateWorkflowStatus("paused");

      console.log(
        "⏸️  PAUSED after 2 steps - Log state: 2 steps, last_completed = 1",
      );

      // PHASE 2: Resume and execute step 3
      console.log("\n▶️  PHASE 2: Resume execution for step 3");

      // Simulate resume by reinitializing logger
      const resumeWorkflowState = {
        ...initialWorkflowState,
        status: "running" as any,
        currentStep: 2,
      };

      await workflowJsonLogger.initializeLog(
        resumeWorkflowState,
        workflowFile,
        true,
      );

      // Execute step 3 with session continuity
      await executeStep(2, workflow, tasks, resumeSessionId);

      // FINAL VERIFICATION: Should have 3 steps total
      logState = await verifyLogState(3, 2);

      expect(logState.workflow_name).toBe("progressive-logging-test");
      expect(logState.status).toBe("completed"); // All 3 steps completed

      console.log("✅ RESUME SCENARIO VERIFIED:");
      console.log("   - Initial execution: 2 steps logged");
      console.log("   - After resume: 3 steps total (not reset)");
      console.log("   - Last completed properly tracks: 0 → 1 → 2");
    }, 20000);
  });
});
