import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { WorkflowStateService } from "../../src/services/WorkflowStateService";
import { VSCodeWorkflowStorageAdapter } from "../../src/adapters/storage/WorkflowStorageAdapter";
import {
  ClaudeCodeService,
  TaskItem,
} from "../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../src/services/ConfigurationService";
import { WorkflowExecution } from "../../src/types/WorkflowTypes";

// Mock VSCode APIs with state persistence
let mockStorage: Record<string, unknown> = {};

interface MockGlobalState {
  get: jest.MockedFunction<(key: string) => unknown>;
  update: jest.MockedFunction<(key: string, value: unknown) => Promise<void>>;
}

interface MockExtensionContext {
  globalState: MockGlobalState;
  subscriptions: unknown[];
  workspaceState: MockGlobalState;
  secrets: unknown;
  extensionUri: unknown;
  extensionPath: string;
  asAbsolutePath: (relativePath: string) => string;
  storagePath: string;
  globalStoragePath: string;
  logPath: string;
  extensionMode: unknown;
  environmentVariableCollection: unknown;
  logUri: unknown;
  storageUri: unknown;
  globalStorageUri: unknown;
}

const mockContext: MockExtensionContext = {
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
  },
  subscriptions: [],
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
  },
  secrets: {},
  extensionUri: {},
  extensionPath: "/mock/path",
  asAbsolutePath: (relativePath: string) => `/mock/path/${relativePath}`,
  storagePath: "/mock/storage",
  globalStoragePath: "/mock/global-storage",
  logPath: "/mock/log",
  extensionMode: 1,
  environmentVariableCollection: {},
  logUri: {},
  storageUri: {},
  globalStorageUri: {},
};

// Setup the mock implementations with proper typing
mockContext.globalState.get.mockImplementation(
  (key: string) => mockStorage[key] || [],
);
mockContext.globalState.update.mockImplementation(
  (key: string, value: unknown) => {
    mockStorage[key] = value;
    return Promise.resolve();
  },
);

// Mock ConfigurationService
jest.mock("../../src/services/ConfigurationService");

