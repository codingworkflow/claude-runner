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
import { MessageRouter } from "../components/webview";
import {
  setupWebviewHtml,
  createWebviewCompatibleView,
} from "../utils/webviewHelpers";
import { handleUnexpectedError } from "../utils/errorHandlers";
import {
  createDataHandler,
  createErrorHandler,
} from "../utils/responseHandlers";

interface CommandFile {
  name: string;
  path: string;
  description: string;
  isProject: boolean;
}

export class ClaudeRunnerPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-runner.mainView";
  private _view?: vscode.WebviewView;
  public readonly controller: RunnerController;
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
      onUsageReportData: createDataHandler(
        "usageReport",
        this.postMessage.bind(this),
      ),
      onUsageReportError: createErrorHandler(
        "usageReport",
        this.postMessage.bind(this),
      ),
      onLogProjectsData: createDataHandler(
        "logProjects",
        this.postMessage.bind(this),
      ),
      onLogProjectsError: createErrorHandler(
        "logProjects",
        this.postMessage.bind(this),
      ),
      onLogConversationsData: createDataHandler(
        "logConversations",
        this.postMessage.bind(this),
      ),
      onLogConversationsError: createErrorHandler(
        "logConversations",
        this.postMessage.bind(this),
      ),
      onLogConversationData: createDataHandler(
        "logConversation",
        this.postMessage.bind(this),
      ),
      onLogConversationError: createErrorHandler(
        "logConversation",
        this.postMessage.bind(this),
      ),
      onCommandScanResult: (data) => this.handleCommandScanResult(data),
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
    this.setupWebview(webviewView);
  }

  public resolveWebviewPanel(webviewPanel: vscode.WebviewPanel) {
    const webviewView = createWebviewCompatibleView(webviewPanel);
    this.setupWebview(webviewView);
  }

  private setupWebview(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    setupWebviewHtml({
      webview: webviewView.webview,
      extensionUri: this.context.extensionUri,
      viewType: "main",
    });

    this.setupMessageHandling(webviewView.webview);
    this.subscribeToStateChanges();
  }

  private setupMessageHandling(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(
      async (message) => {
        try {
          const messageRouter = new MessageRouter();
          const command = messageRouter.fromLegacyMessage(message);
          this.controller.send(command);
        } catch (error) {
          handleUnexpectedError(error, {
            source: "ClaudeRunner",
            postMessage: this.postMessage.bind(this),
          });
        }
      },
      undefined,
      this.context.subscriptions,
    );
  }

  private subscribeToStateChanges(): void {
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

  private handleCommandScanResult(data: {
    globalCommands: CommandFile[];
    projectCommands: CommandFile[];
  }): void {
    this.postMessage({
      type: "commandScanResult",
      globalCommands: data.globalCommands,
      projectCommands: data.projectCommands,
    });
  }

  public toggleAdvancedTabs(): void {
    this.controller.toggleAdvancedTabs();
  }

  public getCurrentRootPath(): string {
    return this.controller.getCurrentState().rootPath;
  }

  public subscribeToRootPathChanges(
    callback: (newPath: string) => void,
  ): vscode.Disposable {
    // Subscribe to controller state changes and filter for rootPath changes
    let lastRootPath = this.controller.getCurrentState().rootPath;

    const subscription = this.controller.state$.subscribe((newState) => {
      if (newState.rootPath !== lastRootPath) {
        lastRootPath = newState.rootPath;
        callback(newState.rootPath);
      }
    });

    return {
      dispose: () => subscription.unsubscribe(),
    };
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
