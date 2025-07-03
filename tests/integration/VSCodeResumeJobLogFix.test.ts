import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import {
  WorkflowJsonLogger,
  JsonLogFormat,
} from "../../src/services/WorkflowJsonLogger";
import {
  WorkflowState,
  WorkflowStepResult,
} from "../../src/services/WorkflowStateService";
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";

// Mock VSCode API
const mockVSCode = {
  workspace: {
    fs: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      stat: jest.fn(),
      createDirectory: jest.fn(),
    },
  },
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
};

// Mock the vscode module
jest.mock("vscode", () => mockVSCode, { virtual: true });

describe("VSCode Resume Job Log Fix Integration", () => {
  let tempDir: string;
  let fileSystem: VSCodeFileSystem;
  let logger: VSCodeLogger;
  let workflowJsonLogger: WorkflowJsonLogger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-test-"));

    // Create real file system adapter for testing
    fileSystem = new VSCodeFileSystem();
    logger = new VSCodeLogger();
    workflowJsonLogger = new WorkflowJsonLogger(fileSystem, logger);

    // Mock VSCode file system calls to use real fs operations
    mockVSCode.workspace.fs.readFile.mockImplementation(async (uri) => {
      const content = await fs.readFile(uri.fsPath, "utf8");
      return Buffer.from(content);
    });

    mockVSCode.workspace.fs.writeFile.mockImplementation(
      async (uri, content) => {
        await fs.writeFile(uri.fsPath, content);
      },
    );

    mockVSCode.workspace.fs.stat.mockImplementation(async (uri) => {
      const stats = await fs.stat(uri.fsPath);
      return {
        type: stats.isDirectory() ? 2 : 1,
        ctime: stats.ctime.getTime(),
        mtime: stats.mtime.getTime(),
        size: stats.size,
      };
    });

    mockVSCode.workspace.fs.createDirectory.mockImplementation(async (uri) => {
      await fs.mkdir(uri.fsPath, { recursive: true });
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Resume Job Log Overwrite Fix", () => {
    test("should load existing job log on resume instead of creating new one", async () => {
      const workflowPath = path.join(tempDir, "test-workflow.yml");
      const jobLogPath = path.join(tempDir, "test-workflow.json");

      // Create test workflow file
      await fs.writeFile(
        workflowPath,
        `
name: "Test Resume Workflow"
jobs:
  pipeline:
    steps:
      - name: "Step 0"
        uses: "anthropics/claude-pipeline-action"
        with:
          prompt: "First step"
          output_session: true
      - name: "Step 1" 
        uses: "anthropics/claude-pipeline-action"
        with:
          prompt: "Second step"
          resume_session: "\${{ steps.step-0.outputs.session_id }}"
`,
      );

      // Create existing job log with step 0 completed
      const existingJobLog: JsonLogFormat = {
        workflow_name: "Test Resume Workflow",
        workflow_file: "test-workflow.yml",
        execution_id: "20241230-120000",
        start_time: new Date().toISOString(),
        last_update_time: new Date().toISOString(),
        status: "paused",
        last_completed_step: 0,
        total_steps: 2,
        steps: [
          {
            step_index: 0,
            step_id: "step-0",
            step_name: "Step 0",
            status: "completed",
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            duration_ms: 30000,
            output: "Step 0 completed successfully",
            session_id: "session-test-123",
            output_session: true,
          },
        ],
      };

      await fs.writeFile(jobLogPath, JSON.stringify(existingJobLog, null, 2));

      // Create mock workflow state
      const mockWorkflowState: WorkflowState = {
        executionId: "20241230-120000",
        workflowPath,
        workflowName: "Test Resume Workflow",
        startTime: new Date().toISOString(),
        currentStep: 1,
        totalSteps: 2,
        status: "paused",
        sessionMappings: { "step-0": "session-test-123" },
        completedSteps: [
          {
            stepIndex: 0,
            stepId: "step-0",
            sessionId: "session-test-123",
            outputSession: true,
            status: "completed",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            output: "Step 0 completed successfully",
          },
        ],
        execution: {
          workflow: {
            name: "Test Resume Workflow",
            jobs: {
              pipeline: {
                steps: [
                  {
                    name: "Step 0",
                    uses: "anthropics/claude-pipeline-action",
                    with: {
                      prompt: "First step",
                      output_session: true,
                    },
                  },
                  {
                    name: "Step 1",
                    uses: "anthropics/claude-pipeline-action",
                    with: {
                      prompt: "Second step",
                      resume_session: "${{ steps.step-0.outputs.session_id }}",
                    },
                  },
                ],
              },
            },
          },
          inputs: {},
          outputs: {},
          currentStep: 1,
          status: "paused",
        },
        canResume: true,
      };

      // Test: Initialize log for resume (should load existing)
      await workflowJsonLogger.initializeLog(
        mockWorkflowState,
        workflowPath,
        true,
      );

      const currentLog = workflowJsonLogger.getCurrentLog();
      expect(currentLog).toBeDefined();
      expect(currentLog?.steps).toHaveLength(1);
      expect(currentLog?.steps[0].step_index).toBe(0);
      expect(currentLog?.steps[0].status).toBe("completed");
      expect(currentLog?.steps[0].session_id).toBe("session-test-123");
      expect(currentLog?.status).toBe("running"); // Should be updated to running
      expect(currentLog?.last_completed_step).toBe(0);
    });

    test("should create new job log when not resuming", async () => {
      const workflowPath = path.join(tempDir, "new-workflow.yml");

      await fs.writeFile(
        workflowPath,
        `
name: "New Workflow"
jobs:
  pipeline:
    steps:
      - name: "Step 0"
        uses: "anthropics/claude-pipeline-action"
        with:
          prompt: "First step"
`,
      );

      const mockWorkflowState: WorkflowState = {
        executionId: "20241230-130000",
        workflowPath,
        workflowName: "New Workflow",
        startTime: new Date().toISOString(),
        currentStep: 0,
        totalSteps: 1,
        status: "running",
        sessionMappings: {},
        completedSteps: [],
        execution: {
          workflow: {
            name: "New Workflow",
            jobs: {
              pipeline: {
                steps: [
                  {
                    name: "Step 0",
                    uses: "anthropics/claude-pipeline-action",
                    with: {
                      prompt: "First step",
                    },
                  },
                ],
              },
            },
          },
          inputs: {},
          outputs: {},
          currentStep: 0,
          status: "running",
        },
        canResume: true,
      };

      // Test: Initialize log for new execution (should create new)
      await workflowJsonLogger.initializeLog(
        mockWorkflowState,
        workflowPath,
        false,
      );

      const currentLog = workflowJsonLogger.getCurrentLog();
      expect(currentLog).toBeDefined();
      expect(currentLog?.steps).toHaveLength(0); // New execution starts empty
      expect(currentLog?.status).toBe("running");
      expect(currentLog?.last_completed_step).toBe(-1);
      expect(currentLog?.total_steps).toBe(1);
    });

    test("should handle timeout status in job logs", async () => {
      const workflowPath = path.join(tempDir, "timeout-workflow.yml");

      await fs.writeFile(
        workflowPath,
        `
name: "Timeout Test Workflow"
jobs:
  pipeline:
    steps:
      - name: "Step 0"
        uses: "anthropics/claude-pipeline-action"
        with:
          prompt: "First step"
          output_session: true
      - name: "Step 1"
        uses: "anthropics/claude-pipeline-action"  
        with:
          prompt: "Second step that times out"
          resume_session: "\${{ steps.step-0.outputs.session_id }}"
`,
      );

      const mockWorkflowState: WorkflowState = {
        executionId: "20241230-140000",
        workflowPath,
        workflowName: "Timeout Test Workflow",
        startTime: new Date().toISOString(),
        currentStep: 1,
        totalSteps: 2,
        status: "timeout",
        sessionMappings: { "step-0": "session-timeout-test" },
        completedSteps: [
          {
            stepIndex: 0,
            stepId: "step-0",
            sessionId: "session-timeout-test",
            outputSession: true,
            status: "completed",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            output: "Step 0 completed",
          },
          {
            stepIndex: 1,
            stepId: "step-1",
            sessionId: "session-timeout-test",
            outputSession: false,
            resumeSession: "session-timeout-test",
            status: "timeout",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            output: "Rate limit timeout - will resume with session",
          },
        ],
        execution: {
          workflow: {
            name: "Timeout Test Workflow",
            jobs: {
              pipeline: {
                steps: [
                  {
                    name: "Step 0",
                    uses: "anthropics/claude-pipeline-action",
                    with: {
                      prompt: "First step",
                      output_session: true,
                    },
                  },
                  {
                    name: "Step 1",
                    uses: "anthropics/claude-pipeline-action",
                    with: {
                      prompt: "Second step that times out",
                      resume_session: "${{ steps.step-0.outputs.session_id }}",
                    },
                  },
                ],
              },
            },
          },
          inputs: {},
          outputs: {},
          currentStep: 1,
          status: "timeout",
        },
        canResume: true,
      };

      // Initialize log for new timeout workflow
      await workflowJsonLogger.initializeLog(
        mockWorkflowState,
        workflowPath,
        false,
      );

      // Update with completed step 0
      const step0Result: WorkflowStepResult = {
        stepIndex: 0,
        stepId: "step-0",
        sessionId: "session-timeout-test",
        outputSession: true,
        status: "completed",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: "Step 0 completed",
      };

      await workflowJsonLogger.updateStepProgress(
        step0Result,
        mockWorkflowState,
      );

      // Update with timeout step 1
      const step1Result: WorkflowStepResult = {
        stepIndex: 1,
        stepId: "step-1",
        sessionId: "session-timeout-test",
        outputSession: false,
        resumeSession: "session-timeout-test",
        status: "timeout",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: "Rate limit timeout - will resume with session",
      };

      await workflowJsonLogger.updateStepProgress(
        step1Result,
        mockWorkflowState,
      );

      // Update workflow status to timeout
      await workflowJsonLogger.updateWorkflowStatus("timeout");

      const currentLog = workflowJsonLogger.getCurrentLog();
      expect(currentLog).toBeDefined();
      expect(currentLog?.steps).toHaveLength(2);
      expect(currentLog?.status).toBe("timeout");

      // Verify step 0 is preserved
      const step0 = currentLog?.steps.find((s) => s.step_index === 0);
      expect(step0).toBeDefined();
      expect(step0?.status).toBe("completed");
      expect(step0?.session_id).toBe("session-timeout-test");

      // Verify step 1 has timeout status
      const step1 = currentLog?.steps.find((s) => s.step_index === 1);
      expect(step1).toBeDefined();
      expect(step1?.status).toBe("timeout");
      expect(step1?.resume_session).toBe("session-timeout-test");
    });

    test("should resume from timeout job log preserving all steps", async () => {
      const workflowPath = path.join(tempDir, "resume-timeout-workflow.yml");
      const jobLogPath = path.join(tempDir, "resume-timeout-workflow.json");

      await fs.writeFile(
        workflowPath,
        `
name: "Resume Timeout Workflow"
jobs:
  pipeline:
    steps:
      - name: "Step 0"
        uses: "anthropics/claude-pipeline-action"
        with:
          prompt: "First step"
          output_session: true
      - name: "Step 1"
        uses: "anthropics/claude-pipeline-action"
        with:
          prompt: "Second step"
          resume_session: "\${{ steps.step-0.outputs.session_id }}"
`,
      );

      // Create timeout job log
      const timeoutJobLog: JsonLogFormat = {
        workflow_name: "Resume Timeout Workflow",
        workflow_file: "resume-timeout-workflow.yml",
        execution_id: "20241230-150000",
        start_time: new Date().toISOString(),
        last_update_time: new Date().toISOString(),
        status: "timeout",
        last_completed_step: 0,
        total_steps: 2,
        steps: [
          {
            step_index: 0,
            step_id: "step-0",
            step_name: "Step 0",
            status: "completed",
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            duration_ms: 30000,
            output: "Step 0 completed",
            session_id: "session-resume-test",
            output_session: true,
          },
          {
            step_index: 1,
            step_id: "step-1",
            step_name: "Step 1",
            status: "timeout",
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            duration_ms: 10000,
            output: "Timeout occurred - can resume",
            session_id: "session-resume-test",
            output_session: false,
            resume_session: "session-resume-test",
          },
        ],
      };

      await fs.writeFile(jobLogPath, JSON.stringify(timeoutJobLog, null, 2));

      const mockResumeWorkflowState: WorkflowState = {
        executionId: "20241230-150000",
        workflowPath,
        workflowName: "Resume Timeout Workflow",
        startTime: new Date().toISOString(),
        currentStep: 1,
        totalSteps: 2,
        status: "running", // Changed from timeout to running for resume
        sessionMappings: { "step-0": "session-resume-test" },
        completedSteps: [
          {
            stepIndex: 0,
            stepId: "step-0",
            sessionId: "session-resume-test",
            outputSession: true,
            status: "completed",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            output: "Step 0 completed",
          },
          {
            stepIndex: 1,
            stepId: "step-1",
            sessionId: "session-resume-test",
            outputSession: false,
            resumeSession: "session-resume-test",
            status: "timeout",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            output: "Timeout occurred - can resume",
          },
        ],
        execution: {
          workflow: {
            name: "Resume Timeout Workflow",
            jobs: {
              pipeline: {
                steps: [
                  {
                    name: "Step 0",
                    uses: "anthropics/claude-pipeline-action",
                    with: {
                      prompt: "First step",
                      output_session: true,
                    },
                  },
                  {
                    name: "Step 1",
                    uses: "anthropics/claude-pipeline-action",
                    with: {
                      prompt: "Second step",
                      resume_session: "${{ steps.step-0.outputs.session_id }}",
                    },
                  },
                ],
              },
            },
          },
          inputs: {},
          outputs: {},
          currentStep: 1,
          status: "running",
        },
        canResume: true,
      };

      // Resume from timeout - should load existing log
      await workflowJsonLogger.initializeLog(
        mockResumeWorkflowState,
        workflowPath,
        true,
      );

      const currentLog = workflowJsonLogger.getCurrentLog();
      expect(currentLog).toBeDefined();
      expect(currentLog?.steps).toHaveLength(2); // Both steps preserved
      expect(currentLog?.status).toBe("running"); // Updated from timeout to running

      // Critical test: Step 0 must be preserved
      const step0 = currentLog?.steps.find((s) => s.step_index === 0);
      expect(step0).toBeDefined();
      expect(step0?.status).toBe("completed");
      expect(step0?.session_id).toBe("session-resume-test");

      // Timeout step should also be preserved
      const step1 = currentLog?.steps.find((s) => s.step_index === 1);
      expect(step1).toBeDefined();
      expect(step1?.status).toBe("timeout");
      expect(step1?.resume_session).toBe("session-resume-test");
    });
  });
});
