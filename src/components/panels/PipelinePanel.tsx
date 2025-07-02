import React, { useState } from "react";
import PathSelector from "../common/PathSelector";
import { getModelIds, DEFAULT_MODEL } from "../../models/ClaudeModels";
import { useExtension } from "../../contexts/ExtensionContext";
import { TaskItem } from "../../services/ClaudeCodeService";
import TaskList from "../pipeline/TaskList";
import PipelineControls from "../pipeline/PipelineControls";
import ProgressTracker from "../pipeline/ProgressTracker";
import PipelineDialog from "../pipeline/PipelineDialog";

interface PipelinePanelProps {
  disabled: boolean;
}

const PipelinePanel: React.FC<PipelinePanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { main } = state;
  const {
    tasks = [],
    rootPath,
    outputFormat,
    availablePipelines = [],
    availableModels = getModelIds(),
    model: defaultModel = DEFAULT_MODEL,
    status,
    currentTaskIndex,
    discoveredWorkflows,
    isPaused = false,
    pausedPipelines = [],
    resumableWorkflows = [],
  } = main;

  const isTasksRunning = status === "running";

  const [showPipelineDialog, setShowPipelineDialog] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [pipelineDescription, setPipelineDescription] = useState("");
  const [selectedPipeline, setSelectedPipeline] = useState("");

  const addTask = () => {
    const existingNumbers = tasks
      .map((t) => {
        const match = t.name?.match(/^Task (\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    const nextNumber =
      existingNumbers.length > 0
        ? Math.max(...existingNumbers) + 1
        : tasks.length + 1;

    const newTask: TaskItem = {
      // NOSONAR S2245 - Math.random() is safe for non-cryptographic task IDs in VSCode extension
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Task ${nextNumber}`,
      prompt: "",
      status: "pending" as const,
      model: defaultModel,
    };
    actions.pipelineAddTask(newTask);
  };

  const handleSavePipeline = () => {
    if (pipelineName.trim()) {
      const validTasks = tasks.filter((task) => task.prompt.trim());
      actions.savePipeline(
        pipelineName.trim(),
        pipelineDescription.trim(),
        validTasks,
      );
      setShowPipelineDialog(false);
      setPipelineName("");
      setPipelineDescription("");
    }
  };

  const handleLoadPipeline = () => {
    if (selectedPipeline) {
      // Check if it's a workflow file (contains .yml or .yaml) or a saved pipeline
      if (
        selectedPipeline.includes(".yml") ||
        selectedPipeline.includes(".yaml")
      ) {
        // It's a discovered workflow file
        actions.loadWorkflow(selectedPipeline);
      } else {
        // It's a saved pipeline
        actions.loadPipeline(selectedPipeline);
      }
      setSelectedPipeline("");
    }
  };

  const clearPipeline = () => {
    actions.pipelineClearAll();
  };

  const removeTask = (taskId: string) => {
    if (tasks.length > 1) {
      actions.pipelineRemoveTask(taskId);
    }
  };

  const updateTask = (
    taskId: string,
    field: keyof TaskItem,
    value: string | boolean,
  ) => {
    actions.pipelineUpdateTaskField(taskId, field, value);
  };

  const handleRunTasks = () => {
    const validTasks = tasks.filter((task) => task.prompt.trim());
    if (validTasks.length > 0) {
      actions.runTasks(validTasks, outputFormat);
    }
  };

  const canRunTasks =
    tasks.some((task) => task.prompt.trim()) && !isTasksRunning;

  const isPipelineFinished =
    !isTasksRunning &&
    !isPaused &&
    tasks.some((t) => t.prompt.trim().length > 0) &&
    tasks.some((t) => t.status === "completed" || t.status === "error");

  return (
    <div className="pipeline-panel">
      <PathSelector
        rootPath={rootPath}
        onUpdateRootPath={actions.updateRootPath}
        disabled={isTasksRunning}
      />

      <TaskList
        tasks={tasks}
        isTasksRunning={isTasksRunning}
        defaultModel={defaultModel}
        availableModels={availableModels}
        updateTask={updateTask}
        removeTask={removeTask}
      />

      <PipelineControls
        isTasksRunning={isTasksRunning}
        canRunTasks={canRunTasks}
        disabled={disabled}
        status={status}
        tasks={tasks}
        currentTaskIndex={currentTaskIndex}
        addTask={addTask}
        cancelTask={actions.cancelTask}
        handleRunTasks={handleRunTasks}
        setShowPipelineDialog={setShowPipelineDialog}
        availablePipelines={availablePipelines}
        selectedPipeline={selectedPipeline}
        setSelectedPipeline={setSelectedPipeline}
        handleLoadPipeline={handleLoadPipeline}
        discoveredWorkflows={discoveredWorkflows}
        isPaused={isPaused}
        pausedPipelines={pausedPipelines}
        resumableWorkflows={resumableWorkflows}
        onPausePipeline={actions.pausePipeline}
        onResumePipeline={actions.resumePipeline}
        onPauseWorkflow={actions.pauseWorkflow}
        onResumeWorkflow={actions.resumeWorkflow}
        onDeleteWorkflowState={actions.deleteWorkflowState}
        isPipelineFinished={isPipelineFinished}
        clearPipeline={clearPipeline}
      />

      <PipelineDialog
        showPipelineDialog={showPipelineDialog}
        pipelineName={pipelineName}
        setPipelineName={setPipelineName}
        pipelineDescription={pipelineDescription}
        setPipelineDescription={setPipelineDescription}
        handleSavePipeline={handleSavePipeline}
        setShowPipelineDialog={setShowPipelineDialog}
      />

      {(isTasksRunning ||
        tasks.some((t) => t.status === "completed" || t.status === "error")) &&
        tasks.some((t) => t.prompt.trim().length > 0) && (
          <ProgressTracker
            tasks={tasks}
            isTasksRunning={isTasksRunning}
            currentTaskIndex={currentTaskIndex}
          />
        )}
    </div>
  );
};

export default React.memo(PipelinePanel);
