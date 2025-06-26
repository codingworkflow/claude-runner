import { useState } from "react";

interface UseCommandFormProps {
  onSubmit: (name: string) => void;
}

export const useCommandForm = ({ onSubmit }: UseCommandFormProps) => {
  const [showForm, setShowForm] = useState(false);
  const [commandName, setCommandName] = useState("");

  const handleSubmit = () => {
    if (!commandName.trim()) {
      return;
    }
    onSubmit(commandName.trim());
    setCommandName("");
    setShowForm(false);
  };

  const handleCancel = () => {
    setCommandName("");
    setShowForm(false);
  };

  const showAddForm = () => {
    setShowForm(true);
  };

  return {
    showForm,
    commandName,
    setCommandName,
    handleSubmit,
    handleCancel,
    showAddForm,
  };
};
