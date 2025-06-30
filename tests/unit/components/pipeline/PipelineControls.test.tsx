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
        discoveredWorkflows={[]}
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
        discoveredWorkflows={[]}
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
        discoveredWorkflows={[]}
      />,
    );

    fireEvent.click(getByText("Run Pipeline"));
    expect(handleRunTasks).toHaveBeenCalled();
  });

  it("displays discovered workflows in dropdown when provided", () => {
    const discoveredWorkflows = [
      { name: "test", path: ".github/workflows/claude-test.yml" },
      {
        name: "integration-test",
        path: ".github/workflows/claude-integration-test.yml",
      },
    ];
    const { getByText, getByRole } = render(
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
        discoveredWorkflows={discoveredWorkflows}
      />,
    );

    // Check that the dropdown contains the workflows
    const select = getByRole("combobox");
    expect(select).toBeTruthy();
    expect(getByText("test")).toBeTruthy();
    expect(getByText("integration-test")).toBeTruthy();
    expect(getByText("Load")).toBeTruthy();

    // Check that the optgroup exists by looking for the label attribute
    const optgroup = select.querySelector('optgroup[label="Workflows"]');
    expect(optgroup).toBeTruthy();
  });

  it("calls setSelectedPipeline when a workflow is selected from dropdown", () => {
    const setSelectedPipeline = jest.fn();
    const discoveredWorkflows = [
      { name: "test", path: ".github/workflows/claude-test.yml" },
    ];
    const { getByRole } = render(
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
        setSelectedPipeline={setSelectedPipeline}
        handleLoadPipeline={() => {}}
        discoveredWorkflows={discoveredWorkflows}
      />,
    );

    const select = getByRole("combobox");
    fireEvent.change(select, {
      target: { value: ".github/workflows/claude-test.yml" },
    });
    expect(setSelectedPipeline).toHaveBeenCalledWith(
      ".github/workflows/claude-test.yml",
    );
  });
});
