/**
 * GitHub Actions workflow types for Claude Pipeline
 * Based on GitHub Actions workflow syntax with Claude-specific extensions
 */

export type ConditionType = "on_success" | "on_failure" | "always";

export interface ClaudeWorkflow {
  name: string;
  on?: WorkflowTrigger;
  inputs?: Record<string, WorkflowInput>;
  env?: Record<string, string>;
  jobs: Record<string, Job>;
}

export interface WorkflowTrigger {
  workflow_dispatch?: {
    inputs?: Record<string, WorkflowInput>;
  };
  [key: string]: unknown;
}

export interface WorkflowInput {
  description?: string;
  required?: boolean;
  default?: string;
  type?: "string" | "boolean" | "choice";
  options?: string[];
}

export interface Job {
  name?: string;
  "runs-on"?: string;
  env?: Record<string, string>;
  steps: Step[];
}

export interface Step {
  id?: string;
  name?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  run?: string;
  if?: string;
  "continue-on-error"?: boolean;
}

export interface ClaudeStep extends Step {
  uses: string; // Must include 'claude-pipeline-action'
  with: {
    prompt: string;
    model?: string;
    allow_all_tools?: boolean;
    bypass_permissions?: boolean;
    working_directory?: string;
    resume_session?: string;
    output_session?: boolean;
    check?: string;
    condition?: ConditionType;
    [key: string]: unknown;
  };
}

export interface StepOutput {
  session_id?: string;
  result?: string;
  [key: string]: unknown;
}

export interface WorkflowExecution {
  workflow: ClaudeWorkflow;
  inputs: Record<string, string>;
  outputs: Record<string, StepOutput>;
  currentStep: number;
  status: "pending" | "running" | "completed" | "failed" | "paused" | "timeout";
  error?: string;
}

export interface WorkflowMetadata {
  id: string;
  name: string;
  description?: string;
  created: Date;
  modified: Date;
  path: string;
}

// Type guards
export function isClaudeStep(step: Step): step is ClaudeStep {
  return (
    !!step.uses &&
    (step.uses.includes("claude-pipeline-action") || step.uses === "claude")
  );
}

export function hasSessionOutput(_step: ClaudeStep): boolean {
  // Auto-detect if session output is needed (no longer depends on output_session parameter)
  return true; // For now, always capture session - the system will auto-detect usage
}

export function getSessionReference(value: string): string | null {
  // Only handle simple format: just the step ID (KISS approach)
  // NO LONGER SUPPORT old complex format: ${{ steps.stepId.outputs.session_id }}
  const simpleMatch = value.match(/^([a-zA-Z0-9_-]+)$/);
  if (simpleMatch) {
    return simpleMatch[1];
  }

  // Return null for any complex format - this will cause validation to fail
  return null;
}
