/**
 * TypeScript interfaces for Job Log system - matches Go CLI internal/types/job_log.go
 * Provides full compatibility with Go CLI job logging for resume functionality
 */

export interface JobLogStep {
  stepIndex: number;
  stepId: string;
  stepName: string;
  status: "completed" | "failed" | "running";
  startTime: string; // ISO string
  endTime?: string;
  durationMs: number;
  output?: string;
  error?: string;
  sessionId?: string;
  resumeSession?: string;
}

export interface JobLog {
  workflowName: string;
  workflowFile: string;
  executionId: string;
  startTime: string;
  lastUpdateTime: string;
  status: "running" | "paused" | "completed" | "failed";
  lastCompletedStep: number; // -1 if none completed
  totalSteps: number;
  steps: JobLogStep[];
}
