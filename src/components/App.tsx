import React, { useState, useEffect, useRef } from "react";
import ChatPanel from "./panels/ChatPanel";
import PipelinePanel from "./panels/PipelinePanel";
import UsageReportPanel from "./panels/UsageReportPanel";
import LogsPanel from "./panels/LogsPanel";
import ShellSelector from "./common/ShellSelector";
import { useVSCodeAPI } from "./hooks/useVSCodeAPI";
import { getModelIds } from "../models/ClaudeModels";

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

// Define the props interface for the App component - includes ALL state
export interface AppProps {
  // Configuration from extension
  model: string;
  rootPath: string;
  allowAllTools: boolean;
  parallelTasksCount: number;
  status: "stopped" | "running" | "starting" | "stopping";

  // UI state - all controlled by extension
  activeTab: "chat" | "pipeline" | "usage" | "logs";
  showAdvancedTabs: boolean;
  outputFormat: "text" | "json";
  tasks: TaskItem[];
  currentTaskIndex?: number;
  results?: string;
  taskCompleted?: boolean;
  taskError?: boolean;
  chatPrompt: string;
  showChatPrompt: boolean;

  // Claude version info
  claudeVersion: string;
  claudeVersionAvailable: boolean;
  claudeVersionError?: string;
  claudeVersionLoading: boolean;

  // Claude installation status
  claudeInstalled: boolean;

  // Available options
  availablePipelines?: string[];
  availableModels?: string[];
}

