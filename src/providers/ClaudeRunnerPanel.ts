import * as vscode from "vscode";
import { Subscription } from "rxjs";
import { RunnerController } from "../controllers/RunnerController";
import { UIState, WebviewMessage } from "../types/runner";
import { ClaudeCodeService } from "../services/ClaudeCodeService";
import { TerminalService } from "../services/TerminalService";
import { ConfigurationService } from "../services/ConfigurationService";
import { PipelineService } from "../services/PipelineService";
import { UsageReportService } from "../services/UsageReportService";
import { ClaudeVersionService } from "../services/ClaudeVersionService";
import { LogsService } from "../services/LogsService";
import { MessageRouter, getWebviewHtml } from "../components/webview";

export class ClaudeRunnerPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-runner.mainView";
  private _view?: vscode.WebviewView;
  private readonly controller: RunnerController;
  private stateSubscription?: Subscription;
  private availablePipelines: string[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly claudeCodeService: ClaudeCodeService,
    private readonly terminalService: TerminalService,
    private readonly configService: ConfigurationService,
    private readonly isClaudeInstalled: boolean = true,
  ) {
    // Initialize services
    const pipelineService = new PipelineService(context);
    const usageReportService = new UsageReportService();
    const claudeVersionService = new ClaudeVersionService();
    const logsService = new LogsService();

    // Create controller with all dependencies
    this.controller = new RunnerController(
      context,
      claudeCodeService,
      terminalService,
      configService,
      pipelineService,
      usageReportService,
      claudeVersionService,
      logsService,
      this.availablePipelines,
    );

    // Set up callbacks for data that needs to be sent back to webview
    this.controller.setCallbacks({
      onUsageReportData: (data) => this.handleUsageReportResponse(data),
      onUsageReportError: (error) => this.handleUsageReportError(error),
      onLogProjectsData: (data) => this.handleLogProjectsResponse(data),
      onLogProjectsError: (error) => this.handleLogProjectsError(error),
      onLogConversationsData: (data) =>
        this.handleLogConversationsResponse(data),
      onLogConversationsError: (error) =>
        this.handleLogConversationsError(error),
      onLogConversationData: (data) => this.handleLogConversationResponse(data),
      onLogConversationError: (error) => this.handleLogConversationError(error),
    });

    // Load pipelines
    this.loadAvailablePipelines();
  }

  private async loadAvailablePipelines(): Promise<void> {
    // This will be handled by the controller
    this.availablePipelines = [];
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.context.extensionUri,
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
      ],
    };

    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.context.extensionUri,
    );

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        try {
          const command = MessageRouter.fromLegacyMessage(message);
          this.controller.send(command);
        } catch (error) {
          console.error("[ClaudeRunner] Unhandled message error:", error);
          // Send error to webview to prevent UI freezing
          this.postMessage({
            command: "error",
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
          });

          // Show notification to user
          vscode.window.showErrorMessage(
            `Claude Runner encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
      undefined,
      this.context.subscriptions,
    );

    // Subscribe to state changes
    this.stateSubscription = this.controller.state$.subscribe((state) => {
      this.updateWebview(state);
    });
  }

  public resolveWebviewPanel(webviewPanel: vscode.WebviewPanel) {
    // Create a minimal WebviewView-compatible object to reuse existing logic
    const webviewView = {
      webview: webviewPanel.webview,
      onDidChangeVisibility: webviewPanel.onDidChangeViewState,
      onDidDispose: webviewPanel.onDidDispose,
      visible: webviewPanel.visible,
      show: () => webviewPanel.reveal(),
      title: webviewPanel.title,
      viewType: "claude-runner-editor",
    } as unknown as vscode.WebviewView;

    // Set up the webview using existing logic
    this._view = webviewView;

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.context.extensionUri,
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
      ],
    };

    webviewPanel.webview.html = getWebviewHtml(
      webviewPanel.webview,
      this.context.extensionUri,
    );

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          const command = MessageRouter.fromLegacyMessage(message);
          this.controller.send(command);
        } catch (error) {
          console.error("[ClaudeRunner] Unhandled message error:", error);
          // Send error to webview to prevent UI freezing
          this.postMessage({
            command: "error",
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
          });

          // Show notification to user
          vscode.window.showErrorMessage(
            `Claude Runner encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
      undefined,
      this.context.subscriptions,
    );

    // Subscribe to state changes
    this.stateSubscription = this.controller.state$.subscribe((state) => {
      this.updateWebview(state);
    });
  }

  private updateWebview(state: UIState): void {
    if (this._view) {
      const isTaskRunning = this.controller.isTaskRunning();
      const message: WebviewMessage = {
        ...state,
        status: isTaskRunning ? "running" : "stopped",
        results: state.lastTaskResults,
        availablePipelines: this.availablePipelines,
        availableModels: this.controller.getAvailableModels(),
      };
      this.postMessage(message);
    }
  }

  private postMessage(message: Record<string, unknown>): void {
    this._view?.webview.postMessage(message);
  }

  // Special handler for usage reports that need to send data back to webview
  private handleUsageReportResponse(data: unknown): void {
    this.postMessage({
      command: "usageReportData",
      data: data,
    });
  }

  private handleUsageReportError(error: string): void {
    this.postMessage({
      command: "usageReportError",
      error: error,
    });
  }

  private handleLogProjectsResponse(data: unknown): void {
    this.postMessage({
      command: "logProjectsData",
      data: data,
    });
  }

  private handleLogProjectsError(error: string): void {
    this.postMessage({
      command: "logProjectsError",
      error: error,
    });
  }

  private handleLogConversationsResponse(data: unknown): void {
    this.postMessage({
      command: "logConversationsData",
      data: data,
    });
  }

  private handleLogConversationsError(error: string): void {
    this.postMessage({
      command: "logConversationsError",
      error: error,
    });
  }

  private handleLogConversationResponse(data: unknown): void {
    this.postMessage({
      command: "logConversationData",
      data: data,
    });
  }

  private handleLogConversationError(error: string): void {
    this.postMessage({
      command: "logConversationError",
      error: error,
    });
  }

  public toggleAdvancedTabs(): void {
    this.controller.toggleAdvancedTabs();
  }

  /**
   * Update Claude status from external source (e.g., extension async detection)
   */
  public updateClaudeStatus(isInstalled: boolean, version?: string): void {
    this.controller.updateClaudeStatus(isInstalled, version);
  }

  public dispose(): void {
    this.stateSubscription?.unsubscribe();
    this._view = undefined;
  }
}
