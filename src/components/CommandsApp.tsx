import React, { useState, useEffect } from "react";
import GlobalCommandsPanel from "./panels/GlobalCommandsPanel";
import ProjectCommandsPanel from "./panels/ProjectCommandsPanel";
import { useVSCodeAPI } from "./hooks/useVSCodeAPI";

interface CommandFile {
  name: string;
  path: string;
  description?: string;
  isProject: boolean;
}

const CommandsApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"global" | "project">("global");
  const [globalCommands, setGlobalCommands] = useState<CommandFile[]>([]);
  const [projectCommands, setProjectCommands] = useState<CommandFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [rootPath, setRootPath] = useState("");
  const vscode = useVSCodeAPI();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case "commandScanResult":
          setGlobalCommands(message.globalCommands || []);
          setProjectCommands(message.projectCommands || []);
          setLoading(false);
          break;
        case "setRootPath":
          setRootPath(message.rootPath || "");
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    vscode.scanCommands("");
  }, [vscode]);

  const handleScanCommands = () => {
    setLoading(true);
    vscode.scanCommands(rootPath);
  };

  const handleOpenFile = (path: string) => {
    vscode.openFile(path);
  };

  const handleCreateCommand = (name: string, isGlobal: boolean) => {
    vscode.createCommand(name, isGlobal, rootPath);
  };

  const handleDeleteCommand = (path: string) => {
    vscode.deleteCommand(path);
  };

  return (
    <div className="commands-app">
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === "global" ? "active" : ""}`}
          onClick={() => setActiveTab("global")}
        >
          Global
        </button>
        <button
          className={`tab-button ${activeTab === "project" ? "active" : ""}`}
          onClick={() => setActiveTab("project")}
        >
          Project
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "global" && (
          <GlobalCommandsPanel
            disabled={false}
            commands={globalCommands}
            loading={loading}
            onRefresh={handleScanCommands}
            onOpenFile={handleOpenFile}
            onCreateCommand={(name) => handleCreateCommand(name, true)}
            onDeleteCommand={handleDeleteCommand}
          />
        )}
        {activeTab === "project" && (
          <ProjectCommandsPanel
            disabled={false}
            commands={projectCommands}
            loading={loading}
            onRefresh={handleScanCommands}
            onOpenFile={handleOpenFile}
            onCreateCommand={(name) => handleCreateCommand(name, false)}
            onDeleteCommand={handleDeleteCommand}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(CommandsApp);