describe("Pause/Resume Workflow Integration", () => {
  let workflowStateService: WorkflowStateService;
  let storageAdapter: VSCodeWorkflowStorageAdapter;
  let claudeCodeService: ClaudeCodeService;
  let mockConfigService: jest.Mocked<ConfigurationService>;

  const mockWorkflow: WorkflowExecution = {
    workflow: {
      name: "integration-test-workflow",
      jobs: {
        pipeline: {
          steps: [
            {
              id: "task_1",
              uses: "anthropics/claude-pipeline-action@v1",
              with: {
                prompt: "First task",
                output_session: true,
              },
            },
            {
              id: "task_2",
              uses: "anthropics/claude-pipeline-action@v1",
              with: {
                prompt: "Second task",
                resume_session: "${{ steps.task_1.outputs.session_id }}",
              },
            },
            {
              id: "task_3",
              uses: "anthropics/claude-pipeline-action@v1",
              with: {
                prompt: "Third task",
                resume_session: "${{ steps.task_1.outputs.session_id }}",
              },
            },
          ],
        },
      },
    },
    inputs: {},
    outputs: {},
    currentStep: 0,
    status: "pending",
  };

  beforeEach(() => {
    // Clear mock storage
    mockStorage = {};

    mockConfigService =
      new ConfigurationService() as jest.Mocked<ConfigurationService>;
    mockConfigService.validateModel = jest
      .fn<(modelId: string) => boolean>()
      .mockReturnValue(true);
    mockConfigService.validatePath = jest
      .fn<(path: string) => boolean>()
      .mockReturnValue(true);

    // Create services
    storageAdapter = new VSCodeWorkflowStorageAdapter(mockContext as never);
    workflowStateService = new WorkflowStateService(storageAdapter);
    claudeCodeService = new ClaudeCodeService(
      mockConfigService,
      workflowStateService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Full pause/resume cycle", () => {
    it("should handle complete workflow pause and resume", async () => {
      // Create a workflow state
      const workflowState = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/workflow.yml",
      );

      expect(workflowState.status).toBe("pending");
      expect(workflowState.canResume).toBe(true);
      expect(workflowState.currentStep).toBe(0);
      expect(workflowState.totalSteps).toBe(3);

      // Simulate workflow execution progress
      workflowState.status = "running";
      await storageAdapter.saveWorkflowState(workflowState);

      // Progress to step 1 and add session output
      const step1Result = workflowStateService.createStepResult(
        0,
        "task_1",
        "ses_abc123",
        true,
      );
      const completedStep1 = workflowStateService.completeStepResult(
        step1Result,
        true,
        "First task completed successfully",
      );

      const updatedState = await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        completedStep1,
      );

      expect(updatedState?.currentStep).toBe(1);
      expect(updatedState?.sessionMappings["task_1"]).toBe("ses_abc123");
      expect(updatedState?.completedSteps).toHaveLength(1);

      // Pause the workflow
      const pausedState = await workflowStateService.pauseWorkflow(
        workflowState.executionId,
        "manual",
      );

      expect(pausedState).not.toBeNull();
      expect(pausedState?.status).toBe("paused");
      expect(pausedState?.pauseReason).toBe("manual");
      expect(pausedState?.canResume).toBe(true);
      expect(pausedState?.pausedAt).toBeDefined();

      // Verify workflow appears in resumable list
      const resumableWorkflows =
        await workflowStateService.getResumableWorkflows();
      expect(resumableWorkflows).toHaveLength(1);
      expect(resumableWorkflows[0].executionId).toBe(workflowState.executionId);

      // Resume the workflow
      const resumedState = await workflowStateService.resumeWorkflow(
        workflowState.executionId,
      );

      expect(resumedState).not.toBeNull();
      expect(resumedState?.status).toBe("running");
      expect(resumedState?.resumedAt).toBeDefined();
      expect(resumedState?.pauseReason).toBeUndefined();

      // Verify session mappings are preserved
      expect(resumedState?.sessionMappings["task_1"]).toBe("ses_abc123");
      expect(resumedState?.currentStep).toBe(1);
      expect(resumedState?.completedSteps).toHaveLength(1);
    });

    it("should handle session ID resolution after resume", async () => {
      const workflowState = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/workflow.yml",
      );

      // Set workflow to running state before completing steps
      workflowState.status = "running";
      await storageAdapter.saveWorkflowState(workflowState);

      // Complete first step with session output
      const step1Result = workflowStateService.completeStepResult(
        workflowStateService.createStepResult(0, "task_1", "ses_123", true),
        true,
        "Step 1 completed",
      );

      await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        step1Result,
      );

      // Pause and resume
      await workflowStateService.pauseWorkflow(
        workflowState.executionId,
        "manual",
      );
      const resumedState = await workflowStateService.resumeWorkflow(
        workflowState.executionId,
      );

      // Test session reference resolution
      const resolvedSession = workflowStateService.resolveSessionReference(
        resumedState?.sessionMappings ?? {},
        "${{ steps.task_1.outputs.session_id }}",
      );

      expect(resolvedSession).toBe("ses_123");
    });

    it("should handle workflow completion after resume", async () => {
      const workflowState = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/workflow.yml",
      );

      // Complete first two steps
      const step1Result = workflowStateService.completeStepResult(
        workflowStateService.createStepResult(0, "task_1", "ses_123", true),
        true,
        "Step 1 completed",
      );
      await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        step1Result,
      );

      const step2Result = workflowStateService.completeStepResult(
        workflowStateService.createStepResult(1, "task_2", "ses_456", false),
        true,
        "Step 2 completed",
      );
      await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        step2Result,
      );

      // Pause after step 2
      await workflowStateService.pauseWorkflow(
        workflowState.executionId,
        "manual",
      );

      // Resume and complete final step
      await workflowStateService.resumeWorkflow(workflowState.executionId);

      const step3Result = workflowStateService.completeStepResult(
        workflowStateService.createStepResult(2, "task_3", "ses_789", false),
        true,
        "Step 3 completed",
      );
      const finalState = await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        step3Result,
      );

      expect(finalState?.status).toBe("completed");
      expect(finalState?.currentStep).toBe(3);
      expect(finalState?.completedSteps).toHaveLength(3);
    });

    it("should handle workflow failure scenarios", async () => {
      const workflowState = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/workflow.yml",
      );

      // Complete first step successfully
      const step1Result = workflowStateService.completeStepResult(
        workflowStateService.createStepResult(0, "task_1", "ses_123", true),
        true,
        "Step 1 completed",
      );
      await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        step1Result,
      );

      // Fail second step
      const step2Result = workflowStateService.completeStepResult(
        workflowStateService.createStepResult(1, "task_2", undefined, false),
        false,
        undefined,
        "Step 2 failed with error",
      );
      const failedState = await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        step2Result,
      );

      expect(failedState?.status).toBe("failed");
      expect(failedState?.canResume).toBe(false);

      // Verify failed workflow doesn't appear in resumable list
      const resumableWorkflows =
        await workflowStateService.getResumableWorkflows();
      expect(resumableWorkflows).toHaveLength(0);
    });
  });

  describe("ClaudeCodeService integration", () => {
    it("should integrate pause/resume with ClaudeCodeService", async () => {
      // Create workflow state
      const workflowState = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/workflow.yml",
      );

      // Simulate running workflow
      workflowState.status = "running";
      await storageAdapter.saveWorkflowState(workflowState);

      // Pause workflow via ClaudeCodeService
      const pausedState = await claudeCodeService.pauseWorkflowExecution(
        workflowState.executionId,
      );

      expect(pausedState).not.toBeNull();
      expect(pausedState?.status).toBe("paused");

      // Get resumable workflows via ClaudeCodeService
      const resumableWorkflows =
        await claudeCodeService.getResumableWorkflows();
      expect(resumableWorkflows).toHaveLength(1);
      expect(resumableWorkflows[0].executionId).toBe(workflowState.executionId);

      // Resume workflow via ClaudeCodeService
      const resumedState = await claudeCodeService.resumeWorkflowExecution(
        workflowState.executionId,
      );

      expect(resumedState).not.toBeNull();
      expect(resumedState?.status).toBe("running");
    });

    it("should handle pipeline pause/resume through ClaudeCodeService", async () => {
      // Mock a running pipeline
      const mockTasks: TaskItem[] = [
        { id: "1", prompt: "Task 1", status: "completed" },
        { id: "2", prompt: "Task 2", status: "running" },
        { id: "3", prompt: "Task 3", status: "pending" },
      ];

      // Access private property using bracket notation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (claudeCodeService as any).currentPipelineExecution = {
        tasks: mockTasks,
        currentIndex: 1,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Pause pipeline
      const pipelineId =
        await claudeCodeService.pausePipelineExecution("manual");
      expect(pipelineId).not.toBeNull();

      // Manually trigger the pause state since we're not running the full pipeline
      if (pipelineId) {
        // Access private pausedPipelines map to simulate the pause
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pausedPipelinesMap = (claudeCodeService as any).pausedPipelines;
        pausedPipelinesMap.set(pipelineId, {
          tasks: mockTasks,
          currentIndex: 1,
          resetTime: Date.now(),
          onProgress: jest.fn(),
          onComplete: jest.fn(),
          onError: jest.fn(),
        });
      }

      // Verify pipeline is paused
      const pausedPipelines = claudeCodeService.getPausedPipelines();
      expect(pausedPipelines).toHaveLength(1);
      expect(pausedPipelines[0].pipelineId).toBe(pipelineId);
      expect(pausedPipelines[0].currentIndex).toBe(1);

      // Resume pipeline
      if (pipelineId) {
        // Mock the resumePipeline method to avoid actual execution
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resumeSpy = jest
          .spyOn(claudeCodeService as any, "resumePipeline")
          .mockResolvedValue(undefined);

        const resumed =
          await claudeCodeService.resumePipelineExecution(pipelineId);
        expect(resumed).toBe(true);
        expect(resumeSpy).toHaveBeenCalledWith(pipelineId);

        resumeSpy.mockRestore();
      } else {
        fail("Pipeline ID should not be null");
      }
    });
  });

  describe("Storage persistence", () => {
    it("should persist workflow states across service restarts", async () => {
      const workflowState = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/workflow.yml",
      );

      // Set workflow to running state
      workflowState.status = "running";
      await storageAdapter.saveWorkflowState(workflowState);

      // Complete a step
      const stepResult = workflowStateService.completeStepResult(
        workflowStateService.createStepResult(0, "task_1", "ses_123", true),
        true,
        "Step completed",
      );
      await workflowStateService.updateWorkflowProgress(
        workflowState.executionId,
        stepResult,
      );

      // Pause workflow
      await workflowStateService.pauseWorkflow(
        workflowState.executionId,
        "manual",
      );

      // Simulate service restart by creating new instances
      const newStorageAdapter = new VSCodeWorkflowStorageAdapter(
        mockContext as never,
      );
      const newWorkflowStateService = new WorkflowStateService(
        newStorageAdapter,
      );

      // Verify state is persisted
      const retrievedState = await newWorkflowStateService.getWorkflowState(
        workflowState.executionId,
      );
      expect(retrievedState).not.toBeNull();
      expect(retrievedState?.status).toBe("paused");
      expect(retrievedState?.sessionMappings["task_1"]).toBe("ses_123");
      expect(retrievedState?.completedSteps).toHaveLength(1);

      // Verify resumable workflows list
      const resumableWorkflows =
        await newWorkflowStateService.getResumableWorkflows();
      expect(resumableWorkflows).toHaveLength(1);
    });

    it("should handle storage cleanup of old states", async () => {
      // Create multiple workflow states
      const workflow1 = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/1.yml",
      );
      const workflow2 = await workflowStateService.createWorkflowState(
        mockWorkflow,
        "/test/2.yml",
      );

      // Mock old timestamps
      workflow1.startTime = new Date(
        Date.now() - 25 * 60 * 60 * 1000,
      ).toISOString(); // 25 hours ago
      await storageAdapter.saveWorkflowState(workflow1);

      // Cleanup states older than 24 hours
      await workflowStateService.cleanupOldWorkflows(24 * 60 * 60 * 1000);

      // Verify only recent workflow remains
      const allStates = await storageAdapter.listWorkflowStates();
      expect(allStates).toHaveLength(1);
      expect(allStates[0].executionId).toBe(workflow2.executionId);
    });
  });
});
