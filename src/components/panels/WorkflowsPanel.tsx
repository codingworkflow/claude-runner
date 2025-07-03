import React, { useState } from "react";
import { useExtension } from "../../contexts/ExtensionContext";
import { getModelIds, DEFAULT_MODEL } from "../../models/ClaudeModels";
import { TaskItem } from "../../services/ClaudeCodeService";
import TaskList from "../pipeline/TaskList";

interface WorkflowsPanelProps {
  disabled: boolean;
}

const WorkflowsPanel: React.FC<WorkflowsPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { main } = state;
  const {
    tasks = [],
    availablePipelines = [],
    availableModels = getModelIds(),
    model: defaultModel = DEFAULT_MODEL,
    discoveredWorkflows,
  } = main;

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState("");

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
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Task ${nextNumber}`,
      prompt: "",
      status: "pending" as const,
      model: defaultModel,
    };
    actions.pipelineAddTask(newTask);
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

  const handleSaveWorkflow = () => {
    if (workflowName.trim()) {
      const validTasks = tasks.filter((task) => task.prompt.trim());
      actions.savePipeline(
        workflowName.trim(),
        workflowDescription.trim(),
        validTasks,
      );
      setShowSaveDialog(false);
      setWorkflowName("");
      setWorkflowDescription("");
    }
  };

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
      setSelectedWorkflow("");
    }
  };

  const clearWorkflow = () => {
    actions.pipelineClearAll();
  };

  const canSave = tasks.some((task) => task.prompt.trim());

  return (
    <div className="workflows-panel">
      <div className="workflow-load-section">
        <select
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          disabled={disabled}
        >
          <option value="">Select a workflow to load...</option>
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
          disabled={disabled || !selectedWorkflow}
        >
          Load
        </button>
      </div>

      <div className="workflow-actions">
        <button onClick={addTask} disabled={disabled}>
          Add Task
        </button>
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={disabled || !canSave}
        >
          Save Workflow
        </button>
        <button
          onClick={clearWorkflow}
          disabled={disabled || tasks.length === 0}
        >
          Clear All
        </button>
      </div>

      <TaskList
        tasks={tasks}
        isTasksRunning={false}
        defaultModel={defaultModel}
        availableModels={availableModels}
        updateTask={updateTask}
        removeTask={removeTask}
      />

      {showSaveDialog && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h3>Save Workflow</h3>
            <input
              type="text"
              placeholder="Workflow name"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              rows={3}
            />
            <div className="dialog-actions">
              <button
                onClick={handleSaveWorkflow}
                disabled={!workflowName.trim()}
              >
                Save
              </button>
              <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(WorkflowsPanel);
