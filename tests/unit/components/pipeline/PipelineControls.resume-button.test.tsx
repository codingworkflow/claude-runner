import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { render } from "@testing-library/react";
import PipelineControls from "../../../../src/components/pipeline/PipelineControls";

describe("PipelineControls Resume Button Issue", () => {
  const defaultProps = {
    isTasksRunning: false,
    canRunTasks: true,
    disabled: false,
    addTask: jest.fn(),
    cancelTask: jest.fn(),
    handleRunTasks: jest.fn(),
    setShowPipelineDialog: jest.fn(),
    availablePipelines: [],
    selectedPipeline: "",
    setSelectedPipeline: jest.fn(),
    handleLoadPipeline: jest.fn(),
    discoveredWorkflows: [],
    isPaused: false,
    pausedPipelines: [],
    resumableWorkflows: [],
    onPausePipeline: jest.fn(),
    onResumePipeline: jest.fn(),
    onPauseWorkflow: jest.fn(),
    onResumeWorkflow: jest.fn(),
    onDeleteWorkflowState: jest.fn(),
  };

  it("Should show Resume button when isTasksRunning=false and isPaused=true", () => {
    const { getByText, queryByText } = render(
      <PipelineControls
        {...defaultProps}
        isTasksRunning={false}
        isPaused={true}
      />,
    );

    // When isPaused=true, should show Resume and Cancel Pipeline buttons
    expect(getByText("Resume")).toBeTruthy();
    expect(getByText("Cancel Pipeline")).toBeTruthy();

    // Should NOT show these buttons
    expect(queryByText("Run Pipeline")).toBeNull();
    expect(queryByText("Pause")).toBeNull();
  });

  it("Should show Pause button when isTasksRunning=true and isPaused=false", () => {
    const { getByText, queryByText } = render(
      <PipelineControls
        {...defaultProps}
        isTasksRunning={true}
        isPaused={false}
      />,
    );

    // Should show Pause button
    expect(getByText("Pause")).toBeTruthy();
    expect(getByText("Cancel Pipeline")).toBeTruthy();

    // Should NOT show these buttons
    expect(queryByText("Run Pipeline")).toBeNull();
    expect(queryByText("Resume")).toBeNull();
  });

  it("Should show Run Pipeline when isTasksRunning=false and isPaused=false", () => {
    const { getByText, queryByText } = render(
      <PipelineControls
        {...defaultProps}
        isTasksRunning={false}
        isPaused={false}
      />,
    );

    // Should show Run Pipeline button
    expect(getByText("Run Pipeline")).toBeTruthy();

    // Should NOT show these buttons
    expect(queryByText("Pause")).toBeNull();
    expect(queryByText("Resume")).toBeNull();
    expect(queryByText("Cancel Pipeline")).toBeNull();
  });

  it("Edge case: isTasksRunning=true and isPaused=true should show Resume (paused takes priority)", () => {
    const { getByText, queryByText } = render(
      <PipelineControls
        {...defaultProps}
        isTasksRunning={true}
        isPaused={true}
      />,
    );

    // Should show Resume button (isPaused condition wins)
    expect(getByText("Resume")).toBeTruthy();
    expect(getByText("Cancel Pipeline")).toBeTruthy();

    // Should NOT show these buttons
    expect(queryByText("Run Pipeline")).toBeNull();
    expect(queryByText("Pause")).toBeNull();
  });
});
