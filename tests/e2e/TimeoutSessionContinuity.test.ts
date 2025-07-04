import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

// E2E Test: Timeout with session continuity - focused on session ID preservation
describe("Timeout Session Continuity E2E Tests", () => {
  let tempDir: string;
  // let workflowJsonLogger: WorkflowJsonLogger;
  // let logPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "timeout-session-e2e-"));

    // const fileSystem = new VSCodeFileSystem();
    // const logger = new VSCodeLogger();
    // workflowJsonLogger = new WorkflowJsonLogger(fileSystem, logger);
    // logPath = path.join(tempDir, "timeout-session-test.json");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Helper to execute timeout script and get session ID
  async function executeTimeoutScript(sessionId?: string) {
    const { spawn } = require("child_process"); // eslint-disable-line @typescript-eslint/no-var-requires
    const scriptPath =
      "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-timeout.sh";

    const args = [scriptPath];
    if (sessionId) {
      args.push("-r", sessionId);
    }

    const result = await new Promise<{ output: string; exitCode: number }>(
      (resolve) => {
        const child = spawn("bash", args, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: process.cwd(),
        });

        let stdout = "";
        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        child.on("close", (code: number) => {
          resolve({
            output: stdout.trim(),
            exitCode: code,
          });
        });
      },
    );

    return result;
  }

  // Helper to execute recovery script
  async function executeRecoveryScript(sessionId: string) {
    const { spawn } = require("child_process"); // eslint-disable-line @typescript-eslint/no-var-requires
    const scriptPath =
      "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-timeout-recovery.sh";

    const result = await new Promise<{ output: string; exitCode: number }>(
      (resolve) => {
        const child = spawn("bash", [scriptPath, "-r", sessionId], {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: process.cwd(),
        });

        let stdout = "";
        child.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        child.on("close", (code: number) => {
          resolve({
            output: stdout.trim(),
            exitCode: code,
          });
        });
      },
    );

    return result;
  }

  describe("Session ID Preservation During Timeout", () => {
    test("should preserve session ID in timeout error and continue with same ID on recovery", async () => {
      console.log("🚀 Testing timeout → recovery session continuity");

      // STEP 1: Execute timeout script (new session)
      console.log("\n📋 === STEP 1: Initial timeout (creates new session) ===");
      const timeoutResult1 = await executeTimeoutScript();

      expect(timeoutResult1.exitCode).toBe(1); // Should fail

      const timeoutOutput1 = JSON.parse(timeoutResult1.output);
      expect(timeoutOutput1.type).toBe("error");
      expect(timeoutOutput1.subtype).toBe("timeout");
      expect(timeoutOutput1.session_id).toBeDefined();
      expect(timeoutOutput1.session_id).toMatch(
        /^claude-session-\d+-[a-f0-9]+$/,
      );

      const originalSessionId = timeoutOutput1.session_id;
      console.log(`🔑 Original session ID: ${originalSessionId}`);

      // STEP 2: Recovery with same session ID
      console.log("\n📋 === STEP 2: Recovery with session continuity ===");
      const recoveryResult = await executeRecoveryScript(originalSessionId);

      expect(recoveryResult.exitCode).toBe(0); // Should succeed

      const recoveryOutput = JSON.parse(recoveryResult.output);
      expect(recoveryOutput.type).toBe("result");
      expect(recoveryOutput.subtype).toBe("success");
      expect(recoveryOutput.session_id).toBe(originalSessionId); // CRITICAL: Same session ID

      console.log(`✅ Recovery session ID: ${recoveryOutput.session_id}`);
      console.log(
        `🔗 Session continuity: ${originalSessionId} → ${recoveryOutput.session_id}`,
      );

      // VERIFY: Session continuity maintained
      expect(recoveryOutput.session_id).toBe(originalSessionId);
      console.log(
        "✅ SESSION CONTINUITY VERIFIED: Timeout and recovery used same session ID",
      );
    }, 10000);

    test("should handle multiple timeout retries with session preservation", async () => {
      console.log(
        "🚀 Testing multiple timeout attempts with session preservation",
      );

      // STEP 1: First timeout (creates session)
      const timeout1 = await executeTimeoutScript();
      const timeoutOutput1 = JSON.parse(timeout1.output);
      const sessionId = timeoutOutput1.session_id;

      console.log(`🔑 Session created: ${sessionId}`);

      // STEP 2: Second timeout with same session ID
      console.log(
        "\n📋 === STEP 2: Second timeout with session continuation ===",
      );
      const timeout2 = await executeTimeoutScript(sessionId);
      const timeoutOutput2 = JSON.parse(timeout2.output);

      // CRITICAL: Second timeout should preserve the same session ID
      expect(timeoutOutput2.session_id).toBe(sessionId);
      console.log(
        `🔗 Second timeout preserved session: ${timeoutOutput2.session_id}`,
      );

      // STEP 3: Third timeout with same session ID
      console.log(
        "\n📋 === STEP 3: Third timeout with session continuation ===",
      );
      const timeout3 = await executeTimeoutScript(sessionId);
      const timeoutOutput3 = JSON.parse(timeout3.output);

      // CRITICAL: Third timeout should preserve the same session ID
      expect(timeoutOutput3.session_id).toBe(sessionId);
      console.log(
        `🔗 Third timeout preserved session: ${timeoutOutput3.session_id}`,
      );

      // STEP 4: Final recovery
      console.log("\n📋 === STEP 4: Final recovery with preserved session ===");
      const recovery = await executeRecoveryScript(sessionId);
      const recoveryOutput = JSON.parse(recovery.output);

      // CRITICAL: Recovery should use the same session ID from all timeouts
      expect(recoveryOutput.session_id).toBe(sessionId);
      console.log(`✅ Final recovery session: ${recoveryOutput.session_id}`);

      // VERIFY: Complete session chain maintained
      const sessionChain = [
        timeoutOutput1.session_id,
        timeoutOutput2.session_id,
        timeoutOutput3.session_id,
        recoveryOutput.session_id,
      ];

      expect(sessionChain.every((id) => id === sessionId)).toBe(true);
      console.log(`🔗 Complete session chain: [${sessionChain.join(", ")}]`);
      console.log("✅ MULTIPLE TIMEOUT SESSION CONTINUITY VERIFIED");
    }, 15000);

    test("should demonstrate session continuity matches real Claude Code behavior", async () => {
      console.log(
        "🚀 Testing real Claude Code timeout/retry behavior simulation",
      );

      // This test simulates:
      // 1. claude -p "prompt" → timeout with session_id_A
      // 2. claude -r session_id_A -p "prompt" → timeout with session_id_A
      // 3. claude -r session_id_A -p "prompt" → success with session_id_A

      // Initial command (no -r parameter)
      const initialResult = await executeTimeoutScript();
      const initialOutput = JSON.parse(initialResult.output);
      const sessionId = initialOutput.session_id;

      console.log(`🎯 Simulating: claude -p "prompt"`);
      console.log(`   → Timeout with session_id: ${sessionId}`);

      // Retry command (with -r parameter)
      const retryResult = await executeTimeoutScript(sessionId);
      const retryOutput = JSON.parse(retryResult.output);

      console.log(`🎯 Simulating: claude -r ${sessionId} -p "prompt"`);
      console.log(`   → Timeout with session_id: ${retryOutput.session_id}`);
      expect(retryOutput.session_id).toBe(sessionId);

      // Final success (with -r parameter)
      const successResult = await executeRecoveryScript(sessionId);
      const successOutput = JSON.parse(successResult.output);

      console.log(`🎯 Simulating: claude -r ${sessionId} -p "prompt"`);
      console.log(`   → Success with session_id: ${successOutput.session_id}`);
      expect(successOutput.session_id).toBe(sessionId);

      console.log("✅ REAL CLAUDE CODE BEHAVIOR SIMULATION VERIFIED:");
      console.log("   - Timeout preserves session ID for retry");
      console.log("   - Retry uses same session ID");
      console.log("   - Success continues same session ID");
      console.log(`   - Session consistency: ${sessionId} throughout`);
    }, 10000);
  });
});
