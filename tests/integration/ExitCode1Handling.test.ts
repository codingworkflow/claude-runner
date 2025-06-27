import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

describe("Exit Code 1 Handling Integration Test", () => {
  const testDir = path.join(__dirname, "temp-exit-code-test");
  const fixtureDir = path.join(testDir, "fixtures");
  const workflowFile = path.join(testDir, "exit-code-workflow.yml");
  const cliPath = path.join(__dirname, "../../cli/claude-runner.js");

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(fixtureDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      console.warn("Failed to clean up test directory:", error);
    }
  });

  test("should handle exit code 1 with rate limit message on STDOUT (not stderr)", async () => {
    // Create fixture script that simulates the EXACT issue:
    // 1. Exit with code 1
    // 2. Send rate limit message to STDOUT (not stderr)
    const claudeScript = path.join(fixtureDir, "claude");

    const scriptContent = `#!/bin/bash

# Log all calls for debugging
echo "Claude script called with args: $*" >> "${testDir}/claude-calls.log"

# If this is version check, succeed
if [[ "$*" == *"--version"* ]]; then
    echo "Claude Code CLI version 1.0.0"
    exit 0
fi

# For task execution - simulate the REAL issue:
# Rate limit message goes to STDOUT, exit with code 1
if [[ "$*" == *"-p"* ]]; then
    MARKER_FILE="${testDir}/exit-code-marker"
    
    if [ ! -f "$MARKER_FILE" ]; then
        # First call - exit 1 with rate limit message on STDOUT
        touch "$MARKER_FILE"
        RESET_TIME=$(($(date +%s) + 3))
        echo "Simulating exit code 1 with rate limit on stdout" >> "${testDir}/claude-calls.log"
        # THIS IS THE KEY: Rate limit message goes to STDOUT, not stderr
        echo "Claude AI usage limit reached|$RESET_TIME"
        exit 1
    else
        # Second call - success
        echo "Exit code 1 handled correctly, now succeeding" >> "${testDir}/claude-calls.log"
        rm -f "$MARKER_FILE"
        echo "Task completed after exit code 1 handling!"
        exit 0
    fi
fi

echo "Default success"
exit 0
`;

    await fs.writeFile(claudeScript, scriptContent);
    await fs.chmod(claudeScript, 0o755);

    // Create simple workflow
    const workflowContent = `name: "Exit Code 1 Test"
jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - id: task-1
        uses: claude-pipeline-action@v1
        with:
          prompt: "Test exit code 1 handling"
          model: "auto"
`;

    await fs.writeFile(workflowFile, workflowContent);

    try {
      const startTime = Date.now();

      // Run the CLI - it should handle exit code 1 gracefully instead of crashing
      const result = await execAsync(
        `node "${cliPath}" run "${workflowFile}"`,
        {
          timeout: 10000,
          env: { ...process.env, PATH: `${fixtureDir}:${process.env.PATH}` },
        },
      );

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Debug output
      console.error("Exit code 1 test duration:", totalDuration);
      console.error("stdout:", result.stdout);
      console.error("stderr:", result.stderr);

      // Read debug log
      try {
        const debugLog = await fs.readFile(
          path.join(testDir, "claude-calls.log"),
          "utf-8",
        );
        console.error("Debug log:", debugLog);
      } catch (e) {
        console.warn("No debug log found");
      }

      // CRITICAL: Test should succeed (not crash with exit code 1)
      expect(result.stdout).toContain("COMPLETED after retry");
      expect(result.stdout).toContain(
        "Task completed after exit code 1 handling!",
      );

      // Verify rate limit was detected correctly from STDOUT
      expect(result.stderr).toContain("RATE LIMITED");
      expect(result.stderr).toContain("Claude AI usage limit reached");

      // Should take at least 3 seconds for rate limit wait
      expect(totalDuration).toBeGreaterThan(3000);
      expect(totalDuration).toBeLessThan(8000);
    } catch (error) {
      const execError = error as ExecError;
      console.error("Exit code 1 test failed:", execError.message);
      console.error("stdout:", execError.stdout);
      console.error("stderr:", execError.stderr);

      // Read debug log on failure
      try {
        const debugLog = await fs.readFile(
          path.join(testDir, "claude-calls.log"),
          "utf-8",
        );
        console.error("Debug log on failure:", debugLog);
      } catch (e) {
        console.warn("No debug log found on failure");
      }

      throw error;
    }
  }, 15000);

  test("should crash with normal exit code 1 (not rate limit)", async () => {
    // Create separate fixture directory for error test
    const errorFixtureDir = path.join(testDir, "error-fixtures");
    await fs.mkdir(errorFixtureDir, { recursive: true });

    // Create fixture that exits with code 1 but NO rate limit message
    const claudeScript = path.join(errorFixtureDir, "claude");

    const scriptContent = `#!/bin/bash

echo "Claude script error test called with args: $*" >> "${testDir}/claude-calls.log"

# If this is version check, succeed
if [[ "$*" == *"--version"* ]]; then
    echo "Claude Code CLI version 1.0.0"
    exit 0
fi

# For task execution - simulate regular error (no rate limit message)
if [[ "$*" == *"-p"* ]]; then
    echo "This is a regular error, not a rate limit" >> "${testDir}/claude-calls.log"
    echo "Error: Something went wrong"
    exit 1
fi

exit 0
`;

    await fs.writeFile(claudeScript, scriptContent);
    await fs.chmod(claudeScript, 0o755);

    const errorWorkflowContent = `name: "Regular Error Test"
jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - id: task-1
        uses: claude-pipeline-action@v1
        with:
          prompt: "Test regular error"
          model: "auto"
`;

    const errorWorkflowFile = path.join(testDir, "error-workflow.yml");
    await fs.writeFile(errorWorkflowFile, errorWorkflowContent);

    // This should fail (not succeed) because it's a real error, not rate limit
    await expect(
      execAsync(`node "${cliPath}" run "${errorWorkflowFile}"`, {
        timeout: 5000,
        env: { ...process.env, PATH: `${errorFixtureDir}:${process.env.PATH}` },
      }),
    ).rejects.toThrow();
  }, 10000);
});
