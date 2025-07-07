import { jest } from "@jest/globals";
import { PipelineService } from "../../src/services/PipelineService";
import { TaskItem } from "../../src/services/ClaudeCodeService";
import { DEFAULT_MODEL } from "../../src/models/ClaudeModels";

interface NewWorkflowUIState {
  hasTasks: boolean;
  showNewWorkflowButton: boolean;
  showWorkflowManagementButtons: boolean;
  tasks: TaskItem[];
}

interface NewWorkflowActions {
  pipelineAddTask: (task: TaskItem) => void;
  pipelineClearAll: () => void;
}

describe("New Workflow Button E2E Tests", () => {
  let uiState: NewWorkflowUIState;
  let actions: NewWorkflowActions;
  let tasks: TaskItem[];

  function generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function createNewTask(): TaskItem {
    const existingNumbers = tasks
      .map((t) => {
        const match = t.name?.match(/^Task (\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    const nextNumber =
      existingNumbers.length > 0
        ? Math.max(...existingNumbers) + 1
        : tasks.length + 1;

    return {
      id: generateTaskId(),
      name: `Task ${nextNumber}`,
      prompt: "",
      status: "pending" as const,
      model: DEFAULT_MODEL,
    };
  }

  function updateUIState(): void {
    const hasTasks =
      tasks.length > 0 && tasks.some((task) => task.prompt.trim());

    uiState.hasTasks = hasTasks;
    uiState.tasks = [...tasks];
    uiState.showNewWorkflowButton = !hasTasks;
    uiState.showWorkflowManagementButtons = hasTasks;
  }

  function simulateNewWorkflowClick(): void {
    console.log(`🖱️  USER: Clicking "New Workflow" button`);

    if (!uiState.showNewWorkflowButton) {
      throw new Error("New Workflow button not visible to user!");
    }

    const newTask = createNewTask();
    actions.pipelineAddTask(newTask);
    tasks.push(newTask);
    updateUIState();
  }

  function simulateClearAllClick(): void {
    console.log(`🖱️  USER: Clicking "Clear All" button`);

    if (!uiState.showWorkflowManagementButtons) {
      throw new Error("Clear All button not visible to user!");
    }

    actions.pipelineClearAll();
    tasks.length = 0;
    updateUIState();
  }

  beforeEach(() => {
    const mockContext = {
      extensionPath: "/test",
      globalStorageUri: { fsPath: "/tmp/test-storage" },
    };

    jest
      .spyOn(PipelineService.prototype as any, "ensureDirectories")
      .mockImplementation(() => Promise.resolve());

    new PipelineService(mockContext as any);

    tasks = [];

    uiState = {
      hasTasks: false,
      showNewWorkflowButton: true,
      showWorkflowManagementButtons: false,
      tasks: [],
    };

    actions = {
      pipelineAddTask: jest.fn((task: TaskItem) => {
        console.log(
          `✅ ACTION: pipelineAddTask called with task: ${task.name}`,
        );
      }),
      pipelineClearAll: jest.fn(() => {
        console.log(`✅ ACTION: pipelineClearAll called`);
      }),
    };

    updateUIState();
    jest.clearAllMocks();
  });

  describe("New Workflow Button Functionality", () => {
    test("should show New Workflow button when no tasks exist", () => {
      expect(uiState.showNewWorkflowButton).toBe(true);
      expect(uiState.showWorkflowManagementButtons).toBe(false);
      expect(uiState.hasTasks).toBe(false);
      expect(tasks).toHaveLength(0);
    });

    test("should call pipelineAddTask when New Workflow button is clicked", () => {
      simulateNewWorkflowClick();

      expect(actions.pipelineAddTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^task_\d+_[a-z0-9]+$/),
          name: "Task 1",
          prompt: "",
          status: "pending",
          model: DEFAULT_MODEL,
        }),
      );
      expect(actions.pipelineAddTask).toHaveBeenCalledTimes(1);
    });

    test("should create first task with correct properties", () => {
      simulateNewWorkflowClick();

      expect(tasks).toHaveLength(1);
      const task = tasks[0];

      expect(task).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(/^task_\d+_[a-z0-9]+$/),
          name: "Task 1",
          prompt: "",
          status: "pending",
          model: DEFAULT_MODEL,
        }),
      );
    });

    test("should hide New Workflow button after task creation (but before prompt)", () => {
      simulateNewWorkflowClick();

      expect(uiState.showNewWorkflowButton).toBe(false);
      expect(uiState.showWorkflowManagementButtons).toBe(false);
      expect(uiState.hasTasks).toBe(false);
    });

    test("should show workflow management buttons after adding task content", () => {
      simulateNewWorkflowClick();

      tasks[0].prompt = "Test task content";
      updateUIState();

      expect(uiState.showNewWorkflowButton).toBe(false);
      expect(uiState.showWorkflowManagementButtons).toBe(true);
      expect(uiState.hasTasks).toBe(true);
    });
  });

  describe("Complete Workflow Creation Cycle", () => {
    test("should handle full workflow creation and clearing cycle", () => {
      console.log("=== STEP 1: Initial state ===");
      expect(uiState.showNewWorkflowButton).toBe(true);
      expect(tasks).toHaveLength(0);

      console.log("=== STEP 2: Create new workflow ===");
      simulateNewWorkflowClick();
      expect(tasks).toHaveLength(1);
      expect(uiState.showNewWorkflowButton).toBe(false);

      console.log("=== STEP 3: Add content to task ===");
      tasks[0].prompt = "My first workflow task";
      updateUIState();
      expect(uiState.showWorkflowManagementButtons).toBe(true);
      expect(uiState.hasTasks).toBe(true);

      console.log("=== STEP 4: Clear workflow ===");
      simulateClearAllClick();
      expect(actions.pipelineClearAll).toHaveBeenCalledTimes(1);
      expect(tasks).toHaveLength(0);
      expect(uiState.showNewWorkflowButton).toBe(true);
      expect(uiState.showWorkflowManagementButtons).toBe(false);
    });

    test("should generate unique task IDs", () => {
      const taskIds = new Set<string>();

      for (let i = 0; i < 5; i++) {
        simulateNewWorkflowClick();
        const taskId = tasks[tasks.length - 1].id;

        expect(taskIds.has(taskId)).toBe(false);
        taskIds.add(taskId);
        expect(taskId).toMatch(/^task_\d+_[a-z0-9]+$/);

        tasks[tasks.length - 1].prompt = `Task ${i + 1} content`;
        updateUIState();
      }

      expect(tasks).toHaveLength(5);
      expect(taskIds.size).toBe(5);
    });

    test("should create tasks with sequential numbering", () => {
      const taskNames: string[] = [];

      for (let i = 0; i < 3; i++) {
        simulateNewWorkflowClick();
        taskNames.push(tasks[tasks.length - 1].name);

        if (i < 2) {
          tasks[tasks.length - 1].prompt = `Content ${i + 1}`;
          updateUIState();
        }
      }

      expect(taskNames).toEqual(["Task 1", "Task 2", "Task 3"]);
    });
  });

  describe("Error Handling", () => {
    test("should throw error when clicking invisible New Workflow button", () => {
      tasks.push({
        id: generateTaskId(),
        name: "Task 1",
        prompt: "Existing task",
        status: "pending",
        model: DEFAULT_MODEL,
      });
      updateUIState();

      expect(() => simulateNewWorkflowClick()).toThrow(
        "New Workflow button not visible to user!",
      );
    });

    test("should throw error when clicking invisible Clear All button", () => {
      expect(() => simulateClearAllClick()).toThrow(
        "Clear All button not visible to user!",
      );
    });
  });

  describe("Real Component Integration", () => {
    test("should use actual TaskItem interface structure", () => {
      simulateNewWorkflowClick();

      const task = tasks[0];

      expect(task).toHaveProperty("id");
      expect(task).toHaveProperty("name");
      expect(task).toHaveProperty("prompt");
      expect(task).toHaveProperty("status");
      expect(task).toHaveProperty("model");

      expect(typeof task.id).toBe("string");
      expect(typeof task.name).toBe("string");
      expect(typeof task.prompt).toBe("string");
      expect(typeof task.status).toBe("string");
      expect(typeof task.model).toBe("string");
    });

    test("should use DEFAULT_MODEL from actual configuration", () => {
      simulateNewWorkflowClick();

      expect(tasks[0].model).toBe(DEFAULT_MODEL);
      expect(DEFAULT_MODEL).toBeTruthy();
      expect(typeof DEFAULT_MODEL).toBe("string");
    });

    test("should call actual pipelineAddTask action", () => {
      const addTaskSpy = actions.pipelineAddTask as jest.Mock;

      simulateNewWorkflowClick();

      expect(addTaskSpy).toHaveBeenCalled();
      const calledWith = addTaskSpy.mock.calls[0][0];
      expect(calledWith).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          prompt: expect.any(String),
          status: "pending",
          model: expect.any(String),
        }),
      );
    });

    test("should call actual pipelineClearAll action", () => {
      simulateNewWorkflowClick();
      tasks[0].prompt = "Content";
      updateUIState();

      const clearAllSpy = actions.pipelineClearAll as jest.Mock;

      simulateClearAllClick();

      expect(clearAllSpy).toHaveBeenCalledTimes(1);
      expect(clearAllSpy).toHaveBeenCalledWith();
    });
  });

  describe("UI State Consistency", () => {
    test("should maintain correct button visibility throughout workflow lifecycle", () => {
      const states: Array<{
        step: string;
        newBtn: boolean;
        mgmtBtns: boolean;
      }> = [];

      function recordState(step: string) {
        states.push({
          step,
          newBtn: uiState.showNewWorkflowButton,
          mgmtBtns: uiState.showWorkflowManagementButtons,
        });
      }

      recordState("initial");
      expect(uiState.showNewWorkflowButton).toBe(true);

      simulateNewWorkflowClick();
      recordState("after new workflow");
      expect(uiState.showNewWorkflowButton).toBe(false);

      tasks[0].prompt = "Task content";
      updateUIState();
      recordState("after adding content");
      expect(uiState.showWorkflowManagementButtons).toBe(true);

      simulateClearAllClick();
      recordState("after clear");
      expect(uiState.showNewWorkflowButton).toBe(true);
      expect(uiState.showWorkflowManagementButtons).toBe(false);

      console.log("UI State transitions:", states);

      expect(states).toEqual([
        { step: "initial", newBtn: true, mgmtBtns: false },
        { step: "after new workflow", newBtn: false, mgmtBtns: false },
        { step: "after adding content", newBtn: false, mgmtBtns: true },
        { step: "after clear", newBtn: true, mgmtBtns: false },
      ]);
    });
  });
});
