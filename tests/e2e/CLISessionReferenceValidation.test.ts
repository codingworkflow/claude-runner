import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { spawn } from "child_process";

describe("CLI Session Reference Validation", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-session-test-"));
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

  test("should accept simple session reference format in workflow validation", async () => {
    // Create a workflow that uses simple session references
    const workflowContent = `name: session-reference-test
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
          prompt: "Execute first step"
          output_session: true
          
      - id: step2
        name: Second Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute second step"
          resume_session: step1
          
      - id: step3
        name: Third Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute third step"
          resume_session: step2`;

    const workflowPath = path.join(tempDir, "session-reference-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    // Test with validate command to check workflow without execution
    const result = await executeCLI(["validate", workflowPath]);

    // VERIFY: Workflow validation passes
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Invalid session reference");
    expect(result.stdout).toContain("session-reference-test");
    expect(result.stdout).toContain("Claude steps: 3");
  }, 15000);

  test("should reject invalid session references", async () => {
    // Create a workflow with invalid session reference
    const workflowContent = `name: invalid-session-test
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
          prompt: "Execute first step"
          output_session: true
          
      - id: step2
        name: Second Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute second step"
          resume_session: nonexistent_step`;

    const workflowPath = path.join(tempDir, "invalid-session-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    // Test validation should fail
    const result = await executeCLI(["validate", workflowPath]);

    // VERIFY: Workflow validation fails with proper error
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("references unknown step");
    expect(result.stderr).toContain("nonexistent_step");
  }, 15000);

  test("should support backward compatibility with complex session references", async () => {
    // Create a workflow that uses old complex format
    const workflowContent = `name: complex-session-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: setup
        name: Setup Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Setup the environment"
          output_session: true
          
      - id: main
        name: Main Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute main logic"
          resume_session: \${{ steps.setup.outputs.session_id }}`;

    const workflowPath = path.join(tempDir, "complex-session-test.yml");
    await fs.writeFile(workflowPath, workflowContent);

    // Test with validate command
    const result = await executeCLI(["validate", workflowPath]);

    // VERIFY: Complex format still works
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Invalid session reference");
    expect(result.stdout).toContain("complex-session-test");
    expect(result.stdout).toContain("Claude steps: 2");
  }, 15000);
});
