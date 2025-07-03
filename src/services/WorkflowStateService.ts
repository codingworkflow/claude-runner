import { WorkflowExecution } from "../types/WorkflowTypes";

export interface WorkflowStepResult {
  stepIndex: number;
  stepId: string;
  sessionId?: string;
  outputSession: boolean;
  resumeSession?: string;
  status: "pending" | "running" | "completed" | "failed" | "paused" | "timeout";
  startTime?: string;
  endTime?: string;
  output?: string;
  error?: string;
}

export interface WorkflowState {
  executionId: string;
  workflowPath: string;
  workflowName: string;
  startTime: string;
  pausedAt?: string;
  resumedAt?: string;
  currentStep: number;
  totalSteps: number;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "timeout";
  sessionMappings: Record<string, string>;
  completedSteps: WorkflowStepResult[];
  execution: WorkflowExecution;
  pauseReason?: "manual" | "rate_limit" | "error" | "timeout";
  canResume: boolean;
}

export interface WorkflowStateStorage {
  saveWorkflowState(state: WorkflowState): Promise<void>;
  loadWorkflowState(executionId: string): Promise<WorkflowState | null>;
  listWorkflowStates(): Promise<WorkflowState[]>;
  deleteWorkflowState(executionId: string): Promise<void>;
  cleanupOldStates(maxAgeMs: number): Promise<void>;
}

export class WorkflowStateService {
  constructor(private readonly storage: WorkflowStateStorage) {}

  async createWorkflowState(
    execution: WorkflowExecution,
    workflowPath: string,
  ): Promise<WorkflowState> {
    const executionId = this.generateExecutionId();
    const totalSteps = execution.workflow.jobs.pipeline?.steps?.length ?? 0;

    const state: WorkflowState = {
      executionId,
      workflowPath,
      workflowName: execution.workflow.name,
      startTime: new Date().toISOString(),
      currentStep: 0,
      totalSteps,
      status: "pending",
      sessionMappings: {},
      completedSteps: [],
      execution,
      canResume: true,
    };

    await this.storage.saveWorkflowState(state);
    return state;
  }

  async pauseWorkflow(
    executionId: string,
    reason: "manual" | "rate_limit" | "error" | "timeout" = "manual",
  ): Promise<WorkflowState | null> {
    const state = await this.storage.loadWorkflowState(executionId);
    if (!state || state.status !== "running") {
      return null;
    }

    state.status = reason === "timeout" ? "timeout" : "paused";
    state.pausedAt = new Date().toISOString();
    state.pauseReason = reason;
    state.canResume = reason !== "error";

    await this.storage.saveWorkflowState(state);
    return state;
  }

  async resumeWorkflow(executionId: string): Promise<WorkflowState | null> {
    const state = await this.storage.loadWorkflowState(executionId);
    if (
      !state ||
      !state.canResume ||
      (state.status !== "paused" && state.status !== "timeout")
    ) {
      return null;
    }

    state.status = "running";
    state.resumedAt = new Date().toISOString();
    state.pauseReason = undefined;

    await this.storage.saveWorkflowState(state);
    return state;
  }

  async updateWorkflowProgress(
    executionId: string,
    stepResult: WorkflowStepResult,
  ): Promise<WorkflowState | null> {
    const state = await this.storage.loadWorkflowState(executionId);
    if (!state) {
      return null;
    }

    // Update or add step result
    const existingIndex = state.completedSteps.findIndex(
      (step) => step.stepIndex === stepResult.stepIndex,
    );

    if (existingIndex >= 0) {
      state.completedSteps[existingIndex] = stepResult;
    } else {
      state.completedSteps.push(stepResult);
    }

    // Update session mappings if step outputs a session
    if (stepResult.sessionId && stepResult.outputSession && stepResult.stepId) {
      state.sessionMappings[stepResult.stepId] = stepResult.sessionId;
    }

    // Update current step and status
    if (stepResult.status === "completed") {
      state.currentStep = Math.max(state.currentStep, stepResult.stepIndex + 1);

      if (state.currentStep >= state.totalSteps) {
        state.status = "completed";
      }
    } else if (stepResult.status === "failed") {
      state.status = "failed";
      state.canResume = false;
    }

    await this.storage.saveWorkflowState(state);
    return state;
  }

  async getResumableWorkflows(): Promise<WorkflowState[]> {
    const allStates = await this.storage.listWorkflowStates();
    return allStates.filter(
      (state) => state.canResume && state.status === "paused",
    );
  }

  async getWorkflowState(executionId: string): Promise<WorkflowState | null> {
    return this.storage.loadWorkflowState(executionId);
  }

  async deleteWorkflowState(executionId: string): Promise<void> {
    await this.storage.deleteWorkflowState(executionId);
  }

  async cleanupOldWorkflows(
    maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
  ): Promise<void> {
    await this.storage.cleanupOldStates(maxAgeMs);
  }

  resolveSessionReference(
    sessionMappings: Record<string, string>,
    reference: string,
  ): string | null {
    // Handle template references like ${{ steps.step_id.outputs.session_id }}
    const templateMatch = reference.match(
      /\$\{\{\s*steps\.(\w+)\.outputs\.session_id\s*\}\}/,
    );

    if (templateMatch) {
      const stepId = templateMatch[1];
      return sessionMappings[stepId] || null;
    }

    // Handle direct session ID references
    if (reference.startsWith("ses_")) {
      return reference;
    }

    return null;
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createStepResult(
    stepIndex: number,
    stepId: string,
    sessionId?: string,
    outputSession: boolean = false,
    resumeSession?: string,
  ): WorkflowStepResult {
    return {
      stepIndex,
      stepId,
      sessionId,
      outputSession,
      resumeSession,
      status: "pending",
      startTime: new Date().toISOString(),
    };
  }

  completeStepResult(
    stepResult: WorkflowStepResult,
    success: boolean,
    output?: string,
    error?: string,
  ): WorkflowStepResult {
    return {
      ...stepResult,
      status: success ? "completed" : "failed",
      endTime: new Date().toISOString(),
      output,
      error,
    };
  }
}
