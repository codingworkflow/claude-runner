import { spawn } from "child_process";
import { ConfigurationService } from "./ConfigurationService";
import { WorkflowService } from "./WorkflowService";
import { WorkflowExecution, StepOutput } from "../types/WorkflowTypes";
import { ClaudeDetectionService } from "./ClaudeDetectionService";

export interface TaskOptions {
  allowAllTools?: boolean;
  outputFormat?: "text" | "json" | "stream-json";
  maxTurns?: number;
  verbose?: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  continueConversation?: boolean;
  resumeSessionId?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpConfig?: string;
  permissionPromptTool?: string;
  workingDirectory?: string;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  sessionId?: string;
}

export type ConditionType = "on_success" | "on_failure" | "always";

/**
 * @deprecated Legacy interface - kept for UI compatibility
 * New code should use ClaudeWorkflow and ClaudeStep from WorkflowTypes
 */
export interface TaskItem {
  id: string;
  name?: string;
  prompt: string;
  resumeFromTaskId?: string;
  status: "pending" | "running" | "completed" | "error" | "paused" | "skipped";
  results?: string;
  sessionId?: string;
  model?: string;
  dependsOn?: string[];
  continueFrom?: string | null;
  pausedUntil?: number;
  check?: string;
  condition?: ConditionType;
  skipReason?: string;
}

export class ClaudeCodeService {
  private currentProcess: ReturnType<typeof spawn> | null = null;
  private currentPipelineExecution: {
    tasks: TaskItem[];
    currentIndex: number;
    onProgress: (tasks: TaskItem[], currentIndex: number) => void;
    onComplete: (tasks: TaskItem[]) => void;
    onError: (error: string, tasks: TaskItem[]) => void;
  } | null = null;
  private currentWorkflowExecution: WorkflowExecution | null = null;
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

  constructor(private readonly configService: ConfigurationService) {}

  async checkInstallation(): Promise<void> {
    const result = await ClaudeDetectionService.detectClaude("auto");
    if (!result.isInstalled) {
      throw new Error(
        "Claude Code CLI not found in PATH. Please install Claude Code.",
      );
    }
  }

  async runTask(
    task: string,
    model: string,
    rootPath: string,
    options: TaskOptions = {},
  ): Promise<string> {
    if (model !== "auto" && !this.configService.validateModel(model)) {
      throw new Error(`Invalid model: ${model}`);
    }

    if (!this.configService.validatePath(rootPath)) {
      throw new Error(`Invalid root path: ${rootPath}`);
    }

    const args = this.buildTaskCommand(task, model, options);
    const result = await this.executeCommand(args, rootPath);

    if (!result.success) {
      throw new Error(result.error ?? "Command execution failed");
    }

    // Extract result from JSON if output format is json
    if (options.outputFormat === "json") {
      return this.extractResultFromJson(result.output);
    }

    return result.output;
  }

  /**
   * @deprecated Legacy method - tasks are now converted to workflows internally
   * This method is kept for UI compatibility but internally creates a workflow
   */
  async runTaskPipeline(
    tasks: TaskItem[],
    model: string,
    rootPath: string,
    options: TaskOptions = {},
    onProgress: (tasks: TaskItem[], currentIndex: number) => void,
    onComplete: (tasks: TaskItem[]) => void,
    onError: (error: string, tasks: TaskItem[]) => void,
  ): Promise<void> {
    this.currentPipelineExecution = {
      tasks: [...tasks],
      currentIndex: 0,
      onProgress,
      onComplete,
      onError,
    };

    await this.executeTasksPipeline(model, rootPath, options);
  }

