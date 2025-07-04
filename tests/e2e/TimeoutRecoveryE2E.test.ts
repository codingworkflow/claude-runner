import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import { WorkflowJsonLogger } from "../../src/services/WorkflowJsonLogger";
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";
import { WorkflowExecution } from "../../src/types/WorkflowTypes";

// E2E Test: Timeout recovery with session continuity validation
describe("Timeout Recovery E2E Tests", () => {
  let tempDir: string;
  let fixturesPath: string;
  let pipelineService: PipelineService;
  let workflowJsonLogger: WorkflowJsonLogger;
  let workflowExecution: WorkflowExecution;
  let workflowFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "timeout-recovery-e2e-"));
    fixturesPath = path.join(__dirname, "../fixtures");

    // Real services - no mocking of timeout logic
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

    // Setup workflow file
    workflowFile = path.join(tempDir, "timeout-recovery-test.yml");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Helper to execute step with real script execution and timeout handling
  async function executeStepWithRetry(
    stepIndex: number,
    workflow: any,
    tasks: any[],
    previousSessionId?: string,
    maxRetries = 1,
    retryDelaySeconds = 5,
  ) {
    const task = tasks[stepIndex];
    const job = Object.values(workflow.jobs)[0] as any;
    const step = job.steps.find((s: any) => s.id === task.id);

    console.log(`📋 Executing step ${stepIndex + 1}: ${task.name}`);

    if (step?.with && (step.with as any).run) {
      const { spawn } = require("child_process"); // eslint-disable-line @typescript-eslint/no-var-requires
      const scriptPath = (step.with as any).run;

      let attempt = 0;
      let lastError: any = null;
      let sessionId = previousSessionId;

      while (attempt <= maxRetries) {
        // Build arguments - add -r parameter if this step should resume a session
        const args = [scriptPath];
        if (sessionId && (step.with as any).resume_session) {
          args.push("-r", sessionId);
          console.log(`🔧 Adding resume session args: -r ${sessionId}`);
        } else if (sessionId) {
          // For timeout recovery, always pass session ID if provided
          args.push("-r", sessionId);
          console.log(
            `🔧 Adding timeout recovery session args: -r ${sessionId}`,
          );
        }
        console.log(`🔧 Full command: bash ${args.join(" ")}`);

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
              output: stdout.trim() || stderr.trim(), // Prefer stdout, fallback to stderr
              exitCode: code,
            });
          });
        });

        // Parse JSON output from Claude-format script
        let parsedOutput;

        try {
          // Debug: Show raw output before parsing
          console.log(
            `🔧 Raw output (length ${result.output.length}):`,
            JSON.stringify(result.output),
          );
          parsedOutput = JSON.parse(result.output);

          if (result.success) {
            // Success - extract session ID and return
            sessionId = parsedOutput.session_id;
            console.log(
              `✅ Step ${stepIndex + 1} completed successfully. Session ID: ${sessionId}`,
            );

            // Log successful step
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
              retryAttempt: attempt,
            };

            const mockWorkflowState = {
              executionId: `timeout-test-${Date.now()}`,
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
              attempts: attempt + 1,
            };
          } else {
            // Failure - check if this is a timeout
            if (
              parsedOutput.type === "error" &&
              parsedOutput.subtype === "timeout"
            ) {
              sessionId = parsedOutput.session_id; // Preserve session ID

              console.log(
                `⏱️  Step ${stepIndex + 1} timed out (attempt ${attempt + 1}). Session ID: ${sessionId}`,
              );

              // ALWAYS log timeout steps (following Go CLI pattern) - regardless of retry attempts
              const stepResult = {
                stepIndex,
                stepId: task.id,
                sessionId: sessionId,
                outputSession: (step.with as any).output_session || false,
                resumeSession: (step.with as any).resume_session,
                status: "timeout" as any, // CRITICAL: Use "timeout" not "failed" for timeout scenarios
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                output: result.output,
                error: parsedOutput.error,
              };

              const mockWorkflowState = {
                executionId: `timeout-test-${Date.now()}`,
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

              // Log the timeout step (following Go CLI pattern)
              await workflowJsonLogger.updateStepProgress(
                stepResult,
                mockWorkflowState,
              );

              // Only retry if attempts remain
              if (attempt < maxRetries) {
                const retryAfter =
                  parsedOutput.retry_after_seconds || retryDelaySeconds;
                console.log(`⏳ Waiting ${retryAfter}s before retry...`);

                // Wait before retry
                await new Promise((resolve) =>
                  setTimeout(resolve, retryAfter * 1000),
                );
                attempt++;
                lastError = parsedOutput;
                continue;
              } else {
                // No more retries - timeout is logged, now throw error
                throw new Error(
                  `Step timed out: ${parsedOutput.error || "Unknown timeout error"}`,
                );
              }
            } else {
              // Not a timeout error
              throw new Error(
                `Step failed: ${parsedOutput.error || "Unknown error"}`,
              );
            }
          }
        } catch (parseError) {
          console.log(
            `⚠️  Step ${stepIndex + 1} JSON parse error:`,
            parseError,
          );
          console.log(`⚠️  Raw output: ${JSON.stringify(result.output)}`);
          throw new Error(`Invalid JSON output: ${result.output}`);
        }
      }

      // Max retries exceeded
      throw new Error(
        `Step failed after ${maxRetries + 1} attempts. Last error: ${lastError?.error || "Unknown error"}`,
      );
    }

    throw new Error("No script to execute");
  }

  // Helper to read and verify log state
  async function verifyLogState() {
    // Get the actual log file path from the logger (not our assumed path)
    const actualLogPath = workflowJsonLogger.getLogFilePath();
    if (!actualLogPath) {
      throw new Error("Logger has no log file path");
    }

    console.log(`🔍 Reading log from: ${actualLogPath}`);
    const actualLogContent = await fs.readFile(actualLogPath, "utf-8");
    const actualLog = JSON.parse(actualLogContent);

    console.log(
      `🔍 Log verification: ${actualLog.steps.length} steps, status: ${actualLog.status}`,
    );

    return actualLog;
  }

  describe("Timeout Recovery with Session Continuity", () => {
    test("should handle timeout, preserve session ID, and retry successfully", async () => {
      // Load workflow
      const workflowPath = path.join(
        fixturesPath,
        "workflows/timeout-recovery-test.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");
      await fs.writeFile(workflowFile, content);

      const workflow = WorkflowParser.parseYaml(content);
      const tasks = pipelineService.workflowToTaskItems(workflow);

      expect(tasks).toHaveLength(2);
      console.log("🚀 Starting timeout recovery test with 2 steps...");

      // Initialize workflow execution and logging
      workflowExecution = {
        workflow: workflow,
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const mockWorkflowState = {
        executionId: `timeout-test-${Date.now()}`,
        workflowPath: workflowFile,
        workflowName: workflow.name,
        startTime: new Date().toISOString(),
        currentStep: 0,
        totalSteps: 2,
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

      // STEP 1: Execute timeout step with retry (this should fail first, then succeed on retry)
      console.log("\n📋 === EXECUTING TIMEOUT STEP ===");

      // First attempt will timeout, but we'll simulate the retry logic by switching scripts
      let timeoutResult;
      try {
        timeoutResult = await executeStepWithRetry(
          0,
          workflow,
          tasks,
          undefined,
          0,
        ); // No retries first
      } catch (error) {
        console.log("⏱️  First attempt timed out as expected");

        // Verify timeout was logged with session ID
        const logState = await verifyLogState();
        expect(logState.steps).toHaveLength(1);
        expect(logState.steps[0].status).toBe("timeout");
        expect(logState.steps[0].session_id).toBeDefined();

        const timeoutSessionId = logState.steps[0].session_id;
        console.log(`🔑 Timeout preserved session ID: ${timeoutSessionId}`);

        // Now simulate recovery - manually execute recovery script with same session ID
        console.log("\n🔄 === SIMULATING TIMEOUT RECOVERY ===");

        // Update the workflow to use recovery script and execute with preserved session
        const recoveryWorkflow = { ...workflow };
        const job = Object.values(recoveryWorkflow.jobs)[0] as any;
        job.steps[0].with.run =
          "./tests/fixtures/scripts/claude-timeout-recovery.sh";

        timeoutResult = await executeStepWithRetry(
          0,
          recoveryWorkflow,
          tasks,
          timeoutSessionId,
          0,
        );
      }

      // VERIFY: Timeout recovery succeeded with same session ID
      let logState = await verifyLogState();

      // Should have at least one step completed now
      const completedSteps = logState.steps.filter(
        (s: any) => s.status === "completed",
      );
      expect(completedSteps.length).toBeGreaterThan(0);

      const recoverySessionId = timeoutResult.sessionId;
      console.log(
        `✅ Recovery completed with session ID: ${recoverySessionId}`,
      );

      // STEP 2: Execute second step that continues the session
      console.log("\n📋 === EXECUTING CONTINUATION STEP ===");
      const continuationResult = await executeStepWithRetry(
        1,
        workflow,
        tasks,
        recoverySessionId,
        0,
      );

      // VERIFY: Session continuity maintained
      expect(continuationResult.sessionId).toBe(recoverySessionId);
      console.log(
        `🔗 Continuation step maintained session ID: ${continuationResult.sessionId}`,
      );

      // FINAL VERIFICATION: Both steps completed with same session ID
      logState = await verifyLogState();

      const finalCompletedSteps = logState.steps.filter(
        (s: any) => s.status === "completed",
      );
      expect(finalCompletedSteps.length).toBe(2);

      // All completed steps should have the same session ID
      const sessionIds = finalCompletedSteps.map((s: any) => s.session_id);
      expect(sessionIds.every((id) => id === recoverySessionId)).toBe(true);

      console.log("✅ TIMEOUT RECOVERY VERIFICATION PASSED:");
      console.log("   - Timeout initially failed with preserved session ID");
      console.log("   - Recovery succeeded with same session ID");
      console.log("   - Continuation step maintained session continuity");
      console.log(`   - Final session chain: [${sessionIds.join(", ")}]`);
    }, 30000); // 30s timeout for real execution with retries

    test("should log timeout failures with session ID preservation for resume", async () => {
      // This test specifically validates that timeout failures preserve session IDs
      // so that when the workflow is resumed, it can continue the same session

      const workflowPath = path.join(
        fixturesPath,
        "workflows/timeout-recovery-test.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");
      await fs.writeFile(workflowFile, content);

      const workflow = WorkflowParser.parseYaml(content);
      const tasks = pipelineService.workflowToTaskItems(workflow);

      workflowExecution = {
        workflow: workflow,
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const mockWorkflowState = {
        executionId: `timeout-preservation-${Date.now()}`,
        workflowPath: workflowFile,
        workflowName: workflow.name,
        startTime: new Date().toISOString(),
        currentStep: 0,
        totalSteps: 2,
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

      // Execute only the timeout step (no recovery) to test session preservation
      console.log("\n📋 === TESTING TIMEOUT SESSION PRESERVATION ===");

      let timeoutSessionId: string = "";
      try {
        await executeStepWithRetry(0, workflow, tasks, undefined, 0); // No retries
      } catch (error) {
        console.log("⏱️  Timeout occurred as expected");

        // CRITICAL TEST: Verify session ID is preserved in logs for resume
        const logState = await verifyLogState();
        expect(logState.steps).toHaveLength(1);
        expect(logState.steps[0].status).toBe("timeout");
        expect(logState.steps[0].session_id).toBeDefined();
        expect(logState.steps[0].session_id).toMatch(
          /^claude-session-\d+-[a-f0-9]+$/,
        );

        timeoutSessionId = logState.steps[0].session_id;
        console.log(`🔑 Session ID preserved in logs: ${timeoutSessionId}`);

        // Verify session can be extracted for resume
        expect(typeof timeoutSessionId).toBe("string");
        expect(timeoutSessionId.length).toBeGreaterThan(20);
      }

      // SIMULATE RESUME: Load the logs and resume with preserved session ID
      console.log("\n▶️  === SIMULATING WORKFLOW RESUME ===");

      // Read the logs to get the preserved session ID (simulates resume logic)
      const resumeLogState = await verifyLogState();
      const timeoutStep = resumeLogState.steps.find(
        (s: any) => s.status === "timeout",
      );
      const preservedSessionId = timeoutStep.session_id;

      expect(preservedSessionId).toBe(timeoutSessionId);
      console.log(
        `🔄 Resuming with preserved session ID: ${preservedSessionId}`,
      );

      // Execute recovery with the preserved session ID
      const recoveryWorkflow = { ...workflow };
      const job = Object.values(recoveryWorkflow.jobs)[0] as any;
      job.steps[0].with.run =
        "./tests/fixtures/scripts/claude-timeout-recovery.sh";

      const recoveryResult = await executeStepWithRetry(
        0,
        recoveryWorkflow,
        tasks,
        preservedSessionId,
        0,
      );

      // VERIFY: Recovery used the same session ID from the logs
      expect(recoveryResult.sessionId).toBe(preservedSessionId);

      console.log("✅ SESSION PRESERVATION VERIFICATION PASSED:");
      console.log("   - Timeout failure preserved session ID in logs");
      console.log("   - Resume successfully extracted preserved session ID");
      console.log("   - Recovery continued with same session ID");
      console.log(
        `   - Session continuity: ${timeoutSessionId} → ${recoveryResult.sessionId}`,
      );
    }, 20000);
  });
});
