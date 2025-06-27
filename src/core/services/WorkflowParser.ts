import * as yaml from "js-yaml";
import {
  ClaudeWorkflow,
  Step,
  ClaudeStep,
  isClaudeStep,
  getSessionReference,
} from "../models/Workflow";

export class WorkflowParser {
  /**
   * Parse YAML content into a ClaudeWorkflow object
   */
  static parseYaml(content: string): ClaudeWorkflow {
    try {
      const workflow = yaml.load(content) as ClaudeWorkflow;
      this.validateWorkflow(workflow);
      return workflow;
    } catch (error) {
      throw new Error(
        `Failed to parse workflow YAML: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate workflow structure
   */
  private static validateWorkflow(workflow: ClaudeWorkflow): void {
    if (!workflow.name) {
      throw new Error("Workflow must have a name");
    }

    if (!workflow.jobs || Object.keys(workflow.jobs).length === 0) {
      throw new Error("Workflow must have at least one job");
    }

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (!job.steps || job.steps.length === 0) {
        throw new Error(`Job '${jobName}' must have at least one step`);
      }

      // Validate Claude steps
      const claudeSteps = job.steps.filter(isClaudeStep);
      for (const step of claudeSteps) {
        this.validateClaudeStep(step);
      }

      // Validate session references
      this.validateSessionReferences(job.steps);
    }
  }

  /**
   * Validate a Claude step
   */
  private static validateClaudeStep(step: ClaudeStep): void {
    if (!step.with.prompt) {
      throw new Error(
        `Claude step '${step.name ?? step.id ?? "unnamed"}' must have a prompt`,
      );
    }

    // Validate resume_session references
    if (step.with.resume_session) {
      const ref = getSessionReference(step.with.resume_session);
      if (!ref) {
        throw new Error(
          `Invalid session reference in step '${step.name ?? step.id}': ${step.with.resume_session}`,
        );
      }
    }

    // Validate conditional step properties
    this.validateConditionalStep(step);
  }

  /**
   * Validate conditional step properties
   */
  private static validateConditionalStep(step: ClaudeStep): void {
    // Validate check command if present
    if (step.with.check && typeof step.with.check !== "string") {
      throw new Error(
        `Check command in step '${step.name ?? step.id ?? "unnamed"}' must be a string`,
      );
    }

    // Validate condition type if present
    if (step.with.condition) {
      const validConditions = ["on_success", "on_failure", "always"];
      if (!validConditions.includes(step.with.condition as string)) {
        throw new Error(
          `Invalid condition type in step '${step.name ?? step.id ?? "unnamed"}': ${step.with.condition}. Must be one of: ${validConditions.join(", ")}`,
        );
      }
    }

    // Validate that check command is provided when condition is specified
    if (step.with.condition && !step.with.check) {
      throw new Error(
        `Step '${step.name ?? step.id ?? "unnamed"}' has condition '${step.with.condition}' but no check command specified`,
      );
    }
  }

  /**
   * Validate that session references point to valid steps
   */
  private static validateSessionReferences(steps: Step[]): void {
    const stepIds = new Set(
      steps.filter((s) => s.id).map((s) => s.id as string),
    );

    for (const step of steps) {
      if (isClaudeStep(step) && step.with.resume_session) {
        const ref = getSessionReference(step.with.resume_session);
        if (ref && !stepIds.has(ref)) {
          throw new Error(
            `Step '${step.name ?? step.id}' references unknown step '${ref}'`,
          );
        }
      }
    }
  }

  /**
   * Extract Claude steps from a workflow
   */
  static extractClaudeSteps(workflow: ClaudeWorkflow): ClaudeStep[] {
    const claudeSteps: ClaudeStep[] = [];

    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (isClaudeStep(step)) {
          claudeSteps.push(step);
        }
      }
    }

    return claudeSteps;
  }

  /**
   * Resolve variable references in a string
   */
  static resolveVariables(
    template: string,
    context: {
      inputs?: Record<string, string>;
      env?: Record<string, string>;
      steps?: Record<string, unknown>;
    },
  ): string {
    let resolved = template;

    // Resolve inputs
    if (context.inputs) {
      resolved = resolved.replace(
        /\$\{\{\s*inputs\.(\w+)\s*\}\}/g,
        (_, key) => {
          return context.inputs?.[key] ?? "";
        },
      );
    }

    // Resolve env
    if (context.env) {
      resolved = resolved.replace(/\$\{\{\s*env\.(\w+)\s*\}\}/g, (_, key) => {
        return context.env?.[key] ?? "";
      });
    }

    // Resolve step outputs
    if (context.steps) {
      resolved = resolved.replace(
        /\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}/g,
        (_, stepId, outputKey) => {
          const step = context.steps?.[stepId];
          if (step && typeof step === "object" && "outputs" in step) {
            const outputs = (step as { outputs: Record<string, unknown> })
              .outputs;
            return String(outputs[outputKey] ?? "");
          }
          return "";
        },
      );
    }

    return resolved;
  }

  /**
   * Convert workflow to string (YAML format)
   */
  static toYaml(workflow: ClaudeWorkflow): string {
    return yaml.dump(workflow, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
  }
}
