import React from "react";
import Button from "../common/Button";
import { TaskItem } from "../../services/ClaudeCodeService";

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
        <div key={task.id} className="task-item">
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
              <Button
                variant="error"
                onClick={() => removeTask(task.id)}
                disabled={isTasksRunning}
              >
                Remove
              </Button>
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
              rows={3}
              className="task-textarea"
              disabled={isTasksRunning}
            />
          </div>

          {index > 0 && (
            <div className="resume-config-group">
              <label>Resume from:</label>
              <select
                value={task.resumeFromTaskId ?? ""}
                onChange={(e) =>
                  updateTask(task.id, "resumeFromTaskId", e.target.value)
                }
                disabled={isTasksRunning}
                className="model-select"
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
        </div>
      ))}
    </div>
  );
};

export default React.memo(TaskList);
