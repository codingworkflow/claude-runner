import React, { useState, useEffect } from "react";
import Button from "../common/Button";

interface CommandFile {
  name: string;
  path: string;
  description?: string;
  isProject: boolean;
}

interface ProjectCommandsPanelProps {
  disabled: boolean;
}

const ProjectCommandsPanel: React.FC<ProjectCommandsPanelProps> = ({
  disabled,
}) => {
  const [projectCommands, setProjectCommands] = useState<CommandFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommandName, setNewCommandName] = useState("");
  const [rootPath, setRootPath] = useState("");

  const loadCommands = async () => {
    setLoading(true);
    try {
      // Send message to extension to scan for commands
      if (window.vscodeApi) {
        window.vscodeApi.postMessage({
          type: "scanCommands",
          rootPath: rootPath,
        });
      } else {
        console.error("ProjectCommandsPanel: window.vscodeApi not available");
        setProjectCommands([]);
        setLoading(false);
      }
    } catch (error) {
      console.error("Failed to scan project commands:", error);
      setProjectCommands([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommands();

    // Listen for command scan results and root path updates
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "commandScanResult") {
        setProjectCommands(message.projectCommands || []);
        setLoading(false);
      } else if (message.type === "setRootPath") {
        setRootPath(message.rootPath || "");
        // Reload commands when root path changes
        if (message.rootPath) {
          setTimeout(() => {
            loadCommands();
          }, 100);
        }
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
        isGlobal: false,
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
      <div className="project-commands-panel">
        <div className="scanning-status">
          <p>Scanning for project commands...</p>
          <div className="scan-paths">
            <div>
              • Project:{" "}
              <code>{rootPath || "No workspace"}/.claude/commands/</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canAdd = !!rootPath;

  return (
    <div className="project-commands-panel">
      {/* Panel Header */}
      <div className="panel-header">
        <h3>Project Commands</h3>
        <div className="panel-actions">
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
        {!rootPath ? (
          <div className="no-workspace">No workspace selected</div>
        ) : projectCommands.length > 0 ? (
          <div className="command-list">
            {projectCommands.map((cmd) => (
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
          <div className="no-commands">No project commands found</div>
        )}
      </div>
    </div>
  );
};

export default ProjectCommandsPanel;
