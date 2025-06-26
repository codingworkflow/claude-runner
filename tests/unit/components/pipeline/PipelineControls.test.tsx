import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import PipelineControls from "../../../../src/components/pipeline/PipelineControls";

describe("PipelineControls", () => {
  it("renders the pipeline controls", () => {
    const { getByText } = render(
      <PipelineControls
        isTasksRunning={false}
        canRunTasks={true}
        disabled={false}
        addTask={() => {}}
        cancelTask={() => {}}
        handleRunTasks={() => {}}
        setShowPipelineDialog={() => {}}
        availablePipelines={[]}
        selectedPipeline=""
        setSelectedPipeline={() => {}}
        handleLoadPipeline={() => {}}
      />,
    );

    expect(getByText("Add Task")).toBeTruthy();
    expect(getByText("Run Pipeline")).toBeTruthy();
  });

  it('calls addTask when the "Add Task" button is clicked', () => {
    const addTask = jest.fn();
    const { getByText } = render(
      <PipelineControls
        isTasksRunning={false}
        canRunTasks={true}
        disabled={false}
        addTask={addTask}
        cancelTask={() => {}}
        handleRunTasks={() => {}}
        setShowPipelineDialog={() => {}}
        availablePipelines={[]}
        selectedPipeline=""
        setSelectedPipeline={() => {}}
        handleLoadPipeline={() => {}}
      />,
    );

    fireEvent.click(getByText("Add Task"));
    expect(addTask).toHaveBeenCalled();
  });

  it('calls handleRunTasks when the "Run Pipeline" button is clicked', () => {
    const handleRunTasks = jest.fn();
    const { getByText } = render(
      <PipelineControls
        isTasksRunning={false}
        canRunTasks={true}
        disabled={false}
        addTask={() => {}}
        cancelTask={() => {}}
        handleRunTasks={handleRunTasks}
        setShowPipelineDialog={() => {}}
        availablePipelines={[]}
        selectedPipeline=""
        setSelectedPipeline={() => {}}
        handleLoadPipeline={() => {}}
      />,
    );

    fireEvent.click(getByText("Run Pipeline"));
    expect(handleRunTasks).toHaveBeenCalled();
  });
});
