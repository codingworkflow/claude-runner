#!/usr/bin/env node

// TRUE DRY IMPLEMENTATION - Imports from compiled core modules
const path = require("path");
const fs = require("fs");

// Import from compiled core modules - ZERO duplication!
const { ClaudeExecutor } = require("./dist/core/services/ClaudeExecutor");
const { ConfigManager } = require("./dist/core/services/ConfigManager");
const { WorkflowParser } = require("./dist/core/services/WorkflowParser");
const {
  ClaudeDetectionService,
} = require("./dist/services/ClaudeDetectionService");

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

    switch (command) {
      case "list":
        await this.listWorkflows(args[1] || ".github/workflows");
        break;

      case "validate":
        if (!args[1]) {
          console.error("Usage: claude-runner validate <workflow.yml>");
          process.exit(1);
        }
        await this.validateWorkflow(args[1]);
        break;

      case "run":
        if (!args[1]) {
          console.error("Usage: claude-runner run <workflow.yml> [--verbose]");
          process.exit(1);
        }
        await this.runWorkflow(args[1], {
          verbose: args.includes("--verbose"),
        });
        break;

      default:
        this.showHelp();
        break;
    }
  }

  showHelp() {
    console.log("Claude Runner CLI");
    console.log("");
    console.log("Usage:");
    console.log(
      "  claude-runner list [directory]         - List Claude workflows",
    );
    console.log("  claude-runner validate <workflow.yml>  - Validate workflow");
    console.log("  claude-runner run <workflow.yml>       - Execute workflow");
    console.log("");
    console.log("Options:");
    console.log(
      "  --verbose                              - Show detailed output",
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
  }

  async listWorkflows(directory) {
    const fullPath = path.resolve(directory);

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

  async validateWorkflow(workflowPath) {
    const fullPath = path.resolve(workflowPath);

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
    const fullPath = path.resolve(workflowPath);
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
    console.log("Executing workflow...\n");

    const sessions = new Map();

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      console.log(`\nJob: ${job.name || jobName}`);

      for (const step of job.steps) {
        if (step.uses && step.uses.includes("claude-pipeline-action")) {
          console.log(`\n  Step: ${step.name || step.id}`);
          if (options.verbose) {
            console.log(`  Prompt: ${step.with.prompt}`);
            console.log(`  Model: ${step.with.model || "auto"}`);
          }

          const taskOptions = {
            outputFormat: step.with.output_session ? "json" : "text",
            allowAllTools: step.with.allow_all_tools,
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

          const startTime = Date.now();

          // Use shared ClaudeExecutor - NO duplication!
          const result = await this.executor.executeTask(
            step.with.prompt,
            step.with.model || "auto",
            step.with.working_directory || process.cwd(),
            taskOptions,
          );

          const duration = Date.now() - startTime;

          if (result.success) {
            console.log(`  COMPLETED (${duration}ms)`);
            console.log(
              `  Output: ${result.output.substring(0, 200)}${result.output.length > 200 ? "..." : ""}`,
            );

            if (step.with.output_session && result.sessionId) {
              sessions.set(step.id, result.sessionId);
              if (options.verbose) {
                console.log(`  Session ID stored: ${result.sessionId}`);
              }
            }
          } else {
            console.error(`  FAILED (${duration}ms): ${result.error}`);
            process.exit(1);
          }
        }
      }
    }

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
