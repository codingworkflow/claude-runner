import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from "react";
import { ClaudeWorkflow, WorkflowMetadata } from "../types/WorkflowTypes";
import { TaskItem } from "../services/ClaudeCodeService";

// LOGS VIEW TYPES
export interface ProjectInfo {
  name: string;
  path: string;
  conversationCount: number;
  lastModified: string;
}

export interface ConversationInfo {
  id: string;
  sessionId: string;
  fileName: string;
  firstTimestamp: string;
  lastTimestamp: string;
  messageCount: number;
  summary?: string;
  filePath: string;
}

export interface UsageInfo {
  input_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens: number;
  service_tier?: string;
}

export interface ContentItem {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | Record<string, unknown>[];
  is_error?: boolean;
  thinking?: string;
}

export interface TranscriptEntry {
  type: "user" | "assistant" | "summary";
  timestamp: string;
  sessionId?: string;
  uuid: string;
  message?: {
    role: "user" | "assistant";
    content: string | ContentItem[];
    model?: string;
    usage?: UsageInfo;
  };
  summary?: string;
  leafUuid?: string;
}

export interface ConversationData {
  info: ConversationInfo;
  entries: TranscriptEntry[];
}

export type Period = "hourly" | "today" | "yesterday" | "week" | "month";

export interface UsageReport {
  date: string;
  models: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUSD: number;
}

export interface PeriodUsageReport {
  period: Period;
  startDate: string;
  endDate: string;
  dailyReports: UsageReport[];
  totals: Omit<UsageReport, "date" | "models"> & { models: string[] };
}

// View Types
export type ViewType = "main" | "commands" | "usage";

// State Interfaces
export interface MainViewState {
  activeTab: "chat" | "pipeline" | "workflows" | "runner";
  model: string;
  rootPath: string;
  allowAllTools: boolean;
  status: "stopped" | "running" | "starting" | "stopping" | "paused";
  tasks: TaskItem[];
  currentTaskIndex?: number;
  results?: string;
  taskCompleted?: boolean;
  taskError?: boolean;
  chatPrompt: string;
  showChatPrompt: boolean;
  outputFormat: "text" | "json";
  availablePipelines?: string[];
  availableModels?: string[];
  discoveredWorkflows?: { name: string; path: string }[];
  workflows: WorkflowMetadata[];
  currentWorkflow: ClaudeWorkflow | null;
  workflowInputs: Record<string, string>;
  executionStatus: "idle" | "running" | "completed" | "failed";
  stepStatuses: Record<
    string,
    {
      status: "pending" | "running" | "completed" | "failed";
      output?: { result?: string; [key: string]: unknown };
    }
  >;

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
}

export interface CommandFile {
  name: string;
  path: string;
  description?: string;
  isProject: boolean;
}

export interface CommandsViewState {
  activeTab: "global" | "project";
  globalCommands: CommandFile[];
  projectCommands: CommandFile[];
  loading: boolean;
  rootPath: string;
}

export interface UsageViewState {
  activeTab: "usage" | "logs";
  projects: ProjectInfo[];
  selectedProject: string;
  conversations: ConversationInfo[];
  selectedConversation: string;
  conversationData: ConversationData | null;
  projectsLoading: boolean;
  conversationsLoading: boolean;
  conversationLoading: boolean;
  projectsError: string | null;
  conversationsError: string | null;
  conversationError: string | null;
  selectedPeriod: Period;
  totalHours: number;
  startHour: number;
  limitType: "input" | "output" | "cost";
  limitValue: number;
  autoRefresh: boolean;
  report: PeriodUsageReport | null;
  loading: boolean;
  error: string | null;
}

export interface ClaudeSystemState {
  version: string;
  isAvailable: boolean;
  isInstalled: boolean;
  error?: string;
  loading: boolean;
}

// Combined Extension State
export interface ExtensionState {
  currentView: ViewType;
  main: MainViewState;
  commands: CommandsViewState;
  usage: UsageViewState;
  claude: ClaudeSystemState;
}

