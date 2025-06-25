import React, { useState, useEffect } from "react";
import Button from "../common/Button";

interface CommandFile {
  name: string;
  path: string;
  description?: string;
  isProject: boolean;
}

interface GlobalCommandsPanelProps {
  disabled: boolean;
}

const GlobalCommandsPanel: React.FC<GlobalCommandsPanelProps> = ({
  disabled,
}) => {
  const [globalCommands, setGlobalCommands] = useState<CommandFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommandName, setNewCommandName] = useState("");

  const loadCommands = async () => {
    setLoading(true);
    try {
      // Send message to extension to scan for commands
      if (window.vscodeApi) {
        window.vscodeApi.postMessage({
          type: "scanCommands",
          rootPath: "",
        });
      } else {
        console.error("GlobalCommandsPanel: window.vscodeApi not available");
        setGlobalCommands([]);
        setLoading(false);
      }
    } catch (error) {
      console.error("Failed to scan global commands:", error);
      setGlobalCommands([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommands();

    // Listen for command scan results
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "commandScanResult") {
        setGlobalCommands(message.globalCommands || []);
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleRefresh = () => {
    loadCommands();
  };

  const handleEdit = (command: CommandFile) => {
    if (window.vscodeApi) {
      window.vscodeApi.postMessage({
        type: "openFile",
        path: command.path,
      });
    }
  };

  const handleAddCommand = () => {
    if (!newCommandName.trim()) {
      return;
    }

    if (window.vscodeApi) {
      window.vscodeApi.postMessage({
        type: "createCommand",
        name: newCommandName.trim(),
        isGlobal: true,
        rootPath: "",
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
        type: "deleteCommand",
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
      <div className="global-commands-panel">
        <div className="scanning-status">
          <p>Scanning for global commands...</p>
          <div className="scan-paths">
            <div>
              • Global: <code>~/.claude/commands/</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="global-commands-panel">
      {/* Panel Header */}
      <div className="panel-header">
        <h3>Global Commands</h3>
        <div className="panel-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddForm(true)}
            disabled={disabled}
          >
            Add
          </Button>
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
        {globalCommands.length > 0 ? (
          <div className="command-list">
            {globalCommands.map((cmd) => (
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
          <div className="no-commands">No global commands found</div>
        )}
      </div>
    </div>
  );
};

export default GlobalCommandsPanel;
