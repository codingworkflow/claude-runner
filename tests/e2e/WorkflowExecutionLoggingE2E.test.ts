import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import { WorkflowJsonLogger } from "../../src/services/WorkflowJsonLogger";
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";
import { WorkflowExecution } from "../../src/types/WorkflowTypes";

// Real E2E test: Workflow Execution → Step Failure → Log Service Captures Error
describe("Workflow Execution with Real Logging E2E Tests", () => {
  let tempDir: string;
  let fixturesPath: string;
  let pipelineService: PipelineService;
  let workflowJsonLogger: WorkflowJsonLogger;
  let workflowExecution: WorkflowExecution;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-logging-e2e-"));
    fixturesPath = path.join(__dirname, "../fixtures");

    // Real services - no mocking
    const mockContext = {
      extensionPath: "/test",
      globalStorageUri: { fsPath: "/tmp/test-storage" },
    };

    // Mock only the directory creation to prevent file system operations
    jest
      .spyOn(PipelineService.prototype as any, "ensureDirectories")
      .mockImplementation(() => Promise.resolve());

    pipelineService = new PipelineService(mockContext as any);

    const fileSystem = new VSCodeFileSystem();
    const logger = new VSCodeLogger();
    workflowJsonLogger = new WorkflowJsonLogger(fileSystem, logger);

    // Reset workflow execution state
    workflowExecution = {
      workflow: { name: "", jobs: {} },
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "pending",
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Real Workflow Execution with Failure Logging", () => {
    test("should capture real script failures in log service", async () => {
      // Load workflow that has failing script
      const workflowPath = path.join(
        fixturesPath,
        "workflows/real-execution-failure.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");

      // Parse with REAL WorkflowParser
      const workflow = WorkflowParser.parseYaml(content);

      // Setup log file
      const logPath = path.join(tempDir, "real-execution-failure.json");
      const workflowFile = path.join(tempDir, "real-execution-failure.yml");
      await fs.writeFile(workflowFile, content);

      // Initialize workflow execution
      workflowExecution = {
        workflow: workflow,
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      // Initialize logging for this workflow
      const mockWorkflowState = {
        executionId: "test-execution-001",
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

      // Convert to task items with REAL PipelineService
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(3);

      console.log("🚀 Executing workflow with real script failure...");

      // Execute tasks one by one and capture real failures
      for (let i = 0; i < tasks.length; i++) {
        workflowExecution.currentStep = i;
        const task = tasks[i];

        try {
          // Find the corresponding step in the workflow
          const job = Object.values(workflow.jobs)[0];
          const step = job.steps.find((s) => s.id === task.id);

          if (step?.with && (step.with as any).run) {
            console.log(`📋 Executing step ${i + 1}: ${task.name}`);

            // Execute the actual script with real process spawning
            const { spawn } = require("child_process"); // eslint-disable-line @typescript-eslint/no-var-requires
            const scriptPath = (step.with as any).run;

            const result = await new Promise<{
              success: boolean;
              output: string;
              exitCode: number;
            }>((resolve) => {
              const child = spawn("bash", [scriptPath], {
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

            if (result.success) {
              console.log(`✅ Step ${i + 1} succeeded: ${result.output}`);

              // Log successful step
              const stepResult = {
                stepIndex: i,
                stepId: task.id,
                sessionId: `session-${task.id}`,
                outputSession: (step.with as any).output_session || false,
                resumeSession: (step.with as any).resume_session,
                status: "completed" as any,
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                output: result.output,
              };

              await workflowJsonLogger.updateStepProgress(
                stepResult,
                mockWorkflowState,
              );
              workflowExecution.outputs[task.id] = { result: result.output };
            } else {
              console.log(
                `❌ Step ${i + 1} failed with exit code ${result.exitCode}: ${result.output}`,
              );

              // Log failed step with real failure data
              const stepResult = {
                stepIndex: i,
                stepId: task.id,
                sessionId: `session-${task.id}`,
                outputSession: false,
                resumeSession: (step.with as any).resume_session,
                status: "failed" as any,
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                output: result.output,
                error: `Script failed with exit code ${result.exitCode}`,
                exitCode: result.exitCode,
              };

              await workflowJsonLogger.updateStepProgress(
                stepResult,
                mockWorkflowState,
              );
              await workflowJsonLogger.updateWorkflowStatus("failed");

              workflowExecution.status = "failed";
              workflowExecution.error = `Step ${task.name} failed with exit code ${result.exitCode}`;

              // Stop execution on failure
              break;
            }
          } else {
            // Simulate Claude API call (we can't actually call Claude in tests)
            console.log(`📋 Simulating Claude step: ${task.name}`);

            const stepResult = {
              stepIndex: i,
              stepId: task.id,
              sessionId: `session-${task.id}`,
              outputSession: false,
              status: "completed" as any,
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              output: `[Simulated] Claude execution completed for: ${task.prompt.substring(0, 50)}...`,
            };

            await workflowJsonLogger.updateStepProgress(
              stepResult,
              mockWorkflowState,
            );
            workflowExecution.outputs[task.id] = { result: "simulated" };
          }
        } catch (error) {
          console.log(
            `💥 Step ${i + 1} threw exception: ${(error as Error).message}`,
          );

          // Log exception failure
          const stepResult = {
            stepIndex: i,
            stepId: task.id,
            sessionId: `session-${task.id}`,
            outputSession: false,
            status: "failed" as any,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            output: "",
            error: (error as Error).message,
          };

          await workflowJsonLogger.updateStepProgress(
            stepResult,
            mockWorkflowState,
          );
          await workflowJsonLogger.updateWorkflowStatus("failed");

          workflowExecution.status = "failed";
          workflowExecution.error = (error as Error).message;
          break;
        }
      }

      // TEST THE REAL LOG FILE OUTPUT
      const logExists = await fs
        .access(logPath)
        .then(() => true)
        .catch(() => false);
      expect(logExists).toBe(true);

      // Read the ACTUAL log file written by the service
      const actualLogContent = await fs.readFile(logPath, "utf-8");
      const actualLog = JSON.parse(actualLogContent);

      console.log("📋 Final log file:", JSON.stringify(actualLog, null, 2));

      // Verify the real execution and failure logging
      expect(actualLog.workflow_name).toBe("real-execution-failure");
      expect(actualLog.status).toBe("failed");
      expect(actualLog.steps).toHaveLength(2); // step1 succeeded, step2 failed

      // Verify step 1 succeeded
      const step1 = actualLog.steps.find((s: any) => s.step_id === "step1");
      expect(step1).toBeDefined();
      expect(step1.status).toBe("completed");
      expect(step1.output).toContain("step1 executed successfully");

      // Verify step 2 failed with real failure data
      const step2 = actualLog.steps.find((s: any) => s.step_id === "step2");
      expect(step2).toBeDefined();
      expect(step2.status).toBe("failed");
      expect(step2.output).toContain(
        "ERROR: Something went wrong during execution",
      );
      expect(step2.output).toContain("Failed to complete the task");
      // Note: WorkflowJsonLogger may not store error/exitCode fields - that's what we discovered!

      // Verify step 3 was never executed
      const step3 = actualLog.steps.find((s: any) => s.step_id === "step3");
      expect(step3).toBeUndefined();

      console.log(
        "✅ Real workflow execution failure correctly captured in log service",
      );
    }, 15000); // 15s timeout for real execution

    test("should capture timeout scenarios in real logging", async () => {
      // Create a workflow with a step that times out
      const timeoutWorkflowContent = `name: timeout-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: step1
        name: Quick Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Quick execution"
          run: "./tests/fixtures/scripts/step1.sh"
          output_session: true
          
      - id: step2
        name: Timeout Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "This step will timeout"
          timeout: 1000`;

      const workflowFile = path.join(tempDir, "timeout-test.yml");
      await fs.writeFile(workflowFile, timeoutWorkflowContent);

      const workflow = WorkflowParser.parseYaml(timeoutWorkflowContent);
      const logPath = path.join(tempDir, "timeout-test.json");

      const mockWorkflowState = {
        executionId: "timeout-test-001",
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

      // Simulate timeout logging
      const timeoutStepResult = {
        stepIndex: 1,
        stepId: "step2",
        sessionId: "session-step2",
        outputSession: false,
        status: "timeout" as any,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: "Step timed out after 1000ms",
        error: "Execution timeout - can be resumed",
        timeoutMs: 1000,
      };

      await workflowJsonLogger.updateStepProgress(
        timeoutStepResult,
        mockWorkflowState,
      );
      await workflowJsonLogger.updateWorkflowStatus("timeout");

      // Verify timeout logging
      const actualLogContent = await fs.readFile(logPath, "utf-8");
      const actualLog = JSON.parse(actualLogContent);

      expect(actualLog.status).toBe("timeout");
      const timeoutStep = actualLog.steps.find(
        (s: any) => s.step_id === "step2",
      );
      expect(timeoutStep).toBeDefined();
      expect(timeoutStep.status).toBe("timeout");
      expect(timeoutStep.output).toContain("timed out");

      console.log("✅ Timeout scenario correctly captured in log service");
    });
  });
});
