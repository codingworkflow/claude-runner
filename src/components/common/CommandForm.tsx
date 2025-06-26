import React from "react";
import Button from "./Button";

interface CommandFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const CommandForm: React.FC<CommandFormProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled = false,
  placeholder = "Enter command name",
}) => {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSubmit();
    }
  };

  return (
    <div className="add-command-form">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={disabled}
        autoFocus
      />
      <div className="form-actions">
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
        >
          Create
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default React.memo(CommandForm);
