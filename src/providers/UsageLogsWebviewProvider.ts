import * as vscode from "vscode";
import { UsageReportService } from "../services/UsageReportService";
import { LogsService } from "../services/LogsService";

export class UsageLogsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-runner.usageLogsView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _usageReportService: UsageReportService,
    private readonly _logsService: LogsService,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case "requestUsageReport":
          this.handleUsageReportRequest(
            data.period,
            data.hours,
            data.startHour,
          );
          break;
        case "requestLogProjects":
          this.handleLogProjectsRequest();
          break;
        case "requestLogConversations":
          this.handleLogConversationsRequest(data.projectName);
          break;
        case "requestLogConversation":
          this.handleLogConversationRequest(data.filePath);
          break;
      }
    });
  }

  public refreshUsageReport() {
    if (this._view) {
      this._view.webview.postMessage({
        command: "refreshUsageReport",
      });
    }
  }

  public refreshLogs() {
    if (this._view) {
      this._view.webview.postMessage({
        command: "refreshLogs",
      });
    }
  }

  private async handleUsageReportRequest(
    period: "today" | "week" | "month" | "hourly",
    hours?: number,
    startHour?: number,
  ) {
    try {
      const data = await this._usageReportService.generateReport(
        period,
        hours,
        startHour,
      );
      this._view?.webview.postMessage({
        command: "usageReportData",
        data,
      });
    } catch (error) {
      this._view?.webview.postMessage({
        command: "usageReportError",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleLogProjectsRequest() {
    try {
      const data = await this._logsService.listProjects();
      this._view?.webview.postMessage({
        command: "logProjectsData",
        data,
      });
    } catch (error) {
      this._view?.webview.postMessage({
        command: "logProjectsError",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleLogConversationsRequest(projectName: string) {
    try {
      const data = await this._logsService.listConversations(projectName);
      this._view?.webview.postMessage({
        command: "logConversationsData",
        data,
      });
    } catch (error) {
      this._view?.webview.postMessage({
        command: "logConversationsError",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleLogConversationRequest(filePath: string) {
    try {
      const data = await this._logsService.loadConversation(filePath);
      this._view?.webview.postMessage({
        command: "logConversationData",
        data,
      });
    } catch (error) {
      this._view?.webview.postMessage({
        command: "logConversationError",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptPathOnDisk = vscode.Uri.joinPath(
      this._extensionUri,
      "dist",
      "webview.js",
    );
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Usage & Logs</title>
        <style>
          /* Base styles for Usage & Logs panel */
          * {
            box-sizing: border-box;
          }

          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px 15px;
            line-height: 1.4;
          }

          /* Usage & Logs App Container */
          .usage-logs-app {
            width: 100%;
          }

          /* Tab Navigation */
          .tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
          }

          .tab-button {
            padding: 8px 16px;
            background: transparent;
            color: var(--vscode-foreground);
            border: none;
            border-bottom: 2px solid transparent;
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: 500;
          }

          .tab-button:hover {
            background-color: var(--vscode-list-hoverBackground);
          }

          .tab-button.active {
            color: var(--vscode-button-foreground);
            border-bottom-color: var(--vscode-button-background);
            background-color: var(--vscode-input-background);
          }

          .tab-button:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
          }

          .tab-content {
            margin-top: 20px;
          }

          /* Usage Report Panel Styles */
          .usage-report-panel {
            width: 100%;
          }

          .usage-report-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }

          .period-selector {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .hourly-options {
            margin-top: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          /* Dropdowns */
          .dropdown {
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            border-radius: 2px;
            font-size: var(--vscode-font-size);
          }

          /* Buttons */
          .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
          }

          .button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }

          .button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          /* State Messages */
          .state-message {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
          }

          .state-message.loading {
            font-style: italic;
          }

          .state-message.error {
            color: var(--vscode-errorForeground);
          }

          /* Usage Report Tables */
          .usage-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
          }

          .usage-table th,
          .usage-table td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-widget-border);
          }

          .usage-table th {
            background-color: var(--vscode-list-hoverBackground);
            font-weight: 600;
            color: var(--vscode-foreground);
          }

          .usage-table td {
            color: var(--vscode-foreground);
          }

          /* Logs Panel Styles */
          .logs-panel {
            width: 100%;
          }

          .logs-section {
            margin-bottom: 20px;
          }

          .logs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }

          .project-list,
          .conversation-list {
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
          }

          .list-item {
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-widget-border);
          }

          .list-item:hover {
            background-color: var(--vscode-list-hoverBackground);
          }

          .list-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
          }

          .conversation-content {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            padding: 12px;
            max-height: 400px;
            overflow-y: auto;
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
          }

          /* Typography */
          h3 {
            font-size: 1.1em;
            font-weight: 600;
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
          }

          h4 {
            font-size: 1em;
            font-weight: 600;
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
          }

          p {
            margin: 8px 0;
          }

          /* Labels */
          label {
            display: block;
            margin-bottom: 4px;
            font-weight: 500;
            color: var(--vscode-foreground);
          }

          /* Inputs */
          input[type="number"] {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 2px;
            font-size: var(--vscode-font-size);
            width: 80px;
          }

          input[type="number"]:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
        <script nonce="${nonce}">
          // Initialize the Usage & Logs React app using existing pattern
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
              if (window.renderUsageLogsApp) {
                window.renderUsageLogsApp();
              }
            });
          } else {
            if (window.renderUsageLogsApp) {
              window.renderUsageLogsApp();
            }
          }
        </script>
      </body>
      </html>`;
  }

  private getNonce() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
