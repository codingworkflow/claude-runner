import React from "react";

export interface Tab<T extends string> {
  id: T;
  label: string;
}

interface TabNavigationProps<T extends string> {
  tabs: Tab<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  disabled?: boolean;
}

function TabNavigation<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  disabled = false,
}: TabNavigationProps<T>) {
  return (
    <div className="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? "active" : ""} ${
            disabled ? "disabled" : ""
          }`}
          onClick={() => !disabled && onTabChange(tab.id)}
          disabled={disabled}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default TabNavigation;
