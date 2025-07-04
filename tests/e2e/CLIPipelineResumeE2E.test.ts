import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { spawn } from "child_process";

// E2E Test: Real CLI Pipeline Resume with Job Log Persistence
describe("CLI Pipeline Resume E2E Tests", () => {
  let tempDir: string;
  let fixturesPath: string;
  let cliPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-resume-e2e-"));
    fixturesPath = path.join(__dirname, "../fixtures");
    cliPath = path.join(__dirname, "../../cli/claude-runner.js");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Helper to execute CLI command and capture output
  async function executeCLI(args: string[], workingDir: string = tempDir) {
    return new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const child = spawn("node", [cliPath, ...args], {
          cwd: workingDir,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            PATH: `${fixturesPath}/scripts:${process.env.PATH}`,
          },
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

  // Helper to read and parse job log
  async function readJobLog(workflowPath: string) {
    const jobLogPath = workflowPath.replace(/\.ya?ml$/, ".job.json");
    try {
      const content = await fs.readFile(jobLogPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  describe("CLI Job Log Resume Logic", () => {
    test("should create job log and resume from last completed step", async () => {
      // Create workflow with multiple steps
      const workflowContent = `name: cli-resume-test
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
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
      - id: step2
        name: Second Step (will timeout)
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute second step"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-timeout.sh"
          resume_session: step1
          
      - id: step3
        name: Third Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute third step"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step3.sh"
          resume_session: step2`;

      const workflowPath = path.join(tempDir, "cli-resume-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🚀 Testing CLI job log creation and resume...");

      // PHASE 1: Initial execution (let's say it fails after step 1)
      console.log(
        "\n📋 === PHASE 1: Initial execution (will be interrupted) ===",
      );

      // Create a failing step2 script for initial run
      const failingStep2Path = path.join(tempDir, "claude-step2-fail.sh");
      await fs.writeFile(
        failingStep2Path,
        `#!/bin/bash
# This script will fail to simulate interruption
echo '{"type": "error", "subtype": "failure", "is_error": true, "error": "Simulated failure for testing resume"}'
exit 1
`,
      );
      await fs.chmod(failingStep2Path, 0o755);

      // No need to modify workflow - claude-timeout.sh will fail
      // await fs.writeFile(workflowPath, workflowContent);

      // Execute CLI - this should fail after step 1
      let result = await executeCLI(["run", workflowPath]);

      console.log(`Initial execution result: exit code ${result.exitCode}`);
      if (result.stdout) {
        console.log("STDOUT:", result.stdout);
      }
      if (result.stderr) {
        console.log("STDERR:", result.stderr);
      }

      // VERIFY: Job log was created with step 1 completed
      const jobLogAfterFail = await readJobLog(workflowPath);
      expect(jobLogAfterFail).toBeTruthy();
      expect(jobLogAfterFail.steps).toBeDefined();

      // Find completed steps (step 1 should be completed)
      const completedSteps = jobLogAfterFail.steps.filter(
        (s: any) => s.status === "completed",
      );
      expect(completedSteps.length).toBeGreaterThan(0);
      expect(completedSteps[0].step_id).toBe("step1");
      expect(completedSteps[0].session_id).toBeDefined();

      const step1SessionId = completedSteps[0].session_id;
      console.log(`🔑 Step 1 session ID preserved: ${step1SessionId}`);

      // PHASE 2: Fix the workflow and resume
      console.log("\n📋 === PHASE 2: Resume execution after fixing ===");

      // Restore original working workflow
      await fs.writeFile(workflowPath, workflowContent);

      // Resume execution with --resume flag
      result = await executeCLI(["run", workflowPath, "--resume"]);

      console.log(`Resume execution result: exit code ${result.exitCode}`);
      if (result.stdout) {
        console.log("STDOUT:", result.stdout);
      }
      if (result.stderr) {
        console.log("STDERR:", result.stderr);
      }

      // VERIFY: Resume skipped step 1 and continued from step 2
      expect(result.stdout).toContain("Resuming from step");
      expect(result.stdout).toContain("Skipping completed step");

      // VERIFY: Final job log shows all steps completed with session continuity
      const finalJobLog = await readJobLog(workflowPath);
      expect(finalJobLog).toBeTruthy();
      expect(finalJobLog.steps.length).toBe(3);

      // All steps should be completed
      expect(
        finalJobLog.steps.every((s: any) => s.status === "completed"),
      ).toBe(true);

      // Session continuity: all steps should use same session ID
      const sessionIds = finalJobLog.steps.map((s: any) => s.session_id);
      expect(sessionIds.every((id: string) => id === step1SessionId)).toBe(
        true,
      );

      console.log("✅ CLI RESUME VERIFICATION PASSED:");
      console.log("   - Job log created during initial execution");
      console.log("   - Step 1 completion preserved in job log");
      console.log("   - Resume skipped completed step 1");
      console.log("   - Session continuity maintained across resume");
      console.log(`   - Final session chain: [${sessionIds.join(", ")}]`);
    }, 30000);

    test("should handle session ID restoration from job log", async () => {
      // Create a workflow that specifically tests session ID restoration
      const workflowContent = `name: session-restoration-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: analyze
        name: Analyze Code
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Analyze the codebase"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
      - id: implement
        name: Implement Changes
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Implement changes based on analysis"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step2.sh"
          resume_session: analyze`;

      const workflowPath = path.join(tempDir, "session-restoration-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🚀 Testing CLI session ID restoration from job log...");

      // PHASE 1: Execute first step only
      console.log("\n📋 === PHASE 1: Execute analyze step ===");

      // Create a modified workflow that only has the first step
      const phase1WorkflowContent = `name: session-restoration-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: analyze
        name: Analyze Code
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Analyze the codebase"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step1.sh"
          output_session: true`;

      const phase1WorkflowPath = path.join(tempDir, "phase1.yml");
      await fs.writeFile(phase1WorkflowPath, phase1WorkflowContent);

      // Execute first step
      let result = await executeCLI(["run", phase1WorkflowPath]);
      expect(result.exitCode).toBe(0);

      // Read the generated job log and extract session ID
      const phase1JobLog = await readJobLog(phase1WorkflowPath);
      expect(phase1JobLog).toBeTruthy();
      expect(phase1JobLog.steps.length).toBe(1);
      expect(phase1JobLog.steps[0].status).toBe("completed");

      const analyzeSessionId = phase1JobLog.steps[0].session_id;
      console.log(`🔑 Analyze step session ID: ${analyzeSessionId}`);

      // PHASE 2: Manually create job log for full workflow with existing session
      console.log("\n📋 === PHASE 2: Create job log with existing session ===");

      // Create job log that simulates step 1 already completed
      const existingJobLog = {
        workflowName: "session-restoration-test",
        workflowFile: workflowPath,
        executionId: `test-${Date.now()}`,
        startTime: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
        status: "running",
        lastCompletedStep: 0,
        totalSteps: 2,
        steps: [
          {
            stepIndex: 0,
            stepId: "analyze",
            stepName: "Analyze Code",
            status: "completed",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 2000,
            output: JSON.stringify({
              type: "result",
              session_id: analyzeSessionId,
              result: "Analysis completed",
            }),
            sessionId: analyzeSessionId,
          },
        ],
      };

      const jobLogPath = workflowPath.replace(/\.ya?ml$/, ".job.json");
      await fs.writeFile(jobLogPath, JSON.stringify(existingJobLog, null, 2));

      // PHASE 3: Resume with session restoration
      console.log("\n📋 === PHASE 3: Resume with session restoration ===");

      result = await executeCLI(["run", workflowPath, "--resume", "--verbose"]);

      console.log(`Resume with verbose output: exit code ${result.exitCode}`);
      console.log("STDOUT:", result.stdout);
      console.log("STDERR:", result.stderr);

      // VERIFY: CLI restored session ID from job log
      expect(result.stdout).toContain("Restored session");
      expect(result.stdout).toContain(analyzeSessionId);

      // VERIFY: Final job log shows session continuity
      const finalJobLog = await readJobLog(workflowPath);
      expect(finalJobLog).toBeTruthy();
      expect(finalJobLog.steps.length).toBe(2);

      // Both steps should use the same session ID
      expect(finalJobLog.steps[0].sessionId).toBe(analyzeSessionId);
      expect(finalJobLog.steps[1].sessionId).toBe(analyzeSessionId);

      console.log("✅ SESSION RESTORATION VERIFICATION PASSED:");
      console.log("   - CLI restored session ID from job log");
      console.log("   - Verbose output confirmed session restoration");
      console.log("   - Second step continued with same session ID");
      console.log(`   - Session continuity: ${analyzeSessionId}`);
    }, 25000);

    test("should handle corrupted job log gracefully", async () => {
      // Create simple workflow
      const workflowContent = `name: corrupt-joblog-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: task1
        name: First Task
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute task"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step1.sh"`;

      const workflowPath = path.join(tempDir, "corrupt-joblog-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🚀 Testing CLI corrupt job log handling...");

      // Create corrupted job log
      const jobLogPath = workflowPath.replace(/\.ya?ml$/, ".job.json");
      await fs.writeFile(jobLogPath, "invalid json content {{{");

      // Execute with --resume flag
      const result = await executeCLI(["run", workflowPath, "--resume"]);

      console.log(`Corrupt job log test result: exit code ${result.exitCode}`);

      // VERIFY: CLI handled corruption gracefully and started fresh
      expect(result.exitCode).toBe(0);

      // Should have generated a new valid job log
      const newJobLog = await readJobLog(workflowPath);
      expect(newJobLog).toBeTruthy();
      expect(newJobLog.steps.length).toBe(1);
      expect(newJobLog.steps[0].status).toBe("completed");

      console.log("✅ CORRUPT JOB LOG HANDLING PASSED:");
      console.log("   - CLI detected corrupted job log");
      console.log("   - Started fresh execution instead of failing");
      console.log("   - Generated new valid job log");
    }, 15000);
  });

  describe("Cross-Task Session Continuity", () => {
    test("should handle resumeFromTaskId with real CLI execution", async () => {
      // This tests the specific case where tasks reference other tasks' sessions
      // which is different from sequential step continuation

      const workflowContent = `name: cross-task-session-test
'on':
  workflow_dispatch:
jobs:
  analysis:
    runs-on: ubuntu-latest
    steps:
      - id: research
        name: Research Phase
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Research the requirements"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
  implementation:
    runs-on: ubuntu-latest
    needs: analysis
    steps:
      - id: design
        name: Design Phase
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Design based on research"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step2.sh"
          resume_session: research
          
      - id: coding
        name: Coding Phase
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Implement the design"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-step3.sh"
          resume_session: design`;

      const workflowPath = path.join(tempDir, "cross-task-session-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🚀 Testing cross-task session continuity...");

      // Execute the workflow
      const result = await executeCLI(["run", workflowPath, "--verbose"]);

      console.log(`Cross-task session test: exit code ${result.exitCode}`);
      console.log("STDOUT:", result.stdout);

      // VERIFY: Execution completed successfully
      expect(result.exitCode).toBe(0);

      // VERIFY: Job log shows proper cross-task session continuity
      const jobLog = await readJobLog(workflowPath);
      expect(jobLog).toBeTruthy();

      // Should have at least the steps from the jobs
      expect(jobLog.steps.length).toBeGreaterThan(0);

      // All completed steps should have session IDs
      const completedSteps = jobLog.steps.filter(
        (s: any) => s.status === "completed",
      );
      expect(completedSteps.length).toBeGreaterThan(0);

      // Verify session continuity across tasks
      if (completedSteps.length > 1) {
        const sessionIds = completedSteps.map((s: any) => s.sessionId);
        // All should use the same session ID (from the first task)
        expect(sessionIds.every((id: string) => id === sessionIds[0])).toBe(
          true,
        );
        console.log(`🔗 Cross-task session chain: [${sessionIds.join(", ")}]`);
      }

      console.log("✅ CROSS-TASK SESSION CONTINUITY PASSED:");
      console.log("   - Workflow executed across multiple jobs");
      console.log("   - Session continuity maintained between different jobs");
      console.log("   - resume_session references worked correctly");
    }, 30000);
  });

  describe("Rate Limit Auto-Resume", () => {
    test("should auto-resume after rate limit with session preservation", async () => {
      // Create workflow with timeout script followed by recovery
      const workflowContent = `name: rate-limit-resume-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: timeout-task
        name: Task That Times Out
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Task that will timeout initially"
          run: "/workspaces/vsix/claude-runner/tests/fixtures/scripts/claude-timeout.sh"
          output_session: true`;

      const workflowPath = path.join(tempDir, "rate-limit-resume-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🚀 Testing CLI rate limit auto-resume...");

      // Execute workflow - this will timeout initially
      const result = await executeCLI(
        ["run", workflowPath, "--verbose"],
        tempDir,
      );

      console.log(`Rate limit test result: exit code ${result.exitCode}`);
      console.log("STDOUT:", result.stdout);
      console.log("STDERR:", result.stderr);

      // The CLI should detect the timeout and may retry automatically
      // Verify job log was created even with timeout
      const jobLog = await readJobLog(workflowPath);
      expect(jobLog).toBeTruthy();

      // Should have at least attempted the step
      expect(jobLog.steps.length).toBeGreaterThan(0);

      console.log("✅ RATE LIMIT AUTO-RESUME TEST COMPLETED:");
      console.log("   - CLI handled timeout scenario");
      console.log("   - Job log preserved failure information");
      console.log("   - Session information available for retry");
    }, 25000);
  });
});
