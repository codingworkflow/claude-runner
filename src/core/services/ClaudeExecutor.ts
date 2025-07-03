import { spawn } from "child_process";
import {
  TaskOptions,
  CommandResult,
  TaskItem,
  TaskResult,
} from "../models/Task";
import { ILogger, IConfigManager } from "../interfaces";

interface RateLimitInfo {
  isLimited: boolean;
  resetTime?: Date;
  waitTime?: number; // milliseconds
  isTimeout?: boolean; // true if wait time > 6 hours
}

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
      const result = await this.executeCommand(
        args,
        workingDirectory,
        options.outputFormat,
      );

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

  async executeTaskWithRetry(
    task: string,
    model: string,
    workingDirectory: string,
    options: TaskOptions = {},
    maxRetries: number = 3,
  ): Promise<CommandResult> {
    let totalWaitTime = 0;
    const maxCumulativeWait = 90 * 60 * 1000; // 90% of timeout (2 hours) = 108 minutes
    let sessionId: string | undefined = options.resumeSessionId;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Preserve session ID across retries for continuity
        const retryOptions = { ...options };
        if (sessionId && attempt > 0) {
          retryOptions.resumeSessionId = sessionId;
        }

        const args = this.buildTaskCommand(task, model, retryOptions);
        const result = await this.executeCommand(
          args,
          workingDirectory,
          retryOptions.outputFormat,
        );

        if (result.success) {
          return result;
        }

        // Store session ID for potential retry
        if (result.sessionId) {
          sessionId = result.sessionId;
        }

        // Handle EXIT 1 from Claude CLI process - check for rate limit
        if (result.exitCode === 1) {
          const rateLimitInfo = this.detectRateLimit(
            result.output ?? "",
            result.error,
          );

          if (rateLimitInfo.isLimited && attempt < maxRetries - 1) {
            if (
              totalWaitTime + (rateLimitInfo.waitTime ?? 0) >
              maxCumulativeWait
            ) {
              throw new Error(
                `Cumulative wait time would exceed timeout limit`,
              );
            }

            totalWaitTime += rateLimitInfo.waitTime ?? 0;
            this.logger.info(
              `Rate limit detected, attempt ${attempt + 1}/${maxRetries}. Waiting...`,
            );
            await this.waitForRateLimit(rateLimitInfo);
            continue;
          }
        }

        // Non-rate-limit error or final attempt
        throw new Error(result.error ?? "Command execution failed");
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }

        // Check if this is a rate limit error in the exception
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const rateLimitInfo = this.detectRateLimit("", errorMessage);

        if (rateLimitInfo.isLimited) {
          if (
            totalWaitTime + (rateLimitInfo.waitTime ?? 0) >
            maxCumulativeWait
          ) {
            throw new Error(`Cumulative wait time would exceed timeout limit`);
          }

          totalWaitTime += rateLimitInfo.waitTime ?? 0;
          this.logger.info(
            `Rate limit detected in error, attempt ${attempt + 1}/${maxRetries}. Waiting...`,
          );
          await this.waitForRateLimit(rateLimitInfo);
          continue;
        }

        throw error;
      }
    }

    throw new Error("Maximum retries exceeded");
  }

  async executePipeline(
    tasks: TaskItem[],
    model: string,
    workingDirectory: string,
    options: TaskOptions = {},
    onProgress?: (tasks: TaskItem[], currentIndex: number) => void,
    onComplete?: (tasks: TaskItem[]) => void,
    onError?: (error: string, tasks: TaskItem[]) => void,
    pauseChecker?: () => boolean,
    onPause?: (tasks: TaskItem[], index: number) => void,
  ): Promise<void> {
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // Check if pause was requested before starting this task
      if (pauseChecker?.()) {
        // Pause at this task
        task.status = "paused";
        task.results = "MANUALLY PAUSED";
        onPause?.(tasks, i);

        // Check if this is the last task or no pending tasks remain
        const hasRemainingTasks = tasks
          .slice(i + 1)
          .some((t) => t.status === "pending");
        if (!hasRemainingTasks) {
          // No more tasks to run, treat as completed
          onComplete?.(tasks);
        }
        return; // Exit pipeline execution
      }

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

          // Check for rate limit and handle with retry logic
          const rateLimitCheck = this.detectRateLimit(
            result.output ?? "",
            result.error,
          );

          if (rateLimitCheck.isLimited) {
            task.status = "paused";
            task.pausedUntil = rateLimitCheck.resetTime?.getTime();
            task.results = `Rate limited - waiting for reset until ${rateLimitCheck.resetTime?.toLocaleString()}`;
            onProgress?.(tasks, i);

            this.logger.warn(
              `Rate limit detected, pausing pipeline execution until ${rateLimitCheck.resetTime?.toLocaleString()}`,
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
    pauseChecker?: () => boolean,
    onPause?: (tasks: TaskItem[], index: number) => void,
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
      tasks[resumeIndex].results = undefined;
      delete tasks[resumeIndex].pausedUntil;
      delete (tasks[resumeIndex] as unknown as { pausedAtIndex?: number })
        .pausedAtIndex;
    }

    // Continue pipeline execution from the resume point
    for (let i = resumeIndex; i < tasks.length; i++) {
      const task = tasks[i];

      // Check if pause was requested before starting this task
      if (pauseChecker?.()) {
        // Pause at this task
        task.status = "paused";
        task.results = "MANUALLY PAUSED";
        onPause?.(tasks, i);

        // Check if this is the last task or no pending tasks remain
        const hasRemainingTasks = tasks
          .slice(i + 1)
          .some((t) => t.status === "pending");
        if (!hasRemainingTasks) {
          // No more tasks to run, treat as completed
          onComplete?.(tasks);
        }
        return; // Exit pipeline execution
      }

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

          // Check for rate limit and handle with retry logic
          const rateLimitCheck = this.detectRateLimit(
            result.output ?? "",
            result.error,
          );

          if (rateLimitCheck.isLimited) {
            task.status = "paused";
            task.pausedUntil = rateLimitCheck.resetTime?.getTime();
            task.results = `Rate limited (resume) - waiting for reset until ${rateLimitCheck.resetTime?.toLocaleString()}`;
            onProgress?.(tasks, i);

            this.logger.warn(
              `Rate limit detected during resume, pausing pipeline execution until ${rateLimitCheck.resetTime?.toLocaleString()}`,
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
    return await this.executeCommand(
      args,
      workingDirectory,
      options.outputFormat,
    );
  }

  protected async executeCommand(
    args: string[],
    cwd: string,
    outputFormat?: string,
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
          // Extract sessionId if output format is JSON
          let sessionId: string | undefined;
          if (outputFormat === "json") {
            const parsed = this.parseTaskResult(stdout, outputFormat);
            sessionId = parsed.sessionId;
          }

          resolve({
            success: true,
            output: stdout,
            exitCode,
            sessionId,
          });
        } else {
          // if stderr is empty, fall back to stdout (so we catch "usage limit reached" there)
          const stderrTrim = stderr.trim();
          const stdoutTrim = stdout.trim();
          let errorMsg =
            stderrTrim ||
            stdoutTrim ||
            `Command failed with exit code ${exitCode}`;
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

    // Match Go CLI logic: if (e.autoAccept || step.AllowAllTools)
    if (
      (options.bypassPermissions ?? false) ||
      (options.allowAllTools ?? false)
    ) {
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

        // Handle both simple and complex Claude CLI JSON formats
        let sessionId = jsonData.session_id;
        let resultText = jsonData.result;

        // If session_id is not at root level, it might be in a wrapper
        if (!sessionId && jsonData.type === "result") {
          sessionId = jsonData.session_id;
          resultText = jsonData.result;
        }

        return {
          sessionId,
          resultText: resultText || JSON.stringify(jsonData, null, 2),
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

  private detectRateLimit(output: string, stderr?: string): RateLimitInfo {
    // Use exact pattern from Go CLI internal/executor/ratelimit.go
    const pattern = /Claude AI usage limit reached\|(\d+)/;
    const fullOutput = `${output} ${stderr ?? ""}`;

    const match = pattern.exec(fullOutput);
    if (!match) {
      return { isLimited: false };
    }

    const timestampStr = match[1];
    const resetTimestamp = parseInt(timestampStr, 10);

    // Handle invalid timestamps
    if (isNaN(resetTimestamp)) {
      return { isLimited: false };
    }

    const resetTime = new Date(resetTimestamp * 1000); // Convert Unix timestamp to milliseconds
    const waitTime = resetTime.getTime() - Date.now();

    // Simple 6-hour timeout detection (like Go CLI)
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    if (waitTime > SIX_HOURS_MS) {
      // Mark as timeout instead of normal rate limit
      return {
        isLimited: true,
        resetTime,
        waitTime: Math.max(0, waitTime),
        isTimeout: true,
      };
    }

    return {
      isLimited: true,
      resetTime,
      waitTime: Math.max(0, waitTime),
    };
  }

  private async waitForRateLimit(
    rateLimitInfo: RateLimitInfo,
    maxWaitTime: number = 30 * 60 * 1000, // 30 minutes maximum
  ): Promise<void> {
    if (!rateLimitInfo.isLimited || !rateLimitInfo.waitTime) {
      return;
    }

    const waitTime = Math.min(rateLimitInfo.waitTime, maxWaitTime);

    if (waitTime <= 0) {
      return;
    }

    const endTime = Date.now() + waitTime;
    const waitMinutes = Math.round(waitTime / 1000 / 60);

    this.logger.warn(
      `Rate limit detected. Waiting ${waitMinutes} minutes until ${rateLimitInfo.resetTime?.toLocaleString()}`,
    );

    // Show progress updates every 30 seconds
    const updateInterval = 30 * 1000;
    let lastUpdate = Date.now();

    while (Date.now() < endTime) {
      const remaining = endTime - Date.now();

      if (Date.now() - lastUpdate >= updateInterval) {
        const remainingMinutes = Math.ceil(remaining / 1000 / 60);
        this.logger.info(
          `Waiting for rate limit reset... ${remainingMinutes} minutes remaining`,
        );
        lastUpdate = Date.now();
      }

      // Sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.logger.info("Rate limit wait period completed");
  }
}
