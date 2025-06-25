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

      {availablePipelines.length > 0 && !isTasksRunning && (
        <div className="pipeline-controls">
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            className="pipeline-select"
          >
            <option value="">Select a pipeline...</option>
            {availablePipelines.map((pipeline) => (
              <option key={pipeline} value={pipeline}>
                {pipeline}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={handleLoadPipeline}
            disabled={!selectedPipeline}
          >
            Load Pipeline
          </Button>
        </div>
      )}
    </div>
  );
};

export default React.memo(PipelineControls);
