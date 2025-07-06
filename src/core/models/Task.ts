/**
 * Core task types - platform-agnostic
 */

export type ConditionType = "on_success" | "on_failure" | "always";

export interface TaskOptions {
  allowAllTools?: boolean;
  bypassPermissions?: boolean;
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

export interface ExecutionOptions {
  model?: string;
  workingDirectory?: string;
  timeoutMs?: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  output: string;
  sessionId?: string;
  error?: string;
  executionTimeMs: number;
}

export interface WorkflowOptions extends ExecutionOptions {
  inputs?: Record<string, string>;
  environment?: Record<string, string>;
}

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
  executionTimeMs: number;
  stepsExecuted: number;
}
