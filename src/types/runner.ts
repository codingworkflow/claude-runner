import { TaskItem } from "../services/ClaudeCodeService";

// Union type for all commands that can be sent from webview to extension
export type RunnerCommand =
  | { kind: "getInitialState" }
  | { kind: "startInteractive"; prompt?: string }
  | { kind: "runTask"; task: string; outputFormat?: "text" | "json" }
  | { kind: "runTasks"; tasks: TaskItem[]; outputFormat?: "text" | "json" }
  | { kind: "cancelTask" }
  | { kind: "updateModel"; model: string }
  | { kind: "updateRootPath"; path: string }
  | { kind: "updateAllowAllTools"; allow: boolean }
  | { kind: "browseFolder" }
  | { kind: "updateActiveTab"; tab: "chat" | "pipeline" | "usage" | "logs" }
  | { kind: "updateChatPrompt"; prompt: string }
  | { kind: "updateShowChatPrompt"; show: boolean }
  | { kind: "updateOutputFormat"; format: "text" | "json" }
  | {
      kind: "savePipeline";
      name: string;
      description: string;
      tasks: TaskItem[];
    }
  | { kind: "loadPipeline"; name: string }
  | { kind: "pipelineAddTask"; newTask: TaskItem }
  | { kind: "pipelineRemoveTask"; taskId: string }
  | {
      kind: "pipelineUpdateTaskField";
      taskId: string;
      field: keyof TaskItem;
      value: unknown;
    }
  | { kind: "updateParallelTasksCount"; value: number }
  | {
      kind: "requestUsageReport";
      period: "today" | "week" | "month" | "hourly";
      hours?: number;
      startHour?: number;
    }
  | { kind: "requestLogProjects" }
  | { kind: "requestLogConversations"; projectName: string }
  | { kind: "requestLogConversation"; filePath: string }
  | { kind: "recheckClaude"; shell?: "auto" | "bash" | "zsh" | "fish" | "sh" }
  | { kind: "webviewError"; error: string };

// Complete UI state interface - single source of truth
export interface UIState {
  // Configuration that can be changed in UI
  model: string;
  rootPath: string;
  allowAllTools: boolean;
  parallelTasksCount: number;

  // Tab state
  activeTab: "chat" | "pipeline" | "usage" | "logs";
  showAdvancedTabs: boolean;

  // Pipeline state
  outputFormat: "text" | "json";
  tasks: TaskItem[];
  currentTaskIndex?: number;

  // Task execution state
  lastTaskResults?: string;
  taskCompleted: boolean;
  taskError: boolean;

  // Chat state
  chatPrompt: string;
  showChatPrompt: boolean;

  // Claude version state
  claudeVersion: string;
  claudeVersionAvailable: boolean;
  claudeVersionError?: string;
  claudeVersionLoading: boolean;

  // Claude installation state
  claudeInstalled: boolean;
}

// Event bus interface for decoupling
export interface EventBus {
  readonly send: (cmd: RunnerCommand) => void;
}

// Message types for webview communication
export type WebviewMessage = UIState & {
  status: "idle" | "running" | "stopped";
  results?: string;
  availablePipelines: string[];
  availableModels: string[];
  [key: string]: unknown; // Add index signature for compatibility
};
