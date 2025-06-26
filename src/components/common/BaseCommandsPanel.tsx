import React from "react";
import Button from "./Button";
import CommandForm from "./CommandForm";
import CommandList from "./CommandList";
import { useExtension, CommandFile } from "../../contexts/ExtensionContext";
import { useCommandForm } from "../../hooks/useCommandForm";

interface BaseCommandsPanelProps {
  disabled: boolean;
  commands?: CommandFile[];
  loading?: boolean;
  onRefresh?: () => void;
  onOpenFile?: (path: string) => void;
  onCreateCommand?: (name: string) => void;
  onDeleteCommand?: (path: string) => void;
  isGlobal: boolean;
  panelClassName: string;
  emptyMessage: string;
  loadingMessage: string;
  additionalLoadingContent?: React.ReactNode;
}

const BaseCommandsPanel: React.FC<BaseCommandsPanelProps> = ({
  disabled,
  commands: propCommands,
  loading: propLoading,
  onRefresh,
  onOpenFile,
  onCreateCommand,
  onDeleteCommand,
  isGlobal,
  panelClassName,
  emptyMessage,
  loadingMessage,
  additionalLoadingContent,
}) => {
  const { state, actions } = useExtension();
  const { commands: commandsState } = state;
  const {
    globalCommands,
    projectCommands,
    loading: stateLoading,
    rootPath,
  } = commandsState;

  // Use props if provided, otherwise fallback to state
  const commands =
    propCommands ?? (isGlobal ? globalCommands : projectCommands);
  const loading = propLoading ?? stateLoading;

  const commandForm = useCommandForm({
    onSubmit: (name) => {
      if (onCreateCommand) {
        onCreateCommand(name);
      } else {
        actions.createCommand(name, isGlobal, rootPath);
      }
    },
  });

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

  const handleDeleteCommand = (command: CommandFile) => {
    if (onDeleteCommand) {
      onDeleteCommand(command.path);
    } else {
      actions.deleteCommand(command.path);
    }
  };

  if (loading) {
    return (
      <div className={panelClassName}>
        <div className="scanning-status">
          <p>{loadingMessage}</p>
          {additionalLoadingContent}
        </div>
      </div>
    );
  }

  return (
    <div className={panelClassName}>
      <div className="panel-actions">
        <Button
          variant="secondary"
          onClick={commandForm.showAddForm}
          disabled={disabled}
        >
          Add
        </Button>
        <Button variant="secondary" onClick={handleRefresh} disabled={disabled}>
          Refresh
        </Button>
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
        <CommandList
          commands={commands}
          onEdit={handleEdit}
          onDelete={handleDeleteCommand}
          disabled={disabled}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
};

export default React.memo(BaseCommandsPanel);
