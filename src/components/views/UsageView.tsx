import React from "react";
import UsageReportPanel from "../panels/UsageReportPanel";
import LogsPanel from "../panels/LogsPanel";
import TabNavigation, { Tab } from "../common/TabNavigation";
import { useExtension } from "../../contexts/ExtensionContext";

// Define tab type for this view
type UsageTabId = "usage" | "logs";

const UsageView: React.FC = () => {
  const { state, actions } = useExtension();
  const { usage } = state;

  // Define tabs for this view
  const usageTabs: Tab<UsageTabId>[] = [
    { id: "usage", label: "Usage" },
    { id: "logs", label: "Logs" },
  ];

  const updateActiveTab = (tab: UsageTabId) => {
    actions.updateUsageState({ activeTab: tab });
  };

  return (
    <div className="usage-logs-app">
      <TabNavigation
        tabs={usageTabs}
        activeTab={usage.activeTab}
        onTabChange={updateActiveTab}
      />

      {/* Tab Content */}
      <div className="tab-content">
        {usage.activeTab === "usage" && <UsageReportPanel disabled={false} />}
        {usage.activeTab === "logs" && <LogsPanel disabled={false} />}
      </div>
    </div>
  );
};

export default UsageView;
