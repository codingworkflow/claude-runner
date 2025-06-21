import { useCallback } from "react";

interface TaskItem {
  id: string;
  name?: string;
  prompt: string;
  resumePrevious: boolean;
  status: "pending" | "running" | "completed" | "error";
  results?: string;
  sessionId?: string;
  model?: string;
  dependsOn?: string[];
  continueFrom?: string | null;
}

export const useVSCodeAPI = () => {
  const vscode = (
    window as typeof window & {
      vscodeApi?: { postMessage: (message: Record<string, unknown>) => void };
    }
  ).vscodeApi;

  const sendMessage = useCallback(
    (command: string, data?: Record<string, unknown>) => {
      if (vscode) {
        vscode.postMessage({ command, ...data });
      }
    },
    [vscode],
  );

  // Start interactive Claude session
  const startInteractive = useCallback(
    (prompt?: string) => {
      sendMessage("startInteractive", { prompt });
    },
    [sendMessage],
  );

  // Run a task with prompt and output format
  const runTask = useCallback(
    (task: string, outputFormat: "text" | "json") => {
      sendMessage("runTask", { task, outputFormat });
    },
    [sendMessage],
  );

  // Run multiple tasks in pipeline
  const runTasks = useCallback(
    (tasks: TaskItem[], outputFormat: "text" | "json") => {
      sendMessage("runTasks", { tasks, outputFormat });
    },
    [sendMessage],
  );

  // Cancel running task
  const cancelTask = useCallback(() => {
    sendMessage("cancelTask");
  }, [sendMessage]);

  // Configuration updates
  const updateModel = useCallback(
    (model: string) => {
      sendMessage("updateModel", { model });
    },
    [sendMessage],
  );

  const updateRootPath = useCallback(
    (path: string) => {
      sendMessage("updateRootPath", { path });
    },
    [sendMessage],
  );

  const updateAllowAllTools = useCallback(
    (allow: boolean) => {
      sendMessage("updateAllowAllTools", { allow });
    },
    [sendMessage],
  );

  // UI State updates
  const updateActiveTab = useCallback(
    (tab: "chat" | "pipeline" | "usage" | "windows" | "logs") => {
      sendMessage("updateActiveTab", { tab });
    },
    [sendMessage],
  );

  const updateChatPrompt = useCallback(
    (prompt: string) => {
      sendMessage("updateChatPrompt", { prompt });
    },
    [sendMessage],
  );

  const updateShowChatPrompt = useCallback(
    (show: boolean) => {
      sendMessage("updateShowChatPrompt", { show });
    },
    [sendMessage],
  );

  const updateOutputFormat = useCallback(
    (format: "text" | "json") => {
      sendMessage("updateOutputFormat", { format });
    },
    [sendMessage],
  );

  // Pipeline operations
  const savePipeline = useCallback(
    (name: string, description: string, tasks: TaskItem[]) => {
      sendMessage("savePipeline", { name, description, tasks });
    },
    [sendMessage],
  );

  const loadPipeline = useCallback(
    (name: string) => {
      sendMessage("loadPipeline", { name });
    },
    [sendMessage],
  );

  // Specific task modification functions
  const pipelineAddTask = useCallback(
    (newTask: TaskItem) => {
      sendMessage("pipelineAddTask", { newTask });
    },
    [sendMessage],
  );

  const pipelineRemoveTask = useCallback(
    (taskId: string) => {
      sendMessage("pipelineRemoveTask", { taskId });
    },
    [sendMessage],
  );

  const pipelineUpdateTaskField = useCallback(
    (taskId: string, field: keyof TaskItem, value: unknown) => {
      sendMessage("pipelineUpdateTaskField", { taskId, field, value });
    },
    [sendMessage],
  );

  const updateParallelTasksCount = useCallback(
    (value: number) => {
      sendMessage("updateParallelTasksCount", { value });
    },
    [sendMessage],
  );

  const requestUsageReport = useCallback(
    (
      period: "today" | "week" | "month" | "hourly",
      hours?: number,
      startHour?: number,
    ) => {
      sendMessage("requestUsageReport", { period, hours, startHour });
    },
    [sendMessage],
  );

  // Logs operations
  const requestLogProjects = useCallback(() => {
    sendMessage("requestLogProjects");
  }, [sendMessage]);

  const requestLogConversations = useCallback(
    (projectName: string) => {
      sendMessage("requestLogConversations", { projectName });
    },
    [sendMessage],
  );

  const requestLogConversation = useCallback(
    (filePath: string) => {
      sendMessage("requestLogConversation", { filePath });
    },
    [sendMessage],
  );

  const recheckClaude = useCallback(
    (shell?: "auto" | "bash" | "zsh" | "fish" | "sh") => {
      sendMessage("recheckClaude", { shell });
    },
    [sendMessage],
  );

  return {
    startInteractive,
    runTask,
    runTasks,
    cancelTask,
    updateModel,
    updateRootPath,
    updateAllowAllTools,
    updateActiveTab,
    updateChatPrompt,
    updateShowChatPrompt,
    updateOutputFormat,
    updateParallelTasksCount,
    savePipeline,
    loadPipeline,
    pipelineAddTask,
    pipelineRemoveTask,
    pipelineUpdateTaskField,
    requestUsageReport,
    requestLogProjects,
    requestLogConversations,
    requestLogConversation,
    recheckClaude,
  };
};
