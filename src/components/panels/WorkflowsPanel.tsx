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

  const [showSaveForm, setShowSaveForm] = useState(false);
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
      setShowSaveForm(false);
      setWorkflowName("");
      setWorkflowDescription("");
    }
  };

  const handleCancelSave = () => {
    setShowSaveForm(false);
    setWorkflowName("");
    setWorkflowDescription("");
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

  const hasTasks = tasks.length > 0;
  const hasValidTasks =
    tasks.length > 0 && tasks.some((task) => task.prompt.trim());

  return (
    <div className="workflows-panel">
      {(availablePipelines.length > 0 ||
        (discoveredWorkflows && discoveredWorkflows.length > 0)) && (
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
      )}

      <div className="workflow-actions">
        {!hasTasks ? (
          <button onClick={addTask} disabled={disabled}>
            New Workflow
          </button>
        ) : (
          <>
            <button onClick={addTask} disabled={disabled}>
              Add Task
            </button>
            <button
              onClick={() => setShowSaveForm(true)}
              disabled={disabled || !hasValidTasks}
            >
              Save Workflow
            </button>
            <button onClick={clearWorkflow} disabled={disabled}>
              Clear All
            </button>
          </>
        )}
      </div>

      {showSaveForm && (
        <div className="task-item">
          <div className="task-header">
            <h4>Save Workflow</h4>
          </div>
          <div className="input-group">
            <input
              type="text"
              className="task-name-input"
              placeholder="Workflow name"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="input-group">
            <textarea
              className="task-textarea"
              placeholder="Description (optional)"
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="control-buttons">
            <button
              onClick={handleSaveWorkflow}
              disabled={!workflowName.trim()}
            >
              Save
            </button>
            <button onClick={handleCancelSave}>Cancel</button>
          </div>
        </div>
      )}

      {hasTasks && (
        <TaskList
          tasks={tasks}
          isTasksRunning={false}
          defaultModel={defaultModel}
          availableModels={availableModels}
          updateTask={updateTask}
          removeTask={removeTask}
        />
      )}
    </div>
  );
};

export default React.memo(WorkflowsPanel);
