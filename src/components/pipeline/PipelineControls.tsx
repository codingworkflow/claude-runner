import React from "react";
import Button from "../common/Button";

interface PipelineControlsProps {
  isTasksRunning: boolean;
  canRunTasks: boolean;
  disabled: boolean;
  status?: string;
  tasks?: Array<{ id: string; status: string; prompt: string }>;
  currentTaskIndex?: number;
  addTask: () => void;
  cancelTask: () => void;
  handleRunTasks: () => void;
  setShowPipelineDialog: (show: boolean) => void;
  availablePipelines: string[];
  selectedPipeline: string;
  setSelectedPipeline: (pipeline: string) => void;
  handleLoadPipeline: () => void;
  discoveredWorkflows?: { name: string; path: string }[];

  // Clear pipeline functionality
  isPipelineFinished?: boolean;
  clearPipeline?: () => void;

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
  status: _status,
  tasks = [],
  currentTaskIndex: _currentTaskIndex,
  addTask,
  cancelTask,
  handleRunTasks,
  setShowPipelineDialog,
  availablePipelines,
  selectedPipeline,
  setSelectedPipeline,
  handleLoadPipeline,
  discoveredWorkflows,
  isPipelineFinished = false,
  clearPipeline,
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

  React.useEffect(() => {
    if (!isTasksRunning && !isPaused) {
      setRunClicked(false);
    }
  }, [isTasksRunning, isPaused]);

  const pipelineRunningMemo = React.useMemo(() => {
    return (isTasksRunning || isPaused) && !isPipelineFinished;
  }, [isTasksRunning, isPaused, isPipelineFinished]);

  const hasTasks = tasks.length > 0;
  const hasValidTasks =
    tasks.length > 0 && tasks.some((task) => task.prompt.trim());

  return (
    <div className="task-controls">
      {!hasTasks ? (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <Button variant="primary" onClick={addTask} disabled={disabled}>
            New Workflow
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <Button
            variant="secondary"
            onClick={addTask}
            disabled={isTasksRunning}
          >
            Add Task
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowPipelineDialog(true)}
            disabled={disabled || !hasValidTasks}
          >
            Save Workflow
          </Button>
          {isPipelineFinished && (
            <Button
              variant="secondary"
              onClick={clearPipeline}
              disabled={disabled || !clearPipeline}
            >
              Clear All
            </Button>
          )}
        </div>
      )}

      {(availablePipelines.length > 0 ||
        (discoveredWorkflows && discoveredWorkflows.length > 0)) && (
        <div className="pipeline-controls" style={{ marginTop: "16px" }}>
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            className="pipeline-select"
          >
            <option value="">Select a workflow to load...</option>

            {availablePipelines.length > 0 && (
              <optgroup label="Saved Workflows">
                {availablePipelines.map((pipeline) => (
                  <option key={`pipeline-${pipeline}`} value={pipeline}>
                    {pipeline}
                  </option>
                ))}
              </optgroup>
            )}

            {discoveredWorkflows && discoveredWorkflows.length > 0 && (
              <optgroup label="Workflow Files">
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

      {hasTasks && hasValidTasks && (
        <div
          className="pipeline-execution-controls"
          style={{ marginTop: "24px" }}
        >
          {pipelineRunningMemo ? (
            <>
              {isPaused ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    const pipelineId =
                      pausedPipelines?.[0]?.pipelineId || "current";
                    onResumePipeline?.(pipelineId);
                  }}
                  disabled={disabled || !onResumePipeline}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={onPausePipeline}
                  disabled={disabled || !onPausePipeline}
                >
                  Pause
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={cancelTask}
                disabled={disabled}
                style={{ marginLeft: "8px" }}
              >
                Cancel
              </Button>
            </>
          ) : (
            !isPipelineFinished && (
              <Button
                variant="primary"
                onClick={handleRunPipeline}
                disabled={disabled || !canRunTasks || runClicked}
              >
                Run Workflow
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(PipelineControls);
