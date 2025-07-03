import {
  ClaudeWorkflow,
  WorkflowExecution,
  WorkflowMetadata,
  ClaudeStep,
  StepOutput,
  isClaudeStep,
} from "../models/Workflow";
import { WorkflowOptions, WorkflowResult } from "../models/Task";
import { ILogger, IFileSystem } from "../interfaces";
import { WorkflowParser } from "./WorkflowParser";
import { ClaudeExecutor } from "./ClaudeExecutor";
import {
  WorkflowStateService,
  WorkflowState,
} from "../../services/WorkflowStateService";
import { WorkflowJsonLogger } from "../../services/WorkflowJsonLogger";

export class WorkflowEngine {
  private currentWorkflowState?: WorkflowState;
  private readonly jsonLogger?: WorkflowJsonLogger;

  constructor(
    private readonly logger: ILogger,
    private readonly fileSystem: IFileSystem,
    private readonly executor: ClaudeExecutor,
    private readonly workflowStateService?: WorkflowStateService,
  ) {
    this.jsonLogger = new WorkflowJsonLogger(this.fileSystem, this.logger);
  }

  /**
   * List all Claude workflows in a directory
   */
  async listWorkflows(workflowsPath: string): Promise<WorkflowMetadata[]> {
    try {
      const exists = await this.fileSystem.exists(workflowsPath);
      if (!exists) {
        return [];
      }

      const files = await this.fileSystem.readdir(workflowsPath);
      const workflows: WorkflowMetadata[] = [];

      for (const file of files) {
        if (
          file.startsWith("claude-") &&
          (file.endsWith(".yml") || file.endsWith(".yaml"))
        ) {
          const filePath = `${workflowsPath}/${file}`;
          const stats = await this.fileSystem.stat(filePath);

          try {
            const content = await this.fileSystem.readFile(filePath);
            const workflow = WorkflowParser.parseYaml(content);

            workflows.push({
              id: file.replace(/\.(yml|yaml)$/, ""),
              name: workflow.name,
              description: workflow.inputs?.description?.default,
              created: stats.birthtime,
              modified: stats.mtime,
              path: filePath,
            });
          } catch (error) {
            this.logger.error(
              `Failed to parse workflow ${file}`,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      }

      return workflows.sort(
        (a, b) => b.modified.getTime() - a.modified.getTime(),
      );
    } catch (error) {
      this.logger.error(
        "Failed to list workflows",
        error instanceof Error ? error : new Error(String(error)),
      );
      return [];
    }
  }

  /**
   * Load a workflow from file
   */
  async loadWorkflow(filePath: string): Promise<ClaudeWorkflow> {
    const content = await this.fileSystem.readFile(filePath);
    return WorkflowParser.parseYaml(content);
  }

  /**
   * Save a workflow to file
   */
  async saveWorkflow(
    filePath: string,
    workflow: ClaudeWorkflow,
  ): Promise<void> {
    const content = WorkflowParser.toYaml(workflow);
    await this.fileSystem.writeFile(filePath, content);
  }

  /**
   * Validate a workflow file
   */
  async validateWorkflow(
    filePath: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      await this.loadWorkflow(filePath);
      return { valid: true, errors: [] };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { valid: false, errors: [errorMessage] };
    }
  }

  /**
   * Create a workflow execution context
   */
  createExecution(
    workflow: ClaudeWorkflow,
    inputs: Record<string, string>,
  ): WorkflowExecution {
    return {
      workflow,
      inputs,
      outputs: {},
      currentStep: 0,
      status: "pending",
    };
  }

  /**
   * Execute a workflow with state persistence support
   */
  async executeWorkflow(
    execution: WorkflowExecution,
    options: WorkflowOptions = {},
    onStepProgress?: (
      stepId: string,
      status: "running" | "completed" | "failed",
      output?: StepOutput,
    ) => void,
    onComplete?: () => void,
    onError?: (error: string) => void,
    workflowPath?: string,
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const steps = this.getExecutionSteps(execution.workflow);
    let stepsExecuted = 0;

    // Create workflow state for persistence if service is available
    if (this.workflowStateService && workflowPath) {
      this.currentWorkflowState =
        await this.workflowStateService.createWorkflowState(
          execution,
          workflowPath,
        );

      // Initialize JSON log file
      if (this.jsonLogger) {
        await this.jsonLogger.initializeLog(
          this.currentWorkflowState,
          workflowPath,
          false, // New execution - not a resume
        );
      }
    }

    try {
      execution.status = "running";

      for (const { step, index } of steps) {
        const stepId = step.id ?? `step-${index}`;

        // Create step checkpoint
        if (this.currentWorkflowState && this.workflowStateService) {
          const stepResult = this.workflowStateService.createStepResult(
            index,
            stepId,
            undefined,
            step.with.output_session === true,
            step.with.resume_session,
          );

          await this.workflowStateService.updateWorkflowProgress(
            this.currentWorkflowState.executionId,
            stepResult,
          );
        }

        onStepProgress?.(stepId, "running");

        // Resolve variables in the step
        const resolvedStep = this.resolveStepVariables(step, execution);

        try {
          const result = await this.executor.executeTask(
            resolvedStep.with.prompt,
            resolvedStep.with.model ?? options.model ?? "auto",
            options.workingDirectory ?? process.cwd(),
            {
              allowAllTools: resolvedStep.with.allow_all_tools,
              outputFormat: "json", // Always use JSON for workflows to capture session ID
              workingDirectory:
                resolvedStep.with.working_directory ?? options.workingDirectory,
              resumeSessionId: resolvedStep.with.resume_session,
            },
          );

          if (!result.success) {
            throw new Error(result.error ?? "Task execution failed");
          }

          const output: StepOutput = {
            result: result.output,
          };

          // Always add session_id to output when available (KISS - no complexity)
          if (result.sessionId) {
            output.session_id = result.sessionId;
          }

          // Update execution with output
          this.updateExecutionOutput(execution, stepId, output);

          // Update step completion in workflow state
          if (this.currentWorkflowState && this.workflowStateService) {
            // Extract clean result from JSON output
            const cleanOutput = this.extractCleanResult(result.output);

            const completedStepResult =
              this.workflowStateService.completeStepResult(
                this.workflowStateService.createStepResult(
                  index,
                  stepId,
                  result.sessionId,
                  true, // Always capture session (auto-detect approach)
                  step.with.resume_session,
                ),
                true,
                cleanOutput,
              );

            const updatedState =
              await this.workflowStateService.updateWorkflowProgress(
                this.currentWorkflowState.executionId,
                completedStepResult,
              );

            // Update JSON log
            if (updatedState && this.jsonLogger) {
              await this.jsonLogger.updateStepProgress(
                completedStepResult,
                updatedState,
              );
            }
          }

          onStepProgress?.(stepId, "completed", output);
          stepsExecuted++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Update step failure in workflow state
          if (this.currentWorkflowState && this.workflowStateService) {
            const failedStepResult =
              this.workflowStateService.completeStepResult(
                this.workflowStateService.createStepResult(
                  index,
                  stepId,
                  undefined,
                  true, // Always capture session (auto-detect approach)
                  step.with.resume_session,
                ),
                false,
                undefined,
                errorMessage,
              );

            const updatedState =
              await this.workflowStateService.updateWorkflowProgress(
                this.currentWorkflowState.executionId,
                failedStepResult,
              );

            // Update JSON log
            if (updatedState && this.jsonLogger) {
              await this.jsonLogger.updateStepProgress(
                failedStepResult,
                updatedState,
              );
            }
          }

          onStepProgress?.(stepId, "failed", { result: errorMessage });
          throw error;
        }
      }

      execution.status = "completed";

      // Mark workflow as completed in state
      if (this.currentWorkflowState && this.workflowStateService) {
        this.currentWorkflowState.status = "completed";
        await this.workflowStateService.updateWorkflowProgress(
          this.currentWorkflowState.executionId,
          this.workflowStateService.createStepResult(-1, "workflow_completed"),
        );

        // Finalize JSON log
        if (this.jsonLogger) {
          await this.jsonLogger.updateWorkflowStatus("completed");
          await this.jsonLogger.finalize();
        }
      }

      onComplete?.();

      const executionTime = Date.now() - startTime;
      return {
        workflowId: execution.workflow.name,
        success: true,
        outputs: execution.outputs,
        executionTimeMs: executionTime,
        stepsExecuted,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      execution.status = "failed";
      execution.error = errorMessage;

      // Mark workflow as failed in state
      if (this.currentWorkflowState && this.workflowStateService) {
        this.currentWorkflowState.status = "failed";
        this.currentWorkflowState.canResume = false;

        // Update JSON log with failure
        if (this.jsonLogger) {
          await this.jsonLogger.updateWorkflowStatus("failed");
          await this.jsonLogger.finalize();
        }
      }

      onError?.(errorMessage);

      const executionTime = Date.now() - startTime;
      return {
        workflowId: execution.workflow.name,
        success: false,
        outputs: execution.outputs,
        error: errorMessage,
        executionTimeMs: executionTime,
        stepsExecuted,
      };
    } finally {
      // Cleanup JSON logger
      if (this.jsonLogger) {
        this.jsonLogger.cleanup();
      }
      this.currentWorkflowState = undefined;
    }
  }

  /**
   * Get Claude steps from workflow in execution order
   */
  private getExecutionSteps(
    workflow: ClaudeWorkflow,
  ): Array<{ jobName: string; step: ClaudeStep; index: number }> {
    const steps: Array<{ jobName: string; step: ClaudeStep; index: number }> =
      [];

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      job.steps.forEach((step, index) => {
        if (isClaudeStep(step)) {
          steps.push({ jobName, step, index });
        }
      });
    }

    return steps;
  }

  /**
   * Resolve variables in a Claude step
   */
  private resolveStepVariables(
    step: ClaudeStep,
    execution: WorkflowExecution,
  ): ClaudeStep {
    // Transform execution.outputs to match expected steps.stepId.outputs.key format
    const steps: Record<string, { outputs: Record<string, unknown> }> = {};
    for (const [stepId, output] of Object.entries(execution.outputs)) {
      steps[stepId] = { outputs: output };
    }

    const context = {
      inputs: execution.inputs,
      env: { ...execution.workflow.env },
      steps,
    };

    // Deep clone the step
    const resolvedStep = JSON.parse(JSON.stringify(step)) as ClaudeStep;

    // Resolve prompt
    resolvedStep.with.prompt = WorkflowParser.resolveVariables(
      resolvedStep.with.prompt,
      context,
    );

    // Resolve other string parameters
    for (const [key, value] of Object.entries(resolvedStep.with)) {
      if (typeof value === "string" && key !== "prompt") {
        // Simple session ID resolution: if resume_session is just a task ID, resolve to session_id
        if (key === "resume_session" && typeof value === "string") {
          // Check if it's a simple task ID (not a complex variable)
          if (!value.includes("${{") && execution.outputs[value]?.session_id) {
            resolvedStep.with[key] = execution.outputs[value]
              .session_id as string;
          } else {
            // Fall back to normal variable resolution for complex cases
            resolvedStep.with[key] = WorkflowParser.resolveVariables(
              value,
              context,
            );
          }
        } else {
          resolvedStep.with[key] = WorkflowParser.resolveVariables(
            value,
            context,
          );
        }
      }
    }

    return resolvedStep;
  }

  /**
   * Resume workflow execution from saved state
   */
  async resumeWorkflow(
    executionId: string,
    options: WorkflowOptions = {},
    onStepProgress?: (
      stepId: string,
      status: "running" | "completed" | "failed",
      output?: StepOutput,
    ) => void,
    onComplete?: () => void,
    onError?: (error: string) => void,
  ): Promise<WorkflowResult> {
    if (!this.workflowStateService) {
      throw new Error(
        "WorkflowStateService not available for resume operation",
      );
    }

    // Load workflow state
    const workflowState =
      await this.workflowStateService.getWorkflowState(executionId);
    if (!workflowState || !workflowState.canResume) {
      throw new Error(`Cannot resume workflow: ${executionId}`);
    }

    // Resume workflow state
    const resumedState =
      await this.workflowStateService.resumeWorkflow(executionId);
    if (!resumedState) {
      throw new Error(`Failed to resume workflow: ${executionId}`);
    }

    this.currentWorkflowState = resumedState;
    const execution = resumedState.execution;
    const steps = this.getExecutionSteps(execution.workflow);

    // Initialize JSON log file for resume
    if (this.jsonLogger) {
      await this.jsonLogger.initializeLog(
        resumedState,
        workflowState.workflowPath,
        true, // This is a resume operation
      );
    }

    // Restore session mappings to execution outputs
    for (const [stepId, sessionId] of Object.entries(
      resumedState.sessionMappings,
    )) {
      if (!execution.outputs[stepId]) {
        execution.outputs[stepId] = {};
      }
      execution.outputs[stepId].session_id = sessionId;
    }

    const startTime = Date.now();
    let stepsExecuted = resumedState.completedSteps.length;

    try {
      execution.status = "running";

      // Continue from current step
      for (let i = resumedState.currentStep; i < steps.length; i++) {
        const { step } = steps[i];
        const stepId = step.id ?? `step-${i}`;

        // Skip if step is already completed
        const existingStep = resumedState.completedSteps.find(
          (s) => s.stepIndex === i,
        );
        if (existingStep && existingStep.status === "completed") {
          continue;
        }

        // Create step checkpoint
        const stepResult = this.workflowStateService.createStepResult(
          i,
          stepId,
          undefined,
          step.with.output_session === true,
          step.with.resume_session,
        );

        await this.workflowStateService.updateWorkflowProgress(
          resumedState.executionId,
          stepResult,
        );

        onStepProgress?.(stepId, "running");

        // Resolve variables in the step using restored session mappings
        const resolvedStep = this.resolveStepVariables(step, execution);

        try {
          const result = await this.executor.executeTask(
            resolvedStep.with.prompt,
            resolvedStep.with.model ?? options.model ?? "auto",
            options.workingDirectory ?? process.cwd(),
            {
              allowAllTools: resolvedStep.with.allow_all_tools,
              outputFormat: "json",
              workingDirectory:
                resolvedStep.with.working_directory ?? options.workingDirectory,
              resumeSessionId: resolvedStep.with.resume_session,
            },
          );

          if (!result.success) {
            throw new Error(result.error ?? "Task execution failed");
          }

          const output: StepOutput = {
            result: result.output,
          };

          if (resolvedStep.with.output_session && result.sessionId) {
            output.session_id = result.sessionId;
          }

          this.updateExecutionOutput(execution, stepId, output);

          // Extract clean result from JSON output
          const cleanOutput = this.extractCleanResult(result.output);

          const completedStepResult =
            this.workflowStateService.completeStepResult(
              this.workflowStateService.createStepResult(
                i,
                stepId,
                result.sessionId,
                step.with.output_session === true,
                step.with.resume_session,
              ),
              true,
              cleanOutput,
            );

          await this.workflowStateService.updateWorkflowProgress(
            resumedState.executionId,
            completedStepResult,
          );

          onStepProgress?.(stepId, "completed", output);
          stepsExecuted++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          const failedStepResult = this.workflowStateService.completeStepResult(
            this.workflowStateService.createStepResult(
              i,
              stepId,
              undefined,
              step.with.output_session === true,
              step.with.resume_session,
            ),
            false,
            undefined,
            errorMessage,
          );

          await this.workflowStateService.updateWorkflowProgress(
            resumedState.executionId,
            failedStepResult,
          );

          onStepProgress?.(stepId, "failed", { result: errorMessage });
          throw error;
        }
      }

      execution.status = "completed";

      if (this.currentWorkflowState) {
        this.currentWorkflowState.status = "completed";
        await this.workflowStateService.updateWorkflowProgress(
          this.currentWorkflowState.executionId,
          this.workflowStateService.createStepResult(-1, "workflow_completed"),
        );
      }

      onComplete?.();

      const executionTime = Date.now() - startTime;
      return {
        workflowId: execution.workflow.name,
        success: true,
        outputs: execution.outputs,
        executionTimeMs: executionTime,
        stepsExecuted,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      execution.status = "failed";
      execution.error = errorMessage;

      if (this.currentWorkflowState) {
        this.currentWorkflowState.status = "failed";
        this.currentWorkflowState.canResume = false;
      }

      onError?.(errorMessage);

      const executionTime = Date.now() - startTime;
      return {
        workflowId: execution.workflow.name,
        success: false,
        outputs: execution.outputs,
        error: errorMessage,
        executionTimeMs: executionTime,
        stepsExecuted,
      };
    } finally {
      // Cleanup JSON logger
      if (this.jsonLogger) {
        this.jsonLogger.cleanup();
      }
      this.currentWorkflowState = undefined;
    }
  }

  /**
   * Pause current workflow execution
   */
  async pauseCurrentWorkflow(): Promise<string | null> {
    if (!this.currentWorkflowState || !this.workflowStateService) {
      return null;
    }

    const pausedState = await this.workflowStateService.pauseWorkflow(
      this.currentWorkflowState.executionId,
      "manual",
    );

    return pausedState ? pausedState.executionId : null;
  }

  /**
   * Get current workflow execution ID
   */
  getCurrentWorkflowExecutionId(): string | null {
    return this.currentWorkflowState?.executionId ?? null;
  }

  /**
   * Update execution with step output
   */
  private updateExecutionOutput(
    execution: WorkflowExecution,
    stepId: string,
    output: StepOutput,
  ): void {
    execution.outputs[stepId] = output;
  }

  /**
   * Extract clean result from JSON output for logging
   */
  private extractCleanResult(output: string): string {
    try {
      const jsonData = JSON.parse(output.trim());
      return jsonData.result || output;
    } catch {
      return output;
    }
  }
}
