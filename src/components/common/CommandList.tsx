import React from "react";
import Button from "./Button";
import { CommandFile } from "../../contexts/ExtensionContext";

interface CommandListProps {
  commands: CommandFile[];
  onEdit: (command: CommandFile) => void;
  onDelete: (command: CommandFile) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

const CommandList: React.FC<CommandListProps> = ({
  commands,
  onEdit,
  onDelete,
  disabled = false,
  emptyMessage = "No commands found",
}) => {
  if (commands.length === 0) {
    return <div className="no-commands">{emptyMessage}</div>;
  }

  return (
    <div className="command-list">
      {commands.map((cmd) => (
        <div key={cmd.name} className="command-item">
          <div className="command-header">
            <span className="command-name">{cmd.name}</span>
            <div className="command-actions">
              <Button
                variant="secondary"
                onClick={() => onEdit(cmd)}
                disabled={disabled}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                onClick={() => onDelete(cmd)}
                disabled={disabled}
                title="Delete command"
              >
                🗑️
              </Button>
            </div>
          </div>
          {cmd.description && (
            <div className="command-description">{cmd.description}</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default React.memo(CommandList);
