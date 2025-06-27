import { spawn } from "child_process";
import {
  TaskOptions,
  CommandResult,
  TaskItem,
  TaskResult,
} from "../models/Task";
import { ILogger, IConfigManager } from "../interfaces";

export class ClaudeExecutor {
  private currentProcess: ReturnType<typeof spawn> | null = null;

  constructor(
    private readonly logger: ILogger,
    private readonly config: IConfigManager,
  ) {}

  async executeTask(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions = {},
  ): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      if (model !== "auto" && !this.config.validateModel(model)) {
        throw new Error(`Invalid model: ${model}`);
      }

      if (!this.config.validatePath(workingDirectory)) {
        throw new Error(`Invalid working directory: ${workingDirectory}`);
      }

      const args = this.buildTaskCommand(task, model, options);
      const result = await this.executeCommand(args, workingDirectory);

      if (!result.success) {
        throw new Error(result.error ?? "Command execution failed");
      }

      // Extract result from JSON if output format is json
      let output = result.output;
      if (options.outputFormat === "json") {
        output = this.extractResultFromJson(result.output);
      }

      const executionTime = Date.now() - startTime;

      return {
        taskId: `task-${Date.now()}`,
        success: true,
        output,
        sessionId: result.sessionId,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "Task execution failed",
        error instanceof Error ? error : new Error(errorMessage),
      );

      return {
        taskId: `task-${Date.now()}`,
        success: false,
        output: "",
        error: errorMessage,
        executionTimeMs: executionTime,
      };
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
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // Update task status to running
      task.status = "running";
      onProgress?.(tasks, i);

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
          workingDirectory,
          taskOptions,
        );

        if (!result.success) {
          const errorOutput =
            result.error ?? result.output ?? "Task execution failed";

          // Check for rate limit in both output and error message
          const rateLimitCheck = this.detectRateLimit(
            result.output || "",
            result.error,
          );

          if (rateLimitCheck.isRateLimited) {
            task.status = "paused";
            task.pausedUntil = rateLimitCheck.resetTime;
            task.results = `Rate limited - waiting for reset until ${new Date(rateLimitCheck.resetTime ?? 0).toLocaleString()}`;
            onProgress?.(tasks, i);

            this.logger.warn(
              `Rate limit detected, pausing pipeline execution until ${new Date(rateLimitCheck.resetTime ?? 0).toLocaleString()}`,
            );

            // Store the failed task index for resumption
            (task as unknown as { pausedAtIndex: number }).pausedAtIndex = i;
            return;
          }

          // Regular error handling
          task.status = "error";
          task.results = errorOutput;
          onError?.(errorOutput, tasks);
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

        onProgress?.(tasks, i);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        task.status = "error";
        task.results = errorMessage;
        onError?.(errorMessage, tasks);
        return;
      }
    }

    // All tasks completed successfully
    onComplete?.(tasks);
  }

  cancelCurrentTask(): void {
    if (this.currentProcess) {
      this.logger.info("Cancelling current Claude task");
      this.currentProcess.kill("SIGTERM");
      this.currentProcess = null;
    }
  }

  isTaskRunning(): boolean {
    return this.currentProcess !== null;
  }

  async resumePipeline(
    tasks: TaskItem[],
    model: string,
    workingDirectory: string,
    options: TaskOptions = {},
    onProgress?: (tasks: TaskItem[], currentIndex: number) => void,
    onComplete?: (tasks: TaskItem[]) => void,
    onError?: (error: string, tasks: TaskItem[]) => void,
  ): Promise<void> {
    // Find the first paused task or the task after the last completed one
    let resumeIndex = tasks.findIndex((task) => task.status === "paused");
    if (resumeIndex === -1) {
      resumeIndex = tasks.findIndex((task) => task.status === "pending");
    }
    if (resumeIndex === -1) {
      this.logger.info("No tasks to resume - all tasks completed");
      onComplete?.(tasks);
      return;
    }

    // Reset the paused task to pending if it was paused
    if (tasks[resumeIndex].status === "paused") {
      tasks[resumeIndex].status = "pending";
      delete tasks[resumeIndex].pausedUntil;
      delete (tasks[resumeIndex] as unknown as { pausedAtIndex?: number })
        .pausedAtIndex;
    }

    // Continue pipeline execution from the resume point
    for (let i = resumeIndex; i < tasks.length; i++) {
      const task = tasks[i];

      // Update task status to running
      task.status = "running";
      onProgress?.(tasks, i);

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
          workingDirectory,
          taskOptions,
        );

        if (!result.success) {
          const errorOutput =
            result.error ?? result.output ?? "Task execution failed";

          // Check for rate limit in both output and error message
          const rateLimitCheck = this.detectRateLimit(
            result.output || "",
            result.error,
          );

          if (rateLimitCheck.isRateLimited) {
            task.status = "paused";
            task.pausedUntil = rateLimitCheck.resetTime;
            task.results = `Rate limited - waiting for reset until ${new Date(rateLimitCheck.resetTime ?? 0).toLocaleString()}`;
            onProgress?.(tasks, i);

            this.logger.warn(
              `Rate limit detected during resume, pausing pipeline execution until ${new Date(rateLimitCheck.resetTime ?? 0).toLocaleString()}`,
            );

            // Store the failed task index for resumption
            (task as unknown as { pausedAtIndex: number }).pausedAtIndex = i;
            return;
          }

          // Regular error handling
          task.status = "error";
          task.results = errorOutput;
          onError?.(errorOutput, tasks);
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

        onProgress?.(tasks, i);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        task.status = "error";
        task.results = errorMessage;
        onError?.(errorMessage, tasks);
        return;
      }
    }

    // All tasks completed successfully
    onComplete?.(tasks);
  }

  async validateClaudeCommand(model: string): Promise<boolean> {
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
    workingDirectory: string,
    options: TaskOptions,
  ): string {
    const args = this.buildTaskCommand(task, model, options);
    return `cd "${workingDirectory}" && ${args.join(" ")}`;
  }

  private async executeTaskCommand(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions,
  ): Promise<CommandResult> {
    const args = this.buildTaskCommand(task, model, options);
    return await this.executeCommand(args, workingDirectory);
  }

  protected async executeCommand(
    args: string[],
    cwd: string,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
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
            errorMsg = `Claude CLI not found in PATH. Please install Claude Code CLI.`;
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
        this.logger.warn(
          "Failed to parse JSON output",
          error instanceof Error ? error : new Error(String(error)),
        );
        return { resultText: output };
      }
    }

    return { resultText: output };
  }

  private extractResultFromJson(output: string): string {
    try {
      const jsonData = JSON.parse(output.trim());

      if (jsonData && typeof jsonData.result === "string") {
        return jsonData.result;
      }

      return JSON.stringify(jsonData, null, 2);
    } catch (error) {
      this.logger.warn(
        "Failed to parse JSON output",
        error instanceof Error ? error : new Error(String(error)),
      );
      return output;
    }
  }

  private escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\"'\"'")}'`;
  }

  private detectRateLimit(
    output: string,
    stderr?: string,
  ): {
    isRateLimited: boolean;
    resetTime?: number;
  } {
    // Check both stdout and stderr for rate limit messages
    const fullOutput = `${output} ${stderr ?? ""}`;
    const match = fullOutput.match(/Claude AI usage limit reached\|(\d+)/);
    if (match) {
      return {
        isRateLimited: true,
        resetTime: parseInt(match[1], 10) * 1000,
      };
    }
    return { isRateLimited: false };
  }
}
