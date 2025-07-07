import React, { useState, useRef, useEffect } from "react";
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { main, claude } = state;
  const [chatMode, setChatMode] = useState<"terminal" | "extension">(
    "extension",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleStartTerminalChat = () => {
    if (main.showChatPrompt && main.chatPrompt.trim()) {
      actions.startInteractive(main.chatPrompt.trim());
    } else {
      actions.startInteractive();
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || main.chatSending) {
      return;
    }

    const messageText = inputMessage.trim();
    const userMessage: ChatMessage = {
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    // Immediately add user message to local state for responsive UI
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");

    // Set chatSending to true to show the spinner
    actions.updateMainState({ chatSending: true });

    try {
      // Send to extension host - this will handle full conversation
      actions.sendChatMessage(
        messageText,
        (main.chatMessages?.length ?? 0) === 0,
      );
    } catch (error) {
      console.error("Error sending message:", error);
      // Reset chatSending on error
      actions.updateMainState({ chatSending: false });
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    actions.clearChatSession();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Sync with extension state - this receives the full conversation from the extension host
  useEffect(() => {
    if (main.chatMessages !== undefined) {
      setMessages(main.chatMessages);
    }
  }, [main.chatMessages]);

  return (
    <div className="chat-panel">
      <ClaudeVersionDisplay
        version={claude.version}
        isAvailable={claude.isAvailable}
        error={claude.error}
        isLoading={claude.loading}
      />

      <PathSelector
        rootPath={main.rootPath}
        onUpdateRootPath={actions.updateRootPath}
        disabled={disabled}
      />

      <Card title="Claude Chat">
        <div className="chat-mode-selector">
          <div className="button-group">
            <Button
              variant={chatMode === "extension" ? "primary" : "secondary"}
              onClick={() => setChatMode("extension")}
              disabled={disabled}
            >
              VSCode
            </Button>
            <Button
              variant={chatMode === "terminal" ? "primary" : "secondary"}
              onClick={() => setChatMode("terminal")}
              disabled={disabled}
            >
              Terminal
            </Button>
          </div>
        </div>

        {chatMode === "terminal" ? (
          <div className="space-y-3">
            <div className="chat-info">
              <p>
                Start an interactive Claude chat session in the VS Code terminal
                using the selected model and configuration.
              </p>
            </div>

            <ModelSelector
              model={main.model}
              onUpdateModel={actions.updateModel}
              disabled={disabled}
            />

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
                      Add Initial Prompt
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
                  onClick={handleStartTerminalChat}
                  disabled={disabled}
                >
                  Start Terminal Session
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="extension-chat">
            <ModelSelector
              model={main.model}
              onUpdateModel={actions.updateModel}
              disabled={disabled || main.chatSending}
            />

            <div className="chat-container">
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="chat-empty">
                    <p>Start a conversation with Claude...</p>
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`chat-message ${msg.role === "user" ? "user" : "assistant"}`}
                    >
                      <div className="message-header">
                        <span className="message-role">
                          {msg.role === "user" ? "👤 You" : "🤖 Claude"}
                        </span>
                        <span className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="message-content">{msg.content}</div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="chat-input-container">
              <textarea
                className="chat-input"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message... (Shift+Enter for new line)"
                disabled={disabled || main.chatSending}
                rows={3}
              />
              <div className="chat-controls">
                <div className="chat-controls-left">
                  <Button
                    variant="secondary"
                    onClick={handleClearChat}
                    disabled={
                      (disabled ?? false) ||
                      (main.chatSending ?? false) ||
                      messages.length === 0
                    }
                  >
                    Clear Chat
                  </Button>
                </div>
                <div className="chat-controls-right">
                  <Button
                    variant="primary"
                    onClick={handleSendMessage}
                    disabled={
                      (disabled ?? false) ||
                      (main.chatSending ?? false) ||
                      !inputMessage.trim()
                    }
                  >
                    {main.chatSending ? (
                      <>
                        <span className="loading-spinner" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default React.memo(ChatPanel);
