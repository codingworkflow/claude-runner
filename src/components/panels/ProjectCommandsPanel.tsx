import React from "react";
import BaseCommandsPanel from "../common/BaseCommandsPanel";
import { CommandFile } from "../../contexts/ExtensionContext";

interface ProjectCommandsPanelProps {
  disabled: boolean;
  commands?: CommandFile[];
  loading?: boolean;
  onRefresh?: () => void;
  onOpenFile?: (path: string) => void;
  onCreateCommand?: (name: string) => void;
  onDeleteCommand?: (path: string) => void;
}

const ProjectCommandsPanel: React.FC<ProjectCommandsPanelProps> = (props) => {
  return (
    <BaseCommandsPanel
      {...props}
      isGlobal={false}
      panelClassName="project-commands-panel"
      emptyMessage="No project commands found"
      loadingMessage="Scanning for project commands..."
    />
  );
};

export default React.memo(ProjectCommandsPanel);