  private async executeTasksPipeline(
    model: string,
    rootPath: string,
    options: TaskOptions,
  ): Promise<void> {
    if (!this.currentPipelineExecution) {
      return;
    }

    const { tasks, onProgress, onComplete, onError } =
      this.currentPipelineExecution;

    let previousStepSuccess = true;

    for (let i = 0; i < tasks.length; i++) {
      if (!this.currentPipelineExecution) {
        // Pipeline was cancelled
        return;
      }

      this.currentPipelineExecution.currentIndex = i;
      const task = tasks[i];

      // Evaluate condition to determine if task should run
      const workingDirectory = options.workingDirectory ?? rootPath;
      const conditionResult = await this.evaluateCondition(
        task.check,
        task.condition,
        previousStepSuccess,
        workingDirectory,
      );

      if (!conditionResult.shouldRun) {
        // Skip task based on condition evaluation
        task.status = "skipped";
        task.skipReason = conditionResult.reason;
        onProgress([...tasks], i);
        continue;
      }

      // Update task status to running
      task.status = "running";
      onProgress([...tasks], i);

      try {
        const taskOptions: TaskOptions = { ...options };

        // Set resume session if this task should resume from another task
        if (task.resumeFromTaskId) {
          const sourceTask = tasks.find((t) => t.id === task.resumeFromTaskId);
          if (sourceTask?.sessionId) {
            taskOptions.resumeSessionId = sourceTask.sessionId;
          }
        }

        // Use task-specific model if specified, otherwise use pipeline default
        const taskModel = task.model ?? model;

        const result = await this.executeTaskCommand(
          task.prompt,
          taskModel,
          rootPath,
          taskOptions,
        );

        if (!result.success) {
          const errorOutput =
            result.error ?? result.output ?? "Task execution failed";
          const rateLimitCheck = this.detectRateLimit(errorOutput);

          if (rateLimitCheck.isRateLimited) {
            task.status = "paused";
            task.pausedUntil = rateLimitCheck.resetTime;
            task.results = "Rate limited - waiting for reset";

            // Generate unique pipeline ID
            const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Store state for resume
            if (rateLimitCheck.resetTime) {
              this.pausedPipelines.set(pipelineId, {
                tasks,
                currentIndex: i,
                resetTime: rateLimitCheck.resetTime,
                onProgress,
                onComplete,
                onError,
              });

              // Schedule auto-resume
              const delay = rateLimitCheck.resetTime - Date.now();
              if (delay > 0) {
                setTimeout(() => {
                  this.resumePipeline(pipelineId);
                }, delay);
              }
            }

            onProgress([...tasks], i);
            // Note: Rate limiting doesn't affect previousStepSuccess status
            return;
          }

          // Regular error handling - continue with remaining tasks
          task.status = "error";
          task.results = errorOutput;
          previousStepSuccess = false;
          onProgress([...tasks], i);
        }

        // Extract session ID and result from output
        const { sessionId, resultText } = this.parseTaskResult(
          result.output,
          taskOptions.outputFormat,
        );

        task.status = "completed";
        task.results = resultText;
        task.sessionId = sessionId;
        previousStepSuccess = true;

        onProgress([...tasks], i);
      } catch (error) {
        // Task failed with exception
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const rateLimitCheck = this.detectRateLimit(errorMessage);

        if (rateLimitCheck.isRateLimited) {
          task.status = "paused";
          task.pausedUntil = rateLimitCheck.resetTime;
          task.results = "Rate limited - waiting for reset";

          // Generate unique pipeline ID
          const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Store state for resume
          if (rateLimitCheck.resetTime) {
            this.pausedPipelines.set(pipelineId, {
              tasks,
              currentIndex: i,
              resetTime: rateLimitCheck.resetTime,
              onProgress,
              onComplete,
              onError,
            });

            // Schedule auto-resume
            const delay = rateLimitCheck.resetTime - Date.now();
            if (delay > 0) {
              setTimeout(() => {
                this.resumePipeline(pipelineId);
              }, delay);
            }
          }

          onProgress([...tasks], i);
          // Note: Rate limiting doesn't affect previousStepSuccess status
          return;
        }

        task.status = "error";
        task.results = errorMessage;
        previousStepSuccess = false;
        onProgress([...tasks], i);
      }
    }

    // Pipeline completed - check for errors
    this.currentPipelineExecution = null;
    const hasErrors = tasks.some((task) => task.status === "error");

    if (hasErrors) {
      const errorTasks = tasks.filter((task) => task.status === "error");
      const firstError = errorTasks[0];
      onError(firstError.results ?? "Task failed", [...tasks]);
    } else {
      onComplete([...tasks]);
    }
  }

  private async executeTaskCommand(
    task: string,
    model: string,
    rootPath: string,
    options: TaskOptions,
  ): Promise<CommandResult> {
    const args = this.buildTaskCommand(task, model, options);
    return await this.executeCommand(args, rootPath);
  }

  private parseTaskResult(
    output: string,
    outputFormat?: string,
  ): { sessionId?: string; resultText: string } {
    if (outputFormat === "json") {
      try {
        const jsonData = JSON.parse(output.trim());

        return {
          sessionId: jsonData.session_id,
          resultText: jsonData.result || JSON.stringify(jsonData, null, 2),
        };
      } catch (error) {
        console.warn("Failed to parse JSON output:", error);
        return { resultText: output };
      }
    }

    return { resultText: output };
  }

  private extractResultFromJson(output: string): string {
    try {
      // Try to parse the JSON response
      const jsonData = JSON.parse(output.trim());

      // Extract the result field if it exists
      if (jsonData && typeof jsonData.result === "string") {
        return jsonData.result;
      }

      // If no result field, return the full JSON formatted nicely
      return JSON.stringify(jsonData, null, 2);
    } catch (error) {
      // If parsing fails, return the original output
      console.warn("Failed to parse JSON output:", error);
      return output;
    }
  }

