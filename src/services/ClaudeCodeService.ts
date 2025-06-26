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

/**
 * @deprecated Legacy interface - kept for UI compatibility
 * New code should use ClaudeWorkflow and ClaudeStep from WorkflowTypes
 */
export interface TaskItem {
  id: string;
  name?: string;
  prompt: string;
  resumePrevious: boolean;
  status: "pending" | "running" | "completed" | "error";
  results?: string;
  sessionId?: string;
  model?: string;
  dependsOn?: string[];
  continueFrom?: string | null;
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
    let lastSessionId: string | undefined;

    for (let i = 0; i < tasks.length; i++) {
      if (!this.currentPipelineExecution) {
        // Pipeline was cancelled
        return;
      }

      this.currentPipelineExecution.currentIndex = i;
      const task = tasks[i];

      // Update task status to running
      task.status = "running";
      onProgress([...tasks], i);

      try {
        const taskOptions: TaskOptions = { ...options };

        // Set resume session if this task should resume previous
        if (task.resumePrevious && lastSessionId) {
          taskOptions.resumeSessionId = lastSessionId;
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
          // Task failed, update status and stop pipeline
          task.status = "error";
          task.results = result.error ?? "Task execution failed";
          onError(result.error ?? "Task execution failed", [...tasks]);
          return;
        }

        // Extract session ID and result from output
        const { sessionId, resultText } = this.parseTaskResult(
          result.output,
          taskOptions.outputFormat,
        );

        task.status = "completed";
        task.results = resultText;
        task.sessionId = sessionId;
        lastSessionId = sessionId;

        onProgress([...tasks], i);
      } catch (error) {
        // Task failed with exception
        task.status = "error";
        task.results = error instanceof Error ? error.message : String(error);
        onError(task.results, [...tasks]);
        return;
      }
    }

    // All tasks completed successfully
    this.currentPipelineExecution = null;
    onComplete([...tasks]);
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
}
