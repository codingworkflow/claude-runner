import React, { useEffect } from "react";
import {
  useExtension,
  TranscriptEntry,
  ContentItem,
} from "../../contexts/ExtensionContext";

interface LogsPanelProps {
  disabled?: boolean;
}

const LogsPanel: React.FC<LogsPanelProps> = ({ disabled = false }) => {
  const { state, actions } = useExtension();
  const { usage } = state;
  const {
    projects,
    selectedProject,
    conversations,
    selectedConversation,
    conversationData,
    projectsLoading,
    conversationsLoading,
    conversationLoading,
    projectsError,
    conversationsError,
    conversationError,
  } = usage;

  // Load projects on component mount
  useEffect(() => {
    actions.requestLogProjects();
  }, []);

  // Load conversations when project changes
  useEffect(() => {
    if (selectedProject) {
      actions.requestLogConversations(selectedProject);
    } else {
      actions.updateUsageState({
        conversations: [],
        selectedConversation: "",
        conversationData: null,
      });
    }
  }, [selectedProject]);

  // Load conversation when selection changes
  useEffect(() => {
    if (selectedConversation) {
      const conversation = conversations.find(
        (c) => c.id === selectedConversation,
      );
      if (conversation) {
        actions.requestLogConversation(conversation.filePath);
      }
    } else {
      actions.updateUsageState({ conversationData: null });
    }
  }, [selectedConversation, conversations]);

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const formatDate = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  const renderContentItem = (item: ContentItem): React.ReactNode => {
    switch (item.type) {
      case "text":
        return <div className="message-text">{item.text}</div>;
      case "tool_use":
        return (
          <div className="tool-use">
            <div className="tool-header">🔧 Tool: {item.name}</div>
            <div className="tool-input">
              <pre>{JSON.stringify(item.input, null, 2)}</pre>
            </div>
          </div>
        );
      case "tool_result":
        return (
          <div className={`tool-result ${item.is_error ? "error" : "success"}`}>
            <div className="tool-result-header">
              {item.is_error ? "❌" : "✅"} Tool Result
            </div>
            <div className="tool-result-content">
              {typeof item.content === "string"
                ? item.content
                : JSON.stringify(item.content, null, 2)}
            </div>
          </div>
        );
      case "thinking":
        return (
          <div className="thinking-content">
            <div className="thinking-header">💭 Thinking</div>
            <div className="thinking-text">{item.thinking}</div>
          </div>
        );
      default:
        return <div className="unknown-content">{JSON.stringify(item)}</div>;
    }
  };

  const renderMessage = (entry: TranscriptEntry): React.ReactNode => {
    if (entry.type === "summary") {
      return (
        <div className="summary-entry">
          <div className="summary-header">📝 Session Summary</div>
          <div className="summary-text">{entry.summary}</div>
        </div>
      );
    }

    if (!entry.message) {
      return null;
    }

    const { message } = entry;
    const isUser = message.role === "user";

    return (
      <div className={`message-entry ${isUser ? "user" : "assistant"}`}>
        <div className="message-header">
          <span className="message-role">
            {isUser ? "👤 User" : "🤖 Assistant"}
          </span>
          <span className="message-timestamp">
            {formatTimestamp(entry.timestamp)}
          </span>
          {message.model && (
            <span className="message-model">{message.model}</span>
          )}
          {message.usage && (
            <span className="message-usage">
              {message.usage.input_tokens}↑ {message.usage.output_tokens}↓
            </span>
          )}
        </div>
        <div className="message-content">
          {typeof message.content === "string" ? (
            <div className="message-text">{message.content}</div>
          ) : (
            message.content.map((item, index) => (
              <div key={index} className="content-item">
                {renderContentItem(item)}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="logs-panel">
      <div className="logs-content">
        {/* Show conversation details when a conversation is selected */}
        {selectedConversation ? (
          <div className="conversation-view">
            <div className="conversation-header-bar">
              <button
                onClick={() =>
                  actions.updateUsageState({ selectedConversation: "" })
                }
                className="button secondary back-button"
              >
                ← Back to Conversations
              </button>
              <h4>Conversation Details</h4>
            </div>

            {conversationError && (
              <div className="error-message">Error: {conversationError}</div>
            )}

            {conversationLoading ? (
              <div className="state-message loading">
                Loading conversation...
              </div>
            ) : conversationData ? (
              <div className="conversation-content">
                <div className="conversation-info">
                  <div className="info-row">
                    <span className="info-label">Session ID:</span>
                    <span className="info-value">
                      {conversationData.info.sessionId}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Duration:</span>
                    <span className="info-value">
                      {formatTimestamp(conversationData.info.firstTimestamp)} →{" "}
                      {formatTimestamp(conversationData.info.lastTimestamp)}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Messages:</span>
                    <span className="info-value">
                      {conversationData.info.messageCount}
                    </span>
                  </div>
                </div>

                <div className="conversation-messages">
                  {conversationData.entries.map((entry, index) => (
                    <div key={`${entry.uuid}-${index}`}>
                      {renderMessage(entry)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="state-message no-data">
                Failed to load conversation data.
              </div>
            )}
          </div>
        ) : (
          /* Show project selection and conversation list when no conversation is selected */
          <div className="conversation-list-view">
            {/* Project Selection */}
            <div className="project-selection">
              {projectsError && (
                <div className="error-message">Error: {projectsError}</div>
              )}

              <select
                value={selectedProject}
                onChange={(e) =>
                  actions.updateUsageState({ selectedProject: e.target.value })
                }
                disabled={disabled || projectsLoading}
                className="dropdown full-width"
              >
                <option value="">
                  {projectsLoading
                    ? "Loading projects..."
                    : "Select a project..."}
                </option>
                {projects.map((project) => (
                  <option key={project.name} value={project.name}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Conversation List - Full height, no scroll box */}
            {selectedProject && (
              <div className="conversations-section">
                <div className="section-header">
                  <h4>Conversations</h4>
                </div>

                {conversationsError && (
                  <div className="error-message">
                    Error: {conversationsError}
                  </div>
                )}

                {conversationsLoading ? (
                  <div className="state-message loading">
                    Loading conversations...
                  </div>
                ) : conversations.length > 0 ? (
                  <div className="conversation-list-full">
                    {conversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className="conversation-item"
                        onClick={() =>
                          actions.updateUsageState({
                            selectedConversation: conversation.id,
                          })
                        }
                      >
                        <div className="conversation-header">
                          <span className="conversation-date">
                            {formatDate(conversation.firstTimestamp)}
                          </span>
                          <span className="conversation-messages">
                            {conversation.messageCount} messages
                          </span>
                        </div>
                        <div className="conversation-time">
                          {formatTimestamp(conversation.firstTimestamp)}
                        </div>
                        {conversation.summary && (
                          <div className="conversation-summary">
                            {conversation.summary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="state-message no-data">
                    No conversations found in this project.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(LogsPanel);
