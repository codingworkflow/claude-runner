import React, { useState, useEffect, useRef } from "react";
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";

interface ProjectInfo {
  name: string;
  path: string;
  conversationCount: number;
  lastModified: string;
}

interface ConversationInfo {
  id: string;
  sessionId: string;
  fileName: string;
  firstTimestamp: string;
  lastTimestamp: string;
  messageCount: number;
  summary?: string;
  filePath: string;
}

interface UsageInfo {
  input_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens: number;
  service_tier?: string;
}

interface ContentItem {
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

interface TranscriptEntry {
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

interface ConversationData {
  info: ConversationInfo;
  entries: TranscriptEntry[];
}

interface LogsPanelProps {
  disabled?: boolean;
}

const LogsPanel: React.FC<LogsPanelProps> = ({ disabled = false }) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>("");
  const [conversationData, setConversationData] =
    useState<ConversationData | null>(null);

  const [projectsLoading, setProjectsLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);

  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [conversationsError, setConversationsError] = useState<string | null>(
    null,
  );
  const [conversationError, setConversationError] = useState<string | null>(
    null,
  );

  const timeoutRef = useRef<number | null>(null);

  const {
    requestLogProjects,
    requestLogConversations,
    requestLogConversation,
  } = useVSCodeAPI();

  // Load projects on component mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load conversations when project changes
  useEffect(() => {
    if (selectedProject) {
      loadConversations(selectedProject);
    } else {
      setConversations([]);
      setSelectedConversation("");
      setConversationData(null);
    }
  }, [selectedProject]);

  // Load conversation when selection changes
  useEffect(() => {
    if (selectedConversation) {
      const conversation = conversations.find(
        (c) => c.id === selectedConversation,
      );
      if (conversation) {
        loadConversation(conversation.filePath);
      }
    } else {
      setConversationData(null);
    }
  }, [selectedConversation, conversations]);

  // Listen for responses from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.command === "logProjectsData") {
        clearTimeout();
        setProjectsLoading(false);
        setProjects(message.data || []);
        setProjectsError(null);
      } else if (message.command === "logProjectsError") {
        clearTimeout();
        setProjectsLoading(false);
        setProjectsError(message.error || "Failed to load projects");
        setProjects([]);
      } else if (message.command === "logConversationsData") {
        clearTimeout();
        setConversationsLoading(false);
        setConversations(message.data || []);
        setConversationsError(null);
      } else if (message.command === "logConversationsError") {
        clearTimeout();
        setConversationsLoading(false);
        setConversationsError(message.error || "Failed to load conversations");
        setConversations([]);
      } else if (message.command === "logConversationData") {
        clearTimeout();
        setConversationLoading(false);
        setConversationData(message.data);
        setConversationError(null);
      } else if (message.command === "logConversationError") {
        clearTimeout();
        setConversationLoading(false);
        setConversationError(message.error || "Failed to load conversation");
        setConversationData(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const clearTimeout = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const loadProjects = () => {
    setProjectsLoading(true);
    setProjectsError(null);
    clearTimeout();

    requestLogProjects();

    // Add timeout
    timeoutRef.current = window.setTimeout(() => {
      setProjectsLoading(false);
      setProjectsError("Request timed out. Please try again.");
    }, 30000);
  };

  const loadConversations = (projectName: string) => {
    setConversationsLoading(true);
    setConversationsError(null);
    setSelectedConversation("");
    setConversationData(null);
    clearTimeout();

    requestLogConversations(projectName);

    // Add timeout
    timeoutRef.current = window.setTimeout(() => {
      setConversationsLoading(false);
      setConversationsError("Request timed out. Please try again.");
    }, 30000);
  };

  const loadConversation = (filePath: string) => {
    setConversationLoading(true);
    setConversationError(null);
    clearTimeout();

    requestLogConversation(filePath);

    // Add timeout
    timeoutRef.current = window.setTimeout(() => {
      setConversationLoading(false);
      setConversationError("Request timed out. Please try again.");
    }, 30000);
  };

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
                onClick={() => setSelectedConversation("")}
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
            <div className="logs-section">
              {projectsError && (
                <div className="error-message">Error: {projectsError}</div>
              )}

              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
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
                    {project.name} ({project.conversationCount} conversations)
                  </option>
                ))}
              </select>
            </div>

            {/* Conversation List - Full height, no scroll box */}
            {selectedProject && (
              <div className="logs-section">
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
                        onClick={() => setSelectedConversation(conversation.id)}
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
