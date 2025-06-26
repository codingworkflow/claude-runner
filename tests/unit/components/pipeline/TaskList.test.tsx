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
      resumePrevious: false,
      model: DEFAULT_MODEL,
    },
    {
      id: "2",
      name: "Task 2",
      prompt: "Prompt 2",
      status: "pending",
      resumePrevious: true,
      model: DEFAULT_MODEL,
    },
  ];

  it("renders a list of tasks", () => {
    const { getByDisplayValue } = render(
      <TaskList
        tasks={tasks}
        isTasksRunning={false}
        defaultModel={DEFAULT_MODEL}
        availableModels={getModelIds()}
        updateTask={() => {}}
        removeTask={() => {}}
      />,
    );

    expect(getByDisplayValue("Task 1")).toBeTruthy();
    expect(getByDisplayValue("Task 2")).toBeTruthy();
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
