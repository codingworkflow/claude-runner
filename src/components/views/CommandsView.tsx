import React, { useEffect } from "react";
import GlobalCommandsPanel from "../panels/GlobalCommandsPanel";
import ProjectCommandsPanel from "../panels/ProjectCommandsPanel";
import TabNavigation, { Tab } from "../common/TabNavigation";
import Button from "../common/Button";
import { useExtension } from "../../contexts/ExtensionContext";

// Define tab type for this view
type CommandsTabId = "global" | "project";

const CommandsView: React.FC = () => {
  const { state, actions } = useExtension();
  const { commands } = state;

  // Define tabs for this view
  const commandsTabs: Tab<CommandsTabId>[] = [
    { id: "global", label: "Global" },
    { id: "project", label: "Project" },
  ];

  useEffect(() => {
    // Scan commands when view loads
    actions.scanCommands("");
  }, []); // Only run once on mount

  const handleScanCommands = () => {
    actions.updateCommandsState({ loading: true });
    actions.scanCommands(commands.rootPath);
  };

  const handleOpenFile = (path: string) => {
    actions.openFile(path);
  };

  const handleCreateCommand = (name: string, isGlobal: boolean) => {
    actions.createCommand(name, isGlobal, commands.rootPath);
  };

  const handleDeleteCommand = (path: string) => {
    actions.deleteCommand(path);
  };

  const updateActiveTab = (tab: CommandsTabId) => {
    actions.updateCommandsState({ activeTab: tab });
  };

  const handleOpenCommandDocs = () => {
    // Open the Claude Code slash commands documentation
    const vscode = (
      window as typeof window & {
        vscodeApi?: { postMessage: (message: Record<string, unknown>) => void };
      }
    ).vscodeApi;

    if (vscode) {
      vscode.postMessage({
        command: "openExternal",
        url: "https://docs.anthropic.com/en/docs/claude-code/slash-commands",
      });
    }
  };

  return (
    <div className="commands-app">
      <TabNavigation
        tabs={commandsTabs}
        activeTab={commands.activeTab}
        onTabChange={updateActiveTab}
      />

      <div className="tab-content">
        {commands.activeTab === "global" && (
          <GlobalCommandsPanel
            disabled={false}
            commands={commands.globalCommands}
            loading={commands.loading}
            onRefresh={handleScanCommands}
            onOpenFile={handleOpenFile}
            onCreateCommand={(name) => handleCreateCommand(name, true)}
            onDeleteCommand={handleDeleteCommand}
          />
        )}
        {commands.activeTab === "project" && (
          <ProjectCommandsPanel
            disabled={false}
            loading={commands.loading}
            onRefresh={handleScanCommands}
            onOpenFile={handleOpenFile}
            onCreateCommand={(name) => handleCreateCommand(name, false)}
            onDeleteCommand={handleDeleteCommand}
          />
        )}
      </div>

      <div className="bottom-actions">
        <Button
          variant="secondary"
          onClick={handleOpenCommandDocs}
          title="Open Claude Code slash commands documentation"
        >
          <span className="button-icon">🌐</span>
          Open Slash Commands Docs
        </Button>
      </div>
    </div>
  );
};

export default React.memo(CommandsView);
