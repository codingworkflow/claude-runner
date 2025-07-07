import React from "react";
import { TaskItem } from "../../services/ClaudeCodeService";
import { ConditionType } from "../../core/models/Task";

interface TaskListProps {
  tasks: TaskItem[];
  isTasksRunning: boolean;
  defaultModel: string;
  availableModels: string[];
  updateTask: (
    taskId: string,
    field: keyof TaskItem,
    value: string | boolean,
  ) => void;
  removeTask: (taskId: string) => void;
}

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  isTasksRunning,
  defaultModel,
  availableModels,
  updateTask,
  removeTask,
}) => {
  return (
    <div className="tasks-container">
      {tasks.map((task, index) => (
        <div key={`task-${task.id}-${index}`} className="task-item">
          <div className="task-header">
            <input
              type="text"
              key={`${task.id}-name`}
              defaultValue={task.name ?? ""}
              onBlur={(e) => updateTask(task.id, "name", e.target.value)}
              className="task-name-input"
              placeholder={`Task ${index + 1}`}
              disabled={isTasksRunning}
            />
            {tasks.length > 1 && (
              <button
                onClick={() => removeTask(task.id)}
                disabled={isTasksRunning}
              >
                Remove
              </button>
            )}
          </div>

          <div className="task-model-group">
            <label>Model:</label>
            <select
              value={task.model ?? defaultModel}
              onChange={(e) => updateTask(task.id, "model", e.target.value)}
              disabled={isTasksRunning}
              className="model-select"
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <textarea
              key={task.id}
              defaultValue={task.prompt}
              onBlur={(e) => updateTask(task.id, "prompt", e.target.value)}
              placeholder="Enter your task or prompt for Claude..."
              rows={5}
              className="task-textarea"
              disabled={isTasksRunning}
            />
          </div>

          {index > 0 && (
            <div className="resume-row-inline">
              <label className="inline-label">Resume from:</label>
              <select
                value={task.resumeFromTaskId ?? ""}
                onChange={(e) =>
                  updateTask(task.id, "resumeFromTaskId", e.target.value)
                }
                disabled={isTasksRunning}
                className="model-select condition-select-inline"
              >
                <option value="">New session</option>
                {tasks.slice(0, index).map((prevTask, idx) => (
                  <option key={prevTask.id} value={prevTask.id}>
                    {prevTask.name ?? `Task ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="condition-controls">
            {(!task.check || task.check.trim() === "") &&
            (!task.condition || task.condition === "always") ? (
              <button
                onClick={() => {
                  updateTask(task.id, "check", "");
                  updateTask(task.id, "condition", "on_success");
                }}
                disabled={isTasksRunning}
              >
                + Add Condition Command
              </button>
            ) : (
              <>
                <div className="check-command-row">
                  <label className="inline-label">Command:</label>
                  <input
                    type="text"
                    value={task.check ?? ""}
                    onChange={(e) =>
                      updateTask(task.id, "check", e.target.value)
                    }
                    placeholder="Optional check command (e.g., make lint)"
                    className="task-name-input check-command-input-inline"
                    disabled={isTasksRunning}
                  />
                  <button
                    onClick={() => {
                      updateTask(task.id, "check", "");
                      updateTask(task.id, "condition", "always");
                    }}
                    disabled={isTasksRunning}
                    className="remove-condition-btn"
                    title="Remove condition"
                  >
                    ×
                  </button>
                </div>
                <div className="condition-row-inline">
                  <label className="inline-label">Condition:</label>
                  <select
                    value={task.condition ?? "always"}
                    onChange={(e) =>
                      updateTask(
                        task.id,
                        "condition",
                        e.target.value as ConditionType,
                      )
                    }
                    disabled={isTasksRunning}
                    className="model-select condition-select-inline"
                  >
                    <option value="always">Always</option>
                    <option value="on_success">On Success</option>
                    <option value="on_failure">On Failure</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(TaskList);
