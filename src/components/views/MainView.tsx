import React, { useState, useEffect, useRef } from "react";
import ChatPanel from "../panels/ChatPanel";
import PipelinePanel from "../panels/PipelinePanel";
import ShellSelector from "../common/ShellSelector";
import TabNavigation, { Tab } from "../common/TabNavigation";
import { useExtension } from "../../contexts/ExtensionContext";

// Define tab type for this view
type MainTabId = "chat" | "pipeline";

const MainView: React.FC = () => {
  const { state, actions } = useExtension();
  const { main: mainState, claude } = state;

  // Local state for shell selection when Claude is not installed
  const [selectedShell, setSelectedShell] = useState<
    "auto" | "bash" | "zsh" | "fish" | "sh"
  >("auto");
  const [recheckState, setRecheckState] = useState<
    "idle" | "checking" | "success" | "error"
  >("idle");
  const isRecheckingRef = useRef(false);

  // Define tabs for this view
  const mainTabs: Tab<MainTabId>[] = [
    { id: "chat", label: "Chat" },
    { id: "pipeline", label: "Pipeline" },
  ];

  // Watch for changes in claudeInstalled when rechecking
  useEffect(() => {
    if (isRecheckingRef.current) {
      if (claude.isInstalled) {
        setRecheckState("success");
        isRecheckingRef.current = false;
      } else {
        // Still checking or failed, update in a moment
        const timer = setTimeout(() => {
          if (isRecheckingRef.current) {
            setRecheckState("error");
            setTimeout(() => {
              setRecheckState("idle");
              isRecheckingRef.current = false;
            }, 2000);
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [claude.isInstalled, claude.loading]);

  const handleRecheckClaude = () => {
    setRecheckState("checking");
    isRecheckingRef.current = true;
    actions.recheckClaude(selectedShell);

    // Safety timeout - if nothing happens in 10 seconds, reset
    setTimeout(() => {
      if (isRecheckingRef.current && recheckState === "checking") {
        setRecheckState("error");
        setTimeout(() => {
          setRecheckState("idle");
          isRecheckingRef.current = false;
        }, 2000);
      }
    }, 10000);
  };

  // Show Claude installation message with shell selector if Claude is not installed
  if (!claude.isInstalled) {
    return (
      <div className="container">
        <div className="claude-not-installed">
          <h3>⚠️ Claude Code CLI Required</h3>
          <p>Please install Claude Code CLI to use this extension:</p>
          <div className="install-command">
            <code>npm install -g @anthropic-ai/claude-code</code>
          </div>
          <p>
            Setup instructions:{" "}
            <a href="https://docs.anthropic.com/en/docs/claude-code/setup">
              https://docs.anthropic.com/en/docs/claude-code/setup
            </a>
          </p>

          <div className="shell-selection-section">
            <h4>If Claude is installed but not detected:</h4>
            <p>Try selecting your shell type and rechecking:</p>
            <ShellSelector
              shell={selectedShell}
              onUpdateShell={setSelectedShell}
              disabled={false}
            />
          </div>

          <button
            className={`recheck-button recheck-${recheckState}`}
            onClick={handleRecheckClaude}
            disabled={recheckState === "checking"}
          >
            {recheckState === "checking" && "⏳ Checking..."}
            {recheckState === "success" && "✅ Found!"}
            {recheckState === "error" && "❌ Not Found"}
            {recheckState === "idle" && "🔄 Recheck Installation"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Tab Navigation */}
      <TabNavigation
        tabs={mainTabs}
        activeTab={mainState.activeTab}
        onTabChange={actions.updateActiveTab}
        disabled={
          mainState.status === "starting" || mainState.status === "stopping"
        }
      />

      {/* Tab Content */}
      <div className="tab-content">
        {mainState.activeTab === "chat" && (
          <ChatPanel
            disabled={
              mainState.status === "starting" || mainState.status === "stopping"
            }
          />
        )}

        {mainState.activeTab === "pipeline" && (
          <PipelinePanel
            disabled={
              mainState.status === "starting" || mainState.status === "stopping"
            }
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(MainView);
