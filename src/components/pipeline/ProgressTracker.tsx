import React, { useState, useEffect } from "react";
import { TaskItem } from "../../services/ClaudeCodeService";

interface ProgressTrackerProps {
  tasks: TaskItem[];
  isTasksRunning: boolean;
  currentTaskIndex?: number;
}

const CountdownTimer: React.FC<{ targetTime: number }> = ({ targetTime }) => {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft("Ready to resume");
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return <span>{timeLeft}</span>;
};

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
                  <span className="status-badge status-pending">Pending</span>
                )}
                {(task.status === "running" ||
                  (isCurrentTask &&
                    isTasksRunning &&
                    task.status === "pending")) && (
                  <span className="status-badge status-running">Running</span>
                )}
                {task.status === "completed" && (
                  <span className="status-badge status-completed">
                    Completed
                  </span>
                )}
                {task.status === "error" && (
                  <span className="status-badge status-error">Failed</span>
                )}
                {task.status === "paused" && (
                  <span className="status-badge status-paused">
                    Paused{" "}
                    {task.pausedUntil && (
                      <CountdownTimer targetTime={task.pausedUntil} />
                    )}
                  </span>
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
              (task.status === "completed" ||
                task.status === "error" ||
                task.status === "paused") && (
                <div className="progress-results">
                  <div className="results-header">
                    <h6>Output:</h6>
                  </div>
                  <div className="results-container">
                    <pre className="results-text">
                      {(() => {
                        try {
                          const parsed = JSON.parse(task.results || "{}");
                          return parsed.result || task.results;
                        } catch {
                          return task.results;
                        }
                      })()}
                    </pre>
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
