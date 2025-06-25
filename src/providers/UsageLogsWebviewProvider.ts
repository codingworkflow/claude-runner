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
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, "dist"),
      ],
    };

    webviewView.webview.html = this._getUsageLogsHtml(webviewView.webview);

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

  private _getUsageLogsHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js"),
    );

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Usage & Logs</title>
      </head>
      <body>
        <div id="root"></div>
        <script>
          window.initialViewType = 'usage';
        </script>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
