import React, { useState } from "react";
import Button from "../common/Button";

interface CommandFile {
  name: string;
  path: string;
  description?: string;
  isProject: boolean;
}

interface ProjectCommandsPanelProps {
  disabled: boolean;
  commands: CommandFile[];
  loading: boolean;
  onRefresh: () => void;
  onOpenFile: (path: string) => void;
  onCreateCommand: (name: string) => void;
  onDeleteCommand: (path: string) => void;
}

const ProjectCommandsPanel: React.FC<ProjectCommandsPanelProps> = ({
  disabled,
  commands,
  loading,
  onRefresh,
  onOpenFile,
  onCreateCommand,
  onDeleteCommand,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCommandName, setNewCommandName] = useState("");

  const handleEdit = (command: CommandFile) => {
    onOpenFile(command.path);
  };

  const handleAddCommand = () => {
    if (!newCommandName.trim()) {
      return;
    }

    onCreateCommand(newCommandName.trim());
    setNewCommandName("");
    setShowAddForm(false);
  };

  const handleCancelAdd = () => {
    setNewCommandName("");
    setShowAddForm(false);
  };

  const handleDeleteCommand = (command: CommandFile) => {
    onDeleteCommand(command.path);
  };

  if (loading) {
    return (
      <div className="project-commands-panel">
        <div className="scanning-status">
          <p>Scanning for project commands...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="project-commands-panel">
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
          onClick={onRefresh}
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
          <div className="no-commands">No project commands found</div>
        )}
      </div>
    </div>
  );
};

export default ProjectCommandsPanel;
