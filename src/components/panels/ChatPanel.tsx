import React from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Toggle from "../common/Toggle";
import PathSelector from "../common/PathSelector";
import ModelSelector from "../common/ModelSelector";
import ParallelTasksConfig from "../common/ParallelTasksConfig";
import ClaudeVersionDisplay from "../common/ClaudeVersionDisplay";

interface ChatPanelProps {
  model: string;
  rootPath: string;
  allowAllTools: boolean;
  parallelTasksCount: number;
  availableModels: string[];
  chatPrompt: string;
  showChatPrompt: boolean;
  claudeVersion: string;
  claudeVersionAvailable: boolean;
  claudeVersionError?: string;
  claudeVersionLoading: boolean;
  onStartInteractive: (prompt?: string) => void;
  onUpdateModel: (model: string) => void;
  onUpdateRootPath: (path: string) => void;
  onUpdateAllowAllTools: (allow: boolean) => void;
  onUpdateChatPrompt: (prompt: string) => void;
  onUpdateShowChatPrompt: (show: boolean) => void;
  onUpdateParallelTasksCount: (value: number) => void;
  onShowUsageAndLogs: () => void;
  disabled: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  model,
  rootPath,
  allowAllTools,
  parallelTasksCount,
  availableModels: _availableModels,
  chatPrompt,
  showChatPrompt,
  claudeVersion,
  claudeVersionAvailable,
  claudeVersionError,
  claudeVersionLoading,
  onStartInteractive,
  onUpdateModel,
  onUpdateRootPath,
  onUpdateAllowAllTools,
  onUpdateChatPrompt,
  onUpdateShowChatPrompt,
  onUpdateParallelTasksCount,
  onShowUsageAndLogs,
  disabled,
}) => {
  const handleStartChat = () => {
    if (showChatPrompt && chatPrompt.trim()) {
      onStartInteractive(chatPrompt.trim());
    } else {
      onStartInteractive();
    }
  };
  return (
    <>
      {/* Claude Version Display - At the very top */}
      <ClaudeVersionDisplay
        version={claudeVersion}
        isAvailable={claudeVersionAvailable}
        error={claudeVersionError}
        isLoading={claudeVersionLoading}
      />

      {/* Root Path */}
      <PathSelector
        rootPath={rootPath}
        onUpdateRootPath={onUpdateRootPath}
        disabled={disabled}
      />

      <Card title="Interactive Chat Session">
        <div className="space-y-4">
          <div className="chat-info">
            <p className="text-sm opacity-80 mb-3">
              Start an interactive Claude chat session in the VS Code terminal
              using the selected model and configuration.
            </p>
          </div>

          {/* Model Selection */}
          <ModelSelector
            model={model}
            onUpdateModel={onUpdateModel}
            disabled={disabled}
          />

          {/* Tool Permissions */}
          <div className="mt-4">
            <Toggle
              checked={allowAllTools}
              onChange={onUpdateAllowAllTools}
              label="Allow All Tools (--dangerously-skip-permissions)"
              disabled={disabled}
            />
          </div>

          <div className="chat-actions">
            <div className="prompt-section">
              {!showChatPrompt ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onUpdateShowChatPrompt(true)}
                  disabled={disabled}
                >
                  Add Prompt
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onUpdateShowChatPrompt(false);
                      onUpdateChatPrompt("");
                    }}
                    disabled={disabled}
                  >
                    Remove Prompt
                  </Button>
                  <textarea
                    className="prompt-textarea"
                    value={chatPrompt}
                    onChange={(e) => onUpdateChatPrompt(e.target.value)}
                    placeholder="Enter your initial prompt for Claude..."
                    rows={10}
                    disabled={disabled}
                  />
                </>
              )}
            </div>

            <Button
              variant="primary"
              onClick={handleStartChat}
              disabled={disabled}
            >
              Start Chat Session
            </Button>
          </div>
        </div>
      </Card>

      {/* Parallel Tasks Configuration */}
      <ParallelTasksConfig
        parallelTasksCount={parallelTasksCount}
        onUpdateParallelTasksCount={onUpdateParallelTasksCount}
        disabled={disabled}
      />

      {/* Usage & Logs Access */}
      <Card title="Usage & Logs">
        <div className="space-y-3">
          <p className="text-sm opacity-80">
            View usage reports and logs for your Claude sessions.
          </p>
          <Button
            variant="secondary"
            onClick={onShowUsageAndLogs}
            disabled={disabled}
          >
            Show Usage & Logs
          </Button>
        </div>
      </Card>
    </>
  );
};

export default React.memo(ChatPanel);