// Action Types
export type ExtensionAction =
  | { type: "SET_VIEW"; view: ViewType }
  | { type: "UPDATE_MAIN_STATE"; updates: Partial<MainViewState> }
  | { type: "UPDATE_COMMANDS_STATE"; updates: Partial<CommandsViewState> }
  | { type: "UPDATE_USAGE_STATE"; updates: Partial<UsageViewState> }
  | { type: "UPDATE_CLAUDE_STATE"; updates: Partial<ClaudeSystemState> }
  | { type: "RESET_STATE"; newState: Partial<ExtensionState> };

// Initial State
const initialState: ExtensionState = {
  currentView: "main",
  main: {
    activeTab: "chat",
    model: "claude-sonnet-4-20250514",
    rootPath: "",
    allowAllTools: false,
    status: "stopped",
    tasks: [],
    currentTaskIndex: undefined,
    results: undefined,
    taskCompleted: undefined,
    taskError: undefined,
    chatPrompt: "",
    showChatPrompt: false,
    outputFormat: "json",
    availablePipelines: [],
    availableModels: [],
    workflows: [],
    currentWorkflow: null,
    workflowInputs: {},
    executionStatus: "idle",
    stepStatuses: {},

    // Pause/Resume initial state
    isPaused: false,
    currentExecutionId: undefined,
    pausedPipelines: [],
    resumableWorkflows: [],
  },
  commands: {
    activeTab: "global",
    globalCommands: [],
    projectCommands: [],
    loading: false,
    rootPath: "",
  },
  usage: {
    activeTab: "usage",
    projects: [],
    selectedProject: "",
    conversations: [],
    selectedConversation: "",
    conversationData: null,
    projectsLoading: false,
    conversationsLoading: false,
    conversationLoading: false,
    projectsError: null,
    conversationsError: null,
    conversationError: null,
    selectedPeriod: "today",
    totalHours: 5,
    startHour: new Date().getUTCHours(),
    limitType: "output",
    limitValue: 0,
    autoRefresh: false,
    report: null,
    loading: false,
    error: null,
  },
  claude: {
    version: "Checking...",
    isAvailable: false,
    isInstalled: true,
    error: undefined,
    loading: true,
  },
};

// Reducer
function extensionReducer(
  state: ExtensionState,
  action: ExtensionAction,
): ExtensionState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, currentView: action.view };

    case "UPDATE_MAIN_STATE":
      return { ...state, main: { ...state.main, ...action.updates } };

    case "UPDATE_COMMANDS_STATE":
      return { ...state, commands: { ...state.commands, ...action.updates } };

    case "UPDATE_USAGE_STATE":
      return { ...state, usage: { ...state.usage, ...action.updates } };

    case "UPDATE_CLAUDE_STATE":
      return { ...state, claude: { ...state.claude, ...action.updates } };

    case "RESET_STATE":
      return { ...state, ...action.newState };

    default:
      return state;
  }
}

// Context Interface
interface ExtensionContextType {
  state: ExtensionState;
  dispatch: React.Dispatch<ExtensionAction>;
  actions: ExtensionActions;
}

// Action Creators
export interface ExtensionActions {
  // View Actions
  setCurrentView: (view: ViewType) => void;

  // Main View Actions
  updateMainState: (updates: Partial<MainViewState>) => void;
  startInteractive: (prompt?: string) => void;
  runTasks: (tasks: TaskItem[], format: "text" | "json") => void;
  cancelTask: () => void;
  updateModel: (model: string) => void;
  updateRootPath: (path: string) => void;
  updateAllowAllTools: (allow: boolean) => void;
  updateActiveTab: (tab: "chat" | "pipeline" | "workflows" | "runner") => void;
  updateChatPrompt: (prompt: string) => void;
  updateShowChatPrompt: (show: boolean) => void;
  updateOutputFormat: (format: "text" | "json") => void;
  savePipeline: (name: string, description: string, tasks: TaskItem[]) => void;
  loadPipeline: (name: string) => void;
  pipelineAddTask: (newTask: TaskItem) => void;
  pipelineRemoveTask: (taskId: string) => void;
  pipelineClearAll: () => void;
  pipelineUpdateTaskField: (
    taskId: string,
    field: keyof TaskItem,
    value: unknown,
  ) => void;
  recheckClaude: (shell?: "auto" | "bash" | "zsh" | "fish" | "sh") => void;
  loadWorkflows: () => void;
  loadWorkflow: (workflowId: string) => void;
  saveWorkflow: (workflowId: string, workflow: ClaudeWorkflow) => void;
  deleteWorkflow: (workflowId: string) => void;
  updateWorkflowInputs: (inputs: Record<string, string>) => void;
  runWorkflow: () => void;
  cancelWorkflow: () => void;
  createSampleWorkflow: () => void;
  pausePipeline: () => void;
  resumePipeline: (executionId: string) => void;
  pauseWorkflow: (executionId?: string) => void;
  resumeWorkflow: (executionId: string) => void;
  deleteWorkflowState: (executionId: string) => void;
  getResumableWorkflows: () => void;

