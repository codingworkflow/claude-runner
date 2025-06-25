// Claude Runner Webview Entry Point
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import MainView from "../views/MainView";
import CommandsView from "../views/CommandsView";
import UsageView from "../views/UsageView";
import { ExtensionProvider } from "../../contexts/ExtensionContext";
import "../../styles/main.css";

// Setup global VS Code API
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: Record<string, unknown>) => void;
    };
    vscodeApi: { postMessage: (message: Record<string, unknown>) => void };
    initialViewType?: "main" | "commands" | "usage";
    // Legacy functions for backwards compatibility
    renderUsageLogsApp?: () => void;
    renderCommandsApp?: () => void;
  }
}

// Store vscode API reference
if (
  typeof window.vscodeApi === "undefined" &&
  typeof window.acquireVsCodeApi === "function"
) {
  window.vscodeApi = window.acquireVsCodeApi();
}

let reactRoot: ReactDOM.Root | null = null;

// Initialize the specific view app when DOM is ready
function initializeApp() {
  const container = document.getElementById("root");
  if (!container) {
    console.error("Root element not found");
    return;
  }

  // Determine which view component to render based on initialViewType
  let ViewComponent: React.ComponentType;
  switch (window.initialViewType) {
    case "commands":
      ViewComponent = CommandsView;
      break;
    case "usage":
      ViewComponent = UsageView;
      break;
    case "main":
    default:
      ViewComponent = MainView;
      break;
  }

  // Create React root and render the specific view wrapped in context
  reactRoot = ReactDOM.createRoot(container);
  reactRoot.render(
    React.createElement(
      ExtensionProvider,
      null,
      React.createElement(ViewComponent),
    ),
  );

  // Request initial state from extension
  if (window.vscodeApi) {
    window.vscodeApi.postMessage({ command: "getInitialState" });
  }
}

// Set up error handling
window.addEventListener("error", (e) => {
  console.error("Webview error:", e.message, e.error?.stack);
  if (window.vscodeApi) {
    window.vscodeApi.postMessage({
      command: "webviewError",
      error: e.message + (e.error?.stack ? "\nStack: " + e.error.stack : ""),
    });
  }
});

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

// DEPRECATED: Legacy functions kept for backwards compatibility
// These are no longer used but maintained to prevent errors
window.renderUsageLogsApp = function () {
  console.warn("renderUsageLogsApp is deprecated. Use unified app instead.");
  initializeApp();
};

window.renderCommandsApp = function () {
  console.warn("renderCommandsApp is deprecated. Use unified app instead.");
  initializeApp();
};
