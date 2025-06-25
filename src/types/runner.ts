import { TaskItem } from "../services/ClaudeCodeService";

// Type assertion helpers
function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isArray<T>(
  value: unknown,
  check: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(check);
}

function isTaskItem(value: unknown): value is TaskItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "prompt" in value
  );
}

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
  | {
      kind: "updateActiveTab";
      tab: "chat" | "pipeline" | "usage" | "logs";
    }
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
  | { kind: "scanCommands"; rootPath: string }
  | { kind: "openFile"; path: string }
  | { kind: "createCommand"; name: string; isGlobal: boolean; rootPath: string }
  | { kind: "deleteCommand"; path: string }
  | { kind: "webviewError"; error: string };

// Command Registry for type-safe command creation
export const RunnerCommandRegistry: {
  [K in RunnerCommand["kind"]]: (
    message: Record<string, unknown>,
  ) => Extract<RunnerCommand, { kind: K }>;
} = {
  getInitialState: () => ({ kind: "getInitialState" }),
  startInteractive: (m) => ({
    kind: "startInteractive",
    prompt: isString(m.prompt) ? m.prompt : undefined,
  }),
  runTask: (m) => ({
    kind: "runTask",
    task: isString(m.task) ? m.task : "",
    outputFormat:
      isString(m.outputFormat) && ["text", "json"].includes(m.outputFormat)
        ? (m.outputFormat as "text" | "json")
        : undefined,
  }),
  runTasks: (m) => ({
    kind: "runTasks",
    tasks: isArray(m.tasks, isTaskItem) ? m.tasks : [],
    outputFormat:
      isString(m.outputFormat) && ["text", "json"].includes(m.outputFormat)
        ? (m.outputFormat as "text" | "json")
        : undefined,
  }),
  cancelTask: () => ({ kind: "cancelTask" }),
  updateModel: (m) => ({
    kind: "updateModel",
    model: isString(m.model) ? m.model : "",
  }),
  updateRootPath: (m) => ({
    kind: "updateRootPath",
    path: isString(m.path) ? m.path : "",
  }),
  updateAllowAllTools: (m) => ({
    kind: "updateAllowAllTools",
    allow: isBoolean(m.allow) ? m.allow : false,
  }),
  browseFolder: () => ({ kind: "browseFolder" }),
  updateActiveTab: (m) => ({
    kind: "updateActiveTab",
    tab:
      isString(m.tab) && ["chat", "pipeline", "usage", "logs"].includes(m.tab)
        ? (m.tab as "chat" | "pipeline" | "usage" | "logs")
        : "chat",
  }),
  updateChatPrompt: (m) => ({
    kind: "updateChatPrompt",
    prompt: isString(m.prompt) ? m.prompt : "",
  }),
  updateShowChatPrompt: (m) => ({
    kind: "updateShowChatPrompt",
    show: isBoolean(m.show) ? m.show : false,
  }),
  updateOutputFormat: (m) => ({
    kind: "updateOutputFormat",
    format:
      isString(m.format) && ["text", "json"].includes(m.format)
        ? (m.format as "text" | "json")
        : "json",
  }),
  savePipeline: (m) => ({
    kind: "savePipeline",
    name: isString(m.name) ? m.name : "",
    description: isString(m.description) ? m.description : "",
    tasks: isArray(m.tasks, isTaskItem) ? m.tasks : [],
  }),
  loadPipeline: (m) => ({
    kind: "loadPipeline",
    name: isString(m.name) ? m.name : "",
  }),
  pipelineAddTask: (m) => ({
    kind: "pipelineAddTask",
    newTask: isTaskItem(m.newTask)
      ? m.newTask
      : ({ id: "", prompt: "" } as TaskItem),
  }),
  pipelineRemoveTask: (m) => ({
    kind: "pipelineRemoveTask",
    taskId: isString(m.taskId) ? m.taskId : "",
  }),
  pipelineUpdateTaskField: (m) => ({
    kind: "pipelineUpdateTaskField",
    taskId: isString(m.taskId) ? m.taskId : "",
    field: isString(m.field) ? (m.field as keyof TaskItem) : "prompt",
    value: m.value,
  }),
  updateParallelTasksCount: (m) => ({
    kind: "updateParallelTasksCount",
    value: isNumber(m.value) ? m.value : 1,
  }),
  requestUsageReport: (m) => ({
    kind: "requestUsageReport",
    period:
      isString(m.period) &&
      ["today", "week", "month", "hourly"].includes(m.period)
        ? (m.period as "today" | "week" | "month" | "hourly")
        : "today",
    hours: isNumber(m.hours) ? m.hours : undefined,
    startHour: isNumber(m.startHour) ? m.startHour : undefined,
  }),
  requestLogProjects: () => ({ kind: "requestLogProjects" }),
  requestLogConversations: (m) => ({
    kind: "requestLogConversations",
    projectName: isString(m.projectName) ? m.projectName : "",
  }),
  requestLogConversation: (m) => ({
    kind: "requestLogConversation",
    filePath: isString(m.filePath) ? m.filePath : "",
  }),
  recheckClaude: (m) => ({
    kind: "recheckClaude",
    shell:
      isString(m.shell) &&
      ["auto", "bash", "zsh", "fish", "sh"].includes(m.shell)
        ? (m.shell as "auto" | "bash" | "zsh" | "fish" | "sh")
        : undefined,
  }),
  scanCommands: (m) => ({
    kind: "scanCommands",
    rootPath: isString(m.rootPath) ? m.rootPath : "",
  }),
  openFile: (m) => ({ kind: "openFile", path: isString(m.path) ? m.path : "" }),
  createCommand: (m) => ({
    kind: "createCommand",
    name: isString(m.name) ? m.name : "",
    isGlobal: isBoolean(m.isGlobal) ? m.isGlobal : false,
    rootPath: isString(m.rootPath) ? m.rootPath : "",
  }),
  deleteCommand: (m) => ({
    kind: "deleteCommand",
    path: isString(m.path) ? m.path : "",
  }),
  webviewError: (m) => ({
    kind: "webviewError",
    error: isString(m.error) ? m.error : "",
  }),
};

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
