import React from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Toggle from "../common/Toggle";
import PathSelector from "../common/PathSelector";
import ModelSelector from "../common/ModelSelector";
import ClaudeVersionDisplay from "../common/ClaudeVersionDisplay";
import { useExtension } from "../../contexts/ExtensionContext";

interface ChatPanelProps {
  disabled: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { main, claude } = state;

  const handleStartChat = () => {
    if (main.showChatPrompt && main.chatPrompt.trim()) {
      actions.startInteractive(main.chatPrompt.trim());
    } else {
      actions.startInteractive();
    }
  };

  return (
    <div className="chat-panel">
      {/* Claude Version Display - At the very top */}
      <ClaudeVersionDisplay
        version={claude.version}
        isAvailable={claude.isAvailable}
        error={claude.error}
        isLoading={claude.loading}
      />

      {/* Root Path */}
      <PathSelector
        rootPath={main.rootPath}
        onUpdateRootPath={actions.updateRootPath}
        disabled={disabled}
      />

      <Card title="Interactive Chat Session">
        <div className="space-y-3">
          <div className="chat-info">
            <p>
              Start an interactive Claude chat session in the VS Code terminal
              using the selected model and configuration.
            </p>
          </div>

          {/* Model Selection */}
          <ModelSelector
            model={main.model}
            onUpdateModel={actions.updateModel}
            disabled={disabled}
          />

          {/* Tool Permissions */}
          <Toggle
            checked={main.allowAllTools}
            onChange={actions.updateAllowAllTools}
            label="Allow All Tools (--dangerously-skip-permissions)"
            disabled={disabled}
          />

          <div className="chat-actions">
            <div className="prompt-section">
              {!main.showChatPrompt ? (
                <div className="button-group">
                  <Button
                    variant="secondary"
                    onClick={() => actions.updateShowChatPrompt(true)}
                    disabled={disabled}
                  >
                    Add Prompt
                  </Button>
                </div>
              ) : (
                <>
                  <div className="button-group">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        actions.updateShowChatPrompt(false);
                        actions.updateChatPrompt("");
                      }}
                      disabled={disabled}
                    >
                      Remove Prompt
                    </Button>
                  </div>
                  <textarea
                    className="prompt-textarea"
                    value={main.chatPrompt}
                    onChange={(e) => actions.updateChatPrompt(e.target.value)}
                    placeholder="Enter your initial prompt for Claude..."
                    rows={10}
                    disabled={disabled}
                  />
                </>
              )}
            </div>

            <div className="button-group">
              <Button
                variant="primary"
                onClick={handleStartChat}
                disabled={disabled}
              >
                Start Chat Session
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default React.memo(ChatPanel);
