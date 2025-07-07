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
  | { kind: "pauseWorkflow"; executionId?: string }
  | { kind: "resumeWorkflow"; executionId: string }
  | { kind: "pausePipeline" }
  | { kind: "resumePipeline"; pipelineId: string }
  | { kind: "getResumableWorkflows" }
  | { kind: "deleteWorkflowState"; executionId: string }
  | { kind: "updateModel"; model: string }
  | { kind: "updateRootPath"; path: string }
  | { kind: "updateAllowAllTools"; allow: boolean }
  | { kind: "browseFolder" }
  | {
      kind: "updateActiveTab";
      tab: "chat" | "pipeline" | "workflows" | "runner" | "usage" | "logs";
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
  | { kind: "loadWorkflow"; workflowId: string }
  | { kind: "pipelineAddTask"; newTask: TaskItem }
  | { kind: "pipelineRemoveTask"; taskId: string }
  | { kind: "pipelineClearAll" }
  | {
      kind: "pipelineUpdateTaskField";
      taskId: string;
      field: keyof TaskItem;
      value: unknown;
    }
  | {
      kind: "requestUsageReport";
      period: "today" | "yesterday" | "week" | "month" | "hourly";
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
  | { kind: "sendChatMessage"; message: string; isFirstMessage: boolean }
  | { kind: "clearChatSession" }
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
  pauseWorkflow: (m) => ({
    kind: "pauseWorkflow",
    executionId: isString(m.executionId) ? m.executionId : undefined,
  }),
  resumeWorkflow: (m) => ({
    kind: "resumeWorkflow",
    executionId: isString(m.executionId) ? m.executionId : "",
  }),
  pausePipeline: () => ({ kind: "pausePipeline" }),
  resumePipeline: (m) => ({
    kind: "resumePipeline",
    pipelineId: isString(m.pipelineId) ? m.pipelineId : "",
  }),
  getResumableWorkflows: () => ({ kind: "getResumableWorkflows" }),
  deleteWorkflowState: (m) => ({
    kind: "deleteWorkflowState",
    executionId: isString(m.executionId) ? m.executionId : "",
  }),
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
      isString(m.tab) &&
      ["chat", "pipeline", "workflows", "runner", "usage", "logs"].includes(
        m.tab,
      )
        ? (m.tab as
            | "chat"
            | "pipeline"
            | "workflows"
            | "runner"
            | "usage"
            | "logs")
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
  loadWorkflow: (m) => ({
    kind: "loadWorkflow",
    workflowId: isString(m.workflowId) ? m.workflowId : "",
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
  pipelineClearAll: () => ({ kind: "pipelineClearAll" }),
  pipelineUpdateTaskField: (m) => ({
    kind: "pipelineUpdateTaskField",
    taskId: isString(m.taskId) ? m.taskId : "",
    field: isString(m.field) ? (m.field as keyof TaskItem) : "prompt",
    value: m.value,
  }),
  requestUsageReport: (m) => ({
    kind: "requestUsageReport",
    period:
      isString(m.period) &&
      ["today", "yesterday", "week", "month", "hourly"].includes(m.period)
        ? (m.period as "today" | "yesterday" | "week" | "month" | "hourly")
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
  sendChatMessage: (m) => ({
    kind: "sendChatMessage",
    message: isString(m.message) ? m.message : "",
    isFirstMessage: isBoolean(m.isFirstMessage) ? m.isFirstMessage : false,
  }),
  clearChatSession: () => ({ kind: "clearChatSession" }),
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

  // Tab state
  activeTab: "chat" | "pipeline" | "workflows" | "runner" | "usage" | "logs";
  showAdvancedTabs: boolean;

  // Pipeline state
  outputFormat: "text" | "json";
  tasks: TaskItem[];
  currentTaskIndex?: number;
  availablePipelines: string[];
  discoveredWorkflows?: { name: string; path: string }[];
  workflowPath?: string;

  // Task execution state
  status: "idle" | "running" | "completed" | "error" | "paused";
  lastTaskResults?: string;
  taskCompleted: boolean;
  taskError: boolean;

  // Pause/Resume state
  isPaused: boolean;
  currentExecutionId?: string;
  pausedPipelines: Array<{
    pipelineId: string;
    tasks: TaskItem[];
    currentIndex: number;
    pausedAt: number;
  }>;
  resumableWorkflows: Array<{
    executionId: string;
    workflowName: string;
    workflowPath: string;
    pausedAt: string;
    currentStep: number;
    totalSteps: number;
    canResume: boolean;
  }>;

  // Chat state
  chatPrompt: string;
  showChatPrompt: boolean;
  chatMessages?: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  chatSessionId?: string;
  chatSending?: boolean;

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
  results?: string;
  availablePipelines: string[];
  availableModels: string[];
  [key: string]: unknown; // Add index signature for compatibility
};
