import { jest } from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { PipelineService } from "../../src/services/PipelineService";
import { TaskItem } from "../../src/core/models/Task";
import { DEFAULT_MODEL } from "../../src/models/ClaudeModels";
import { ClaudeWorkflow } from "../../src/types/WorkflowTypes";
import { WorkflowParser } from "../../src/services/WorkflowParser";

describe("Session Isolation E2E Test", () => {
  let pipelineService: PipelineService;
  let testWorkflowsDir: string;
  let testRootPath: string;

  beforeEach(async () => {
    // Create temporary directory for test
    testRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "claude-runner-session-test-"),
    );
    testWorkflowsDir = path.join(testRootPath, ".github", "workflows");

    const mockContext = {
      extensionPath: "/test",
      globalStorageUri: { fsPath: "/tmp/test-storage" },
    };

    // Mock ensureDirectories to avoid environment side effects (per guidelines)
    jest
      .spyOn(PipelineService.prototype as any, "ensureDirectories")
      .mockImplementation(() => Promise.resolve());

    // Create real PipelineService and set test root path
    pipelineService = new PipelineService(mockContext as any);
    await pipelineService.setRootPath(testRootPath);

    // Create the workflows directory manually for real file operations
    await fs.mkdir(testWorkflowsDir, { recursive: true });

    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(testRootPath, { recursive: true, force: true });
    } catch (error) {
      console.warn("Failed to clean up test directory:", error);
    }
  });

  function createTask(
    name: string,
    prompt: string,
    resumeFromTaskId?: string,
  ): TaskItem {
    const task: TaskItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      prompt,
      status: "pending" as const,
      model: DEFAULT_MODEL,
    };

    if (resumeFromTaskId) {
      task.resumeFromTaskId = resumeFromTaskId;
    }

    return task;
  }

  describe("Session Isolation Validation", () => {
    test("should NOT add resume_session when tasks are independent", async () => {
      console.log("=== Testing Independent Tasks (No Session Sharing) ===");

      const task1 = createTask("Task 1", "say a random number that is not 42");
      const task2 = createTask("Task 2", "what is the previous random number?");

      const tasks = [task1, task2];

      await pipelineService.savePipeline(
        "Session Isolation Test",
        "Test that independent tasks don't share sessions",
        tasks,
        DEFAULT_MODEL,
        true,
      );

      // Read and verify the workflow file
      const expectedFilename = "claude-session-isolation-test.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      console.log(
        "Generated workflow steps:",
        JSON.stringify(parsedWorkflow.jobs.pipeline.steps, null, 2),
      );

      // Verify Task 1 has NO resume_session
      expect(
        parsedWorkflow.jobs.pipeline.steps[0]?.with?.resume_session,
      ).toBeUndefined();

      // Verify Task 2 has NO resume_session (this is the bug we're testing)
      expect(
        parsedWorkflow.jobs.pipeline.steps[1]?.with?.resume_session,
      ).toBeUndefined();

      // Verify Task 1 has NO output_session (since no task references it)
      expect(
        parsedWorkflow.jobs.pipeline.steps[0]?.with?.output_session,
      ).toBeUndefined();
    });

    test("should add resume_session ONLY when explicitly configured", async () => {
      console.log("=== Testing Explicit Session Resume ===");

      const task1 = createTask("Task 1", "say a random number that is not 42");
      const task2 = createTask(
        "Task 2",
        "what is the previous random number?",
        task1.id,
      );

      const tasks = [task1, task2];

      await pipelineService.savePipeline(
        "Explicit Session Resume Test",
        "Test that explicit session resume works correctly",
        tasks,
        DEFAULT_MODEL,
        true,
      );

      // Read and verify the workflow file
      const expectedFilename = "claude-explicit-session-resume-test.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      console.log(
        "Generated workflow steps:",
        JSON.stringify(parsedWorkflow.jobs.pipeline.steps, null, 2),
      );

      // Verify Task 1 has NO resume_session
      expect(
        parsedWorkflow.jobs.pipeline.steps[0]?.with?.resume_session,
      ).toBeUndefined();

      // Verify Task 1 HAS output_session (since Task 2 references it)
      expect(parsedWorkflow.jobs.pipeline.steps[0]?.with?.output_session).toBe(
        true,
      );

      // Verify Task 2 HAS resume_session pointing to Task 1
      expect(parsedWorkflow.jobs.pipeline.steps[1]?.with?.resume_session).toBe(
        task1.id,
      );
    });

    test("should handle complex session chains correctly", async () => {
      console.log("=== Testing Complex Session Chains ===");

      const task1 = createTask("Task 1", "Generate a UUID");
      const task2 = createTask("Task 2", "Say hello world"); // Independent
      const task3 = createTask(
        "Task 3",
        "What was the UUID from earlier?",
        task1.id,
      ); // Resume from task1
      const task4 = createTask("Task 4", "What was the greeting?", task2.id); // Resume from task2

      const tasks = [task1, task2, task3, task4];

      await pipelineService.savePipeline(
        "Complex Session Chains Test",
        "Test complex session chain handling",
        tasks,
        DEFAULT_MODEL,
        true,
      );

      const expectedFilename = "claude-complex-session-chains-test.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      const steps = parsedWorkflow.jobs.pipeline.steps;

      // Task 1: No resume, has output (task3 references it)
      expect(steps[0]?.with?.resume_session).toBeUndefined();
      expect(steps[0]?.with?.output_session).toBe(true);

      // Task 2: No resume, has output (task4 references it)
      expect(steps[1]?.with?.resume_session).toBeUndefined();
      expect(steps[1]?.with?.output_session).toBe(true);

      // Task 3: Resumes from task1, no output
      expect(steps[2]?.with?.resume_session).toBe(task1.id);
      expect(steps[2]?.with?.output_session).toBeUndefined();

      // Task 4: Resumes from task2, no output
      expect(steps[3]?.with?.resume_session).toBe(task2.id);
      expect(steps[3]?.with?.output_session).toBeUndefined();
    });
  });

  describe("Current Bug Demonstration", () => {
    test("should demonstrate the current session sharing bug", async () => {
      console.log("=== Demonstrating Current Bug ===");
      console.log("This test shows how the system incorrectly shares sessions");

      // Create the exact workflow from the bug report
      const task1 = createTask("Task 1", "say a random number that is not 42");
      const task2 = createTask("Task 2", "what is the previous random number?");

      const tasks = [task1, task2];

      await pipelineService.savePipeline(
        "test-session",
        "Pipeline execution",
        tasks,
        DEFAULT_MODEL,
        true,
      );

      const expectedFilename = "claude-test-session.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      console.log("Bug demonstration - workflow content:");
      console.log(fileContent);

      // This should pass if the bug is fixed
      // Currently this will fail because the system incorrectly creates session links
      expect(
        parsedWorkflow.jobs.pipeline.steps[1]?.with?.resume_session,
      ).toBeUndefined();

      // Log the actual behavior for debugging
      if (parsedWorkflow.jobs.pipeline.steps[1]?.with?.resume_session) {
        console.log(
          "BUG CONFIRMED: Task 2 has unexpected resume_session:",
          parsedWorkflow.jobs.pipeline.steps[1]?.with?.resume_session,
        );
      }
    });
  });
});
