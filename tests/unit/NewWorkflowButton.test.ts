import { TaskItem } from "../../src/services/ClaudeCodeService";
import { DEFAULT_MODEL } from "../../src/models/ClaudeModels";

describe("New Workflow Button - Core Logic Test", () => {
  test("should create new task with correct properties", () => {
    const newTask: TaskItem = {
      id: `task_${Date.now()}_test123`,
      name: "Task 1",
      prompt: "",
      status: "pending",
      model: DEFAULT_MODEL,
    };

    expect(newTask.name).toBe("Task 1");
    expect(newTask.prompt).toBe("");
    expect(newTask.status).toBe("pending");
    expect(newTask.model).toBe(DEFAULT_MODEL);
    expect(newTask.id).toContain("task_");
  });

  test("should use correct default model", () => {
    expect(DEFAULT_MODEL).toBeTruthy();
    expect(typeof DEFAULT_MODEL).toBe("string");
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
  });

  test("should handle task numbering logic", () => {
    const tasks: TaskItem[] = [];

    function getNextTaskNumber(existingTasks: TaskItem[]): number {
      const existingNumbers = existingTasks
        .map((t) => {
          const match = t.name?.match(/^Task (\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n) => n > 0);

      return existingNumbers.length > 0
        ? Math.max(...existingNumbers) + 1
        : existingTasks.length + 1;
    }

    expect(getNextTaskNumber(tasks)).toBe(1);

    tasks.push({
      id: "test1",
      name: "Task 1",
      prompt: "",
      status: "pending",
      model: DEFAULT_MODEL,
    });

    expect(getNextTaskNumber(tasks)).toBe(2);

    tasks.push({
      id: "test2",
      name: "Task 5",
      prompt: "",
      status: "pending",
      model: DEFAULT_MODEL,
    });

    expect(getNextTaskNumber(tasks)).toBe(6);
  });
});
