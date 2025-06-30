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

  // Pause/Resume functionality
  isPaused?: boolean;
  pausedPipelines?: Array<{
    pipelineId: string;
    tasks: Array<{ id: string; prompt: string; status: string }>;
    currentIndex: number;
    pausedAt: number;
  }>;
  resumableWorkflows?: Array<{
    executionId: string;
    workflowName: string;
    workflowPath: string;
    pausedAt: string;
    currentStep: number;
    totalSteps: number;
    canResume: boolean;
  }>;
  onPausePipeline?: () => void;
  onResumePipeline?: (pipelineId: string) => void;
  onPauseWorkflow?: () => void;
  onResumeWorkflow?: (executionId: string) => void;
  onDeleteWorkflowState?: (executionId: string) => void;
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
  isPaused = false,
  pausedPipelines = [],
  resumableWorkflows = [],
  onPausePipeline,
  onResumePipeline,
  onPauseWorkflow: _onPauseWorkflow,
  onResumeWorkflow,
  onDeleteWorkflowState,
}) => {
  const [runClicked, setRunClicked] = React.useState(false);

  const handleRunPipeline = React.useCallback(() => {
    setRunClicked(true);
    handleRunTasks();
  }, [handleRunTasks]);

  // Reset the runClicked flag when pipeline stops running
  React.useEffect(() => {
    if (!isTasksRunning && !isPaused) {
      setRunClicked(false);
    }
  }, [isTasksRunning, isPaused]);

  // Determine if we should show running state controls
  const showRunningControls = isTasksRunning || isPaused;
  return (
    <div className="task-controls">
      <div className="control-buttons">
        <Button
          variant="secondary"
          onClick={addTask}
          disabled={showRunningControls}
        >
          Add Task
        </Button>

        {showRunningControls ? (
          <>
            {!isPaused ? (
              <Button
                variant="secondary"
                onClick={onPausePipeline}
                disabled={disabled || !onPausePipeline}
              >
                Pause
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => onResumePipeline?.("current")}
                disabled={disabled || !onResumePipeline}
              >
                Resume
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={cancelTask}
              disabled={disabled}
            >
              Cancel Pipeline
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={handleRunPipeline}
            disabled={disabled || !canRunTasks || runClicked}
          >
            Run Pipeline
          </Button>
        )}
      </div>

      {!showRunningControls && (
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
        !showRunningControls && (
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

      {/* Paused Pipelines Section */}
      {pausedPipelines.length > 0 && (
        <div className="paused-pipelines-section" style={{ marginTop: "24px" }}>
          <h4>Paused Pipelines</h4>
          {pausedPipelines.map((pipeline) => (
            <div key={pipeline.pipelineId} className="paused-pipeline-item">
              <div className="pipeline-info">
                <span className="pipeline-name">
                  Pipeline (Step {pipeline.currentIndex + 1}/
                  {pipeline.tasks.length})
                </span>
                <span className="paused-time">
                  Paused {new Date(pipeline.pausedAt).toLocaleTimeString()}
                </span>
              </div>
              <Button
                variant="primary"
                onClick={() => onResumePipeline?.(pipeline.pipelineId)}
                disabled={!onResumePipeline}
                size="small"
              >
                Resume
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Resumable Workflows Section */}
      {resumableWorkflows.length > 0 && (
        <div
          className="resumable-workflows-section"
          style={{ marginTop: "24px" }}
        >
          <h4>Resumable Workflows</h4>
          {resumableWorkflows.map((workflow) => (
            <div key={workflow.executionId} className="resumable-workflow-item">
              <div className="workflow-info">
                <span className="workflow-name">{workflow.workflowName}</span>
                <span className="workflow-progress">
                  Step {workflow.currentStep}/{workflow.totalSteps}
                </span>
                <span className="paused-time">
                  Paused {new Date(workflow.pausedAt).toLocaleString()}
                </span>
              </div>
              <div className="workflow-actions">
                {workflow.canResume && (
                  <Button
                    variant="primary"
                    onClick={() => onResumeWorkflow?.(workflow.executionId)}
                    disabled={!onResumeWorkflow}
                    size="small"
                  >
                    Resume
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => onDeleteWorkflowState?.(workflow.executionId)}
                  disabled={!onDeleteWorkflowState}
                  size="small"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(PipelineControls);
