import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import PipelineControls from "../../../../src/components/pipeline/PipelineControls";

describe("PipelineControls Button Workflow", () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Button Workflow States", () => {
    it("State 1: Shows 'Run Pipeline' button when idle", () => {
      const { getByText, queryByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={false}
          isPaused={false}
          canRunTasks={true}
        />,
      );

      // Should show Run Pipeline button
      expect(getByText("Run Pipeline")).toBeTruthy();
      expect(queryByText("Pause")).toBeNull();
      expect(queryByText("Resume")).toBeNull();
      expect(queryByText("Cancel Pipeline")).toBeNull();
    });

    it("State 2: Shows 'Pause' and 'Cancel' buttons when running", () => {
      const { getByText, queryByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={false}
        />,
      );

      // Should show Pause and Cancel Pipeline buttons
      expect(getByText("Pause")).toBeTruthy();
      expect(getByText("Cancel Pipeline")).toBeTruthy();
      expect(queryByText("Run Pipeline")).toBeNull();
      expect(queryByText("Resume")).toBeNull();
    });

    it("State 3: Shows 'Resume' and 'Cancel' buttons when paused", () => {
      const { getByText, queryByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={false}
          isPaused={true}
        />,
      );

      // When isPaused=true, shows Resume and Cancel Pipeline buttons
      expect(getByText("Resume")).toBeTruthy();
      expect(getByText("Cancel Pipeline")).toBeTruthy();
      expect(queryByText("Run Pipeline")).toBeNull();
      expect(queryByText("Pause")).toBeNull();
    });

    it("State 4: Shows 'Run Pipeline' button when completed", () => {
      const { getByText, queryByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={false}
          isPaused={false}
          canRunTasks={true}
        />,
      );

      // Should show Run Pipeline button (same as idle state)
      expect(getByText("Run Pipeline")).toBeTruthy();
      expect(queryByText("Pause")).toBeNull();
      expect(queryByText("Resume")).toBeNull();
      expect(queryByText("Cancel Pipeline")).toBeNull();
    });
  });

  describe("Button Actions", () => {
    it("Clicking 'Run Pipeline' triggers handleRunTasks", () => {
      const { getByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={false}
          isPaused={false}
        />,
      );

      fireEvent.click(getByText("Run Pipeline"));
      expect(defaultProps.handleRunTasks).toHaveBeenCalledTimes(1);
    });

    it("Clicking 'Pause' triggers onPausePipeline", () => {
      const { getByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={false}
        />,
      );

      fireEvent.click(getByText("Pause"));
      expect(defaultProps.onPausePipeline).toHaveBeenCalledTimes(1);
    });

    it("Clicking 'Resume' triggers onResumePipeline with 'current'", () => {
      const { getByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={true}
        />,
      );

      fireEvent.click(getByText("Resume"));
      expect(defaultProps.onResumePipeline).toHaveBeenCalledWith("current");
    });

    it("Clicking 'Cancel' triggers cancelTask", () => {
      const { getByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={false}
        />,
      );

      fireEvent.click(getByText("Cancel Pipeline"));
      expect(defaultProps.cancelTask).toHaveBeenCalledTimes(1);
    });
  });

  describe("Edge Cases", () => {
    it("Should show Resume when both isTasksRunning=true and isPaused=true", () => {
      const { getByText, queryByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={true}
        />,
      );

      // When both are true, shows Resume and Cancel Pipeline
      expect(getByText("Resume")).toBeTruthy();
      expect(getByText("Cancel Pipeline")).toBeTruthy();
      expect(queryByText("Pause")).toBeNull();
    });

    it("Disables buttons when disabled=true", () => {
      const { getByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={false}
          isPaused={true}
          disabled={true}
        />,
      );

      // When isPaused=true, shows Resume button which should be disabled
      const button = getByText("Resume") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("Disables Resume button when onResumePipeline is not provided", () => {
      const { getByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={true}
          onResumePipeline={undefined}
        />,
      );

      const resumeButton = getByText("Resume") as HTMLButtonElement;
      expect(resumeButton.disabled).toBe(true);
    });
  });

  describe("Full Workflow Integration", () => {
    it("Complete workflow: Run → Pause → Resume → Complete", () => {
      const { rerender, getByText } = render(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={false}
          isPaused={false}
          canRunTasks={true}
        />,
      );

      // Step 1: Initially shows Run Pipeline
      expect(getByText("Run Pipeline")).toBeTruthy();

      // Step 2: After clicking Run, should show Pause and Cancel
      rerender(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={false}
        />,
      );
      expect(getByText("Pause")).toBeTruthy();
      expect(getByText("Cancel Pipeline")).toBeTruthy();

      // Step 3: After clicking Pause, should show Resume and Cancel Pipeline
      rerender(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={true}
        />,
      );
      expect(getByText("Resume")).toBeTruthy();
      expect(getByText("Cancel Pipeline")).toBeTruthy();

      // Step 4: After clicking Resume, should show Pause and Cancel again
      rerender(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={true}
          isPaused={false}
        />,
      );
      expect(getByText("Pause")).toBeTruthy();
      expect(getByText("Cancel Pipeline")).toBeTruthy();

      // Step 5: After completion, should show Run Pipeline again
      rerender(
        <PipelineControls
          {...defaultProps}
          isTasksRunning={false}
          isPaused={false}
          canRunTasks={true}
        />,
      );
      expect(getByText("Run Pipeline")).toBeTruthy();
    });
  });
});
