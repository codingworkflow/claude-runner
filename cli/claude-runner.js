#!/usr/bin/env node

// TRUE DRY IMPLEMENTATION - Imports from compiled core modules
const path = require("path");
const fs = require("fs");

// Import from compiled core modules - ZERO duplication!
const { ClaudeExecutor } = require("./dist/src/core/services/ClaudeExecutor");
const { ConfigManager } = require("./dist/src/core/services/ConfigManager");
const { WorkflowParser } = require("./dist/src/core/services/WorkflowParser");
const {
  ClaudeDetectionService,
} = require("./dist/src/services/ClaudeDetectionService");
const { JobLogManager } = require("./dist/cli/src/utils/JobLogManager");

// External dependency
const yaml = require("js-yaml");

// Node.js adapters for CLI environment (minimal, only what's needed)
class ConsoleLogger {
  info(message, ...args) {
    console.log(message, ...args);
  }

  warn(message, ...args) {
    console.warn(message, ...args);
  }

  error(message, error) {
    if (error) {
      console.error(message, error);
    } else {
      console.error(message);
    }
  }

  debug(message, ...args) {
    if (process.env.VERBOSE) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
}

class CLIConfigManager {
  constructor(logger) {
    this.logger = logger;
  }

  validateModel(model) {
    return true; // Let Claude CLI validate
  }

  validatePath(pathStr) {
    return fs.existsSync(pathStr);
  }
}

/**
 * CLI that imports from core module - ZERO code duplication
 */
class ClaudeRunnerCLI {
  constructor() {
    this.logger = new ConsoleLogger();
    this.configManager = new CLIConfigManager(this.logger);

    // Use the ACTUAL core executor - no duplication!
    this.executor = new ClaudeExecutor(this.logger, this.configManager);
  }

  async main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Parse global options
    const options = this.parseGlobalOptions(args);

    // Validate flags are only used with 'run' command
    if (command !== "run" && (options.resume || options.autoAccept)) {
      console.error(
        "ERROR: --resume and --yes flags can only be used with the run command",
      );
      process.exit(1);
    }

    switch (command) {
      case "list":
        await this.listWorkflows(args[1] || ".github/workflows", options);
        break;

      case "validate":
        if (!args[1]) {
          console.error(
            "Usage: claude-runner validate <workflow.yml> [--path <directory>]",
          );
          process.exit(1);
        }
        await this.validateWorkflow(args[1], options);
        break;

      case "run":
        if (!args[1]) {
          console.error(
            "Usage: claude-runner run <workflow.yml> [--verbose] [--path <directory>]",
          );
          process.exit(1);
        }
        await this.runWorkflow(args[1], {
          verbose: args.includes("--verbose"),
          executionPath: options.executionPath,
          resume: options.resume,
          autoAccept: options.autoAccept,
        });
        break;

      default:
        this.showHelp();
        break;
    }
  }

