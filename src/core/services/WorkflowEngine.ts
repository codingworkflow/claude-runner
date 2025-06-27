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

export class WorkflowEngine {
  constructor(
    private readonly logger: ILogger,
    private readonly fileSystem: IFileSystem,
    private readonly executor: ClaudeExecutor,
  ) {}

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
   * Execute a workflow
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
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const steps = this.getExecutionSteps(execution.workflow);
    let stepsExecuted = 0;

    try {
      execution.status = "running";

      for (const { step, index } of steps) {
        const stepId = step.id ?? `step-${index}`;
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

          // Add session_id to output if requested
          if (resolvedStep.with.output_session && result.sessionId) {
            output.session_id = result.sessionId;
          }

          // Update execution with output
          this.updateExecutionOutput(execution, stepId, output);
          onStepProgress?.(stepId, "completed", output);
          stepsExecuted++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          onStepProgress?.(stepId, "failed", { result: errorMessage });
          throw error;
        }
      }

      execution.status = "completed";
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
    const context = {
      inputs: execution.inputs,
      env: { ...execution.workflow.env },
      steps: execution.outputs,
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
        resolvedStep.with[key] = WorkflowParser.resolveVariables(
          value,
          context,
        );
      }
    }

    return resolvedStep;
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
}
