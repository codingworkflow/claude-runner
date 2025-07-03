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
  private readonly logger: VSCodeLogger;
  private pauseAfterCurrentTask = false;
  private readonly pausedPipelines: Map<
    string,
    {
      tasks: TaskItem[];
      currentIndex: number;
      resetTime: number;
      onProgress: (tasks: TaskItem[], currentIndex: number) => void;
      onComplete: (tasks: TaskItem[]) => void;
      onError: (error: string, tasks: TaskItem[]) => void;
    }
  > = new Map();

  constructor() {
    try {
      this.logger = new VSCodeLogger();
      const configSource = new VSCodeConfigSource();
      this.configManager = new ConfigManager(this.logger);
      this.configManager.addSource(configSource);
      this.executor = new ClaudeExecutor(this.logger, this.configManager);
    } catch (error) {
      // For constructor errors, we throw them as configuration errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes("config")) {
        throw new Error(`Configuration invalid: ${errorMessage}`);
      }
      throw error;
    }
  }

  async checkInstallation(): Promise<void> {
    try {
      const result = await ClaudeDetectionService.detectClaude("auto");
      if (!result.isInstalled) {
        throw new Error(
          "Claude Code CLI not found in PATH. Please install Claude Code.",
        );
      }
    } catch (error) {
      this.logger.error(
        "Detection failed",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  async executeTask(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions = {},
  ): Promise<TaskResult> {
    try {
      return await this.executor.executeTask(
        task,
        model,
        workingDirectory,
        options,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes("timeout")) {
        this.logger.error(
          "Task execution timeout",
          error instanceof Error ? error : new Error(String(error)),
        );
      } else if (errorMessage.toLowerCase().includes("network")) {
        this.logger.error(
          "Network error during task execution",
          error instanceof Error ? error : new Error(String(error)),
        );
      } else if (errorMessage.toLowerCase().includes("rate limit")) {
        this.logger.warn(
          "Rate limit exceeded during task execution",
          error instanceof Error ? error : new Error(String(error)),
        );
      } else {
        this.logger.error(
          "Task execution failed",
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      throw error;
    }
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
    try {
      return await this.executor.executePipeline(
        tasks,
        model,
        workingDirectory,
        options,
        onProgress,
        onComplete,
        onError,
        () => this.pauseAfterCurrentTask,
        (tasks, index) =>
          this.onPipelinePaused(tasks, index, onProgress, onComplete, onError),
      );
    } catch (error) {
      this.logger.error(
        "Pipeline execution failed",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
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
          bypassPermissions: resolvedStep.with.bypass_permissions,
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
    try {
      return await this.executor.validateClaudeCommand(model);
    } catch (error) {
      this.logger.error(
        "Validation failed",
        error instanceof Error ? error : new Error(String(error)),
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("service unavailable")) {
        throw new Error("Service unavailable");
      }
      throw error;
    }
  }

  formatCommandPreview(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions,
  ): string {
    try {
      return this.executor.formatCommandPreview(
        task,
        model,
        workingDirectory,
        options,
      );
    } catch (error) {
      this.logger.error(
        "Preview generation failed",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  isValidModelId(modelId: string): boolean {
    try {
      return modelId === "auto" || this.configManager.validateModel(modelId);
    } catch (error) {
      this.logger.error(
        "Model validation failed",
        error instanceof Error ? error : new Error(String(error)),
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes("config")) {
        throw new Error(`Configuration invalid: ${errorMessage}`);
      }
      throw error;
    }
  }

  async pausePipelineExecution(): Promise<string | null> {
    // Set pause flag - don't modify current task status yet
    this.pauseAfterCurrentTask = true;

    // Generate unique pipeline ID for resume
    const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return pipelineId;
  }

  async resumePipelineExecution(pipelineId: string): Promise<boolean> {
    const pausedData = this.pausedPipelines.get(pipelineId);
    if (!pausedData) {
      return false;
    }

    // Resume from the paused task
    await this.executor.resumePipeline(
      pausedData.tasks,
      "claude-3-5-sonnet-20241022", // Default model
      "./", // Default working directory
      {},
      pausedData.onProgress,
      pausedData.onComplete,
      pausedData.onError,
      () => this.pauseAfterCurrentTask,
      (tasks, index) =>
        this.onPipelinePaused(
          tasks,
          index,
          pausedData.onProgress,
          pausedData.onComplete,
          pausedData.onError,
        ),
    );

    this.pausedPipelines.delete(pipelineId);
    return true;
  }

  getPausedPipelines(): Array<{
    id: string;
    pausedAt: number;
    taskCount: number;
  }> {
    return Array.from(this.pausedPipelines.entries()).map(([id, data]) => ({
      id,
      pausedAt: data.resetTime,
      taskCount: data.tasks.length,
    }));
  }

  private onPipelinePaused(
    tasks: TaskItem[],
    index: number,
    onProgress?: (tasks: TaskItem[], currentIndex: number) => void,
    onComplete?: (tasks: TaskItem[]) => void,
    onError?: (error: string, tasks: TaskItem[]) => void,
  ): void {
    // Generate pipeline ID
    const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store state for resume
    if (onProgress && onComplete && onError) {
      this.pausedPipelines.set(pipelineId, {
        tasks,
        currentIndex: index,
        resetTime: Date.now(),
        onProgress,
        onComplete,
        onError,
      });
    }

    // Clear pause flag
    this.pauseAfterCurrentTask = false;
  }
}