  parseGlobalOptions(args) {
    const options = {
      executionPath: process.cwd(), // Default to current working directory
      resume: false,
      autoAccept: false,
    };

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--path" || args[i] === "-p") {
        if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          options.executionPath = path.resolve(args[i + 1]);
        } else {
          console.error("ERROR: --path requires a directory argument");
          process.exit(1);
        }
      } else if (args[i] === "--resume" || args[i] === "-r") {
        options.resume = true;
      } else if (args[i] === "--yes" || args[i] === "-y") {
        options.autoAccept = true;
      }
    }

    return options;
  }

  showHelp() {
    console.log("Claude Runner CLI");
    console.log("");
    console.log("Usage:");
    console.log(
      "  claude-runner list [directory] [options]        - List Claude workflows",
    );
    console.log(
      "  claude-runner validate <workflow.yml> [options] - Validate workflow",
    );
    console.log(
      "  claude-runner run <workflow.yml> [options]      - Execute workflow",
    );
    console.log("");
    console.log("Options:");
    console.log(
      "  --verbose                               - Show detailed output",
    );
    console.log(
      "  --path, -p <directory>                  - Set execution directory (default: current)",
    );
    console.log(
      "  --resume, -r                            - Resume from last failed step (run command only)",
    );
    console.log(
      "  --yes, -y                               - Auto-accept prompts without confirmation (run command only)",
    );
    console.log(
      "                                            WARNING: Use with caution - bypasses safety prompts",
    );
    console.log("");
    console.log("Examples:");
    console.log("  claude-runner list");
    console.log("  claude-runner validate .github/workflows/claude-test.yml");
    console.log(
      "  claude-runner run .github/workflows/claude-integration-test.yml",
    );
    console.log(
      "  claude-runner run .github/workflows/claude-test.yml --verbose",
    );
    console.log("  claude-runner run workflow.yml --path /path/to/project");
    console.log("  claude-runner run workflow.yml --resume --verbose");
    console.log("  claude-runner run workflow.yml --yes --path /custom/path");
    console.log("  claude-runner run workflow.yml -r -y --verbose");
  }

  async listWorkflows(directory, options = {}) {
    const baseDir = options.executionPath || process.cwd();
    const fullPath = path.resolve(baseDir, directory);

    if (!fs.existsSync(fullPath)) {
      console.error(`ERROR: Directory not found: ${fullPath}`);
      process.exit(1);
    }

    const files = fs.readdirSync(fullPath);
    const workflowFiles = files.filter(
      (file) =>
        (file.startsWith("claude-") || file.includes("claude")) &&
        (file.endsWith(".yml") || file.endsWith(".yaml")),
    );

    if (workflowFiles.length === 0) {
      console.log("No Claude workflows found");
      return;
    }

    console.log(`Found ${workflowFiles.length} Claude workflow(s):\n`);

    workflowFiles.forEach((file, index) => {
      const filePath = path.join(fullPath, file);
      const stats = fs.statSync(filePath);

      console.log(`${index + 1}. ${file}`);
      console.log(
        `   Modified: ${stats.mtime.toISOString().slice(0, 16).replace("T", " ")}`,
      );

      try {
        const content = fs.readFileSync(filePath, "utf-8");

        // Use shared WorkflowParser - NO duplication!
        const workflow = WorkflowParser.parseYaml(content);
        console.log(`   Name: ${workflow.name || "Unnamed workflow"}`);

        let claudeSteps = 0;
        for (const job of Object.values(workflow.jobs || {})) {
          for (const step of job.steps || []) {
            if (step.uses && step.uses.includes("claude-pipeline-action")) {
              claudeSteps++;
            }
          }
        }
        console.log(`   Claude steps: ${claudeSteps}`);
      } catch (error) {
        console.log(`   WARNING: Could not parse workflow: ${error.message}`);
      }
      console.log("");
    });
  }

  async validateWorkflow(workflowPath, options = {}) {
    const baseDir = options.executionPath || process.cwd();
    const fullPath = path.resolve(baseDir, workflowPath);

    if (!fs.existsSync(fullPath)) {
      console.error(`ERROR: Workflow file not found: ${fullPath}`);
      process.exit(1);
    }

    try {
      const content = fs.readFileSync(fullPath, "utf-8");

      // Use shared WorkflowParser - NO duplication!
      const workflow = WorkflowParser.parseYaml(content);
      // Note: parseYaml includes validation, will throw if invalid

      console.log(`Workflow: ${workflow.name}`);
      console.log(`Jobs: ${Object.keys(workflow.jobs || {}).length}`);

      let claudeSteps = 0;
      for (const job of Object.values(workflow.jobs || {})) {
        for (const step of job.steps || []) {
          if (step.uses && step.uses.includes("claude-pipeline-action")) {
            claudeSteps++;
          }
        }
      }
      console.log(`Claude steps: ${claudeSteps}`);

      console.log("Workflow is valid!");
    } catch (error) {
      console.error(`ERROR: Validation failed: ${error.message}`);
      process.exit(1);
    }
  }

  async runWorkflow(workflowPath, options = {}) {
    // Use shared ClaudeDetectionService - NO duplication!
    console.log("Checking Claude CLI installation...");
    const detection = await ClaudeDetectionService.detectClaude();

    if (!detection.isInstalled) {
      console.error(`ERROR: Claude CLI not found: ${detection.error}`);
      console.error(
        "Please install Claude Code CLI and ensure it's in your PATH",
      );
      process.exit(1);
    }

    console.log(
      `Claude CLI detected: ${detection.version} (${detection.shell})`,
    );

    // Load and validate workflow using shared parser
    const baseDir = options.executionPath || process.cwd();
    const fullPath = path.resolve(baseDir, workflowPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`ERROR: Workflow file not found: ${fullPath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const workflow = WorkflowParser.parseYaml(content);

    // Check if this is actually a Claude workflow
    let totalClaudeSteps = 0;
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (step.uses && step.uses.includes("claude-pipeline-action")) {
          totalClaudeSteps++;
        }
      }
    }

    if (totalClaudeSteps === 0) {
      console.error(
        `ERROR: No Claude pipeline steps found in workflow "${workflow.name}"`,
      );
      console.error(
        "This appears to be a regular GitHub Actions workflow, not a Claude workflow.",
      );
      console.error(
        'Claude workflows should have steps that use "anthropics/claude-pipeline-action"',
      );
      process.exit(1);
    }

    console.log(`Workflow: ${workflow.name}`);
    console.log(`Found ${totalClaudeSteps} Claude steps to execute`);

    // Resume functionality - Step 2.2 from implementation plan
    let startFromStep = 0;
    let existingJobLog = null;
    const jobLogPath = JobLogManager.getJobLogPath(fullPath);

    if (options.resume) {
      existingJobLog = await JobLogManager.loadJobLog(jobLogPath);
      if (existingJobLog) {
        console.log(`📄 Found job log: ${jobLogPath}`);
        console.log(
          `⏯️  Last completed step: ${existingJobLog.lastCompletedStep + 1}/${existingJobLog.totalSteps}`,
        );

        if (existingJobLog.lastCompletedStep >= 0) {
          startFromStep = existingJobLog.lastCompletedStep + 1;
          console.log(`🚀 Resuming from step ${startFromStep + 1}\n`);
        }
      } else {
        console.log(`⚠️  No job log found for resume: ${jobLogPath}`);
      }
    } else {
      // Clear existing job log for fresh start (matches Go CLI main.go:82-86)
      try {
        await JobLogManager.removeJobLog(fullPath);
      } catch {
        // File doesn't exist, that's fine
      }
    }

    // Create new job log if not resuming or no existing log
    const jobLog =
      existingJobLog ||
      JobLogManager.createJobLog(workflow.name, fullPath, totalClaudeSteps);

    // Display warning when bypassing permissions
    if (options.autoAccept) {
      console.log(`\x1b[33m⚠️  Bypassing Permissions\x1b[0m\n`);
    }

    console.log("Executing workflow...\n");

    const sessions = new Map();

    // Restore session IDs from job log for resume operations (session continuity)
    if (existingJobLog) {
      for (const step of existingJobLog.steps) {
        if (step.sessionId && step.status === "completed") {
          sessions.set(step.stepId, step.sessionId);
          if (options.verbose) {
            console.log(
              `🔗 Restored session for ${step.stepId}: ${step.sessionId}`,
            );
          }
        }
      }
    }

    // Step tracking for resume functionality - Step 2.3 from implementation plan
    let currentStepIndex = 0;

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      console.log(`\nJob: ${job.name || jobName}`);

      for (const step of job.steps) {
        if (step.uses && step.uses.includes("claude-pipeline-action")) {
          // Skip if we're resuming and this step is already completed
          if (currentStepIndex < startFromStep) {
            console.log(
              `⏭️  Skipping completed step ${currentStepIndex + 1}: ${step.name || step.id}`,
            );
            currentStepIndex++;
            continue;
          }

          console.log(
            `\n  Step ${currentStepIndex + 1}: ${step.name || step.id}`,
          );
          if (options.verbose) {
            console.log(`  Prompt: ${step.with.prompt}`);
            console.log(`  Model: ${step.with.model || "auto"}`);
          }

          const taskOptions = {
            outputFormat: step.with.output_session ? "json" : "text",
            allowAllTools: step.with.allow_all_tools,
            bypassPermissions: options.autoAccept,
            resumeSessionId: undefined,
          };

          if (step.with.resume_session) {
            const sessionRef = step.with.resume_session.match(
              /\$\{\{\s*steps\.(\w+)\.outputs\.session_id\s*\}\}/,
            );
            if (sessionRef && sessions.has(sessionRef[1])) {
              taskOptions.resumeSessionId = sessions.get(sessionRef[1]);
              console.log(`  Resuming session: ${taskOptions.resumeSessionId}`);
            }
          }

          const stepStartTime = new Date();
          const logStep = {
            stepIndex: currentStepIndex,
            stepId: step.id || `step-${currentStepIndex}`,
            stepName: step.name || step.id || `Step ${currentStepIndex + 1}`,
            status: "running",
            startTime: stepStartTime.toISOString(),
            durationMs: 0,
          };

          const startTime = Date.now();

          // Use shared ClaudeExecutor - NO duplication!
          const result = await this.executor.executeTask(
            step.with.prompt,
            step.with.model || "auto",
            step.with.working_directory || baseDir,
            taskOptions,
          );

          const duration = Date.now() - startTime;

          if (result.success) {
            console.log(`  COMPLETED (${duration}ms)`);

            // Extract clean result from JSON output if needed
            let displayOutput = result.output;
            if (taskOptions.outputFormat === "json") {
              try {
                const jsonData = JSON.parse(result.output.trim());
                displayOutput = jsonData.result || result.output;
              } catch {
                // Keep original output if parsing fails
              }
            }

            console.log(
              `  Output: ${displayOutput.substring(0, 200)}${displayOutput.length > 200 ? "..." : ""}`,
            );

            if (step.with.output_session && result.sessionId) {
              sessions.set(step.id, result.sessionId);
              if (options.verbose) {
                console.log(`  Session ID stored: ${result.sessionId}`);
              }
            }

            // Update job log for successful completion
            const endTime = new Date();
            logStep.endTime = endTime.toISOString();
            logStep.durationMs = endTime.getTime() - stepStartTime.getTime();
            logStep.status = "completed";
            logStep.output = result.output;
            logStep.sessionId = result.sessionId;

            JobLogManager.addStep(jobLog, logStep);
            await JobLogManager.saveJobLog(jobLog, jobLogPath);
          } else {
            // Check for rate limit before failing
            const rateLimitMatch = (result.error || "").match(
              /Claude AI usage limit reached\|(\d+)/,
            );
            if (rateLimitMatch) {
              const resetTime = parseInt(rateLimitMatch[1], 10) * 1000;
              const waitTime = resetTime - Date.now();
              const resetDate = new Date(resetTime).toLocaleString();

              console.warn(
                `  RATE LIMITED (${duration}ms): Claude AI usage limit reached`,
              );
              console.warn(`  Reset time: ${resetDate}`);

              if (waitTime > 0) {
                const waitMinutes = Math.ceil(waitTime / 60000);
                console.warn(
                  `  Waiting ${waitMinutes} minute(s) before retrying...`,
                );

                // Wait for the rate limit to reset
                await new Promise((resolve) =>
                  setTimeout(resolve, waitTime + 1000),
                ); // Add 1 second buffer

                console.log(`  Rate limit expired, retrying step: ${step.id}`);

                // Retry the same step
                const retryResult = await this.executor.executeTask(
                  step.with.prompt,
                  step.with.model || "auto",
                  step.with.working_directory || baseDir,
                  taskOptions,
                );

                const retryDuration = Date.now() - startTime;

                if (retryResult.success) {
                  console.log(`  COMPLETED after retry (${retryDuration}ms)`);
                  console.log(
                    `  Output: ${retryResult.output.substring(0, 200)}${retryResult.output.length > 200 ? "..." : ""}`,
                  );

                  if (step.with.output_session && retryResult.sessionId) {
                    sessions.set(step.id, retryResult.sessionId);
                    if (options.verbose) {
                      console.log(
                        `  Session ID stored: ${retryResult.sessionId}`,
                      );
                    }
                  }

                  // Update job log for successful retry completion
                  const endTime = new Date();
                  logStep.endTime = endTime.toISOString();
                  logStep.durationMs =
                    endTime.getTime() - stepStartTime.getTime();
                  logStep.status = "completed";
                  logStep.output = retryResult.output;
                  logStep.sessionId = retryResult.sessionId;

                  JobLogManager.addStep(jobLog, logStep);
                  await JobLogManager.saveJobLog(jobLog, jobLogPath);
                } else {
                  console.error(
                    `  FAILED after retry (${retryDuration}ms): ${retryResult.error}`,
                  );

                  // Update job log for retry failure
                  logStep.status = "failed";
                  logStep.error = retryResult.error;
                  JobLogManager.addStep(jobLog, logStep);
                  await JobLogManager.saveJobLog(jobLog, jobLogPath);

                  process.exit(1);
                }
              } else {
                console.warn(
                  `  Rate limit already expired, retrying immediately...`,
                );
                // Retry immediately if the reset time has already passed
                const retryResult = await this.executor.executeTask(
                  step.with.prompt,
                  step.with.model || "auto",
                  step.with.working_directory || baseDir,
                  taskOptions,
                );

                if (retryResult.success) {
                  console.log(
                    `  COMPLETED after immediate retry (${Date.now() - startTime}ms)`,
                  );
                  console.log(
                    `  Output: ${retryResult.output.substring(0, 200)}${retryResult.output.length > 200 ? "..." : ""}`,
                  );

                  if (step.with.output_session && retryResult.sessionId) {
                    sessions.set(step.id, retryResult.sessionId);
                    if (options.verbose) {
                      console.log(
                        `  Session ID stored: ${retryResult.sessionId}`,
                      );
                    }
                  }

                  // Update job log for successful immediate retry completion
                  const endTime = new Date();
                  logStep.endTime = endTime.toISOString();
                  logStep.durationMs =
                    endTime.getTime() - stepStartTime.getTime();
                  logStep.status = "completed";
                  logStep.output = retryResult.output;
                  logStep.sessionId = retryResult.sessionId;

                  JobLogManager.addStep(jobLog, logStep);
                  await JobLogManager.saveJobLog(jobLog, jobLogPath);
                } else {
                  console.error(
                    `  FAILED after immediate retry: ${retryResult.error}`,
                  );

                  // Update job log for immediate retry failure
                  logStep.status = "failed";
                  logStep.error = retryResult.error;
                  JobLogManager.addStep(jobLog, logStep);
                  await JobLogManager.saveJobLog(jobLog, jobLogPath);

                  process.exit(1);
                }
              }
            } else {
              console.error(`  FAILED (${duration}ms): ${result.error}`);

              // Update job log for failure
              logStep.status = "failed";
              logStep.error = result.error;
              JobLogManager.addStep(jobLog, logStep);
              await JobLogManager.saveJobLog(jobLog, jobLogPath);

              process.exit(1);
            }
          }

          // Increment step index after processing each Claude step
          currentStepIndex++;
        }
      }
    }

    // Mark workflow as completed
    jobLog.status = "completed";
    await JobLogManager.saveJobLog(jobLog, jobLogPath);

    console.log("\nWorkflow execution completed successfully!");
    if (options.verbose) {
      console.log(`Sessions tracked: ${sessions.size}`);
    }
  }
}

if (require.main === module) {
  const cli = new ClaudeRunnerCLI();
  cli.main().catch((error) => {
    console.error(`CLI error: ${error.message}`);
    process.exit(1);
  });
}
