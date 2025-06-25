import React, { useState } from "react";
import Button from "../common/Button";
import { useExtension, CommandFile } from "../../contexts/ExtensionContext";

interface GlobalCommandsPanelProps {
  disabled: boolean;
  commands?: CommandFile[];
  loading?: boolean;
  onRefresh?: () => void;
  onOpenFile?: (path: string) => void;
  onCreateCommand?: (name: string) => void;
  onDeleteCommand?: (path: string) => void;
}

const GlobalCommandsPanel: React.FC<GlobalCommandsPanelProps> = ({
  disabled,
  commands: propCommands,
  loading: propLoading,
  onRefresh,
  onOpenFile,
  onCreateCommand,
  onDeleteCommand,
}) => {
  const { state, actions } = useExtension();
  const { commands: commandsState } = state;
  const { globalCommands, loading: stateLoading, rootPath } = commandsState;

  // Use props if provided, otherwise fallback to state
  const commands = propCommands ?? globalCommands;
  const loading = propLoading ?? stateLoading;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommandName, setNewCommandName] = useState("");

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      actions.scanCommands(rootPath);
    }
  };

  const handleEdit = (command: CommandFile) => {
    if (onOpenFile) {
      onOpenFile(command.path);
    } else {
      actions.openFile(command.path);
    }
  };

  const handleAddCommand = () => {
    if (!newCommandName.trim()) {
      return;
    }

    if (onCreateCommand) {
      onCreateCommand(newCommandName.trim());
    } else {
      actions.createCommand(newCommandName.trim(), true, rootPath);
    }
    setNewCommandName("");
    setShowAddForm(false);
  };

  const handleCancelAdd = () => {
    setNewCommandName("");
    setShowAddForm(false);
  };

  const handleDeleteCommand = (command: CommandFile) => {
    if (onDeleteCommand) {
      onDeleteCommand(command.path);
    } else {
      actions.deleteCommand(command.path);
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
        {commands.length > 0 ? (
          <div className="command-list">
            {commands.map((cmd) => (
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

export default React.memo(GlobalCommandsPanel);
