import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowJsonLogger } from "../../src/services/WorkflowJsonLogger";
import { WorkflowState } from "../../src/services/WorkflowStateService";

// Real file system adapter - NO MOCKING
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";

// Helper to create workflow state - minimal object for testing
function createWorkflowState(
  executionId: string,
  workflowPath: string,
  workflowName: string,
  status: string,
  currentStep: number,
  totalSteps: number,
  sessionMappings: Record<string, string> = {},
  completedSteps: any[] = [],
): WorkflowState {
  return {
    executionId,
    workflowPath,
    workflowName,
    startTime: "2024-12-30T12:00:00.000Z",
    currentStep,
    totalSteps,
    status: status as any,
    sessionMappings,
    completedSteps,
    execution: {
      workflow: { name: workflowName, jobs: {} },
      inputs: {},
      outputs: {},
      currentStep,
      status: status as any,
    },
    canResume: true,
  };
}

describe("Workflow Resume Logging E2E Tests - Real File Output", () => {
  let tempDir: string;
  let fileSystem: VSCodeFileSystem;
  let logger: VSCodeLogger;
  let workflowJsonLogger: WorkflowJsonLogger;
  let fixturesPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "real-logging-test-"));
    fixturesPath = path.join(__dirname, "../fixtures");

    // Use REAL file system - no mocking!
    fileSystem = new VSCodeFileSystem();
    logger = new VSCodeLogger();
    workflowJsonLogger = new WorkflowJsonLogger(fileSystem, logger);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Real JSON File Output Testing", () => {
    test("should write actual JSON log file when resuming", async () => {
      const workflowPath = path.join(tempDir, "test-workflow.yml");
      const expectedLogPath = path.join(tempDir, "test-workflow.json");

      // Copy workflow from fixtures
      const fixtureWorkflowPath = path.join(
        fixturesPath,
        "workflows/test-resume-workflow.yml",
      );
      const workflowContent = await fs.readFile(fixtureWorkflowPath, "utf-8");
      await fs.writeFile(workflowPath, workflowContent);

      // Copy existing job log from fixtures - this simulates previous execution
      const existingLogFixture = path.join(
        fixturesPath,
        "logs/existing-job-log.json",
      );
      const existingLogContent = await fs.readFile(existingLogFixture, "utf-8");
      await fs.writeFile(expectedLogPath, existingLogContent);

      // Create workflow state
      const mockWorkflowState = createWorkflowState(
        "20241230-120000",
        workflowPath,
        "Test Resume Workflow",
        "paused",
        1,
        2,
        { "step-0": "session-test-123" },
        [
          {
            stepIndex: 0,
            stepId: "step-0",
            sessionId: "session-test-123",
            outputSession: true,
            status: "completed",
            startTime: "2024-12-30T12:00:00.000Z",
            endTime: "2024-12-30T12:00:00.000Z",
            output: "Step 0 completed successfully",
          },
        ],
      );

      // Execute the logging service - this should write to REAL files
      await workflowJsonLogger.initializeLog(
        mockWorkflowState,
        workflowPath,
        true,
      );

      // TEST THE REAL FILE OUTPUT - not internal state!
      const actualLogExists = await fs
        .access(expectedLogPath)
        .then(() => true)
        .catch(() => false);
      expect(actualLogExists).toBe(true);

      // Read the ACTUAL JSON file written by the service
      const actualLogContent = await fs.readFile(expectedLogPath, "utf-8");
      const actualLog = JSON.parse(actualLogContent);

      // Verify the REAL output structure
      expect(actualLog.workflow_name).toBe("Test Resume Workflow");
      expect(actualLog.workflow_file).toBe("test-workflow.yml");
      expect(actualLog.execution_id).toBe("20241230-120000"); // Preserves original execution ID
      expect(actualLog.status).toBe("paused"); // Service preserves original status when loading
      expect(actualLog.steps).toHaveLength(1);
      expect(actualLog.steps[0].step_index).toBe(0);
      expect(actualLog.steps[0].status).toBe("completed");
      expect(actualLog.steps[0].session_id).toBe("session-test-123");
      expect(actualLog.last_completed_step).toBe(0);
      expect(actualLog.total_steps).toBe(2);

      console.log(
        "✅ Real file output verified - service preserves original state",
      );
    });

    test("should create new JSON log file for new execution", async () => {
      const workflowPath = path.join(tempDir, "new-workflow.yml");
      const expectedLogPath = path.join(tempDir, "new-workflow.json");

      // Copy workflow from fixtures
      const fixtureWorkflowPath = path.join(
        fixturesPath,
        "workflows/new-workflow.yml",
      );
      const workflowContent = await fs.readFile(fixtureWorkflowPath, "utf-8");
      await fs.writeFile(workflowPath, workflowContent);

      const mockWorkflowState = createWorkflowState(
        "20241230-130000",
        workflowPath,
        "New Workflow",
        "running",
        0,
        1,
      );

      // Execute the logging service - should create NEW file
      await workflowJsonLogger.initializeLog(
        mockWorkflowState,
        workflowPath,
        false,
      );

      // TEST THE REAL FILE OUTPUT
      const actualLogExists = await fs
        .access(expectedLogPath)
        .then(() => true)
        .catch(() => false);
      expect(actualLogExists).toBe(true);

      // Read the ACTUAL JSON file created by the service
      const actualLogContent = await fs.readFile(expectedLogPath, "utf-8");
      const actualLog = JSON.parse(actualLogContent);

      // Verify the REAL output for new execution
      expect(actualLog.workflow_name).toBe("New Workflow");
      expect(actualLog.workflow_file).toBe("new-workflow.yml");
      expect(actualLog.execution_id).toMatch(/^\d{8}-\d{6}$/); // Service generates timestamp-based ID
      expect(actualLog.status).toBe("running");
      expect(actualLog.steps).toHaveLength(0); // New execution starts empty
      expect(actualLog.last_completed_step).toBe(-1);
      expect(actualLog.total_steps).toBe(0); // Based on Claude steps found

      console.log(
        "✅ New execution file output verified - service generates new execution ID",
      );
    });

    test("should preserve timeout state when resuming from timeout", async () => {
      const workflowPath = path.join(tempDir, "resume-timeout-workflow.yml");
      const expectedLogPath = path.join(
        tempDir,
        "resume-timeout-workflow.json",
      );

      // Copy workflow from fixtures
      const fixtureWorkflowPath = path.join(
        fixturesPath,
        "workflows/resume-timeout-workflow.yml",
      );
      const workflowContent = await fs.readFile(fixtureWorkflowPath, "utf-8");
      await fs.writeFile(workflowPath, workflowContent);

      // Copy timeout job log from fixtures
      const timeoutLogFixture = path.join(
        fixturesPath,
        "logs/timeout-job-log.json",
      );
      const timeoutLogContent = await fs.readFile(timeoutLogFixture, "utf-8");
      await fs.writeFile(expectedLogPath, timeoutLogContent);

      const mockResumeWorkflowState = createWorkflowState(
        "20241230-150000",
        workflowPath,
        "Resume Timeout Workflow",
        "running", // Changed from timeout to running for resume
        1,
        2,
        { "step-0": "session-resume-test" },
        [
          {
            stepIndex: 0,
            stepId: "step-0",
            sessionId: "session-resume-test",
            outputSession: true,
            status: "completed",
            startTime: "2024-12-30T15:00:00.000Z",
            endTime: "2024-12-30T15:00:00.000Z",
            output: "Step 0 completed",
          },
          {
            stepIndex: 1,
            stepId: "step-1",
            sessionId: "session-resume-test",
            outputSession: false,
            resumeSession: "session-resume-test",
            status: "timeout",
            startTime: "2024-12-30T15:00:00.000Z",
            endTime: "2024-12-30T15:00:00.000Z",
            output: "Timeout occurred - can resume",
          },
        ],
      );

      // Execute resume from timeout
      await workflowJsonLogger.initializeLog(
        mockResumeWorkflowState,
        workflowPath,
        true,
      );

      // TEST THE REAL FILE OUTPUT
      const actualLogExists = await fs
        .access(expectedLogPath)
        .then(() => true)
        .catch(() => false);
      expect(actualLogExists).toBe(true);

      // Read the ACTUAL JSON file
      const actualLogContent = await fs.readFile(expectedLogPath, "utf-8");
      const actualLog = JSON.parse(actualLogContent);

      // Verify timeout resume preserves both steps
      expect(actualLog.workflow_name).toBe("Resume Timeout Workflow");
      expect(actualLog.steps).toHaveLength(2); // Both steps preserved
      expect(actualLog.status).toBe("timeout"); // Service preserves original timeout status

      // Verify step 0 is preserved
      const step0 = actualLog.steps.find((s: any) => s.step_index === 0);
      expect(step0).toBeDefined();
      expect(step0.status).toBe("completed");
      expect(step0.session_id).toBe("session-resume-test");

      // Verify timeout step is preserved
      const step1 = actualLog.steps.find((s: any) => s.step_index === 1);
      expect(step1).toBeDefined();
      expect(step1.status).toBe("timeout");
      expect(step1.resume_session).toBe("session-resume-test");

      console.log(
        "✅ Timeout resume file output verified - service preserves timeout state",
      );
    });
  });
});
