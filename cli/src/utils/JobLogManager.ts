/**
 * JobLogManager - Manages job execution logs for resume functionality
 *
 * Provides full compatibility with Go CLI job logging system:
 * - Generates .job.json files alongside workflow files like Go CLI's GetJobLogPath()
 * - Persists job state with saveJobLog/loadJobLog matching Go CLI's SaveToFile/LoadFromFile
 * - Creates new job logs with createJobLog matching Go CLI's NewJobLog()
 * - Handles step tracking with addStep including deduplication like Go CLI's AddStep()
 */

import * as fs from "fs/promises";
import * as path from "path";
import { JobLog, JobLogStep } from "../types/JobLog";

export class JobLogManager {
  private static executionCounter = 0;
  /**
   * Generate job log file path - matches Go CLI's GetJobLogPath()
   * Creates {workflow-name}.job.json alongside the workflow file
   *
   * @param workflowFile - Path to the workflow file
   * @returns Path to the job log file
   */
  static getJobLogPath(workflowFile: string): string {
    const base = path.basename(workflowFile, path.extname(workflowFile));
    const dir = path.dirname(workflowFile);
    const jobLogName = `${base}.job.json`;

    // Preserve relative path prefixes like './' by manually constructing path
    if (workflowFile.startsWith("./")) {
      if (dir === ".") {
        return `./${jobLogName}`;
      } else {
        // dir will be like './workflows', so we can directly join
        return `${dir}/${jobLogName}`;
      }
    }

    return path.join(dir, jobLogName);
  }

  /**
   * Save job log to file - matches Go CLI's SaveToFile()
   * Persists job log with proper formatting for cross-compatibility
   *
   * @param jobLog - The job log to save
   * @param filePath - Path to save the job log file
   */
  static async saveJobLog(jobLog: JobLog, filePath: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Save with 2-space indentation for readability and Go CLI compatibility
      await fs.writeFile(filePath, JSON.stringify(jobLog, null, 2), "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to save job log to ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Load job log from file - matches Go CLI's LoadFromFile()
   * Returns null if file doesn't exist (not an error condition)
   *
   * @param filePath - Path to the job log file
   * @returns The loaded job log or null if file doesn't exist
   */
  static async loadJobLog(filePath: string): Promise<JobLog | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const jobLog = JSON.parse(content) as JobLog;

      // Validate the loaded job log has required fields
      if (
        !jobLog.workflowName ||
        !jobLog.workflowFile ||
        !Array.isArray(jobLog.steps)
      ) {
        throw new Error("Invalid job log format");
      }

      return jobLog;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        // File doesn't exist - this is expected for new workflows
        return null;
      }
      throw new Error(
        `Failed to load job log from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create new job log - matches Go CLI's NewJobLog()
   * Initializes a new job log with proper defaults
   *
   * @param workflowName - Name of the workflow
   * @param workflowFile - Path to the workflow file
   * @param totalSteps - Total number of steps in the workflow
   * @returns New job log instance
   */
  static createJobLog(
    workflowName: string,
    workflowFile: string,
    totalSteps: number,
  ): JobLog {
    const now = new Date().toISOString();

    // Generate unique execution ID by combining timestamp with counter
    const baseId = new Date().toISOString().slice(0, 19).replace(/[:-]/g, ""); // YYYYMMDDTHHMMSS
    const uniqueId = `${baseId}${String(++this.executionCounter).padStart(3, "0")}`;

    return {
      workflowName,
      workflowFile,
      executionId: uniqueId,
      startTime: now,
      lastUpdateTime: now,
      status: "running",
      lastCompletedStep: -1, // -1 indicates no steps completed yet
      totalSteps,
      steps: [],
    };
  }

  /**
   * Add or update step in job log - matches Go CLI's AddStep() with deduplication
   * Prevents duplicate step entries and updates lastCompletedStep for completed steps
   *
   * @param jobLog - The job log to update
   * @param step - The step to add or update
   */
  static addStep(jobLog: JobLog, step: JobLogStep): void {
    // Remove duplicate if exists (matches Go CLI deduplication logic)
    jobLog.steps = jobLog.steps.filter(
      (s) => !(s.stepIndex === step.stepIndex && s.stepId === step.stepId),
    );

    // Add the new step
    jobLog.steps.push(step);

    // Update lastCompletedStep if this step is completed
    if (step.status === "completed") {
      jobLog.lastCompletedStep = Math.max(
        jobLog.lastCompletedStep,
        step.stepIndex,
      );
    }

    // Update the last update time
    jobLog.lastUpdateTime = new Date().toISOString();

    // Update overall job status based on steps
    const allSteps = jobLog.steps;
    const completedSteps = allSteps.filter(
      (s) => s.status === "completed",
    ).length;
    const failedSteps = allSteps.filter((s) => s.status === "failed").length;

    if (failedSteps > 0) {
      jobLog.status = "failed";
    } else if (completedSteps === jobLog.totalSteps) {
      jobLog.status = "completed";
    } else {
      jobLog.status = "running";
    }
  }

  /**
   * Get the next step index to execute during resume
   *
   * @param jobLog - The job log to analyze
   * @returns Step index to start from (0-based)
   */
  static getResumeStepIndex(jobLog: JobLog): number {
    return jobLog.lastCompletedStep + 1;
  }

  /**
   * Check if a job log exists for a workflow
   *
   * @param workflowFile - Path to the workflow file
   * @returns True if job log exists, false otherwise
   */
  static async jobLogExists(workflowFile: string): Promise<boolean> {
    const jobLogPath = this.getJobLogPath(workflowFile);
    try {
      await fs.access(jobLogPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove job log file for a workflow
   *
   * @param workflowFile - Path to the workflow file
   */
  static async removeJobLog(workflowFile: string): Promise<void> {
    const jobLogPath = this.getJobLogPath(workflowFile);
    try {
      await fs.unlink(jobLogPath);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        // File doesn't exist - that's fine
        return;
      }
      // Any other error should be thrown
      throw new Error(
        `Failed to remove job log ${jobLogPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
