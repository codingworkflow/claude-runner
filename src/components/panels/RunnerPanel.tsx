import React, { useState } from "react";
import { useExtension } from "../../contexts/ExtensionContext";
import ProgressTracker from "../pipeline/ProgressTracker";

interface RunnerPanelProps {
  disabled: boolean;
}

const RunnerPanel: React.FC<RunnerPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { main } = state;
  const {
    tasks = [],
    outputFormat,
    availablePipelines = [],
    discoveredWorkflows,
    status,
    currentTaskIndex,
    isPaused = false,
    pausedPipelines = [],
    resumableWorkflows = [],
  } = main;

  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [loadedWorkflowName, setLoadedWorkflowName] = useState("");

  const isTasksRunning = status === "running";

  const handleLoadWorkflow = () => {
    if (selectedWorkflow) {
      if (
        selectedWorkflow.includes(".yml") ||
        selectedWorkflow.includes(".yaml")
      ) {
        actions.loadWorkflow(selectedWorkflow);
      } else {
        actions.loadPipeline(selectedWorkflow);
      }
      setLoadedWorkflowName(selectedWorkflow);
      setSelectedWorkflow("");
    }
  };

  const handleRunTasks = () => {
    const validTasks = tasks.filter((task) => task.prompt.trim());
    if (validTasks.length > 0) {
      actions.runTasks(validTasks, outputFormat);
    }
  };

  const clearWorkflow = () => {
    actions.pipelineClearAll();
    setLoadedWorkflowName("");
  };

  const deleteWorkflow = (executionId: string) => {
    actions.deleteWorkflowState(executionId);
    clearWorkflow();
  };

  const hasWorkflowLoaded =
    loadedWorkflowName || tasks.some((task) => task.prompt.trim());
  const canRunTasks = hasWorkflowLoaded && !isTasksRunning;

  const isPipelineFinished =
    !isTasksRunning &&
    !isPaused &&
    tasks.some((t) => t.prompt.trim().length > 0) &&
    tasks.some((t) => t.status === "completed" || t.status === "error");

  return (
    <div className="runner-panel">
      <div className="workflow-selection">
        <select
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          disabled={disabled || isTasksRunning}
        >
          <option value="">Select a workflow to run...</option>
          {availablePipelines.length > 0 && (
            <optgroup label="Saved Workflows">
              {availablePipelines.map((pipeline) => (
                <option key={pipeline} value={pipeline}>
                  {pipeline}
                </option>
              ))}
            </optgroup>
          )}
          {discoveredWorkflows && discoveredWorkflows.length > 0 && (
            <optgroup label="Workflow Files">
              {discoveredWorkflows.map((workflow) => (
                <option key={workflow.path} value={workflow.path}>
                  {workflow.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          onClick={handleLoadWorkflow}
          disabled={disabled || !selectedWorkflow || isTasksRunning}
        >
          Load
        </button>
      </div>

      {loadedWorkflowName && (
        <div className="loaded-workflow">
          Current:{" "}
          <strong>
            {loadedWorkflowName.split("/").pop()?.split("\\").pop()}
          </strong>
        </div>
      )}

      {!hasWorkflowLoaded && !isTasksRunning && !isPaused && (
        <div className="workflow-message">Load workflow first</div>
      )}

      {(hasWorkflowLoaded || isTasksRunning || isPipelineFinished) && (
        <div className="execution-controls">
          {!isTasksRunning && !isPaused && hasWorkflowLoaded && (
            <button
              onClick={handleRunTasks}
              disabled={disabled || !canRunTasks}
            >
              Run Workflow
            </button>
          )}

          {isTasksRunning && !isPaused && (
            <button onClick={() => actions.pausePipeline()} disabled={disabled}>
              Pause
            </button>
          )}

          {isTasksRunning && (
            <button onClick={() => actions.cancelTask()} disabled={disabled}>
              Cancel
            </button>
          )}

          {isPipelineFinished && (
            <button onClick={clearWorkflow} disabled={disabled}>
              Clear Results
            </button>
          )}
        </div>
      )}

      {(pausedPipelines.length > 0 || resumableWorkflows.length > 0) && (
        <div className="resumable-section">
          <h4>Resumable Workflows</h4>
          {pausedPipelines.map((pipeline) => (
            <div key={pipeline.pipelineId} className="resumable-item">
              <span>Pipeline {pipeline.pipelineId}</span>
              <button
                onClick={() => actions.resumePipeline(pipeline.pipelineId)}
                disabled={disabled || isTasksRunning}
              >
                Resume
              </button>
              <button
                onClick={() => deleteWorkflow(pipeline.pipelineId)}
                disabled={disabled || isTasksRunning}
              >
                Delete
              </button>
            </div>
          ))}
          {resumableWorkflows.map((workflow) => (
            <div key={workflow.executionId} className="resumable-item">
              <span>{workflow.workflowName}</span>
              <button
                onClick={() => actions.resumeWorkflow(workflow.executionId)}
                disabled={disabled || isTasksRunning}
              >
                Resume
              </button>
              <button
                onClick={() => deleteWorkflow(workflow.executionId)}
                disabled={disabled || isTasksRunning}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {tasks.some((t) => t.prompt.trim().length > 0) && (
        <div className="progress-section">
          <ProgressTracker
            tasks={tasks}
            isTasksRunning={isTasksRunning}
            currentTaskIndex={currentTaskIndex}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(RunnerPanel);
