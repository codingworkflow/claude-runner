import { jest } from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import { ClaudeCodeService } from "../../src/services/ClaudeCodeService";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import { ClaudeWorkflow } from "../../src/types/WorkflowTypes";

describe("Command Execution Session Isolation E2E Test", () => {
  let claudeCodeService: ClaudeCodeService;
  let pipelineService: PipelineService;
  let capturedCommands: string[][];
  let fixturesPath: string;

  beforeEach(async () => {
    fixturesPath = path.join(__dirname, "..", "fixtures", "workflows");

    // Mock configuration service
    const mockConfigService = {
      get: jest.fn().mockReturnValue("claude"),
      getConfig: jest.fn().mockReturnValue({}),
    };

    const mockContext = {
      extensionPath: "/test",
      globalStorageUri: { fsPath: "/tmp/test-storage" },
    };

    claudeCodeService = new ClaudeCodeService(mockConfigService as any);
    pipelineService = new PipelineService(mockContext as any);

    // Mock ensureDirectories to avoid environment side effects
    jest
      .spyOn(PipelineService.prototype as any, "ensureDirectories")
      .mockImplementation(() => Promise.resolve());

    // THIS IS THE KEY: Capture all executeCommand calls to validate session arguments
    capturedCommands = [];
    jest
      .spyOn(claudeCodeService as any, "executeCommand")
      .mockImplementation(async (...args: any[]) => {
        const commandArgs = args[0] as string[];
        capturedCommands.push([...commandArgs]);

        console.log(`🔍 CAPTURED COMMAND: ${commandArgs.join(" ")}`);

        // Mock successful execution with deterministic session ID
        const sessionId = `mock-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return {
          success: true,
          output: JSON.stringify({
            result: `Mock result for command: ${commandArgs.join(" ")}`,
            session_id: sessionId,
          }),
          error: undefined,
        };
      });

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Session Isolation Validation via Command Arguments", () => {
    test("should execute isolated tasks WITHOUT -r flag (using isolated-tasks.yml fixture)", async () => {
      console.log("=== TESTING: Isolated Tasks (NO Session Continuity) ===");

      // Load workflow from fixture
      const workflowPath = path.join(fixturesPath, "isolated-tasks.yml");
      const workflowContent = await fs.readFile(workflowPath, "utf-8");
      const workflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(workflowContent);

      console.log(`📄 Loaded workflow: ${workflow.name}`);
      console.log(`📋 Steps: ${workflow.jobs.pipeline.steps.length}`);

      // Verify fixture has NO resume_session
      expect(
        workflow.jobs.pipeline.steps[0]?.with?.resume_session,
      ).toBeUndefined();
      expect(
        workflow.jobs.pipeline.steps[1]?.with?.resume_session,
      ).toBeUndefined();
      console.log("✅ Fixture validation: No resume_session fields found");

      // Convert workflow to tasks
      const tasks = pipelineService.workflowToTaskItems(workflow);
      console.log(`🔧 Converted to ${tasks.length} tasks`);

      // Verify no resumeFromTaskId in tasks
      expect(tasks[0].resumeFromTaskId).toBeUndefined();
      expect(tasks[1].resumeFromTaskId).toBeUndefined();
      console.log("✅ Task validation: No resumeFromTaskId fields found");

      const mockCallbacks = {
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Execute the pipeline
      console.log("🚀 Executing pipeline...");
      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { outputFormat: "json" },
        mockCallbacks.onProgress,
        mockCallbacks.onComplete,
        mockCallbacks.onError,
      );

      console.log("🔍 VALIDATION: Command Analysis");
      console.log(`📊 Total commands captured: ${capturedCommands.length}`);

      // CRITICAL VALIDATION: Verify NO -r flags in ANY commands
      capturedCommands.forEach((cmd, index) => {
        console.log(`Command ${index + 1}: ${cmd.join(" ")}`);
        expect(cmd).not.toContain("-r");
      });

      // Verify we have exactly 2 commands (one per task)
      expect(capturedCommands).toHaveLength(2);

      // Verify first command structure
      const task1Command = capturedCommands[0];
      expect(task1Command[0]).toBe("claude");
      expect(task1Command).toContain("-p");
      expect(task1Command).toContain("'say a random number that is not 42'");
      expect(task1Command).not.toContain("-r");
      console.log("✅ Task 1: No session resume (-r flag absent)");

      // Verify second command structure
      const task2Command = capturedCommands[1];
      expect(task2Command[0]).toBe("claude");
      expect(task2Command).toContain("-p");
      expect(task2Command).toContain("'what is the previous random number?'");
      expect(task2Command).not.toContain("-r");
      console.log("✅ Task 2: No session resume (-r flag absent)");

      console.log(
        "🎉 SESSION ISOLATION VALIDATED: Both tasks run independently",
      );
    });

    test("should execute session continuity tasks WITH -r flag (using session-continuity.yml fixture)", async () => {
      console.log("=== TESTING: Session Continuity (WITH Session Resume) ===");

      // Load workflow from fixture
      const workflowPath = path.join(fixturesPath, "session-continuity.yml");
      const workflowContent = await fs.readFile(workflowPath, "utf-8");
      const workflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(workflowContent);

      console.log(`📄 Loaded workflow: ${workflow.name}`);
      console.log(`📋 Steps: ${workflow.jobs.pipeline.steps.length}`);

      // Verify fixture has correct resume_session setup
      expect(
        workflow.jobs.pipeline.steps[0]?.with?.resume_session,
      ).toBeUndefined();
      expect(workflow.jobs.pipeline.steps[0]?.with?.output_session).toBe(true);
      expect(workflow.jobs.pipeline.steps[1]?.with?.resume_session).toBe(
        "task_generate_number",
      );
      console.log(
        "✅ Fixture validation: Correct resume_session configuration",
      );

      // Convert workflow to tasks
      const tasks = pipelineService.workflowToTaskItems(workflow);
      console.log(`🔧 Converted to ${tasks.length} tasks`);

      // Verify resumeFromTaskId is set correctly
      expect(tasks[0].resumeFromTaskId).toBeUndefined();
      expect(tasks[1].resumeFromTaskId).toBe("task_generate_number");
      console.log(
        "✅ Task validation: resumeFromTaskId correctly set for task 2",
      );

      const mockCallbacks = {
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      // Execute the pipeline
      console.log("🚀 Executing pipeline...");
      await claudeCodeService.runTaskPipeline(
        tasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { outputFormat: "json" },
        mockCallbacks.onProgress,
        mockCallbacks.onComplete,
        mockCallbacks.onError,
      );

      console.log("🔍 VALIDATION: Command Analysis");
      console.log(`📊 Total commands captured: ${capturedCommands.length}`);

      // Verify we have exactly 2 commands
      expect(capturedCommands).toHaveLength(2);

      // Verify first command has NO -r flag
      const task1Command = capturedCommands[0];
      console.log(`Command 1: ${task1Command.join(" ")}`);
      expect(task1Command[0]).toBe("claude");
      expect(task1Command).toContain("-p");
      expect(task1Command).toContain("'say a random number that is not 42'");
      expect(task1Command).not.toContain("-r");
      console.log("✅ Task 1: No session resume (-r flag absent)");

      // CRITICAL: Verify second command HAS -r flag
      const task2Command = capturedCommands[1];
      console.log(`Command 2: ${task2Command.join(" ")}`);
      expect(task2Command[0]).toBe("claude");
      expect(task2Command).toContain("-p");
      expect(task2Command).toContain("'what is the previous random number?'");
      expect(task2Command).toContain("-r");

      // Verify the session ID is present after -r flag
      const resumeIndex = task2Command.indexOf("-r");
      expect(resumeIndex).toBeGreaterThan(-1);
      expect(task2Command[resumeIndex + 1]).toBeDefined();
      expect(typeof task2Command[resumeIndex + 1]).toBe("string");
      console.log(
        `✅ Task 2: Session resume confirmed (-r ${task2Command[resumeIndex + 1]})`,
      );

      console.log(
        "🎉 SESSION CONTINUITY VALIDATED: Task 2 resumes from Task 1",
      );
    });
  });

  describe("Edge Cases and Validation", () => {
    test("should demonstrate the exact command difference between isolated vs continuity", async () => {
      console.log("=== DEMONSTRATION: Command Difference Analysis ===");

      // Test isolated workflow
      console.log("🔬 Testing isolated workflow...");
      const isolatedWorkflowPath = path.join(
        fixturesPath,
        "isolated-tasks.yml",
      );
      const isolatedContent = await fs.readFile(isolatedWorkflowPath, "utf-8");
      const isolatedWorkflow = WorkflowParser.parseYaml(isolatedContent);
      const isolatedTasks =
        pipelineService.workflowToTaskItems(isolatedWorkflow);

      capturedCommands = []; // Reset

      await claudeCodeService.runTaskPipeline(
        isolatedTasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { outputFormat: "json" },
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );

      const isolatedCommands = [...capturedCommands];

      // Test continuity workflow
      console.log("🔬 Testing continuity workflow...");
      const continuityWorkflowPath = path.join(
        fixturesPath,
        "session-continuity.yml",
      );
      const continuityContent = await fs.readFile(
        continuityWorkflowPath,
        "utf-8",
      );
      const continuityWorkflow = WorkflowParser.parseYaml(continuityContent);
      const continuityTasks =
        pipelineService.workflowToTaskItems(continuityWorkflow);

      capturedCommands = []; // Reset

      await claudeCodeService.runTaskPipeline(
        continuityTasks,
        "claude-sonnet-4-20250514",
        "/test/workspace",
        { outputFormat: "json" },
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );

      const continuityCommands = [...capturedCommands];

      console.log("📊 COMMAND COMPARISON:");
      console.log("🔸 ISOLATED Task 1:", isolatedCommands[0]?.join(" "));
      console.log("🔸 ISOLATED Task 2:", isolatedCommands[1]?.join(" "));
      console.log("🔹 CONTINUITY Task 1:", continuityCommands[0]?.join(" "));
      console.log("🔹 CONTINUITY Task 2:", continuityCommands[1]?.join(" "));

      // Validate the key differences
      expect(isolatedCommands[0]).not.toContain("-r");
      expect(isolatedCommands[1]).not.toContain("-r");
      expect(continuityCommands[0]).not.toContain("-r");
      expect(continuityCommands[1]).toContain("-r");

      console.log("✅ VALIDATION COMPLETE: Command patterns verified");
      console.log("   - Isolated: Neither task uses -r flag");
      console.log("   - Continuity: Only task 2 uses -r flag");
    });
  });
});
