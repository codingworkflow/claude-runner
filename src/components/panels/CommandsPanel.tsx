import React, { useState, useEffect } from "react";
import Button from "../common/Button";

interface CommandFile {
  name: string;
  path: string;
  description?: string;
  isProject: boolean;
}

interface CommandsPanelProps {
  rootPath: string;
  disabled: boolean;
}

const CommandsPanel: React.FC<CommandsPanelProps> = ({
  rootPath,
  disabled,
}) => {
  const [globalCommands, setGlobalCommands] = useState<CommandFile[]>([]);
  const [projectCommands, setProjectCommands] = useState<CommandFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"global" | "project">("global");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommandName, setNewCommandName] = useState("");

  const loadCommands = async () => {
    setLoading(true);
    try {
      // Send message to extension to scan for commands
      if (window.vscodeApi) {
        console.log(
          "CommandsPanel: Sending scanCommands message with rootPath:",
          rootPath,
        );
        window.vscodeApi.postMessage({
          command: "scanCommands",
          rootPath: rootPath,
        });
      } else {
        console.error("CommandsPanel: window.vscodeApi not available");
        setGlobalCommands([]);
        setProjectCommands([]);
        setLoading(false);
      }
    } catch (error) {
      console.error("Failed to scan commands:", error);
      // Fallback to empty arrays
      setGlobalCommands([]);
      setProjectCommands([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommands();

    // Listen for command scan results
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log("CommandsPanel: Received message:", message);
      if (message.type === "commandScanResult") {
        console.log("CommandsPanel: Processing commandScanResult message");
        console.log("CommandsPanel: Global commands:", message.globalCommands);
        console.log(
          "CommandsPanel: Project commands:",
          message.projectCommands,
        );
        setGlobalCommands(message.globalCommands || []);
        setProjectCommands(message.projectCommands || []);
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [rootPath]);

  const handleRefresh = () => {
    loadCommands();
  };

  const handleEdit = (command: CommandFile) => {
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({
        command: "openFile",
        path: command.path,
      });
    }
  };

  const handleAddCommand = () => {
    if (!newCommandName.trim()) {
      return;
    }

    const isGlobal = activeTab === "global";

    if (window.vscodeApi) {
      window.vscodeApi.postMessage({
        command: "createCommand",
        name: newCommandName.trim(),
        isGlobal: isGlobal,
        rootPath: rootPath,
      });
    }

    // Reset form
    setNewCommandName("");
    setShowAddForm(false);

    // Refresh commands list
    setTimeout(() => {
      loadCommands();
    }, 500);
  };

  const handleCancelAdd = () => {
    setNewCommandName("");
    setShowAddForm(false);
  };

  const handleDeleteCommand = (command: CommandFile) => {
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({
        command: "deleteCommand",
        path: command.path,
      });

      // Refresh commands list after a short delay to allow deletion to complete
      setTimeout(() => {
        loadCommands();
      }, 1000);
    }
  };

  if (loading) {
    return (
      <div className="commands-content">
        <div className="scanning-status">
          <p>Scanning for commands...</p>
          <div className="scan-paths">
            <div>
              • Global: <code>~/.claude/commands/</code>
            </div>
            <div>
              • Project: <code>{rootPath}/.claude/commands/</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentCommands =
    activeTab === "global" ? globalCommands : projectCommands;
  const canAdd =
    activeTab === "global" || (activeTab === "project" && rootPath);

  return (
    <div className="commands-content">
      {/* Tab Navigation */}
      <div className="commands-tabs">
        <button
          className={`tab-button ${activeTab === "global" ? "active" : ""}`}
          onClick={() => setActiveTab("global")}
          disabled={disabled}
        >
          Global
        </button>
        <button
          className={`tab-button ${activeTab === "project" ? "active" : ""}`}
          onClick={() => setActiveTab("project")}
          disabled={disabled}
        >
          Project
        </button>
        <div className="tab-actions">
          {canAdd && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddForm(true)}
              disabled={disabled}
            >
              Add
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={disabled}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Add Command Form */}
      {showAddForm && (
        <div className="add-command-form">
          <input
            type="text"
            placeholder="Enter command name"
            value={newCommandName}
            onChange={(e) => setNewCommandName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddCommand()}
            disabled={disabled}
            autoFocus
          />
          <div className="form-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddCommand}
              disabled={disabled || !newCommandName.trim()}
            >
              Create
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancelAdd}
              disabled={disabled}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Commands List */}
      <div className="command-list-container">
        {activeTab === "project" && !rootPath ? (
          <div className="no-workspace">No workspace selected</div>
        ) : currentCommands.length > 0 ? (
          <div className="command-list">
            {currentCommands.map((cmd) => (
              <div key={cmd.name} className="command-item">
                <div className="command-info">
                  <span className="command-name">{cmd.name}</span>
                  {cmd.description && (
                    <span className="command-description">
                      {cmd.description}
                    </span>
                  )}
                </div>
                <div className="command-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(cmd)}
                    disabled={disabled}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeleteCommand(cmd)}
                    disabled={disabled}
                    title="Delete command"
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-commands">No {activeTab} commands found</div>
        )}
      </div>
    </div>
  );
};

export default CommandsPanel;
