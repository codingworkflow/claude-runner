import React from "react";
import { TaskItem } from "../../services/ClaudeCodeService";

interface ProgressTrackerProps {
  tasks: TaskItem[];
  isTasksRunning: boolean;
  currentTaskIndex?: number;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  tasks,
  isTasksRunning,
  currentTaskIndex,
}) => {
  return (
    <div className="pipeline-progress">
      <h4>Pipeline Progress</h4>
      {tasks.map((task, index) => {
        const isCurrentTask = currentTaskIndex === index;
        const hasContent = task.prompt.trim().length > 0;

        if (!hasContent) {
          return null;
        }

        return (
          <div
            key={`progress-${task.id}`}
            className={`progress-task ${isCurrentTask ? "current" : ""}`}
          >
            <div className="progress-header">
              <h5>
                {(task.name ?? task.name === "")
                  ? task.name
                  : `Task ${index + 1}`}
              </h5>
              <div className="progress-status">
                {task.status === "pending" && !isCurrentTask && (
                  <span className="status-badge status-pending">
                    ⏸️ Pending
                  </span>
                )}
                {(task.status === "running" ||
                  (isCurrentTask && isTasksRunning)) && (
                  <span className="status-badge status-running">
                    ⏳ Running...
                  </span>
                )}
                {task.status === "completed" && (
                  <span className="status-badge status-completed">
                    ✅ Completed
                  </span>
                )}
                {task.status === "error" && (
                  <span className="status-badge status-error">❌ Failed</span>
                )}
              </div>
            </div>

            <div className="progress-prompt">
              <span className="prompt-preview">
                {task.prompt.substring(0, 100)}
                {task.prompt.length > 100 ? "..." : ""}
              </span>
            </div>

            {task.results &&
              (task.status === "completed" || task.status === "error") && (
                <div className="progress-results">
                  <div className="results-header">
                    <h6>Output:</h6>
                  </div>
                  <div className="results-container">
                    <pre className="results-text">{task.results}</pre>
                  </div>
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(ProgressTracker);
