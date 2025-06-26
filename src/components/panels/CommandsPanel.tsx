import React, { useEffect } from "react";
import Button from "../common/Button";
import CommandForm from "../common/CommandForm";
import CommandList from "../common/CommandList";
import { useExtension, CommandFile } from "../../contexts/ExtensionContext";
import { useCommandForm } from "../../hooks/useCommandForm";

interface CommandsPanelProps {
  disabled: boolean;
}

const CommandsPanel: React.FC<CommandsPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { commands } = state;
  const { activeTab, globalCommands, projectCommands, loading, rootPath } =
    commands;

  const commandForm = useCommandForm({
    onSubmit: (name) => {
      const isGlobal = activeTab === "global";
      actions.createCommand(name, isGlobal, rootPath);
    },
  });

  useEffect(() => {
    actions.scanCommands(rootPath);
  }, [rootPath]);

  const handleRefresh = () => {
    actions.scanCommands(rootPath);
  };

  const handleEdit = (command: CommandFile) => {
    actions.openFile(command.path);
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
              onClick={commandForm.showAddForm}
              disabled={disabled}
            >
              Add
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={disabled}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Add Command Form */}
      {commandForm.showForm && (
        <CommandForm
          value={commandForm.commandName}
          onChange={commandForm.setCommandName}
          onSubmit={commandForm.handleSubmit}
          onCancel={commandForm.handleCancel}
          disabled={disabled}
          placeholder="Enter command name"
        />
      )}

      {/* Commands List */}
      <div className="command-list-container">
        {activeTab === "project" && !rootPath ? (
          <div className="no-workspace">No workspace selected</div>
        ) : (
          <CommandList
            commands={currentCommands}
            onEdit={handleEdit}
            onDelete={handleDeleteCommand}
            disabled={disabled}
            emptyMessage={`No ${activeTab} commands found`}
          />
        )}
      </div>
    </div>
  );
};

export default CommandsPanel;
