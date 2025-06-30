import * as vscode from "vscode";
import {
  WorkflowStateStorage,
  WorkflowState,
} from "../../services/WorkflowStateService";

export class VSCodeWorkflowStorageAdapter implements WorkflowStateStorage {
  private readonly storageKey = "claude-runner.workflow-states";
  private readonly maxStates = 50; // Limit stored states to prevent excessive memory usage

  constructor(private readonly context: vscode.ExtensionContext) {}

  async saveWorkflowState(state: WorkflowState): Promise<void> {
    try {
      const existingStates = await this.loadAllStates();

      // Update existing state or add new one
      const existingIndex = existingStates.findIndex(
        (s) => s.executionId === state.executionId,
      );

      if (existingIndex >= 0) {
        existingStates[existingIndex] = state;
      } else {
        existingStates.push(state);
      }

      // Limit the number of stored states
      if (existingStates.length > this.maxStates) {
        // Sort by start time (newest first) and keep only the most recent states
        existingStates.sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        );
        existingStates.splice(this.maxStates);
      }

      await this.context.globalState.update(this.storageKey, existingStates);
    } catch (error) {
      console.error("Failed to save workflow state:", error);
      throw new Error(
        `Failed to save workflow state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async loadWorkflowState(executionId: string): Promise<WorkflowState | null> {
    try {
      const states = await this.loadAllStates();
      return states.find((state) => state.executionId === executionId) ?? null;
    } catch (error) {
      console.error("Failed to load workflow state:", error);
      return null;
    }
  }

  async listWorkflowStates(): Promise<WorkflowState[]> {
    try {
      return await this.loadAllStates();
    } catch (error) {
      console.error("Failed to list workflow states:", error);
      return [];
    }
  }

  async deleteWorkflowState(executionId: string): Promise<void> {
    try {
      const states = await this.loadAllStates();
      const filteredStates = states.filter(
        (state) => state.executionId !== executionId,
      );

      await this.context.globalState.update(this.storageKey, filteredStates);
    } catch (error) {
      console.error("Failed to delete workflow state:", error);
      throw new Error(
        `Failed to delete workflow state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async cleanupOldStates(maxAgeMs: number): Promise<void> {
    try {
      const states = await this.loadAllStates();
      const cutoffTime = Date.now() - maxAgeMs;

      const validStates = states.filter((state) => {
        const stateTime = new Date(state.startTime).getTime();
        return stateTime > cutoffTime;
      });

      if (validStates.length !== states.length) {
        await this.context.globalState.update(this.storageKey, validStates);
      }
    } catch (error) {
      console.error("Failed to cleanup old workflow states:", error);
    }
  }

  private async loadAllStates(): Promise<WorkflowState[]> {
    try {
      const states = this.context.globalState.get<WorkflowState[]>(
        this.storageKey,
        [],
      );

      // Validate and sanitize the loaded states
      return states.filter(this.isValidWorkflowState);
    } catch (error) {
      console.error("Failed to load workflow states from storage:", error);
      return [];
    }
  }

  private isValidWorkflowState(state: unknown): state is WorkflowState {
    if (!state || typeof state !== "object") {
      return false;
    }

    const s = state as Partial<WorkflowState>;

    return !!(
      s.executionId &&
      typeof s.executionId === "string" &&
      s.workflowName &&
      typeof s.workflowName === "string" &&
      s.workflowPath &&
      typeof s.workflowPath === "string" &&
      s.startTime &&
      typeof s.startTime === "string" &&
      typeof s.currentStep === "number" &&
      typeof s.totalSteps === "number" &&
      s.status &&
      typeof s.status === "string" &&
      s.sessionMappings &&
      typeof s.sessionMappings === "object" &&
      Array.isArray(s.completedSteps) &&
      s.execution &&
      typeof s.execution === "object" &&
      typeof s.canResume === "boolean"
    );
  }

  // Utility methods for storage management
  async getStorageStats(): Promise<{
    totalStates: number;
    totalSize: number;
    oldestState?: string;
    newestState?: string;
  }> {
    try {
      const states = await this.loadAllStates();

      if (states.length === 0) {
        return { totalStates: 0, totalSize: 0 };
      }

      const sortedByTime = [...states].sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );

      // Estimate storage size (rough calculation)
      const totalSize = JSON.stringify(states).length;

      return {
        totalStates: states.length,
        totalSize,
        oldestState: sortedByTime[0]?.startTime,
        newestState: sortedByTime[sortedByTime.length - 1]?.startTime,
      };
    } catch (error) {
      console.error("Failed to get storage stats:", error);
      return { totalStates: 0, totalSize: 0 };
    }
  }

  async clearAllStates(): Promise<void> {
    try {
      await this.context.globalState.update(this.storageKey, []);
    } catch (error) {
      console.error("Failed to clear all workflow states:", error);
      throw new Error(
        `Failed to clear workflow states: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
