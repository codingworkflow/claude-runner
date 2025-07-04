import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import { WorkflowJsonLogger } from "../../src/services/WorkflowJsonLogger";
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";
import { WorkflowExecution } from "../../src/types/WorkflowTypes";

// E2E Test: Workflow Execution Logging using real service integration
describe("Workflow Execution with Real Logging E2E Tests", () => {
  let tempDir: string;
  let fixturesPath: string;
  let pipelineService: PipelineService;
  let workflowJsonLogger: WorkflowJsonLogger;
  let workflowExecution: WorkflowExecution;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-logging-e2e-"));
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

  describe("Real Workflow Execution with Logging Service Integration", () => {
    test("should test workflow parsing and logging service integration", async () => {
      // Use existing fixture instead of inline workflow content
      const workflowPath = path.join(
        fixturesPath,
        "workflows/real-execution-failure.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");

      console.log(
        "🚀 Testing workflow parsing and logging service integration...",
      );

      // Parse with REAL WorkflowParser
      const workflow = WorkflowParser.parseYaml(content);
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe("real-execution-failure");

      // Convert to task items with REAL PipelineService
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(3);

      console.log(`✅ Workflow parsed: ${workflow.name}`);
      console.log(`✅ Tasks generated: ${tasks.length} tasks`);

      // Setup log file
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

      // Initialize logging for this workflow using real service
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

      // Verify logger initialization
      const initialLog = workflowJsonLogger.getCurrentLog();
      expect(initialLog).toBeDefined();
      expect(initialLog?.workflow_name).toBe("real-execution-failure");
      expect(initialLog?.total_steps).toBe(3);
      expect(initialLog?.steps).toHaveLength(0);
      expect(initialLog?.status).toBe("running");

      console.log(`✅ Logger initialized: ${initialLog?.workflow_name}`);
      console.log(
        `✅ Initial state: ${initialLog?.steps.length} steps, status: ${initialLog?.status}`,
      );
    });

    test("should test step logging with failure scenarios", async () => {
      // Use existing fixture for failure testing
      const workflowPath = path.join(
        fixturesPath,
        "workflows/real-execution-failure.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");
      const workflowFile = path.join(tempDir, "real-execution-failure.yml");
      await fs.writeFile(workflowFile, content);

      const workflow = WorkflowParser.parseYaml(content);
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(3); // Verify task generation

      // Initialize workflow execution
      workflowExecution = {
        workflow: workflow,
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      const mockWorkflowState = {
        executionId: "step-failure-test-001",
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

      console.log("🔧 Testing step logging with failure scenarios...");

      // Test logging successful step
      const successfulStepResult = {
        stepIndex: 0,
        stepId: "step1",
        sessionId: "session-step1",
        outputSession: true,
        status: "completed" as any,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: JSON.stringify({
          type: "success",
          session_id: "session-step1",
          result: "Step 1 completed successfully",
        }),
      };

      await workflowJsonLogger.updateStepProgress(
        successfulStepResult,
        mockWorkflowState,
      );

      // Test logging failed step
      const failedStepResult = {
        stepIndex: 1,
        stepId: "step2",
        sessionId: "session-step2",
        outputSession: false,
        status: "failed" as any,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: JSON.stringify({
          type: "error",
          is_error: true,
          error: "ERROR: Something went wrong during execution",
          details: "Failed to complete the task",
          session_id: "session-step2",
        }),
        error: "Script failed with exit code 1",
        exitCode: 1,
      };

      await workflowJsonLogger.updateStepProgress(
        failedStepResult,
        mockWorkflowState,
      );

      // Verify logging results
      const currentLog = workflowJsonLogger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(2);

      // Verify successful step
      const step1 = currentLog?.steps.find((s: any) => s.step_id === "step1");
      expect(step1).toBeDefined();
      expect(step1?.status).toBe("completed");
      expect(step1?.session_id).toBe("session-step1");

      // Verify failed step
      const step2 = currentLog?.steps.find((s: any) => s.step_id === "step2");
      expect(step2).toBeDefined();
      expect(step2?.status).toBe("failed");
      expect(step2?.session_id).toBe("session-step2");

      console.log(
        `✅ Step logging verified: ${currentLog?.steps.length} steps logged`,
      );
      console.log(
        `   - Step 1: ${step1?.status}, session: ${step1?.session_id}`,
      );
      console.log(
        `   - Step 2: ${step2?.status}, session: ${step2?.session_id}`,
      );
    });

    test("should test timeout logging scenarios", async () => {
      // Use existing fixture for timeout testing
      const workflowPath = path.join(
        fixturesPath,
        "workflows/timeout-recovery-test.yml",
      );
      const content = await fs.readFile(workflowPath, "utf-8");
      const workflowFile = path.join(tempDir, "timeout-recovery-test.yml");
      await fs.writeFile(workflowFile, content);

      const workflow = WorkflowParser.parseYaml(content);

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

      console.log("🔧 Testing timeout logging scenarios...");

      // Test logging timeout step
      const timeoutStepResult = {
        stepIndex: 1,
        stepId: "step2",
        sessionId: "session-step2",
        outputSession: false,
        status: "timeout" as any,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: JSON.stringify({
          type: "error",
          subtype: "timeout",
          is_error: true,
          error:
            "Request timed out after 1000ms. This is typically due to rate limiting or high server load.",
          session_id: "session-step2",
          timestamp: new Date().toISOString(),
          retry_after_seconds: 5,
          suggested_action: "retry_with_backoff",
        }),
        error: "Execution timeout - can be resumed",
        timeoutMs: 1000,
      };

      await workflowJsonLogger.updateStepProgress(
        timeoutStepResult,
        mockWorkflowState,
      );

      // Verify timeout logging
      const currentLog = workflowJsonLogger.getCurrentLog();
      expect(currentLog?.steps).toHaveLength(1);

      const timeoutStep = currentLog?.steps.find(
        (s: any) => s.step_id === "step2",
      );
      expect(timeoutStep).toBeDefined();
      expect(timeoutStep?.status).toBe("timeout");
      expect(timeoutStep?.session_id).toBe("session-step2");

      // Verify workflow status is updated to "paused" for timeout (following Go CLI pattern)
      expect(currentLog?.status).toBe("paused");

      console.log(`✅ Timeout logging verified: status=${currentLog?.status}`);
      console.log(
        `   - Timeout step: ${timeoutStep?.status}, session: ${timeoutStep?.session_id}`,
      );
      console.log("✅ Timeout scenario correctly captured in log service");
    });
  });
});
