import React, { useState } from "react";
import GlobalCommandsPanel from "./panels/GlobalCommandsPanel";
import ProjectCommandsPanel from "./panels/ProjectCommandsPanel";

const CommandsApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"global" | "project">("global");

  return (
    <div className="commands-app">
      {/* Tab Navigation */}
      <div className="tabs">
        <button
          className={`tab-button ${activeTab === "global" ? "active" : ""}`}
          onClick={() => setActiveTab("global")}
        >
          🌐 Global
        </button>
        <button
          className={`tab-button ${activeTab === "project" ? "active" : ""}`}
          onClick={() => setActiveTab("project")}
        >
          📁 Project
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === "global" && <GlobalCommandsPanel disabled={false} />}
        {activeTab === "project" && <ProjectCommandsPanel disabled={false} />}
      </div>
    </div>
  );
};

export default CommandsApp;
