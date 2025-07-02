import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import TaskList from "../../../../src/components/pipeline/TaskList";
import { TaskItem } from "../../../../src/services/ClaudeCodeService";
import {
  DEFAULT_MODEL,
  getModelIds,
} from "../../../../src/models/ClaudeModels";

describe("TaskList", () => {
  const tasks: TaskItem[] = [
    {
      id: "1",
      name: "Task 1",
      prompt: "Prompt 1",
      status: "pending",
      model: DEFAULT_MODEL,
    },
    {
      id: "2",
      name: "Task 2",
      prompt: "Prompt 2",
      status: "pending",
      resumeFromTaskId: "1",
      model: DEFAULT_MODEL,
    },
  ];

  it("renders a list of tasks", () => {
    const { container } = render(
      <TaskList
        tasks={tasks}
        isTasksRunning={false}
        defaultModel={DEFAULT_MODEL}
        availableModels={getModelIds()}
        updateTask={() => {}}
        removeTask={() => {}}
      />,
    );

    // Check for task name inputs specifically
    const taskNameInputs = container.querySelectorAll(
      'input[type="text"].task-name-input',
    );
    expect(taskNameInputs).toHaveLength(2);
    expect((taskNameInputs[0] as HTMLInputElement).value).toBe("Task 1");
    expect((taskNameInputs[1] as HTMLInputElement).value).toBe("Task 2");

    // Check for model selects (should be 2, one for each task)
    const modelSelects = container.querySelectorAll("select.model-select");
    expect(modelSelects).toHaveLength(2); // 2 model selects only

    // Check for resume from dropdown (now uses condition-select-inline class)
    const resumeSelect = container.querySelector(
      "div.resume-row-inline select",
    );
    expect(resumeSelect).toBeTruthy();
    expect(resumeSelect?.textContent).toContain("Task 1");
  });

  it("calls updateTask when a task is modified", () => {
    const updateTask = jest.fn();
    const { getByDisplayValue } = render(
      <TaskList
        tasks={tasks}
        isTasksRunning={false}
        defaultModel={DEFAULT_MODEL}
        availableModels={getModelIds()}
        updateTask={updateTask}
        removeTask={() => {}}
      />,
    );

    fireEvent.blur(getByDisplayValue("Prompt 1"), {
      target: { value: "New Prompt" },
    });
    expect(updateTask).toHaveBeenCalledWith("1", "prompt", "New Prompt");
  });

  it("calls removeTask when a task is removed", () => {
    const removeTask = jest.fn();
    const { getAllByText } = render(
      <TaskList
        tasks={tasks}
        isTasksRunning={false}
        defaultModel={DEFAULT_MODEL}
        availableModels={getModelIds()}
        updateTask={() => {}}
        removeTask={removeTask}
      />,
    );

    fireEvent.click(getAllByText("Remove")[0]);
    expect(removeTask).toHaveBeenCalledWith("1");
  });

  it("renders condition configuration controls", () => {
    // Use tasks with condition controls visible
    const tasksWithConditions = [
      {
        ...tasks[0],
        check: "make lint",
        condition: "on_success" as const,
      },
      {
        ...tasks[1],
        check: "npm test",
        condition: "on_failure" as const,
      },
    ];

    const { container } = render(
      <TaskList
        tasks={tasksWithConditions}
        isTasksRunning={false}
        defaultModel={DEFAULT_MODEL}
        availableModels={getModelIds()}
        updateTask={() => {}}
        removeTask={() => {}}
      />,
    );

    // Check for check command inputs
    const checkCommandInputs = container.querySelectorAll(
      "input.check-command-input-inline",
    );
    expect(checkCommandInputs).toHaveLength(2); // One for each task

    // Check for condition dropdowns (exclude resume dropdown)
    const conditionSelects = container.querySelectorAll(
      "div.condition-row-inline select.condition-select-inline",
    );
    expect(conditionSelects).toHaveLength(2); // One for each task

    // Verify condition dropdown options
    const firstConditionSelect = conditionSelects[0];
    expect(firstConditionSelect?.textContent).toContain("Always");
    expect(firstConditionSelect?.textContent).toContain("On Success");
    expect(firstConditionSelect?.textContent).toContain("On Failure");
  });

  it("calls updateTask when condition controls are modified", () => {
    const updateTask = jest.fn();

    // Use tasks with condition controls visible
    const tasksWithConditions = [
      {
        ...tasks[0],
        check: "make lint",
        condition: "on_success" as const,
      },
      {
        ...tasks[1],
        check: "npm test",
        condition: "on_failure" as const,
      },
    ];

    const { container } = render(
      <TaskList
        tasks={tasksWithConditions}
        isTasksRunning={false}
        defaultModel={DEFAULT_MODEL}
        availableModels={getModelIds()}
        updateTask={updateTask}
        removeTask={() => {}}
      />,
    );

    // Test check command input
    const checkCommandInput = container.querySelector(
      ".check-command-input-inline",
    ) as HTMLInputElement;
    fireEvent.change(checkCommandInput, {
      target: { value: "test -f file.txt" },
    });
    expect(updateTask).toHaveBeenCalledWith("1", "check", "test -f file.txt");

    // Test condition dropdown
    const conditionSelect = container.querySelector(
      "div.condition-row-inline .condition-select-inline",
    ) as HTMLSelectElement;
    fireEvent.change(conditionSelect, {
      target: { value: "on_failure" },
    });
    expect(updateTask).toHaveBeenCalledWith("1", "condition", "on_failure");
  });
});
