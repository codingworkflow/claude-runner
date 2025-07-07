import { jest } from "@jest/globals";
import { TaskItem } from "../../src/services/ClaudeCodeService";
import { DEFAULT_MODEL } from "../../src/models/ClaudeModels";

describe("New Workflow Button Action Test", () => {
  let mockPipelineAddTask: jest.Mock;
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

  function simulateNewWorkflowButtonClick(): void {
    console.log("🖱️ USER: Clicking 'New Workflow' button");

    const newTask = createNewTask();
    mockPipelineAddTask(newTask);
    tasks.push(newTask);
  }

  beforeEach(() => {
    tasks = [];
    mockPipelineAddTask = jest.fn((task: TaskItem) => {
      console.log(`✅ ACTION: pipelineAddTask called with task: ${task.name}`);
    });

    jest.clearAllMocks();
  });

  test("should call pipelineAddTask with correct task when New Workflow button is clicked", () => {
    expect(tasks).toHaveLength(0);

    simulateNewWorkflowButtonClick();

    expect(mockPipelineAddTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^task_\d+_[a-z0-9]+$/),
        name: "Task 1",
        prompt: "",
        status: "pending",
        model: DEFAULT_MODEL,
      }),
    );
    expect(mockPipelineAddTask).toHaveBeenCalledTimes(1);
    expect(tasks).toHaveLength(1);
  });

  test("should create task with correct sequential naming", () => {
    simulateNewWorkflowButtonClick();
    simulateNewWorkflowButtonClick();
    simulateNewWorkflowButtonClick();

    expect(tasks).toHaveLength(3);
    expect(tasks[0].name).toBe("Task 1");
    expect(tasks[1].name).toBe("Task 2");
    expect(tasks[2].name).toBe("Task 3");

    expect(mockPipelineAddTask).toHaveBeenCalledTimes(3);
  });

  test("should create tasks with unique IDs", () => {
    const taskIds = new Set<string>();

    for (let i = 0; i < 5; i++) {
      simulateNewWorkflowButtonClick();
      const taskId = tasks[i].id;

      expect(taskIds.has(taskId)).toBe(false);
      taskIds.add(taskId);
      expect(taskId).toMatch(/^task_\d+_[a-z0-9]+$/);
    }

    expect(taskIds.size).toBe(5);
  });

  test("should use DEFAULT_MODEL for new tasks", () => {
    simulateNewWorkflowButtonClick();

    expect(tasks[0].model).toBe(DEFAULT_MODEL);
    expect(typeof DEFAULT_MODEL).toBe("string");
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
  });

  test("should create pending tasks with empty prompts", () => {
    simulateNewWorkflowButtonClick();

    const task = tasks[0];
    expect(task.status).toBe("pending");
    expect(task.prompt).toBe("");
    expect(typeof task.prompt).toBe("string");
  });

  test("should handle edge case numbering correctly", () => {
    const existingTasks: TaskItem[] = [
      {
        id: generateTaskId(),
        name: "Task 5",
        prompt: "Existing task",
        status: "pending",
        model: DEFAULT_MODEL,
      },
      {
        id: generateTaskId(),
        name: "Custom Name",
        prompt: "Non-numbered task",
        status: "pending",
        model: DEFAULT_MODEL,
      },
    ];

    tasks.push(...existingTasks);

    simulateNewWorkflowButtonClick();

    expect(tasks).toHaveLength(3);
    expect(tasks[2].name).toBe("Task 6");
  });
});
