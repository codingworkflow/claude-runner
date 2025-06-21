// Claude Runner Webview Entry Point
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App, { initialState } from "../App";
import "../styles.css";

// Setup global VS Code API
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: Record<string, unknown>) => void;
    };
    vscodeApi: { postMessage: (message: Record<string, unknown>) => void };
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

// Initialize the app when DOM is ready
function initializeApp() {
  const container = document.getElementById("root");
  if (!container) {
    console.error("Root element not found");
    return;
  }

  // Create React root and render initial app
  reactRoot = ReactDOM.createRoot(container);
  reactRoot.render(React.createElement(App, initialState));

  // Handle messages from the extension
  window.addEventListener("message", (event) => {
    const message = event.data;

    // Only re-render the app for actual state updates, not component-specific messages
    if (
      message.command === "usageReportData" ||
      message.command === "usageReportError" ||
      message.command === "logProjectsData" ||
      message.command === "logProjectsError" ||
      message.command === "logConversationsData" ||
      message.command === "logConversationsError" ||
      message.command === "logConversationData" ||
      message.command === "logConversationError"
    ) {
      // These messages are handled by component-specific panels directly
      return;
    }

    // Update app with new props from extension
    if (reactRoot) {
      reactRoot.render(React.createElement(App, message));
    }
  });

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
