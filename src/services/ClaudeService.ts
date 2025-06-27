import { ClaudeExecutor } from "../core/services/ClaudeExecutor";
import { TaskOptions, TaskItem, TaskResult } from "../core/models/Task";
import { VSCodeLogger, VSCodeConfigSource } from "../adapters/vscode";
import { ConfigManager } from "../core/services/ConfigManager";
import { ClaudeDetectionService } from "./ClaudeDetectionService";
import { WorkflowService } from "./WorkflowService";
import { WorkflowExecution, StepOutput } from "../types/WorkflowTypes";

/**
 * Modern Claude service that uses the core module through VS Code adapters
 * This replaces ClaudeCodeService for new workflows while maintaining compatibility
 */
export class ClaudeService {
  private readonly executor: ClaudeExecutor;
  private readonly configManager: ConfigManager;

  constructor() {
    const logger = new VSCodeLogger();
    const configSource = new VSCodeConfigSource();
    this.configManager = new ConfigManager(logger);
    this.configManager.addSource(configSource);
    this.executor = new ClaudeExecutor(logger, this.configManager);
  }

  async checkInstallation(): Promise<void> {
    const result = await ClaudeDetectionService.detectClaude("auto");
    if (!result.isInstalled) {
      throw new Error(
        "Claude Code CLI not found in PATH. Please install Claude Code.",
      );
    }
  }

  async executeTask(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions = {},
  ): Promise<TaskResult> {
    return await this.executor.executeTask(
      task,
      model,
      workingDirectory,
      options,
    );
  }

  async executePipeline(
    tasks: TaskItem[],
    model: string,
    workingDirectory: string,
    options: TaskOptions = {},
    onProgress?: (tasks: TaskItem[], currentIndex: number) => void,
    onComplete?: (tasks: TaskItem[]) => void,
    onError?: (error: string, tasks: TaskItem[]) => void,
  ): Promise<void> {
    return await this.executor.executePipeline(
      tasks,
      model,
      workingDirectory,
      options,
      onProgress,
      onComplete,
      onError,
    );
  }

  /**
   * Execute a workflow using the core executor
   */
  async executeWorkflow(
    execution: WorkflowExecution,
    workflowService: WorkflowService,
    defaultModel: string,
    rootPath: string,
    onStepProgress: (
      stepId: string,
      status: "running" | "completed" | "failed",
      output?: StepOutput,
    ) => void,
    onComplete: () => void,
    onError: (error: string) => void,
  ): Promise<void> {
    const steps = workflowService.getExecutionSteps(execution.workflow);

    try {
      for (const { step, index } of steps) {
        const stepId = step.id ?? `step-${index}`;
        onStepProgress(stepId, "running");

        // Resolve variables in the step
        const resolvedStep = workflowService.resolveStepVariables(
          step,
          execution,
        );

        // Build task options from step configuration
        const taskOptions: TaskOptions = {
          allowAllTools: resolvedStep.with.allow_all_tools,
          outputFormat: "json", // Always use JSON for workflows to capture session ID
          workingDirectory: resolvedStep.with.working_directory ?? rootPath,
          resumeSessionId: resolvedStep.with.resume_session,
        };

        try {
          const result = await this.executor.executeTask(
            resolvedStep.with.prompt,
            resolvedStep.with.model ?? defaultModel,
            taskOptions.workingDirectory ?? rootPath,
            taskOptions,
          );

          if (!result.success) {
            throw new Error(result.error ?? "Task execution failed");
          }

          const output: StepOutput = {
            result: result.output,
          };

          // Add session_id to output if requested
          if (resolvedStep.with.output_session && result.sessionId) {
            output.session_id = result.sessionId;
          }

          // Update execution with output
          workflowService.updateExecutionOutput(execution, stepId, output);
          onStepProgress(stepId, "completed", output);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          onStepProgress(stepId, "failed", { result: errorMessage });
          throw error;
        }
      }

      execution.status = "completed";
      onComplete();
    } catch (error) {
      execution.status = "failed";
      execution.error = error instanceof Error ? error.message : String(error);
      onError(execution.error);
    }
  }

  cancelCurrentTask(): void {
    this.executor.cancelCurrentTask();
  }

  isTaskRunning(): boolean {
    return this.executor.isTaskRunning();
  }

  async validateClaudeCommand(model: string): Promise<boolean> {
    return await this.executor.validateClaudeCommand(model);
  }

  formatCommandPreview(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions,
  ): string {
    return this.executor.formatCommandPreview(
      task,
      model,
      workingDirectory,
      options,
    );
  }

  isValidModelId(modelId: string): boolean {
    return modelId === "auto" || this.configManager.validateModel(modelId);
  }
}