  private buildTaskCommand(
    task: string,
    model: string,
    options: TaskOptions,
  ): string[] {
    const args: string[] = ["claude"];

    if (options.continueConversation) {
      args.push("--continue");
    } else if (options.resumeSessionId) {
      args.push("-r", options.resumeSessionId);
      args.push("-p", this.escapeShellArg(task));
    } else {
      args.push("-p", this.escapeShellArg(task));
    }

    // Only add model flag if not 'auto' (which means use default)
    if (model !== "auto") {
      args.push("--model", model);
    }

    if (options.outputFormat && options.outputFormat !== "text") {
      args.push("--output-format", options.outputFormat);
    }

    if (options.maxTurns && options.maxTurns !== 10) {
      args.push("--max-turns", options.maxTurns.toString());
    }

    if (options.verbose) {
      args.push("--verbose");
    }

    if (!options.continueConversation && !options.resumeSessionId) {
      if (options.systemPrompt) {
        args.push("--system-prompt", options.systemPrompt);
      }

      if (options.appendSystemPrompt) {
        args.push("--append-system-prompt", options.appendSystemPrompt);
      }
    }

    if (options.allowAllTools) {
      args.push("--dangerously-skip-permissions");
    } else {
      if (options.allowedTools && options.allowedTools.length > 0) {
        args.push("--allowedTools", options.allowedTools.join(","));
      }

      if (options.disallowedTools && options.disallowedTools.length > 0) {
        args.push("--disallowedTools", options.disallowedTools.join(","));
      }
    }

    if (options.mcpConfig) {
      args.push("--mcp-config", options.mcpConfig);
    }

    if (
      options.permissionPromptTool &&
      !options.continueConversation &&
      !options.resumeSessionId
    ) {
      args.push("--permission-prompt-tool", options.permissionPromptTool);
    }

    return args;
  }

  buildInteractiveCommand(
    model: string,
    allowAllTools: boolean,
    prompt?: string,
  ): string[] {
    const args: string[] = ["claude"];

    // Add prompt if provided
    if (prompt) {
      args.push("-p", this.escapeShellArg(prompt));
    }

    // Only add model flag if not 'auto' (which means use default)
    if (model !== "auto") {
      args.push("--model", model);
    }

    // Add tool permissions
    if (allowAllTools) {
      args.push("--dangerously-skip-permissions");
    }

    return args;
  }

  cancelCurrentTask(): void {
    if (this.currentProcess) {
      // Cancelling current Claude task
      this.currentProcess.kill("SIGTERM");
      this.currentProcess = null;
    }

    // Cancel pipeline execution
    this.currentPipelineExecution = null;
  }

  isTaskRunning(): boolean {
    return this.currentProcess !== null;
  }

