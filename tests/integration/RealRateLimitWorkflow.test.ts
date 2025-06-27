import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

// Interface for exec errors that include stdout/stderr
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

describe("Real Rate Limit Workflow Integration Test", () => {
  const testDir = path.join(__dirname, "temp-rate-limit-test");
  const fixtureDir = path.join(testDir, "fixtures");
  const workflowFile = path.join(testDir, "rate-limit-workflow.yml");
  const cliPath = path.join(__dirname, "../../cli/claude-runner.js");

  beforeAll(async () => {
    // Create test directory structure
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(fixtureDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      console.warn("Failed to clean up test directory:", error);
    }
  });

  test("should handle rate limit with real timeout and auto-resume", async () => {
    // Create fixture script that simulates Claude CLI with rate limit
    const claudeScript = path.join(fixtureDir, "claude");

    // Create a mock claude script that:
    // 1. Always fails with rate limit on actual task calls (not --version)
    // 2. After the timeout period (5 seconds), succeeds
    const scriptContent = `#!/bin/bash

# Log all calls for debugging
echo "Claude script called with args: $*" >> "${testDir}/claude-calls.log"
echo "Current time: $(date +%s)" >> "${testDir}/claude-calls.log"

# If this is just a version check, always succeed
if [[ "$*" == *"--version"* ]]; then
    echo "claude version test" >> "${testDir}/claude-calls.log"
    echo "Claude Code CLI version 1.0.0"
    exit 0
fi

# For actual task execution
if [[ "$*" == *"-p"* ]]; then
    # Dynamic reset time calculation - 5 seconds from first call
    RESET_TIME_FILE="${testDir}/reset-time"
    
    if [ ! -f "$RESET_TIME_FILE" ]; then
        # First call - set reset time to 5 seconds from now
        RESET_TIME=$(($(date +%s) + 5))
        echo "$RESET_TIME" > "$RESET_TIME_FILE"
        echo "Setting reset time to: $RESET_TIME" >> "${testDir}/claude-calls.log"
    else
        # Read existing reset time
        RESET_TIME=$(cat "$RESET_TIME_FILE")
    fi
    
    CURRENT_TIME=$(date +%s)
    echo "Task execution - current: $CURRENT_TIME, reset: $RESET_TIME" >> "${testDir}/claude-calls.log"
    
    if [ $CURRENT_TIME -lt $RESET_TIME ]; then
        # Still rate limited
        echo "Rate limit still active" >> "${testDir}/claude-calls.log"
        echo "Claude AI usage limit reached|$RESET_TIME" >&2
        exit 1
    else
        # Rate limit expired - clean up and succeed
        echo "Rate limit expired, task succeeds" >> "${testDir}/claude-calls.log"
        rm -f "$RESET_TIME_FILE"
        echo "Task completed successfully after rate limit!"
        exit 0
    fi
fi

# Default success for any other calls
echo "Default success for: $*" >> "${testDir}/claude-calls.log"
echo "Default response"
exit 0
`;

    await fs.writeFile(claudeScript, scriptContent);
    await fs.chmod(claudeScript, 0o755);

    // Create workflow file that uses our fixture
    const workflowContent = `name: "Rate Limit Test Workflow"
jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - id: task-1
        uses: claude-pipeline-action@v1
        with:
          prompt: "Test task that will hit rate limit"
          model: "auto"
`;

    await fs.writeFile(workflowFile, workflowContent);

    try {
      const startTime = Date.now();

      // Run the CLI with our workflow - this should handle the rate limit automatically
      const result = await execAsync(
        `node "${cliPath}" run "${workflowFile}"`,
        {
          timeout: 20000, // 20 second timeout for the test
          env: { ...process.env, PATH: `${fixtureDir}:${process.env.PATH}` },
        },
      );

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Debug output
      console.error("Test duration:", totalDuration);
      console.error("stdout:", result.stdout);
      console.error("stderr:", result.stderr);

      // Read the debug log
      try {
        const debugLog = await fs.readFile(
          path.join(testDir, "claude-calls.log"),
          "utf-8",
        );
        console.error("Claude calls log:", debugLog);
      } catch (e) {
        console.warn("No debug log found");
      }

      // Verify the behavior - MUST take at least 5 seconds for real timeout
      expect(totalDuration).toBeGreaterThan(5000); // MUST take at least 5 seconds - NO CHEATING!
      expect(totalDuration).toBeLessThan(10000); // But not too long

      // Check that rate limit was detected and handled
      expect(result.stderr).toContain("RATE LIMITED");
      expect(result.stderr).toContain("Claude AI usage limit reached");
      expect(result.stderr).toContain("Waiting");

      // Check that retry happened and succeeded
      expect(result.stdout).toContain("Rate limit expired, retrying");
      expect(result.stdout).toContain("COMPLETED after retry");
      expect(result.stdout).toContain(
        "Task completed successfully after rate limit!",
      );
    } catch (error) {
      const execError = error as ExecError;
      // Log error details for debugging
      console.error("Test failed with error:", execError.message);
      console.error("stdout:", execError.stdout);
      console.error("stderr:", execError.stderr);

      // Try to read debug log even on failure
      try {
        const debugLog = await fs.readFile(
          path.join(testDir, "claude-calls.log"),
          "utf-8",
        );
        console.error("Claude calls log:", debugLog);
      } catch (e) {
        console.warn("No debug log found on error");
      }

      throw error;
    }
  }, 15000); // 15 second test timeout (should be enough for 5s wait + overhead)

  test("should handle immediate retry when rate limit already expired", async () => {
    // Create separate fixture directory for this test
    const expiredFixtureDir = path.join(testDir, "expired-fixtures");
    await fs.mkdir(expiredFixtureDir, { recursive: true });

    // Create fixture script that simulates expired rate limit
    const claudeScript = path.join(expiredFixtureDir, "claude");

    const scriptContent = `#!/bin/bash

# Log all calls for debugging
echo "Expired test - Claude script called with args: $*" >> "${testDir}/claude-calls.log"

# If this is just a version check, always succeed
if [[ "$*" == *"--version"* ]]; then
    echo "Claude Code CLI version 1.0.0"
    exit 0
fi

# For actual task execution - simulate expired rate limit
if [[ "$*" == *"-p"* ]]; then
    MARKER_FILE="${testDir}/expired-marker"
    
    if [ ! -f "$MARKER_FILE" ]; then
        # First call - return expired rate limit (timestamp in past)
        touch "$MARKER_FILE"
        EXPIRED_TIME=$(($(date +%s) - 10))  # 10 seconds ago
        echo "Returning expired rate limit: $EXPIRED_TIME" >> "${testDir}/claude-calls.log"
        echo "Claude AI usage limit reached|$EXPIRED_TIME" >&2
        exit 1
    else
        # Second call - immediate success
        echo "Immediate retry successful!" >> "${testDir}/claude-calls.log"
        rm -f "$MARKER_FILE"
        echo "Immediate retry successful!"
        exit 0
    fi
fi

echo "Default response"
exit 0
`;

    await fs.writeFile(claudeScript, scriptContent);
    await fs.chmod(claudeScript, 0o755);

    // Create workflow that uses expired rate limit fixture
    const workflowContent = `name: "Expired Rate Limit Test"
jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - id: task-1
        uses: claude-pipeline-action@v1
        with:
          prompt: "Test expired rate limit"
          model: "auto"
`;

    const expiredWorkflowFile = path.join(
      testDir,
      "expired-rate-limit-workflow.yml",
    );
    await fs.writeFile(expiredWorkflowFile, workflowContent);

    try {
      const startTime = Date.now();

      const result = await execAsync(
        `node "${cliPath}" run "${expiredWorkflowFile}"`,
        {
          timeout: 10000,
          env: {
            ...process.env,
            PATH: `${expiredFixtureDir}:${process.env.PATH}`,
          },
        },
      );

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      console.error("Expired test duration:", totalDuration);
      console.error("stdout:", result.stdout);
      console.error("stderr:", result.stderr);

      // Should be fast since rate limit already expired
      expect(totalDuration).toBeLessThan(3000);

      // Check that immediate retry happened
      expect(result.stderr).toContain("RATE LIMITED");
      expect(result.stderr).toContain(
        "Rate limit already expired, retrying immediately",
      );
      expect(result.stdout).toContain("COMPLETED after immediate retry");
      expect(result.stdout).toContain("Immediate retry successful!");
    } catch (error) {
      const execError = error as ExecError;
      console.error("Expired test error:", execError.message);
      console.error("stdout:", execError.stdout);
      console.error("stderr:", execError.stderr);
      throw error;
    }
  }, 15000);

  test("should handle session continuation after rate limit", async () => {
    // Create separate fixture directory for this test
    const sessionFixtureDir = path.join(testDir, "session-fixtures");
    await fs.mkdir(sessionFixtureDir, { recursive: true });

    // Create fixture script that simulates session continuation
    const claudeScript = path.join(sessionFixtureDir, "claude");

    const scriptContent = `#!/bin/bash

# Log all calls for debugging
echo "Session test - Claude script called with args: $*" >> "${testDir}/claude-calls.log"

# If this is just a version check, always succeed
if [[ "$*" == *"--version"* ]]; then
    echo "Claude Code CLI version 1.0.0"
    exit 0
fi

# Check if we're being called with resume session flag OR if this is the second task
if [[ "$*" == *"-r"* ]] || [[ "$*" == *"Continue conversation"* ]]; then
    # This is the second task with session continuation
    MARKER_FILE="${testDir}/session-marker"
    
    if [ ! -f "$MARKER_FILE" ]; then
        # First call to second task - rate limit (5 seconds from now)
        touch "$MARKER_FILE"
        RESET_TIME=$(($(date +%s) + 5))
        echo "$RESET_TIME" > "${testDir}/session-reset-time"
        echo "Session task rate limited until: $RESET_TIME" >> "${testDir}/claude-calls.log"
        echo "Claude AI usage limit reached|$RESET_TIME" >&2
        exit 1
    else
        # Second call to second task - check if time expired
        RESET_TIME=$(cat "${testDir}/session-reset-time")
        CURRENT_TIME=$(date +%s)
        
        if [ $CURRENT_TIME -lt $RESET_TIME ]; then
            echo "Session task still rate limited" >> "${testDir}/claude-calls.log"
            echo "Claude AI usage limit reached|$RESET_TIME" >&2
            exit 1
        else
            echo "Session task rate limit expired - success" >> "${testDir}/claude-calls.log"
            rm -f "$MARKER_FILE" "${testDir}/session-reset-time"
            echo '{"result": "Continued conversation successfully!", "session_id": "session-456"}'
            exit 0
        fi
    fi
else
    # First task - always succeeds and returns session
    echo "First task executing" >> "${testDir}/claude-calls.log"
    echo '{"result": "First task completed", "session_id": "session-123"}'
    exit 0
fi
`;

    await fs.writeFile(claudeScript, scriptContent);
    await fs.chmod(claudeScript, 0o755);

    // Create workflow with session continuation
    const workflowContent = `name: "Session Continuation Test"
jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - id: task1
        uses: claude-pipeline-action@v1
        with:
          prompt: "Start conversation"
          model: "auto"
          output_session: true
      - id: task2
        uses: claude-pipeline-action@v1
        with:
          prompt: "Continue conversation"
          model: "auto"
          resume_session: "\${{ steps.task1.outputs.session_id }}"
`;

    const sessionWorkflowFile = path.join(testDir, "session-workflow.yml");
    await fs.writeFile(sessionWorkflowFile, workflowContent);

    try {
      const startTime = Date.now();

      const result = await execAsync(
        `node "${cliPath}" run "${sessionWorkflowFile}"`,
        {
          timeout: 15000,
          env: {
            ...process.env,
            PATH: `${sessionFixtureDir}:${process.env.PATH}`,
          },
        },
      );

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      console.error("Session test duration:", totalDuration);
      console.error("stdout:", result.stdout);
      console.error("stderr:", result.stderr);

      // Should take at least 5 seconds due to rate limit wait
      expect(totalDuration).toBeGreaterThan(5000);

      // Check that first task completed
      expect(result.stdout).toContain("First task completed");

      // Check that second task hit rate limit and recovered
      expect(result.stderr).toContain("RATE LIMITED");
      expect(result.stdout).toContain("COMPLETED after retry");
      expect(result.stdout).toContain("Continued conversation successfully!");
    } catch (error) {
      const execError = error as ExecError;
      console.error("Session test error:", execError.message);
      console.error("stdout:", execError.stdout);
      console.error("stderr:", execError.stderr);

      try {
        const debugLog = await fs.readFile(
          path.join(testDir, "claude-calls.log"),
          "utf-8",
        );
        console.error("Session test debug log:", debugLog);
      } catch (e) {
        console.warn("No debug log found for session test");
      }

      throw error;
    }
  }, 20000);
});
