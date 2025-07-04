import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { spawn } from "child_process";

// Simple CLI test to debug session reference validation
describe("Simple CLI Resume Test", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "simple-cli-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  async function executeCLI(args: string[]) {
    const cliPath = path.join(__dirname, "../../cli/claude-runner.js");

    return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const child = spawn("node", [cliPath, ...args], {
          cwd: tempDir,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        child.on("close", (code) => {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? 0,
          });
        });
      },
    );
  }

  test("should validate simple session reference format", async () => {
    // Create a very simple workflow with two steps
    const workflowContent = `name: simple-session-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: first
        name: First Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "first step"
          run: "echo 'first step completed'"
          output_session: true
          
      - id: second
        name: Second Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "second step"
          run: "echo 'second step completed'"
          resume_session: first`;

    const workflowPath = path.join(tempDir, "simple-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    console.log("Testing simple session reference...");
    console.log("Workflow content:", workflowContent);

    // Try to run the workflow
    const result = await executeCLI(["run", workflowPath, "--dry-run"]);

    console.log(`Result: exit code ${result.exitCode}`);
    console.log("STDOUT:", result.stdout);
    console.log("STDERR:", result.stderr);

    // Check if validation passes
    if (result.exitCode !== 0) {
      console.log("❌ Session reference validation failed");
      console.log("Error:", result.stderr);
    } else {
      console.log("✅ Session reference validation passed");
    }
  }, 10000);

  test("should test with progressive logging workflow format", async () => {
    // Use the exact same format as our working progressive logging test
    const workflowContent = `name: progressive-logging-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: step1
        name: Initial Setup
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Setup initial project structure"
          run: "echo 'step1 output'"
          output_session: true
          
      - id: step2
        name: Feature Implementation
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Implement core features"
          run: "echo 'step2 output'"
          resume_session: step1`;

    const workflowPath = path.join(tempDir, "progressive-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    console.log("Testing progressive logging format...");

    // Try to run the workflow
    const result = await executeCLI(["run", workflowPath, "--dry-run"]);

    console.log(`Result: exit code ${result.exitCode}`);
    console.log("STDOUT:", result.stdout);
    console.log("STDERR:", result.stderr);

    if (result.exitCode !== 0) {
      console.log("❌ Progressive format failed");
    } else {
      console.log("✅ Progressive format worked");
    }
  }, 10000);
});