const App: React.FC<AppProps> = ({
  model,
  rootPath,
  allowAllTools,
  parallelTasksCount = 1,
  status,
  activeTab = "chat",
  showAdvancedTabs = false,
  outputFormat = "json",
  tasks = [],
  currentTaskIndex,
  results: _results,
  taskCompleted: _taskCompleted,
  taskError: _taskError,
  chatPrompt = "",
  showChatPrompt = false,
  claudeVersion = "Checking...",
  claudeVersionAvailable = false,
  claudeVersionError,
  claudeVersionLoading = true,
  claudeInstalled = false,
  availablePipelines,
  availableModels = getModelIds(),
}) => {
  // Use custom hook for VS Code API calls
  const {
    startInteractive,
    runTasks,
    cancelTask,
    updateModel,
    updateRootPath,
    updateAllowAllTools,
    updateOutputFormat,
    updateActiveTab,
    updateChatPrompt,
    updateShowChatPrompt,
    updateParallelTasksCount,
    savePipeline,
    loadPipeline,
    pipelineAddTask,
    pipelineRemoveTask,
    pipelineUpdateTaskField,
    recheckClaude,
  } = useVSCodeAPI();

  // Local state for shell selection when Claude is not installed
  const [selectedShell, setSelectedShell] = useState<
    "auto" | "bash" | "zsh" | "fish" | "sh"
  >("auto");
  const [recheckState, setRecheckState] = useState<
    "idle" | "checking" | "success" | "error"
  >("idle");
  const isRecheckingRef = useRef(false);

  // Watch for changes in claudeInstalled when rechecking
  useEffect(() => {
    if (isRecheckingRef.current) {
      if (claudeInstalled) {
        setRecheckState("success");
        isRecheckingRef.current = false;
      } else {
        // Still checking or failed, update in a moment
        const timer = setTimeout(() => {
          if (isRecheckingRef.current) {
            setRecheckState("error");
            setTimeout(() => {
              setRecheckState("idle");
              isRecheckingRef.current = false;
            }, 2000);
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
    return undefined; // Explicit return for no cleanup
  }, [claudeInstalled]);

  const handleRecheckClaude = () => {
    setRecheckState("checking");
    isRecheckingRef.current = true;
    recheckClaude(selectedShell);
  };

  // Show Claude installation message with shell selector if Claude is not installed
  if (!claudeInstalled) {
    return (
      <div className="container">
        <div className="claude-not-installed">
          <h3>⚠️ Claude Code CLI Required</h3>
          <p>Please install Claude Code CLI to use this extension:</p>
          <div className="install-command">
            <code>npm install -g @anthropic-ai/claude-code</code>
          </div>
          <p>
            Setup instructions:{" "}
            <a href="https://docs.anthropic.com/en/docs/claude-code/setup">
              https://docs.anthropic.com/en/docs/claude-code/setup
            </a>
          </p>

          <div className="shell-selection-section">
            <h4>If Claude is installed but not detected:</h4>
            <p>Try selecting your shell type and rechecking:</p>
            <ShellSelector
              shell={selectedShell}
              onUpdateShell={setSelectedShell}
              disabled={false}
            />
          </div>

          <button
            className={`recheck-button recheck-${recheckState}`}
            onClick={handleRecheckClaude}
            disabled={recheckState === "checking"}
          >
            {recheckState === "checking" && "⏳ Checking..."}
            {recheckState === "success" && "✅ Found!"}
            {recheckState === "error" && "❌ Not Found"}
            {recheckState === "idle" && "🔄 Recheck Installation"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => updateActiveTab("chat")}
        >
          Chat
        </button>
        <button
          className={`tab-button ${activeTab === "pipeline" ? "active" : ""}`}
          onClick={() => updateActiveTab("pipeline")}
        >
          Pipeline
        </button>
        {(showAdvancedTabs ||
          activeTab === "usage" ||
          activeTab === "logs") && (
          <>
            <button
              className={`tab-button ${activeTab === "usage" ? "active" : ""}`}
              onClick={() => updateActiveTab("usage")}
            >
              Usage
            </button>
            <button
              className={`tab-button ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => updateActiveTab("logs")}
            >
              Logs
            </button>
          </>
        )}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === "chat" && (
          <ChatPanel
            model={model}
            rootPath={rootPath}
            allowAllTools={allowAllTools}
            parallelTasksCount={parallelTasksCount}
            availableModels={availableModels}
            chatPrompt={chatPrompt}
            showChatPrompt={showChatPrompt}
            claudeVersion={claudeVersion}
            claudeVersionAvailable={claudeVersionAvailable}
            claudeVersionError={claudeVersionError}
            claudeVersionLoading={claudeVersionLoading}
            onStartInteractive={startInteractive}
            onUpdateModel={updateModel}
            onUpdateRootPath={updateRootPath}
            onUpdateAllowAllTools={updateAllowAllTools}
            onUpdateChatPrompt={updateChatPrompt}
            onUpdateShowChatPrompt={updateShowChatPrompt}
            onUpdateParallelTasksCount={updateParallelTasksCount}
            onShowUsageAndLogs={() => updateActiveTab("usage")}
            disabled={status === "starting" || status === "stopping"}
          />
        )}

        {activeTab === "pipeline" && (
          <PipelinePanel
            onRunTasks={runTasks}
            onCancelTasks={cancelTask}
            onSavePipeline={savePipeline}
            onLoadPipeline={loadPipeline}
            onPipelineAddTask={pipelineAddTask}
            onPipelineRemoveTask={pipelineRemoveTask}
            onPipelineUpdateTaskField={pipelineUpdateTaskField}
            availablePipelines={availablePipelines}
            availableModels={availableModels}
            defaultModel={model}
            rootPath={rootPath}
            outputFormat={outputFormat}
            onOutputFormatChange={updateOutputFormat}
            onUpdateRootPath={updateRootPath}
            tasks={tasks}
            disabled={status === "starting" || status === "stopping"}
            isTasksRunning={status === "running"}
            currentTaskIndex={currentTaskIndex}
          />
        )}

        {activeTab === "usage" && (
          <UsageReportPanel
            disabled={status === "starting" || status === "stopping"}
          />
        )}

        {activeTab === "logs" && (
          <LogsPanel
            disabled={status === "starting" || status === "stopping"}
          />
        )}
      </div>
    </div>
  );
};

// Initial state - placeholder values that will be replaced by extension
export const initialState: AppProps = {
  model: "claude-sonnet-4-20250514",
  rootPath: "",
  allowAllTools: false,
  parallelTasksCount: 1,
  status: "stopped",
  activeTab: "chat", // Default to chat
  showAdvancedTabs: false,
  outputFormat: "json",
  tasks: [],
  currentTaskIndex: undefined,
  results: undefined,
  taskCompleted: undefined,
  taskError: undefined,
  chatPrompt: "",
  showChatPrompt: false,
  claudeVersion: "Checking...",
  claudeVersionAvailable: false,
  claudeVersionError: undefined,
  claudeVersionLoading: true,
  claudeInstalled: true,
};

export default React.memo(App);
