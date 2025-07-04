import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { spawn } from "child_process";

describe("Session Continuity E2E Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "session-continuity-test-"),
    );
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

  function extractSessionIds(stdout: string): string[] {
    // Extract session IDs from CLI output
    const sessionMatches = stdout.match(/claude-session-\d+-[a-f0-9]+/g);
    return sessionMatches ?? [];
  }

  test("should maintain session continuity across multiple steps with resume_session", async () => {
    // Create a workflow that uses session continuity
    const workflowContent = `name: session-continuity-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: step1
        name: First Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Initialize project"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
      - id: step2
        name: Second Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Build features"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step2.sh"
          resume_session: step1
          
      - id: step3
        name: Third Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Finalize project"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step3.sh"
          resume_session: step2`;

    const workflowPath = path.join(tempDir, "session-continuity-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    console.log("🔗 Testing session continuity across 3 steps...");

    // Execute the workflow
    const result = await executeCLI(["run", workflowPath, "--verbose"]);

    console.log(`Execution result: exit code ${result.exitCode}`);
    if (result.stderr) {
      console.log("STDERR:", result.stderr);
    }

    // VERIFY: Workflow completed successfully
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Workflow execution completed successfully",
    );

    // EXTRACT: All session IDs from the output
    const sessionIds = extractSessionIds(result.stdout);
    console.log(`📋 Session IDs found: ${sessionIds}`);

    // VERIFY: All three steps use the SAME session ID (session continuity)
    expect(sessionIds.length).toBeGreaterThanOrEqual(3); // At least 3 session references

    // All session IDs should be identical (session continuity maintained)
    const uniqueSessionIds = [...new Set(sessionIds)];
    expect(uniqueSessionIds.length).toBe(1); // Only ONE unique session ID

    const sessionId = uniqueSessionIds[0];
    console.log(
      `✅ Session continuity maintained: all steps used session ${sessionId}`,
    );

    // VERIFY: Each step output contains the same session ID
    const stepOutputs = result.stdout
      .split("\n")
      .filter(
        (line) =>
          line.includes("Step 1:") ||
          line.includes("Step 2:") ||
          line.includes("Step 3:"),
      );
    expect(stepOutputs.length).toBeGreaterThanOrEqual(3);
  }, 60000);

  test("should break session continuity when resume_session is not used", async () => {
    // Create a workflow WITHOUT session continuity (no resume_session)
    const workflowContent = `name: broken-continuity-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: step1
        name: First Step (no output_session)
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Initialize project"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step1.sh"
          
      - id: step2
        name: Second Step (no resume_session)
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Build features"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step2.sh"
          
      - id: step3
        name: Third Step (no resume_session)
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Finalize project"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step3.sh"`;

    const workflowPath = path.join(tempDir, "broken-continuity-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    console.log("💔 Testing broken session continuity (no resume_session)...");

    // Execute the workflow
    const result = await executeCLI(["run", workflowPath, "--verbose"]);

    console.log(`Execution result: exit code ${result.exitCode}`);
    if (result.stderr) {
      console.log("STDERR:", result.stderr);
    }

    // VERIFY: Workflow completed successfully (Claude Code doesn't fail without -r)
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Workflow execution completed successfully",
    );

    // EXTRACT: All session IDs from the output
    const sessionIds = extractSessionIds(result.stdout);
    console.log(`📋 Session IDs found: ${sessionIds}`);

    // VERIFY: Each step creates a NEW session (session continuity broken)
    expect(sessionIds.length).toBeGreaterThanOrEqual(3); // At least 3 session references

    // All session IDs should be DIFFERENT (no session continuity)
    const uniqueSessionIds = [...new Set(sessionIds)];
    expect(uniqueSessionIds.length).toBe(3); // THREE different session IDs

    console.log(
      `💔 Session continuity broken: steps used different sessions ${uniqueSessionIds}`,
    );
  }, 60000);

  test("should validate session reference format in workflow parsing", async () => {
    // This test validates that our CLI session reference fix works
    const workflowContent = `name: reference-format-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: init
        name: Initialize
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Start project"
          output_session: true
          
      - id: build
        name: Build
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Build project"
          resume_session: init  # Simple format (this was broken before our fix)`;

    const workflowPath = path.join(tempDir, "reference-format-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    // Test with validate command
    const result = await executeCLI(["validate", workflowPath]);

    // VERIFY: Simple session reference format is accepted
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Invalid session reference");
    expect(result.stdout).toContain("Workflow is valid");

    console.log("✅ Simple session reference format validation passed");
  }, 15000);
});
