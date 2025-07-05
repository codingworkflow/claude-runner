import * as path from "path";
import { WorkflowState, WorkflowStepResult } from "./WorkflowStateService";
import { IFileSystem } from "../core/interfaces/IFileSystem";
import { ILogger } from "../core/interfaces/ILogger";

export interface JsonLogStep {
  step_index: number;
  step_id: string;
  step_name: string;
  status: "completed" | "failed" | "paused" | "timeout";
  start_time: string;
  end_time: string;
  duration_ms: number;
  output: string;
  session_id: string;
  output_session: boolean;
  resume_session?: string;
}

export interface JsonLogFormat {
  workflow_name: string;
  workflow_file: string;
  execution_id: string;
  start_time: string;
  last_update_time: string;
  status: "running" | "paused" | "completed" | "failed" | "timeout";
  last_completed_step: number;
  total_steps: number;
  steps: JsonLogStep[];
}

export class WorkflowJsonLogger {
  private logFilePath?: string;
  private currentLog?: JsonLogFormat;

  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly logger: ILogger,
  ) {}

  async initializeLog(
    workflowState: WorkflowState,
    workflowPath: string,
    isResume: boolean = false,
  ): Promise<void> {
    try {
      // Generate log file path in same folder as workflow (per specs)
      const workflowDir = path.dirname(workflowPath);
      const workflowBaseName = path.basename(
        workflowPath,
        path.extname(workflowPath),
      );
      const logFileName = `${workflowBaseName}.json`;
      this.logFilePath = path.join(workflowDir, logFileName);

      // Ensure log directory exists
      const logDir = path.dirname(this.logFilePath);
      if (!(await this.fileSystem.exists(logDir))) {
        await this.fileSystem.mkdir(logDir, { recursive: true });
      }

      // RESUME: Load existing job log instead of creating new one
      if (isResume) {
        try {
          const existingContent = await this.fileSystem.readFile(
            this.logFilePath,
          );
          this.currentLog = JSON.parse(existingContent);
          if (this.currentLog) {
            this.currentLog.last_update_time = new Date().toISOString();
            this.currentLog.status = "running";
            return; // Keep existing log with all previous steps
          }
        } catch (error) {
          // If existing log not found, fall through to create new one
          this.logger.warn("Could not load existing job log, creating new one");
        }
      }

      // Generate execution ID in correct format (YYYYMMDD-HHMMSS)
      const now = new Date();
      const executionId =
        now.toISOString().slice(0, 19).replace(/[-:T]/g, "").slice(0, 8) +
        "-" +
        now.toISOString().slice(11, 19).replace(/[-:]/g, "").slice(0, 6);

      // Get total steps count
      const workflow = workflowState.execution.workflow;
      let totalSteps = 0;
      if (workflow.jobs) {
        const jobName = Object.keys(workflow.jobs)[0];
        const job = workflow.jobs[jobName];
        totalSteps = job?.steps?.length || 0;
      }

      // NEW EXECUTION: Create fresh job log
      this.currentLog = {
        workflow_name: workflow.name || workflowBaseName,
        workflow_file: path.relative(path.dirname(workflowPath), workflowPath),
        execution_id: executionId,
        start_time: new Date().toISOString(),
        last_update_time: new Date().toISOString(),
        status: "running",
        last_completed_step: -1,
        total_steps: totalSteps,
        steps: [], // Empty only for NEW executions
      };

      await this.writeLogFile();
    } catch (error) {
      this.logger.error(
        "Failed to initialize workflow JSON log",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateStepProgress(
    stepResult: WorkflowStepResult,
    workflowState: WorkflowState,
  ): Promise<void> {
    if (!this.currentLog || !this.logFilePath) {
      return;
    }

    try {
      // Only add steps when they are COMPLETED, FAILED, TIMEOUT, or PAUSED
      if (
        stepResult.status === "completed" ||
        stepResult.status === "failed" ||
        stepResult.status === "timeout" ||
        stepResult.status === "paused"
      ) {
        // Calculate duration
        const startTime = new Date(
          stepResult.startTime ?? new Date().toISOString(),
        );
        const endTime = new Date(
          stepResult.endTime ?? new Date().toISOString(),
        );
        const durationMs = endTime.getTime() - startTime.getTime();

        // Get step details from workflow
        const workflow = workflowState.execution.workflow;
        let stepName = `Step ${stepResult.stepIndex + 1}`;
        let outputSession = false;
        let resumeSession = "";

        if (workflow.jobs) {
          const jobName = Object.keys(workflow.jobs)[0];
          const job = workflow.jobs[jobName];
          const step = job?.steps?.[stepResult.stepIndex];
          if (step) {
            stepName = step.name ?? stepName;
            outputSession = step.with?.output_session === true;
            resumeSession = step.with?.resume_session
              ? String(step.with.resume_session)
              : "";

            // Resolve session template variables (e.g., "${{ steps.step-0.outputs.session_id }}")
            if (resumeSession && resumeSession.includes("${{")) {
              resumeSession = this.resolveSessionVariables(
                resumeSession,
                workflowState,
              );
            }
          }
        }

        // Add completed step to log
        const logStep: JsonLogStep = {
          step_index: stepResult.stepIndex,
          step_id: stepResult.stepId,
          step_name: stepName,
          status:
            stepResult.status === "completed"
              ? "completed"
              : stepResult.status === "timeout"
                ? "timeout"
                : stepResult.status === "paused"
                  ? "paused"
                  : "failed",
          start_time: stepResult.startTime ?? new Date().toISOString(),
          end_time: stepResult.endTime ?? new Date().toISOString(),
          duration_ms: durationMs,
          output: stepResult.output ?? "",
          session_id: stepResult.sessionId ?? "",
          output_session: outputSession,
        };

        if (resumeSession) {
          logStep.resume_session = resumeSession;
        }

        this.currentLog.steps.push(logStep);
        // Only update last_completed_step for completed steps (not failed)
        if (stepResult.status === "completed") {
          this.currentLog.last_completed_step = Math.max(
            this.currentLog.last_completed_step,
            stepResult.stepIndex,
          );
        }
      }

      // Update log metadata
      this.currentLog.last_update_time = new Date().toISOString();

      // Update overall workflow status based on step results (following Go CLI pattern)
      this.calculateWorkflowStatusFromSteps(workflowState);

      await this.writeLogFile();
    } catch (error) {
      this.logger.error(
        "Failed to update workflow JSON log",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async updateWorkflowStatus(
    status: "running" | "paused" | "completed" | "failed" | "timeout",
  ): Promise<void> {
    if (!this.currentLog || !this.logFilePath) {
      return;
    }

    try {
      this.currentLog.status = status;
      this.currentLog.last_update_time = new Date().toISOString();
      await this.writeLogFile();
    } catch (error) {
      this.logger.error(
        "Failed to update workflow status in JSON log",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  // Removed restoreFromWorkflowState - not needed with new format

  getLogFilePath(): string | undefined {
    return this.logFilePath;
  }

  getCurrentLog(): JsonLogFormat | undefined {
    return this.currentLog;
  }

  private async writeLogFile(): Promise<void> {
    if (!this.logFilePath || !this.currentLog) {
      return;
    }

    try {
      const logContent = JSON.stringify(this.currentLog, null, 2);
      await this.fileSystem.writeFile(this.logFilePath, logContent);
    } catch (error) {
      this.logger.error(
        "Failed to write workflow JSON log file",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async finalize(): Promise<void> {
    if (this.currentLog) {
      this.currentLog.status =
        this.currentLog.status === "running"
          ? "completed"
          : this.currentLog.status;
      await this.writeLogFile();
    }
  }

  cleanup(): void {
    this.logFilePath = undefined;
    this.currentLog = undefined;
  }

  private resolveSessionVariables(
    template: string,
    workflowState: WorkflowState,
  ): string {
    // Handle session template variables like "${{ steps.step-0.outputs.session_id }}"
    return template.replace(
      /\$\{\{\s*steps\.([^.]+)\.outputs\.session_id\s*\}\}/g,
      (match, stepId) => {
        const sessionId = workflowState.sessionMappings[stepId];
        return sessionId || match; // Return original if no mapping found
      },
    );
  }

  /**
   * Calculate and update workflow status following Go CLI pattern:
   * - If any step failed -> "failed"
   * - If any step timed out or paused -> "paused" (resumable)
   * - If all steps completed -> "completed"
   * - Otherwise -> "running"
   */
  private calculateWorkflowStatusFromSteps(workflowState: WorkflowState): void {
    if (!this.currentLog) {
      return;
    }

    // Use workflow state status if explicitly set
    if (
      workflowState.status === "completed" ||
      workflowState.status === "failed"
    ) {
      this.currentLog.status = workflowState.status;
      return;
    }

    // Calculate status based on step results (Go CLI pattern)
    const steps = this.currentLog.steps;
    const failedSteps = steps.filter((s) => s.status === "failed").length;
    const timeoutSteps = steps.filter((s) => s.status === "timeout").length;
    const pausedSteps = steps.filter((s) => s.status === "paused").length;
    const completedSteps = steps.filter((s) => s.status === "completed").length;
    const totalSteps = this.currentLog.total_steps;

    if (failedSteps > 0) {
      this.currentLog.status = "failed";
    } else if (timeoutSteps > 0 || pausedSteps > 0) {
      // CRITICAL: Timeout or paused steps make workflow "paused" (not "timeout") - following Go CLI pattern
      this.currentLog.status = "paused";
    } else if (completedSteps === totalSteps && totalSteps > 0) {
      this.currentLog.status = "completed";
    } else {
      this.currentLog.status = "running";
    }
  }
}