  public async executeCommand(
    args: string[],
    cwd: string,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      // NOSONAR S4721 - Safe OS command execution in VSCode extension context with validated args
      const child = spawn(args[0], args.slice(1), {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: process.env,
      });

      this.currentProcess = child;

      let stdout = "";
      let stderr = "";

      if (child.stdin) {
        child.stdin.end();
      }

      if (child.stdout) {
        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      }

      child.on("close", (code: number | null) => {
        this.currentProcess = null;

        const exitCode = code ?? 0;
        if (exitCode === 0) {
          resolve({
            success: true,
            output: stdout,
            exitCode,
          });
        } else {
          let errorMsg = stderr || `Command failed with exit code ${exitCode}`;
          if (exitCode === 127) {
            errorMsg = `Claude CLI not found in this terminal PATH. The installation itself is still registered – re-open VS Code or fix your PATH if you need it here.`;
          }
          resolve({
            success: false,
            output: stdout,
            error: errorMsg,
            exitCode,
          });
        }
      });

      child.on("error", (error: Error) => {
        this.currentProcess = null;
        resolve({
          success: false,
          output: "",
          error: `Spawn error: ${error.message}`,
          exitCode: -1,
        });
      });
    });
  }

  async validateClaudeCommand(model: string): Promise<boolean> {
    // Quick early-out so previews don't execute the binary if we already know it is not installed
    if (!ClaudeDetectionService.getCachedResult()?.isInstalled) {
      return false;
    }

    try {
      const args = ["claude"];
      if (model !== "auto") {
        args.push("--model", model);
      }
      args.push("-p", "test");
      const result = await this.executeCommand(args, process.cwd());
      return result.success;
    } catch {
      return false;
    }
  }

  formatCommandPreview(
    task: string,
    model: string,
    rootPath: string,
    options: TaskOptions,
  ): string {
    const args = this.buildTaskCommand(task, model, options);
    return `cd "${rootPath}" && ${args.join(" ")}`;
  }

  escapeShellArg(arg: string): string {
    // Wrap in single quotes and escape any single quotes inside
    return `'${arg.replace(/'/g, "'\"'\"'")}'`;
  }

  isValidModelId(modelId: string): boolean {
    return modelId === "auto" || this.configService.validateModel(modelId);
  }

  private detectRateLimit(output: string): {
    isRateLimited: boolean;
    resetTime?: number;
  } {
    const match = output.match(/Claude AI usage limit reached\|(\d+)/);
    if (match) {
      return {
        isRateLimited: true,
        resetTime: parseInt(match[1], 10) * 1000,
      };
    }
    return { isRateLimited: false };
  }

  private async resumePipeline(pipelineId: string): Promise<void> {
    const pausedState = this.pausedPipelines.get(pipelineId);
    if (!pausedState) {
      return;
    }

    this.pausedPipelines.delete(pipelineId);

    // Restore pipeline execution state
    this.currentPipelineExecution = {
      tasks: pausedState.tasks,
      currentIndex: pausedState.currentIndex,
      onProgress: pausedState.onProgress,
      onComplete: pausedState.onComplete,
      onError: pausedState.onError,
    };

    // Resume from the paused task
    const resumeIndex = pausedState.currentIndex;
    if (resumeIndex < pausedState.tasks.length) {
      pausedState.tasks[resumeIndex].status = "pending";
      pausedState.tasks[resumeIndex].pausedUntil = undefined;
    }

    // Continue pipeline execution
    await this.executeTasksPipeline(
      pausedState.tasks[resumeIndex]?.model ?? "auto",
      "/",
      {},
    );
  }

  /**
   * Execute a workflow
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
    this.currentWorkflowExecution = execution;
    const steps = workflowService.getExecutionSteps(execution.workflow);

    try {
      for (const { step, index } of steps) {
        if (!this.currentWorkflowExecution) {
          // Workflow was cancelled
          return;
        }

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
          const result = await this.executeTaskCommand(
            resolvedStep.with.prompt,
            resolvedStep.with.model ?? defaultModel,
            taskOptions.workingDirectory ?? rootPath,
            taskOptions,
          );

          if (!result.success) {
            throw new Error(result.error ?? "Task execution failed");
          }

          // Parse the result
          const { sessionId, resultText } = this.parseTaskResult(
            result.output,
            "json",
          );

          const output: StepOutput = {
            result: resultText,
          };

          // Add session_id to output if requested
          if (resolvedStep.with.output_session && sessionId) {
            output.session_id = sessionId;
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
      this.currentWorkflowExecution = null;
      onComplete();
    } catch (error) {
      execution.status = "failed";
      execution.error = error instanceof Error ? error.message : String(error);
      this.currentWorkflowExecution = null;
      onError(execution.error);
    }
  }

  /**
   * Cancel current workflow execution
   */
  cancelWorkflow(): void {
    this.currentWorkflowExecution = null;
    this.cancelCurrentTask();
  }

  /**
   * Evaluate whether a step should run based on its condition and check command
   */
  async evaluateCondition(
    checkCommand: string | undefined,
    condition: ConditionType | undefined,
    previousStepSuccess: boolean,
    workingDirectory: string,
  ): Promise<{ shouldRun: boolean; reason?: string }> {
    // If no condition is specified, default to "always" (KISS principle)
    if (!condition) {
      return { shouldRun: true };
    }

    // Handle condition-based logic
    let conditionMet = false;
    switch (condition) {
      case "always":
        conditionMet = true;
        break;
      case "on_success":
        conditionMet = previousStepSuccess;
        break;
      case "on_failure":
        conditionMet = !previousStepSuccess;
        break;
      default:
        conditionMet = previousStepSuccess;
    }

    // If condition is not met, skip the step
    if (!conditionMet) {
      const reason = `Condition '${condition}' not met (previous step ${previousStepSuccess ? "succeeded" : "failed"})`;
      return { shouldRun: false, reason };
    }

    // If no check command, and condition is met, run the step
    if (!checkCommand) {
      return { shouldRun: true };
    }

    // Execute the check command to determine if step should run
    try {
      const result = await this.executeCommand(
        checkCommand.split(" "),
        workingDirectory,
      );

      if (result.success) {
        return { shouldRun: true };
      } else {
        const reason = `Check command failed: ${result.error ?? "Command returned non-zero exit code"}`;
        return { shouldRun: false, reason };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const reason = `Check command execution failed: ${errorMessage}`;
      return { shouldRun: false, reason };
    }
  }
}
