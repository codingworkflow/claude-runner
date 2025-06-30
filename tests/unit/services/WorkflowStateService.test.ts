import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  WorkflowStateService,
  WorkflowStateStorage,
  WorkflowState,
} from "../../../src/services/WorkflowStateService";
import { WorkflowExecution } from "../../../src/types/WorkflowTypes";

// Mock storage implementation for testing
class MockWorkflowStateStorage implements WorkflowStateStorage {
  private readonly states: Map<string, WorkflowState> = new Map();

  async saveWorkflowState(state: WorkflowState): Promise<void> {
    this.states.set(state.executionId, { ...state });
  }

  async loadWorkflowState(executionId: string): Promise<WorkflowState | null> {
    return this.states.get(executionId) ?? null;
  }

  async listWorkflowStates(): Promise<WorkflowState[]> {
    return Array.from(this.states.values());
  }

  async deleteWorkflowState(executionId: string): Promise<void> {
    this.states.delete(executionId);
  }

  async cleanupOldStates(maxAgeMs: number): Promise<void> {
    const cutoffTime = Date.now() - maxAgeMs;
    for (const [id, state] of this.states.entries()) {
      const stateTime = new Date(state.startTime).getTime();
      if (stateTime < cutoffTime) {
        this.states.delete(id);
      }
    }
  }

  clear(): void {
    this.states.clear();
  }
}

