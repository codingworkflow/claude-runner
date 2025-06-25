import React, { useState, useEffect } from "react";
import Button from "../common/Button";
import { useExtension } from "../../contexts/ExtensionContext";
import { CommandFile } from "../../contexts/ExtensionContext";

interface CommandsPanelProps {
  disabled: boolean;
}

const CommandsPanel: React.FC<CommandsPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { commands } = state;
  const { activeTab, globalCommands, projectCommands, loading, rootPath } =
    commands;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommandName, setNewCommandName] = useState("");

  useEffect(() => {
    actions.scanCommands(rootPath);
  }, [rootPath]);

  const handleRefresh = () => {
    actions.scanCommands(rootPath);
  };

  const handleEdit = (command: CommandFile) => {
    actions.openFile(command.path);
  };

  const handleAddCommand = () => {
    if (!newCommandName.trim()) {
      return;
    }

    const isGlobal = activeTab === "global";
    actions.createCommand(newCommandName.trim(), isGlobal, rootPath);

    // Reset form
    setNewCommandName("");
    setShowAddForm(false);
  };

  const handleCancelAdd = () => {
    setNewCommandName("");
    setShowAddForm(false);
  };

  const handleDeleteCommand = (command: CommandFile) => {
    actions.deleteCommand(command.path);
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
          onClick={() => actions.updateCommandsState({ activeTab: "global" })}
          disabled={disabled}
        >
          Global
        </button>
        <button
          className={`tab-button ${activeTab === "project" ? "active" : ""}`}
          onClick={() => actions.updateCommandsState({ activeTab: "project" })}
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
