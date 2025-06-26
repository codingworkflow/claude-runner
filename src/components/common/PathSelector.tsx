import React from "react";
import Input from "./Input";
import Button from "./Button";

interface PathSelectorProps {
  rootPath: string;
  onUpdateRootPath: (path: string) => void;
  disabled?: boolean;
}

const PathSelector: React.FC<PathSelectorProps> = ({
  rootPath,
  onUpdateRootPath,
  disabled = false,
}) => {
  const handleBrowseFolder = () => {
    const vscode = (
      window as typeof window & {
        vscodeApi?: { postMessage: (message: Record<string, unknown>) => void };
      }
    ).vscodeApi;
    if (vscode) {
      vscode.postMessage({ command: "browseFolder" });
    }
  };

  return (
    <div className="path-selector">
      <div className="flex gap-2">
        <Input
          id="root-path"
          type="text"
          value={rootPath}
          onChange={(e) => onUpdateRootPath(e.target.value)}
          placeholder="Select working directory"
          fullWidth
          disabled={disabled}
        />
        <Button
          variant="secondary"
          onClick={handleBrowseFolder}
          disabled={disabled}
          className="browse-button"
        >
          Browse
        </Button>
      </div>
    </div>
  );
};

export default PathSelector;
