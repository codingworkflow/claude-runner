import React from "react";
import BaseCommandsPanel from "../common/BaseCommandsPanel";
import { CommandFile } from "../../contexts/ExtensionContext";

interface GlobalCommandsPanelProps {
  disabled: boolean;
  commands?: CommandFile[];
  loading?: boolean;
  onRefresh?: () => void;
  onOpenFile?: (path: string) => void;
  onCreateCommand?: (name: string) => void;
  onDeleteCommand?: (path: string) => void;
}

const GlobalCommandsPanel: React.FC<GlobalCommandsPanelProps> = (props) => {
  return (
    <BaseCommandsPanel
      {...props}
      isGlobal={true}
      panelClassName="global-commands-panel"
      emptyMessage="No global commands found"
      loadingMessage="Scanning for global commands..."
      additionalLoadingContent={
        <div className="scan-paths">
          <div>
            • Global: <code>~/.claude/commands/</code>
          </div>
        </div>
      }
    />
  );
};

export default React.memo(GlobalCommandsPanel);
