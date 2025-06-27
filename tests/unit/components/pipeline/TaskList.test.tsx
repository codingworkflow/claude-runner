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

    // Check for resume from dropdown
    const allSelects = container.querySelectorAll("select.model-select");
    expect(allSelects).toHaveLength(3); // 2 model selects + 1 resume select
    const resumeSelect = allSelects[2]; // The third select is the resume dropdown
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
});
