import React, { useState } from "react";
import UsageReportPanel from "./panels/UsageReportPanel";
import LogsPanel from "./panels/LogsPanel";

const UsageLogsApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"usage" | "logs">("usage");

  return (
    <div className="usage-logs-app">
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === "usage" ? "active" : ""}`}
          onClick={() => setActiveTab("usage")}
        >
          Usage
        </button>
        <button
          className={`tab-button ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          Logs
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === "usage" && <UsageReportPanel disabled={false} />}
        {activeTab === "logs" && <LogsPanel disabled={false} />}
      </div>
    </div>
  );
};

export default UsageLogsApp;
