import React from "react";
import Button from "../common/Button";

interface PipelineControlsProps {
  isTasksRunning: boolean;
  canRunTasks: boolean;
  disabled: boolean;
  addTask: () => void;
  cancelTask: () => void;
  handleRunTasks: () => void;
  setShowPipelineDialog: (show: boolean) => void;
  availablePipelines: string[];
  selectedPipeline: string;
  setSelectedPipeline: (pipeline: string) => void;
  handleLoadPipeline: () => void;
  discoveredWorkflows?: { name: string; path: string }[];
}

const PipelineControls: React.FC<PipelineControlsProps> = ({
  isTasksRunning,
  canRunTasks,
  disabled,
  addTask,
  cancelTask,
  handleRunTasks,
  setShowPipelineDialog,
  availablePipelines,
  selectedPipeline,
  setSelectedPipeline,
  handleLoadPipeline,
  discoveredWorkflows,
}) => {
  return (
    <div className="task-controls">
      <div className="control-buttons">
        <Button variant="secondary" onClick={addTask} disabled={isTasksRunning}>
          Add Task
        </Button>

        {isTasksRunning ? (
          <Button variant="error" onClick={cancelTask} disabled={disabled}>
            Cancel Pipeline
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleRunTasks}
            disabled={disabled || !canRunTasks}
          >
            Run Pipeline
          </Button>
        )}
      </div>

      {!isTasksRunning && (
        <div className="save-pipeline-controls" style={{ marginTop: "24px" }}>
          <Button
            variant="secondary"
            onClick={() => setShowPipelineDialog(true)}
            disabled={disabled || !canRunTasks}
          >
            Save as Pipeline
          </Button>
        </div>
      )}

      {(availablePipelines.length > 0 ||
        (discoveredWorkflows && discoveredWorkflows.length > 0)) &&
        !isTasksRunning && (
          <div className="pipeline-controls" style={{ marginTop: "16px" }}>
            <select
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              className="pipeline-select"
            >
              <option value="">Select pipeline</option>

              {availablePipelines.length > 0 && (
                <optgroup label="Saved Pipelines">
                  {availablePipelines.map((pipeline) => (
                    <option key={`pipeline-${pipeline}`} value={pipeline}>
                      {pipeline}
                    </option>
                  ))}
                </optgroup>
              )}

              {discoveredWorkflows && discoveredWorkflows.length > 0 && (
                <optgroup label="Workflows">
                  {discoveredWorkflows.map((workflow) => (
                    <option
                      key={`workflow-${workflow.path}`}
                      value={workflow.path}
                    >
                      {workflow.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <Button
              variant="secondary"
              onClick={handleLoadPipeline}
              disabled={!selectedPipeline}
            >
              Load
            </Button>
          </div>
        )}
    </div>
  );
};

export default React.memo(PipelineControls);
