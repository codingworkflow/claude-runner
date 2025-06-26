import { describe, it, expect } from "@jest/globals";
import React from "react";
import { render } from "@testing-library/react";
import ProgressTracker from "../../../../src/components/pipeline/ProgressTracker";
import { TaskItem } from "../../../../src/services/ClaudeCodeService";

describe("ProgressTracker", () => {
  const tasks: TaskItem[] = [
    {
      id: "1",
      name: "Task 1",
      prompt: "Prompt 1",
      status: "completed",
      results: "Results 1",
      resumePrevious: false,
    },
    {
      id: "2",
      name: "Task 2",
      prompt: "Prompt 2",
      status: "running",
      resumePrevious: false,
    },
    {
      id: "3",
      name: "Task 3",
      prompt: "Prompt 3",
      status: "pending",
      resumePrevious: false,
    },
  ];

  it("renders the progress of the pipeline", () => {
    const { getByText } = render(
      <ProgressTracker
        tasks={tasks}
        isTasksRunning={true}
        currentTaskIndex={1}
      />,
    );

    expect(getByText("Pipeline Progress")).toBeTruthy();
    expect(getByText("Task 1")).toBeTruthy();
    expect(getByText("✅ Completed")).toBeTruthy();
    expect(getByText("Task 2")).toBeTruthy();
    expect(getByText("⏳ Running...")).toBeTruthy();
    expect(getByText("Task 3")).toBeTruthy();
    expect(getByText("⏸️ Pending")).toBeTruthy();
  });
});