describe("WorkflowStateService", () => {
  let service: WorkflowStateService;
  let mockStorage: MockWorkflowStateStorage;
  let mockExecution: WorkflowExecution;

  beforeEach(() => {
    mockStorage = new MockWorkflowStateStorage();
    service = new WorkflowStateService(mockStorage);

    mockExecution = {
      workflow: {
        name: "test-workflow",
        jobs: {
          pipeline: {
            steps: [
              {
                id: "step1",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Test step 1",
                  output_session: true,
                },
              },
              {
                id: "step2",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Test step 2",
                  resume_session: "${{ steps.step1.outputs.session_id }}",
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
  });

  describe("createWorkflowState", () => {
    it("should create a new workflow state", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      expect(state.executionId).toMatch(/^exec_\d+_[a-z0-9]+$/);
      expect(state.workflowPath).toBe("/path/to/workflow.yml");
      expect(state.workflowName).toBe("test-workflow");
      expect(state.status).toBe("pending");
      expect(state.currentStep).toBe(0);
      expect(state.totalSteps).toBe(2);
      expect(state.canResume).toBe(true);
      expect(state.sessionMappings).toEqual({});
      expect(state.completedSteps).toEqual([]);
    });

    it("should save the state to storage", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      const retrieved = await service.getWorkflowState(state.executionId);
      expect(retrieved).toEqual(state);
    });
  });

  describe("pauseWorkflow", () => {
    it("should pause a running workflow", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      // Simulate workflow running
      state.status = "running";
      await mockStorage.saveWorkflowState(state);

      const pausedState = await service.pauseWorkflow(
        state.executionId,
        "manual",
      );

      expect(pausedState).not.toBeNull();
      if (pausedState) {
        expect(pausedState.status).toBe("paused");
        expect(pausedState.pauseReason).toBe("manual");
        expect(pausedState.pausedAt).toBeDefined();
        expect(pausedState.canResume).toBe(true);
      }
    });

    it("should not pause a non-running workflow", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      const pausedState = await service.pauseWorkflow(
        state.executionId,
        "manual",
      );

      expect(pausedState).toBeNull();
    });

    it("should handle error pause reason", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      state.status = "running";
      await mockStorage.saveWorkflowState(state);

      const pausedState = await service.pauseWorkflow(
        state.executionId,
        "error",
      );

      if (pausedState) {
        expect(pausedState.status).toBe("paused");
        expect(pausedState.pauseReason).toBe("error");
        expect(pausedState.canResume).toBe(false);
      }
    });
  });

  describe("resumeWorkflow", () => {
    it("should resume a paused workflow", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      // Simulate paused workflow
      state.status = "paused";
      state.canResume = true;
      await mockStorage.saveWorkflowState(state);

      const resumedState = await service.resumeWorkflow(state.executionId);

      expect(resumedState).not.toBeNull();
      if (resumedState) {
        expect(resumedState.status).toBe("running");
        expect(resumedState.resumedAt).toBeDefined();
        expect(resumedState.pauseReason).toBeUndefined();
      }
    });

    it("should not resume a non-paused workflow", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      const resumedState = await service.resumeWorkflow(state.executionId);

      expect(resumedState).toBeNull();
    });

    it("should not resume a workflow that cannot be resumed", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      state.status = "paused";
      state.canResume = false;
      await mockStorage.saveWorkflowState(state);

      const resumedState = await service.resumeWorkflow(state.executionId);

      expect(resumedState).toBeNull();
    });
  });

  describe("updateWorkflowProgress", () => {
    it("should update workflow progress with step result", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      const stepResult = service.createStepResult(0, "step1", "ses_123", true);
      const completedStepResult = service.completeStepResult(
        stepResult,
        true,
        "Step completed successfully",
      );

      const updatedState = await service.updateWorkflowProgress(
        state.executionId,
        completedStepResult,
      );

      expect(updatedState).not.toBeNull();
      if (updatedState) {
        expect(updatedState.completedSteps).toHaveLength(1);
        expect(updatedState.completedSteps[0].status).toBe("completed");
        expect(updatedState.sessionMappings["step1"]).toBe("ses_123");
        expect(updatedState.currentStep).toBe(1);
      }
    });

    it("should mark workflow as completed when all steps are done", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      // Complete step 1
      const step1Result = service.completeStepResult(
        service.createStepResult(0, "step1", "ses_123", true),
        true,
        "Step 1 completed",
      );
      await service.updateWorkflowProgress(state.executionId, step1Result);

      // Complete step 2
      const step2Result = service.completeStepResult(
        service.createStepResult(1, "step2", "ses_456", false),
        true,
        "Step 2 completed",
      );
      const finalState = await service.updateWorkflowProgress(
        state.executionId,
        step2Result,
      );

      if (finalState) {
        expect(finalState.status).toBe("completed");
        expect(finalState.currentStep).toBe(2);
      }
    });

    it("should mark workflow as failed on step failure", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      const failedStepResult = service.completeStepResult(
        service.createStepResult(0, "step1", undefined, true),
        false,
        undefined,
        "Step failed",
      );

      const updatedState = await service.updateWorkflowProgress(
        state.executionId,
        failedStepResult,
      );

      if (updatedState) {
        expect(updatedState.status).toBe("failed");
        expect(updatedState.canResume).toBe(false);
      }
    });
  });

  describe("getResumableWorkflows", () => {
    it("should return only resumable paused workflows", async () => {
      // Create resumable workflow
      const state1 = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow1.yml",
      );
      state1.status = "paused";
      state1.canResume = true;
      await mockStorage.saveWorkflowState(state1);

      // Create non-resumable workflow
      const state2 = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow2.yml",
      );
      state2.status = "paused";
      state2.canResume = false;
      await mockStorage.saveWorkflowState(state2);

      // Create completed workflow
      const state3 = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow3.yml",
      );
      state3.status = "completed";
      state3.canResume = true;
      await mockStorage.saveWorkflowState(state3);

      const resumableWorkflows = await service.getResumableWorkflows();

      expect(resumableWorkflows).toHaveLength(1);
      expect(resumableWorkflows[0].executionId).toBe(state1.executionId);
    });
  });

  describe("resolveSessionReference", () => {
    it("should resolve template references", () => {
      const sessionMappings = { step1: "ses_123", step2: "ses_456" };

      const result = service.resolveSessionReference(
        sessionMappings,
        "${{ steps.step1.outputs.session_id }}",
      );

      expect(result).toBe("ses_123");
    });

    it("should return null for unknown template references", () => {
      const sessionMappings = { step1: "ses_123" };

      const result = service.resolveSessionReference(
        sessionMappings,
        "${{ steps.unknown.outputs.session_id }}",
      );

      expect(result).toBeNull();
    });

    it("should handle direct session ID references", () => {
      const sessionMappings = {};

      const result = service.resolveSessionReference(
        sessionMappings,
        "ses_direct123",
      );

      expect(result).toBe("ses_direct123");
    });

    it("should return null for invalid references", () => {
      const sessionMappings = {};

      const result = service.resolveSessionReference(
        sessionMappings,
        "invalid_ref",
      );

      expect(result).toBeNull();
    });
  });

  describe("deleteWorkflowState", () => {
    it("should delete workflow state", async () => {
      const state = await service.createWorkflowState(
        mockExecution,
        "/path/to/workflow.yml",
      );

      await service.deleteWorkflowState(state.executionId);

      const retrieved = await service.getWorkflowState(state.executionId);
      expect(retrieved).toBeNull();
    });
  });

  describe("cleanupOldWorkflows", () => {
    it("should cleanup old workflow states", async () => {
      // Create old workflow (simulate by setting old start time)
      const oldState = await service.createWorkflowState(
        mockExecution,
        "/path/to/old.yml",
      );
      oldState.startTime = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString(); // 24 hours ago
      await mockStorage.saveWorkflowState(oldState);

      // Create recent workflow
      const recentState = await service.createWorkflowState(
        mockExecution,
        "/path/to/recent.yml",
      );

      // Cleanup states older than 12 hours
      await service.cleanupOldWorkflows(12 * 60 * 60 * 1000);

      const allStates = await mockStorage.listWorkflowStates();
      expect(allStates).toHaveLength(1);
      expect(allStates[0].executionId).toBe(recentState.executionId);
    });
  });
});
