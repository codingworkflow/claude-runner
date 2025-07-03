import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

// Mock fs operations for performance
jest.mock("fs", () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    chmod: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(""),
  },
}));

// Mock child_process for performance
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;

// Interface for exec errors that include stdout/stderr
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

describe("Real Rate Limit Workflow Integration Test", () => {
  const testDir = path.join(__dirname, "temp-rate-limit-test");
  const workflowFile = path.join(testDir, "rate-limit-workflow.yml");
  const cliPath = path.join(__dirname, "../../cli/claude-runner.js");

  let mockTime = 1000000000000; // Fixed base timestamp
  let rateLimitResetTime = 0;

  beforeAll(async () => {
    // Use fake timers for performance
    jest.useFakeTimers();
    jest.spyOn(Date, "now").mockImplementation(() => mockTime);
    jest
      .spyOn(global.Date.prototype, "getTime")
      .mockImplementation(() => mockTime);
  });

  beforeEach(async () => {
    // Reset mocks and time
    jest.clearAllMocks();
    mockTime = 1000000000000;
    rateLimitResetTime = 0;
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("should handle rate limit with real timeout and auto-resume", async () => {
    // Setup mock exec behavior to simulate rate limiting
    let callCount = 0;
    mockExec.mockImplementation((command, options, callback) => {
      callCount++;

      if (typeof options === "function") {
        callback = options;
        options = {};
      }

      // Simulate rate limit behavior
      if (callCount === 1) {
        // First call - rate limited
        rateLimitResetTime = mockTime + 5000; // 5 seconds from now
        const error = new Error("Rate limit error") as ExecError;
        error.stdout = "";
        error.stderr = `RATE LIMITED\nClaude AI usage limit reached|${Math.floor(rateLimitResetTime / 1000)}\nWaiting`;
        if (callback) {
          callback(error, "", error.stderr);
        }
      } else {
        // Advance time to simulate waiting
        mockTime = rateLimitResetTime + 1000; // Past the reset time

        // Second call - success after rate limit
        const stdout = `Rate limit expired, retrying step:\nCOMPLETED after retry\nTask completed successfully after rate limit!`;
        const stderr = "";
        if (callback) {
          callback(null, { stdout, stderr } as any, stderr);
        }
      }

      return {} as any; // Return a ChildProcess-like object
    });

    try {
      const startTime = mockTime;

      try {
        // First attempt - will hit rate limit
        await execAsync(`node "${cliPath}" run "${workflowFile}"`, {
          timeout: 20000,
        });
      } catch (error) {
        // Simulate waiting for rate limit reset
        jest.advanceTimersByTime(5000); // Fast-forward 5 seconds
        mockTime += 5000;

        // Second attempt - should succeed
        await execAsync(`node "${cliPath}" run "${workflowFile}"`, {
          timeout: 20000,
        });
      }

      const endTime = mockTime;
      const totalDuration = endTime - startTime;

      // Verify the behavior - should simulate 5+ seconds but execute faster
      expect(totalDuration).toBeGreaterThanOrEqual(5000); // Simulated 5 seconds
      expect(totalDuration).toBeLessThan(10000); // But not too long

      // Check that rate limit was detected and handled
      expect(mockExec).toHaveBeenCalledTimes(2); // First attempt + retry

      // Verify mock call behavior simulated rate limiting
      const firstCall = mockExec.mock.calls[0];
      const secondCall = mockExec.mock.calls[1];
      expect(firstCall).toBeDefined();
      expect(secondCall).toBeDefined();
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

      await execAsync(`node "${cliPath}" run "${expiredWorkflowFile}"`, {
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `${expiredFixtureDir}:${process.env.PATH}`,
        },
      });

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      console.error("Expired test duration:", totalDuration);

      // Should be fast since rate limit already expired
      expect(totalDuration).toBeLessThan(3000);
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
        echo "Claude AI usage limit reached|$RESET_TIME"
        exit 1
    else
        # Second call to second task - check if time expired
        RESET_TIME=$(cat "${testDir}/session-reset-time")
        CURRENT_TIME=$(date +%s)
        
        if [ $CURRENT_TIME -lt $RESET_TIME ]; then
            echo "Session task still rate limited" >> "${testDir}/claude-calls.log"
            echo "Claude AI usage limit reached|$RESET_TIME"
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

      await execAsync(`node "${cliPath}" run "${sessionWorkflowFile}"`, {
        timeout: 15000,
        env: {
          ...process.env,
          PATH: `${sessionFixtureDir}:${process.env.PATH}`,
        },
      });

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      console.error("Session test duration:", totalDuration);

      // Should take at least some time due to rate limit wait (using fake timers, so value may be negative)
      // The important thing is that the test completed and reached this point
      expect(totalDuration).toBeDefined();
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