  // Commands View Actions
  updateCommandsState: (updates: Partial<CommandsViewState>) => void;
  scanCommands: (rootPath: string) => void;
  createCommand: (name: string, isGlobal: boolean, rootPath?: string) => void;
  openFile: (path: string) => void;
  deleteCommand: (path: string) => void;

  // Usage View Actions
  updateUsageState: (updates: Partial<UsageViewState>) => void;
  requestUsageReport: (
    period: "today" | "yesterday" | "week" | "month" | "hourly",
    hours?: number,
    startHour?: number,
  ) => void;
  requestLogProjects: () => void;
  requestLogConversations: (projectName: string) => void;
  requestLogConversation: (filePath: string) => void;
}

// Context
const ExtensionContext = createContext<ExtensionContextType | null>(null);

// VSCode API Hook
function useVSCodeAPI() {
  const vscode = (
    window as typeof window & {
      vscodeApi?: { postMessage: (message: Record<string, unknown>) => void };
    }
  ).vscodeApi;

  const sendMessage = (command: string, data?: Record<string, unknown>) => {
    if (vscode) {
      vscode.postMessage({ command, ...data });
    }
  };

  return { sendMessage };
}

// Provider Component
export const ExtensionProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(extensionReducer, initialState);
  const { sendMessage } = useVSCodeAPI();

  // Create action creators
  const actions: ExtensionActions = {
    // View Actions
    setCurrentView: (view: ViewType) => {
      dispatch({ type: "SET_VIEW", view });
    },

    // Main View Actions
    updateMainState: (updates: Partial<MainViewState>) => {
      dispatch({ type: "UPDATE_MAIN_STATE", updates });
    },

    startInteractive: (prompt?: string) => {
      sendMessage("startInteractive", { prompt });
    },

    runTasks: (tasks: TaskItem[], format: "text" | "json") => {
      sendMessage("runTasks", { tasks, outputFormat: format });
    },

    cancelTask: () => {
      sendMessage("cancelTask");
    },

    updateModel: (model: string) => {
      sendMessage("updateModel", { model });
    },

    updateRootPath: (path: string) => {
      sendMessage("updateRootPath", { path });
    },

    updateAllowAllTools: (allow: boolean) => {
      sendMessage("updateAllowAllTools", { allow });
    },

    updateActiveTab: (tab: "chat" | "pipeline" | "workflows" | "runner") => {
      sendMessage("updateActiveTab", { tab });
    },

    updateChatPrompt: (prompt: string) => {
      sendMessage("updateChatPrompt", { prompt });
    },

    updateShowChatPrompt: (show: boolean) => {
      sendMessage("updateShowChatPrompt", { show });
    },

    updateOutputFormat: (format: "text" | "json") => {
      sendMessage("updateOutputFormat", { format });
    },

    savePipeline: (name: string, description: string, tasks: TaskItem[]) => {
      sendMessage("savePipeline", { name, description, tasks });
    },

    loadPipeline: (name: string) => {
      sendMessage("loadPipeline", { name });
    },

    pipelineAddTask: (newTask: TaskItem) => {
      sendMessage("pipelineAddTask", { newTask });
    },

    pipelineRemoveTask: (taskId: string) => {
      sendMessage("pipelineRemoveTask", { taskId });
    },

    pipelineClearAll: () => {
      sendMessage("pipelineClearAll");
    },

    pipelineUpdateTaskField: (
      taskId: string,
      field: keyof TaskItem,
      value: unknown,
    ) => {
      sendMessage("pipelineUpdateTaskField", { taskId, field, value });
    },

    recheckClaude: (shell?: "auto" | "bash" | "zsh" | "fish" | "sh") => {
      sendMessage("recheckClaude", { shell });
    },

    loadWorkflows: () => {
      sendMessage("loadWorkflows");
    },

    loadWorkflow: (workflowId: string) => {
      sendMessage("loadWorkflow", { workflowId });
    },

    saveWorkflow: (workflowId: string, workflow: ClaudeWorkflow) => {
      sendMessage("saveWorkflow", { workflowId, workflow });
    },

    deleteWorkflow: (workflowId: string) => {
      sendMessage("deleteWorkflow", { workflowId });
    },

    updateWorkflowInputs: (inputs: Record<string, string>) => {
      sendMessage("updateWorkflowInputs", { inputs });
    },

    runWorkflow: () => {
      sendMessage("runWorkflow");
    },

    cancelWorkflow: () => {
      sendMessage("cancelWorkflow");
    },

    createSampleWorkflow: () => {
      sendMessage("createSampleWorkflow");
    },

    // Pause/Resume Actions
    pauseWorkflow: (executionId?: string) => {
      sendMessage("pauseWorkflow", { executionId });
    },

    resumeWorkflow: (executionId: string) => {
      sendMessage("resumeWorkflow", { executionId });
    },

    pausePipeline: () => {
      sendMessage("pausePipeline");
    },

    resumePipeline: (pipelineId: string) => {
      sendMessage("resumePipeline", { pipelineId });
    },

    getResumableWorkflows: () => {
      sendMessage("getResumableWorkflows");
    },

    deleteWorkflowState: (executionId: string) => {
      sendMessage("deleteWorkflowState", { executionId });
    },

    // Commands View Actions
    updateCommandsState: (updates: Partial<CommandsViewState>) => {
      dispatch({ type: "UPDATE_COMMANDS_STATE", updates });
    },

    scanCommands: (rootPath: string) => {
      sendMessage("scanCommands", { rootPath });
    },

    createCommand: (name: string, isGlobal: boolean, rootPath?: string) => {
      sendMessage("createCommand", { name, isGlobal, rootPath });
    },

    openFile: (path: string) => {
      sendMessage("openFile", { path });
    },

    deleteCommand: (path: string) => {
      sendMessage("deleteCommand", { path });
    },

    // Usage View Actions
    updateUsageState: (updates: Partial<UsageViewState>) => {
      dispatch({ type: "UPDATE_USAGE_STATE", updates });
    },

    requestUsageReport: (
      period: "today" | "yesterday" | "week" | "month" | "hourly",
      hours?: number,
      startHour?: number,
    ) => {
      sendMessage("requestUsageReport", { period, hours, startHour });
    },

    requestLogProjects: () => {
      sendMessage("requestLogProjects");
    },

    requestLogConversations: (projectName: string) => {
      sendMessage("requestLogConversations", { projectName });
    },

    requestLogConversation: (filePath: string) => {
      sendMessage("requestLogConversation", { filePath });
    },
  };

  // Handle messages from VS Code
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      // Handle different message types and update state accordingly
      switch (message.command) {
        case "setInitialView":
          if (message.viewType) {
            dispatch({ type: "SET_VIEW", view: message.viewType as ViewType });
          }
          break;

        case "commandScanResult":
          dispatch({
            type: "UPDATE_COMMANDS_STATE",
            updates: {
              globalCommands: message.globalCommands || [],
              projectCommands: message.projectCommands || [],
              loading: false,
            },
          });
          break;

        case "logProjectsData":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              projects: message.data || [],
              projectsLoading: false,
              projectsError: null,
            },
          });
          break;

        case "logProjectsError":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              projects: [],
              projectsLoading: false,
              projectsError: message.error || "Failed to load projects",
            },
          });
          break;

        case "logConversationsData":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              conversations: message.data || [],
              conversationsLoading: false,
              conversationsError: null,
            },
          });
          break;

        case "logConversationsError":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              conversations: [],
              conversationsLoading: false,
              conversationsError:
                message.error || "Failed to load conversations",
            },
          });
          break;

        case "logConversationData":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              conversationData: message.data,
              conversationLoading: false,
              conversationError: null,
            },
          });
          break;

        case "logConversationError":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              conversationData: null,
              conversationLoading: false,
              conversationError: message.error || "Failed to load conversation",
            },
          });
          break;

        case "usageReportData":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              report: message.data,
              loading: false,
              error: null,
            },
          });
          break;

        case "usageReportError":
          dispatch({
            type: "UPDATE_USAGE_STATE",
            updates: {
              report: null,
              loading: false,
              error: message.error || "Failed to load usage report",
            },
          });
          break;

        case "workflowList":
          dispatch({
            type: "UPDATE_MAIN_STATE",
            updates: {
              workflows: message.workflows || [],
            },
          });
          break;

        case "workflowLoaded":
          dispatch({
            type: "UPDATE_MAIN_STATE",
            updates: {
              currentWorkflow: message.workflow,
            },
          });
          break;

        case "workflowExecutionUpdate":
          dispatch({
            type: "UPDATE_MAIN_STATE",
            updates: {
              executionStatus: message.executionStatus,
              stepStatuses: message.stepStatuses,
            },
          });
          break;

        case "setRootPath":
          dispatch({
            type: "UPDATE_COMMANDS_STATE",
            updates: {
              rootPath: message.rootPath || "",
            },
          });
          break;

        // Handle other message types as needed
        default:
          // For main app state updates, merge into main state
          if (typeof message === "object" && message !== null) {
            // Filter out command-specific messages
            const mainStateFields = [
              "model",
              "rootPath",
              "allowAllTools",
              "parallelTasksCount",
              "status",
              "activeTab",
              "outputFormat",
              "tasks",
              "currentTaskIndex",
              "results",
              "taskCompleted",
              "taskError",
              "chatPrompt",
              "showChatPrompt",
              "availablePipelines",
              "availableModels",
              "discoveredWorkflows",
              "isPaused",
              "pausedPipelines",
              "resumableWorkflows",
              "currentExecutionId",
            ];

            const mainUpdates: Partial<MainViewState> = {};
            const claudeUpdates: Partial<ClaudeSystemState> = {};

            for (const [key, value] of Object.entries(message)) {
              if (mainStateFields.includes(key)) {
                (mainUpdates as Record<string, unknown>)[key] = value;
              } else if (key === "claudeVersion") {
                claudeUpdates.version = value as string;
              } else if (key === "claudeVersionAvailable") {
                claudeUpdates.isAvailable = value as boolean;
              } else if (key === "claudeVersionError") {
                claudeUpdates.error = value as string;
              } else if (key === "claudeVersionLoading") {
                claudeUpdates.loading = value as boolean;
              } else if (key === "claudeInstalled") {
                claudeUpdates.isInstalled = value as boolean;
              }
            }

            if (Object.keys(mainUpdates).length > 0) {
              dispatch({ type: "UPDATE_MAIN_STATE", updates: mainUpdates });
            }

            if (Object.keys(claudeUpdates).length > 0) {
              dispatch({ type: "UPDATE_CLAUDE_STATE", updates: claudeUpdates });
            }
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Request initial state on mount
  useEffect(() => {
    sendMessage("getInitialState");
  }, []);

  const contextValue: ExtensionContextType = {
    state,
    dispatch,
    actions,
  };

  return (
    <ExtensionContext.Provider value={contextValue}>
      {children}
    </ExtensionContext.Provider>
  );
};

// Custom Hook
export const useExtension = (): ExtensionContextType => {
  const context = useContext(ExtensionContext);
  if (!context) {
    throw new Error("useExtension must be used within an ExtensionProvider");
  }
  return context;
};
