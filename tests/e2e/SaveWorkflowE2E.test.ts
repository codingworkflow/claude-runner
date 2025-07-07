import { jest } from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { PipelineService } from "../../src/services/PipelineService";
import { TaskItem } from "../../src/core/models/Task";
import { DEFAULT_MODEL } from "../../src/models/ClaudeModels";
import { ClaudeWorkflow } from "../../src/types/WorkflowTypes";
import { WorkflowParser } from "../../src/services/WorkflowParser";

describe("Save Workflow E2E Test", () => {
  let pipelineService: PipelineService;
  let testWorkflowsDir: string;
  let testRootPath: string;
  let tasks: TaskItem[];
  let uiState: {
    showSaveForm: boolean;
    workflowName: string;
    workflowDescription: string;
    hasTasks: boolean;
    hasValidTasks: boolean;
  };

  function createTask(name: string, prompt: string): TaskItem {
    return {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      prompt,
      status: "pending" as const,
      model: DEFAULT_MODEL,
    };
  }

  function simulateAddTask() {
    const newTask = createTask("Task 1", "");
    tasks.push(newTask);
    updateUIState();
  }

  function simulateTaskContentEdit(taskIndex: number, prompt: string) {
    tasks[taskIndex].prompt = prompt;
    updateUIState();
  }

  function simulateSaveWorkflowClick() {
    console.log("🖱️ USER: Clicking 'Save Workflow' button");
    if (!uiState.hasValidTasks) {
      throw new Error("Save Workflow button should be disabled!");
    }
    uiState.showSaveForm = true;
  }

  function simulateFormFill(name: string, description: string) {
    console.log(
      `📝 USER: Filling form - name: "${name}", description: "${description}"`,
    );
    uiState.workflowName = name;
    uiState.workflowDescription = description;
  }

  async function simulateFormSaveClick() {
    console.log("🖱️ USER: Clicking 'Save' button in form");

    if (!uiState.workflowName.trim()) {
      throw new Error("Save button should be disabled when name is empty!");
    }

    const validTasks = tasks.filter((task) => task.prompt.trim());

    console.log(`💾 SYSTEM: Calling savePipeline with:`, {
      name: uiState.workflowName.trim(),
      description: uiState.workflowDescription.trim(),
      taskCount: validTasks.length,
    });

    // Actually save the pipeline using the real service
    await pipelineService.savePipeline(
      uiState.workflowName.trim(),
      uiState.workflowDescription.trim(),
      validTasks,
      DEFAULT_MODEL,
      true, // allowAllTools
    );

    uiState.showSaveForm = false;
    uiState.workflowName = "";
    uiState.workflowDescription = "";
  }

  function updateUIState() {
    uiState.hasTasks = tasks.length > 0;
    uiState.hasValidTasks =
      tasks.length > 0 && tasks.some((task) => task.prompt.trim());
  }

  beforeEach(async () => {
    // Create temporary directory for test
    testRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "claude-runner-test-"),
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

    tasks = [];
    uiState = {
      showSaveForm: false,
      workflowName: "",
      workflowDescription: "",
      hasTasks: false,
      hasValidTasks: false,
    };

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

  describe("Complete Save Workflow Journey", () => {
    test("should save workflow when user completes full flow", async () => {
      console.log("=== STEP 1: Initial state (no tasks) ===");
      expect(uiState.hasTasks).toBe(false);
      expect(uiState.hasValidTasks).toBe(false);

      console.log("=== STEP 2: Add new task ===");
      simulateAddTask();
      expect(tasks).toHaveLength(1);
      expect(uiState.hasTasks).toBe(true);
      expect(uiState.hasValidTasks).toBe(false); // No content yet

      console.log("=== STEP 3: Add content to task ===");
      simulateTaskContentEdit(0, "Test workflow task prompt");
      expect(uiState.hasValidTasks).toBe(true);

      console.log("=== STEP 4: Click Save Workflow button ===");
      simulateSaveWorkflowClick();
      expect(uiState.showSaveForm).toBe(true);

      console.log("=== STEP 5: Fill save form ===");
      simulateFormFill("My Test Workflow", "A workflow for testing");
      expect(uiState.workflowName).toBe("My Test Workflow");
      expect(uiState.workflowDescription).toBe("A workflow for testing");

      console.log("=== STEP 6: Click Save button in form ===");
      await simulateFormSaveClick();

      console.log("=== STEP 7: Verify file was actually saved ===");
      const expectedFilename = "claude-my-test-workflow.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      // Check file exists
      const fileExists = await fs
        .access(expectedFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Read and verify file content
      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      expect(parsedWorkflow.name).toBe("My Test Workflow");
      expect(
        parsedWorkflow.on?.workflow_dispatch?.inputs?.description?.description,
      ).toBe("A workflow for testing");
      expect(parsedWorkflow.jobs.pipeline.steps).toHaveLength(1);
      expect(parsedWorkflow.jobs.pipeline.steps[0]?.with?.prompt).toBe(
        "Test workflow task prompt",
      );
      expect(parsedWorkflow.jobs.pipeline.steps[0]?.with?.model).toBe(
        DEFAULT_MODEL,
      );
      expect(parsedWorkflow.jobs.pipeline.steps[0]?.with?.allow_all_tools).toBe(
        true,
      );

      console.log("=== STEP 8: Verify form closed and cleared ===");
      expect(uiState.showSaveForm).toBe(false);
      expect(uiState.workflowName).toBe("");
      expect(uiState.workflowDescription).toBe("");
    });

    test("should handle save with multiple tasks", async () => {
      console.log("=== Creating workflow with multiple tasks ===");

      simulateAddTask();
      simulateTaskContentEdit(0, "First task prompt");

      const secondTask = createTask("Task 2", "Second task prompt");
      tasks.push(secondTask);
      updateUIState();

      const thirdTask = createTask("Task 3", ""); // Empty task
      tasks.push(thirdTask);
      updateUIState();

      expect(tasks).toHaveLength(3);
      expect(uiState.hasValidTasks).toBe(true);

      simulateSaveWorkflowClick();
      simulateFormFill("Multi Task Workflow", "Workflow with multiple tasks");
      await simulateFormSaveClick();

      const validTasks = tasks.filter((task) => task.prompt.trim());
      expect(validTasks).toHaveLength(2); // Only tasks with content

      // Verify file was created
      const expectedFilename = "claude-multi-task-workflow.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileExists = await fs
        .access(expectedFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Read and verify file content
      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      expect(parsedWorkflow.name).toBe("Multi Task Workflow");
      expect(parsedWorkflow.jobs.pipeline.steps).toHaveLength(2); // Only valid tasks
      expect(parsedWorkflow.jobs.pipeline.steps[0]?.with?.prompt).toBe(
        "First task prompt",
      );
      expect(parsedWorkflow.jobs.pipeline.steps[1]?.with?.prompt).toBe(
        "Second task prompt",
      );
    });

    test("should handle save with no description", async () => {
      simulateAddTask();
      simulateTaskContentEdit(0, "Task with no description");

      simulateSaveWorkflowClick();
      simulateFormFill("No Description Workflow", "");
      await simulateFormSaveClick();

      // Verify file was created
      const expectedFilename = "claude-no-description-workflow.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileExists = await fs
        .access(expectedFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Read and verify file content
      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      expect(parsedWorkflow.name).toBe("No Description Workflow");
      expect(
        parsedWorkflow.on?.workflow_dispatch?.inputs?.description?.description,
      ).toBe("Pipeline execution");
    });

    test("should trim whitespace from workflow name and description", async () => {
      simulateAddTask();
      simulateTaskContentEdit(0, "Test task");

      simulateSaveWorkflowClick();
      simulateFormFill("  Trimmed Workflow  ", "  Description with spaces  ");
      await simulateFormSaveClick();

      // Verify file was created with trimmed name
      const expectedFilename = "claude-trimmed-workflow.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileExists = await fs
        .access(expectedFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Read and verify file content
      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      expect(parsedWorkflow.name).toBe("Trimmed Workflow");
      expect(
        parsedWorkflow.on?.workflow_dispatch?.inputs?.description?.description,
      ).toBe("Description with spaces");
    });
  });

  describe("Save Button State Management", () => {
    test("should disable Save Workflow button when no valid tasks", () => {
      simulateAddTask();
      expect(uiState.hasValidTasks).toBe(false);

      expect(() => simulateSaveWorkflowClick()).toThrow(
        "Save Workflow button should be disabled!",
      );
    });

    test("should disable form Save button when name is empty", async () => {
      simulateAddTask();
      simulateTaskContentEdit(0, "Test task");
      simulateSaveWorkflowClick();

      simulateFormFill("", "Description");

      await expect(simulateFormSaveClick()).rejects.toThrow(
        "Save button should be disabled when name is empty!",
      );
    });

    test("should allow save with empty description but valid name", async () => {
      simulateAddTask();
      simulateTaskContentEdit(0, "Test task");
      simulateSaveWorkflowClick();

      simulateFormFill("Valid Name", "");

      await expect(simulateFormSaveClick()).resolves.not.toThrow();

      // Verify file was created
      const expectedFilename = "claude-valid-name.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileExists = await fs
        .access(expectedFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe("Real Component Integration", () => {
    test("should use actual TaskItem structure", () => {
      simulateAddTask();

      const task = tasks[0];
      expect(task).toHaveProperty("id");
      expect(task).toHaveProperty("name");
      expect(task).toHaveProperty("prompt");
      expect(task).toHaveProperty("status");
      expect(task).toHaveProperty("model");

      expect(typeof task.id).toBe("string");
      expect(typeof task.name).toBe("string");
      expect(typeof task.prompt).toBe("string");
      expect(task.status).toBe("pending");
      expect(task.model).toBe(DEFAULT_MODEL);
    });

    test("should filter tasks correctly for save", async () => {
      const tasksWithMixedContent = [
        createTask("Task 1", "Valid content"),
        createTask("Task 2", ""),
        createTask("Task 3", "   "), // Only whitespace
        createTask("Task 4", "Another valid task"),
      ];

      tasks.push(...tasksWithMixedContent);
      updateUIState();

      simulateSaveWorkflowClick();
      simulateFormFill("Test Workflow", "Test");
      await simulateFormSaveClick();

      // Verify only valid tasks were saved
      const expectedFilename = "claude-test-workflow.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileContent = await fs.readFile(expectedFilePath, "utf-8");
      const parsedWorkflow: ClaudeWorkflow =
        WorkflowParser.parseYaml(fileContent);

      expect(parsedWorkflow.jobs.pipeline.steps).toHaveLength(2);
      expect(parsedWorkflow.jobs.pipeline.steps[0]?.with?.prompt).toBe(
        "Valid content",
      );
      expect(parsedWorkflow.jobs.pipeline.steps[1]?.with?.prompt).toBe(
        "Another valid task",
      );
    });
  });

  describe("Error Scenarios", () => {
    test("should handle file system errors gracefully", async () => {
      // Make the test directory read-only to simulate permission errors
      await fs.mkdir(testWorkflowsDir, { recursive: true });
      await fs.chmod(testWorkflowsDir, 0o444); // Read-only

      simulateAddTask();
      simulateTaskContentEdit(0, "Test task");
      simulateSaveWorkflowClick();
      simulateFormFill("Test Workflow", "Test");

      await expect(simulateFormSaveClick()).rejects.toThrow();

      // Reset permissions for cleanup
      await fs.chmod(testWorkflowsDir, 0o755);
    });

    test("should handle invalid workflow name characters", async () => {
      simulateAddTask();
      simulateTaskContentEdit(0, "Test task");
      simulateSaveWorkflowClick();
      simulateFormFill("Test/Workflow\\With<>Special*Characters", "Test");
      await simulateFormSaveClick();

      // Verify file was created with sanitized name (matches PipelineService logic)
      const expectedFilename =
        "claude-test-workflow-with--special-characters.yml";
      const expectedFilePath = path.join(testWorkflowsDir, expectedFilename);

      const fileExists = await fs
        .access(expectedFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });
  });
});
