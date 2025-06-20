import * as vscode from "vscode";
import { ClaudeCodeService, TaskItem } from "../services/ClaudeCodeService";
import { TerminalService } from "../services/TerminalService";
import { ConfigurationService } from "../services/ConfigurationService";
import { PipelineService } from "../services/PipelineService";
import { UsageReportService } from "../services/UsageReportService";
import { ClaudeVersionService } from "../services/ClaudeVersionService";
import { ClaudeDetectionService } from "../services/ClaudeDetectionService";
import { LogsService } from "../services/LogsService";
import { getModelIds } from "../models/ClaudeModels";
// ShellDetection removed - replaced with ClaudeDetectionService

export class ClaudeRunnerPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-runner.mainView";
  private _view?: vscode.WebviewView;
  private readonly pipelineService: PipelineService;
  private readonly usageReportService: UsageReportService;
  private readonly claudeVersionService: ClaudeVersionService;
  private readonly logsService: LogsService;
  private availablePipelines: string[] = [];

  // UI state - single source of truth for ALL UI state
  private readonly _uiState = {
    // Configuration that can be changed in UI
    model: "" as string,
    rootPath: "" as string,
    allowAllTools: false as boolean,
    parallelTasksCount: 1 as number, // Added to main state

    // Tab state - default to chat
    activeTab: "chat" as "chat" | "pipeline" | "usage" | "logs",
    showAdvancedTabs: false as boolean,

    // Pipeline state
    outputFormat: "json" as "text" | "json",
    tasks: [] as TaskItem[], // Always initialize with empty array
    currentTaskIndex: undefined as number | undefined,

    // Task execution state
    lastTaskResults: undefined as string | undefined,
    taskCompleted: false,
    taskError: false,

    // Chat state
    chatPrompt: "" as string,
    showChatPrompt: false as boolean,

    // Claude version state
    claudeVersion: "Checking..." as string,
    claudeVersionAvailable: false as boolean,
    claudeVersionError: undefined as string | undefined,
    claudeVersionLoading: true as boolean,

    // Claude installation state
    claudeInstalled: false as boolean,
  };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly claudeCodeService: ClaudeCodeService,
    private readonly terminalService: TerminalService,
    private readonly configService: ConfigurationService,
    private readonly isClaudeInstalled: boolean = true,
  ) {
    this.pipelineService = new PipelineService(context);
    this.usageReportService = new UsageReportService();
    this.claudeVersionService = new ClaudeVersionService();
    this.logsService = new LogsService();

    // Initialize UI state from configuration
    const config = this.configService.getConfiguration();
    this._uiState.model = config.defaultModel;
    this._uiState.rootPath =
      config.defaultRootPath ?? this._getCurrentWorkspacePath() ?? "";
    this._uiState.allowAllTools = config.allowAllTools;

    // Replace volatile _uiState.claudeInstalled logic with the persisted flag
    const cached = this.context.globalState.get<{
      isInstalled: boolean;
      version?: string;
      shell?: string;
      error?: string;
    }>("claude.detected");
    this._uiState.claudeInstalled = cached?.isInstalled ?? false;
    this._uiState.claudeVersionAvailable = cached?.isInstalled ?? false;
    this._uiState.claudeVersion = cached?.version ?? "Not Available";
    this._uiState.claudeVersionLoading = false;

    // Set the root path on PipelineService
    if (this._uiState.rootPath) {
      this.pipelineService.setRootPath(this._uiState.rootPath);
    }

    // Restore last active tab from workspace state (default to chat)
    const lastActiveTab =
      this.context.workspaceState.get<string>("lastActiveTab");
    // Fallback to chat if windows tab was previously selected (removed)
    this._uiState.activeTab =
      lastActiveTab === "windows"
        ? "chat"
        : ((lastActiveTab as "chat" | "pipeline" | "usage" | "logs") ?? "chat");

    // Load pipelines synchronously on initialization
    this._loadAvailablePipelines();

    // Initialize parallel tasks count from cached value
    this._uiState.parallelTasksCount =
      this.context.globalState.get<number>("claude.parallelTasks") ?? 1;

    // Claude detection already completed in extension init - no redundant checks

    // Listen for workspace changes
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await this._loadAvailablePipelines();
      this._updateWebview();
    });

    // Don't listen for config changes - UI state is the source of truth
  }

  // REMOVED: _initializeClaudeVersion - Claude detection now only done once in extension init

  private async _loadAvailablePipelines(): Promise<void> {
    this.availablePipelines = await this.pipelineService.listPipelines();
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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        try {
          await this._handleMessage(message);
        } catch (error) {
          console.error("[ClaudeRunner] Unhandled message error:", error);
          // Send error to webview to prevent UI freezing
          this._postMessage({
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

    // Send initial state immediately
    this._updateWebview();
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

    webviewPanel.webview.html = this._getHtmlForWebview(webviewPanel.webview);

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        try {
          await this._handleMessage(message);
        } catch (error) {
          console.error("[ClaudeRunner] Unhandled message error:", error);
          // Send error to webview to prevent UI freezing
          this._postMessage({
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

    // Send initial state immediately
    this._updateWebview();
  }

  private async _handleMessage(
    message: Record<string, unknown>,
  ): Promise<void> {
    switch (message.command) {
      case "getInitialState":
        this._updateWebview();
        break;
      case "startInteractive":
        await this._handleStartInteractive(
          message.prompt as string | undefined,
        );
        break;
      case "runTask":
        await this._handleRunTask(
          message.task as string,
          message.outputFormat as "text" | "json",
        );
        break;
      case "runTasks":
        await this._handleRunTasks(
          message.tasks as TaskItem[],
          message.outputFormat as "text" | "json",
        );
        break;
      case "cancelTask":
        await this._handleCancelTask();
        break;
      case "updateModel":
        await this._handleUpdateModel(message.model as string);
        break;
      case "updateRootPath":
        await this._handleUpdateRootPath(message.path as string);
        break;
      case "updateAllowAllTools":
        await this._handleUpdateAllowAllTools(message.allow as boolean);
        break;
      case "browseFolder":
        await this._handleBrowseFolder();
        break;
      case "updateActiveTab":
        this._handleUpdateActiveTab(
          message.tab as "chat" | "pipeline" | "usage" | "logs",
        );
        break;
      case "updateChatPrompt":
        this._handleUpdateChatPrompt(message.prompt as string);
        break;
      case "updateShowChatPrompt":
        this._handleUpdateShowChatPrompt(message.show as boolean);
        break;
      case "updateOutputFormat":
        this._handleUpdateOutputFormat(message.format as "text" | "json");
        break;
      case "savePipeline":
        await this._handleSavePipeline(
          message.name as string,
          message.description as string,
          message.tasks as TaskItem[],
        );
        break;
      case "loadPipeline":
        await this._handleLoadPipeline(message.name as string);
        break;
      case "pipelineAddTask":
        this._handlePipelineAddTask(message.newTask as TaskItem);
        break;
      case "pipelineRemoveTask":
        this._handlePipelineRemoveTask(message.taskId as string);
        break;
      case "pipelineUpdateTaskField":
        this._handlePipelineUpdateTaskField(
          message.taskId as string,
          message.field as keyof TaskItem,
          message.value as unknown,
        );
        break;
      case "webviewError":
        console.error("Webview error:", message.error);
        break;
      case "updateParallelTasksCount":
        await this._handleUpdateParallelTasksCount(message.value as number);
        break;
      case "requestUsageReport":
        await this._handleRequestUsageReport(
          message.period as "today" | "week" | "month",
        );
        break;
      case "requestLogProjects":
        await this._handleRequestLogProjects();
        break;
      case "requestLogConversations":
        await this._handleRequestLogConversations(
          message.projectName as string,
        );
        break;
      case "requestLogConversation":
        await this._handleRequestLogConversation(message.filePath as string);
        break;
      case "recheckClaude":
        await this._handleRecheckClaude(
          message.shell as "auto" | "bash" | "zsh" | "fish" | "sh" | undefined,
        );
        break;
      default:
        console.warn("Unknown command:", message.command);
    }
  }

  private async _handleRunTasks(
    tasks: TaskItem[],
    outputFormat: "text" | "json" = "json",
  ): Promise<void> {
    try {
      // Filter to only run pending tasks (tasks that haven't been completed or errored)
      const pendingTasks = tasks.filter((task) => task.status === "pending");

      if (pendingTasks.length === 0) {
        vscode.window.showInformationMessage(
          "No pending tasks to run. All tasks have been completed or errored.",
        );
        return;
      }

      // Clear previous task state and set running status
      this._uiState.taskCompleted = false;
      this._uiState.taskError = false;
      this._uiState.lastTaskResults = undefined;
      this._uiState.tasks = [...tasks];
      this._uiState.currentTaskIndex = undefined;

      this._postMessage({
        status: "running",
        taskCompleted: false,
        taskError: false,
        results: undefined,
        tasks: this._uiState.tasks,
        currentTaskIndex: this._uiState.currentTaskIndex,
      });

      await this.claudeCodeService.runTaskPipeline(
        pendingTasks,
        this._uiState.model,
        this._uiState.rootPath,
        {
          allowAllTools: true, // Pipelines always run in dangerous mode
          outputFormat: outputFormat,
        },
        // onProgress callback
        async (updatedTasks: TaskItem[], currentIndex: number) => {
          // Merge the updated pending tasks back into the full task list
          const taskMap = new Map(this._uiState.tasks.map((t) => [t.id, t]));
          updatedTasks.forEach((task) => {
            taskMap.set(task.id, task);
          });
          this._uiState.tasks = Array.from(taskMap.values());

          // Find the actual index in the full task list
          const runningTask = updatedTasks[currentIndex];
          this._uiState.currentTaskIndex = this._uiState.tasks.findIndex(
            (t) => t.id === runningTask?.id,
          );

          this._postMessage({
            status: "running",
            tasks: this._uiState.tasks,
            currentTaskIndex: this._uiState.currentTaskIndex,
          });
        },
        // onComplete callback
        async (completedTasks: TaskItem[]) => {
          // Merge the completed pending tasks back into the full task list
          const taskMap = new Map(this._uiState.tasks.map((t) => [t.id, t]));
          completedTasks.forEach((task) => {
            taskMap.set(task.id, task);
          });
          this._uiState.tasks = Array.from(taskMap.values());

          this._uiState.taskCompleted = true;
          this._uiState.taskError = false;
          this._uiState.currentTaskIndex = undefined;

          this._postMessage({
            status: "stopped",
            tasks: this._uiState.tasks,
            taskCompleted: true,
            taskError: false,
            currentTaskIndex: undefined,
          });

          vscode.window.showInformationMessage(
            `Task pipeline completed successfully. ${completedTasks.length} tasks executed.`,
          );
        },
        // onError callback
        async (error: string, errorTasks: TaskItem[]) => {
          // Merge the error tasks back into the full task list
          const taskMap = new Map(this._uiState.tasks.map((t) => [t.id, t]));
          errorTasks.forEach((task) => {
            taskMap.set(task.id, task);
          });
          this._uiState.tasks = Array.from(taskMap.values());

          this._uiState.taskCompleted = true;
          this._uiState.taskError = true;
          this._uiState.currentTaskIndex = undefined;

          this._postMessage({
            status: "stopped",
            tasks: this._uiState.tasks,
            taskCompleted: true,
            taskError: true,
            currentTaskIndex: undefined,
            results: `Pipeline failed: ${error}`,
          });

          vscode.window.showErrorMessage(`Task pipeline failed: ${error}`);
        },
      );
    } catch (error) {
      // Update UI state with error results
      this._uiState.taskCompleted = true;
      this._uiState.taskError = true;
      this._uiState.currentTaskIndex = undefined;

      // Send error status back to webview
      this._postMessage({
        status: "stopped",
        results: `Error: ${error}`,
        taskCompleted: true,
        taskError: true,
        currentTaskIndex: undefined,
      });
      vscode.window.showErrorMessage(`Failed to run task pipeline: ${error}`);
    }
  }

  private async _handleStartInteractive(prompt?: string): Promise<void> {
    try {
      // Use UI state values, not configuration
      await this.terminalService.runInteractive(
        this._uiState.model,
        this._uiState.rootPath,
        this._uiState.allowAllTools,
        prompt,
      );

      // Save current UI state to configuration after successful start
      await this.configService.updateConfiguration(
        "defaultModel",
        this._uiState.model,
      );
      await this.configService.updateConfiguration(
        "defaultRootPath",
        this._uiState.rootPath,
      );
      await this.configService.updateConfiguration(
        "allowAllTools",
        this._uiState.allowAllTools,
      );

      vscode.window.showInformationMessage(
        "Interactive Claude session started",
      );
      this._updateWebview();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start interactive session: ${error}`,
      );
    }
  }

  private async _handleRunTask(
    task: string,
    outputFormat: "text" | "json" = "text",
  ): Promise<void> {
    try {
      // Clear previous task state and set running status
      this._uiState.taskCompleted = false;
      this._uiState.taskError = false;
      this._uiState.lastTaskResults = undefined;

      this._postMessage({
        status: "running",
        taskCompleted: false,
        taskError: false,
        results: undefined,
      });

      const result = await this.claudeCodeService.runTask(
        task,
        this._uiState.model,
        this._uiState.rootPath,
        {
          allowAllTools: this._uiState.allowAllTools,
          outputFormat: outputFormat,
        },
      );

      // Update UI state with successful results
      this._uiState.taskCompleted = true;
      this._uiState.taskError = false;
      this._uiState.lastTaskResults = result;

      // Send success results back to webview
      this._postMessage({
        status: "stopped",
        results: result,
        taskCompleted: true,
        taskError: false,
      });

      // Task completed - result should speak for itself
    } catch (error) {
      // Update UI state with error results
      this._uiState.taskCompleted = true;
      this._uiState.taskError = true;
      this._uiState.lastTaskResults = `Error: ${error}`;

      // Send error status back to webview
      this._postMessage({
        status: "stopped",
        results: `Error: ${error}`,
        taskCompleted: true,
        taskError: true,
      });
      vscode.window.showErrorMessage(`Failed to run task: ${error}`);
    }
  }

  private async _handleCancelTask(): Promise<void> {
    try {
      this.claudeCodeService.cancelCurrentTask();

      // Clear task state on cancellation but keep tasks array
      this._uiState.taskCompleted = false;
      this._uiState.taskError = false;
      this._uiState.lastTaskResults = undefined;
      this._uiState.currentTaskIndex = undefined;
      // Don't clear tasks - user may want to keep them

      this._postMessage({
        status: "stopped",
        taskCompleted: false,
        taskError: false,
        results: undefined,
        tasks: this._uiState.tasks, // Keep tasks, don't set to undefined
        currentTaskIndex: undefined,
      });
      vscode.window.showInformationMessage("Task cancelled");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to cancel task: ${error}`);
    }
  }

  private async _handleUpdateModel(model: string): Promise<void> {
    // Don't allow model changes during running tasks
    if (this.claudeCodeService.isTaskRunning()) {
      vscode.window.showWarningMessage(
        "Cannot change model while a task is running. Please cancel the current task first.",
      );
      return;
    }

    // Update UI state only
    this._uiState.model = model;
    this._updateWebview();
  }

  private async _handleUpdateRootPath(path: string): Promise<void> {
    // Update UI state only
    this._uiState.rootPath = path;
    // Update PipelineService root path
    this.pipelineService.setRootPath(path);
    // Reload available pipelines from the new location
    await this._loadAvailablePipelines();
    this._updateWebview();
  }

  private async _handleUpdateAllowAllTools(allow: boolean): Promise<void> {
    // Update UI state only
    this._uiState.allowAllTools = allow;
    this._updateWebview();
  }

  private async _handleBrowseFolder(): Promise<void> {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      canSelectFiles: false,
      canSelectFolders: true,
      openLabel: "Select Root Directory",
      defaultUri: this._uiState.rootPath
        ? vscode.Uri.file(this._uiState.rootPath)
        : undefined,
    };

    const result = await vscode.window.showOpenDialog(options);
    if (result?.[0]) {
      const selectedPath = result[0].fsPath;
      // Update UI state only
      this._uiState.rootPath = selectedPath;
      // Update PipelineService root path
      this.pipelineService.setRootPath(selectedPath);
      // Reload available pipelines from the new location
      await this._loadAvailablePipelines();
      this._updateWebview();
    }
  }

  private _handleUpdateActiveTab(
    tab: "chat" | "pipeline" | "usage" | "logs",
  ): void {
    this._uiState.activeTab = tab;
    // Persist the active tab selection
    this.context.workspaceState.update("lastActiveTab", tab);
    this._updateWebview();
  }

  private _handleUpdateChatPrompt(prompt: string): void {
    this._uiState.chatPrompt = prompt;
    // Update webview to ensure state is synchronized
    this._updateWebview();
  }

  private _handleUpdateShowChatPrompt(show: boolean): void {
    this._uiState.showChatPrompt = show;
    this._updateWebview();
  }

  private _handleUpdateOutputFormat(format: "text" | "json"): void {
    this._uiState.outputFormat = format;
    this._updateWebview();
  }

  private async _handleUpdateParallelTasksCount(value: number): Promise<void> {
    try {
      // Validate value
      if (value < 1 || value > 8) {
        throw new Error("Value must be between 1 and 8");
      }

      // Update UI state
      this._uiState.parallelTasksCount = value;

      // Execute command to persist the value
      const result = await this.claudeCodeService.executeCommand(
        [
          "claude",
          "config",
          "set",
          "--global",
          "parallelTasksCount",
          value.toString(),
        ],
        this._uiState.rootPath ?? process.cwd(),
      );

      if (!result.success) {
        throw new Error(result.error ?? "Failed to set parallelTasksCount");
      }

      // Update webview
      this._updateWebview();

      vscode.window.showInformationMessage(
        `Parallel tasks count updated to ${value}`,
      );
    } catch (error) {
      console.error("Failed to set parallelTasksCount:", error);
      // Revert UI state on error to cached value
      this._uiState.parallelTasksCount =
        this.context.globalState.get<number>("claude.parallelTasks") ?? 1;
      vscode.window.showErrorMessage(
        `Failed to update parallel tasks count: ${error}`,
      );
    }
  }

  private _handlePipelineAddTask(newTask: TaskItem): void {
    if (!this._uiState.tasks) {
      this._uiState.tasks = [];
    }
    // Ensure unique ID if not provided or if it clashes
    if (!newTask.id || this._uiState.tasks.find((t) => t.id === newTask.id)) {
      newTask.id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // If pipeline has already completed or errored, we're effectively starting a new pipeline
    // So clear the completion state but preserve existing task results
    if (this._uiState.taskCompleted || this._uiState.taskError) {
      this._uiState.taskCompleted = false;
      this._uiState.taskError = false;
      this._uiState.currentTaskIndex = undefined;
      // Keep the lastTaskResults to show what was previously done
    }

    this._uiState.tasks.push(newTask);
    this._updateWebview();
  }

  private _handlePipelineRemoveTask(taskId: string): void {
    if (this._uiState.tasks) {
      this._uiState.tasks = this._uiState.tasks.filter(
        (task) => task.id !== taskId,
      );
      this._updateWebview();
    }
  }

  private _handlePipelineUpdateTaskField(
    taskId: string,
    field: keyof TaskItem,
    value: unknown,
  ): void {
    if (this._uiState.tasks) {
      const taskIndex = this._uiState.tasks.findIndex(
        (task) => task.id === taskId,
      );
      if (taskIndex > -1) {
        const task = this._uiState.tasks[taskIndex];
        // Using type assertion to safely assign value to dynamic field
        (task as unknown as Record<string, unknown>)[field] = value;
        this._updateWebview();
      }
    }
  }

  private async _handleSavePipeline(
    name: string,
    description: string,
    tasks: TaskItem[],
  ): Promise<void> {
    try {
      await this.pipelineService.savePipeline(
        name,
        description,
        tasks,
        this._uiState.model,
        this._uiState.allowAllTools,
      );
      await this._loadAvailablePipelines();
      this._updateWebview();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save pipeline: ${error}`);
    }
  }

  private async _handleLoadPipeline(name: string): Promise<void> {
    try {
      const workflow = await this.pipelineService.loadPipeline(name);

      if (!workflow) {
        return;
      }

      let tasks: TaskItem[];
      try {
        tasks = this.pipelineService.workflowToTaskItems(workflow);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Pipeline '${name}' is invalid: ${error}`,
        );
        return;
      }

      // Clear existing state and load new tasks
      this._uiState.taskCompleted = false;
      this._uiState.taskError = false;
      this._uiState.lastTaskResults = undefined;
      this._uiState.currentTaskIndex = undefined;

      this._uiState.tasks = tasks;

      this._updateWebview();

      vscode.window.showInformationMessage(
        `Pipeline '${name}' loaded successfully with ${tasks.length} tasks`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unexpected error loading pipeline: ${error}`,
      );
    }
  }

  private _updateWebview(): void {
    if (this._view) {
      const isTaskRunning = this.claudeCodeService?.isTaskRunning() ?? false;
      const message = {
        // All state from UI state, not configuration
        model: this._uiState.model,
        rootPath: this._uiState.rootPath,
        allowAllTools: this._uiState.allowAllTools,
        parallelTasksCount: this._uiState.parallelTasksCount,
        status: isTaskRunning ? "running" : "stopped",

        // All UI state
        activeTab: this._uiState.activeTab,
        showAdvancedTabs: this._uiState.showAdvancedTabs,
        outputFormat: this._uiState.outputFormat,
        tasks: this._uiState.tasks,
        currentTaskIndex: this._uiState.currentTaskIndex,
        results: this._uiState.lastTaskResults,
        taskCompleted: this._uiState.taskCompleted,
        taskError: this._uiState.taskError,
        chatPrompt: this._uiState.chatPrompt,
        showChatPrompt: this._uiState.showChatPrompt,
        claudeVersion: this._uiState.claudeVersion,
        claudeVersionAvailable: this._uiState.claudeVersionAvailable,
        claudeVersionError: this._uiState.claudeVersionError,
        claudeVersionLoading: this._uiState.claudeVersionLoading,

        // Claude installation state
        claudeInstalled: this._uiState.claudeInstalled,

        // Available options
        availablePipelines: this.availablePipelines,
        availableModels: getModelIds(),
      };
      this._postMessage(message);
    }
  }

  private _postMessage(message: Record<string, unknown>): void {
    this._view?.webview.postMessage(message);
  }

  private _getCurrentWorkspacePath(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders?.[0]?.uri.fsPath;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js"),
    );

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Agent Runner</title>
            </head>
            <body>
                <div id="root"></div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
  }

  private async _handleRequestUsageReport(
    period: "today" | "week" | "month",
  ): Promise<void> {
    try {
      const report = await this.usageReportService.generateReport(period);
      this._postMessage({
        command: "usageReportData",
        data: report,
      });
    } catch (error) {
      console.error("ClaudeRunnerPanel: Error generating usage report:", error);
      this._postMessage({
        command: "usageReportError",
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate usage report",
      });
    }
  }

  private async _handleRequestLogProjects(): Promise<void> {
    try {
      const projects = await this.logsService.listProjects();
      this._postMessage({
        command: "logProjectsData",
        data: projects,
      });
    } catch (error) {
      console.error("ClaudeRunnerPanel: Error loading log projects:", error);
      this._postMessage({
        command: "logProjectsError",
        error:
          error instanceof Error ? error.message : "Failed to load projects",
      });
    }
  }

  private async _handleRequestLogConversations(
    projectName: string,
  ): Promise<void> {
    try {
      const conversations =
        await this.logsService.listConversations(projectName);
      this._postMessage({
        command: "logConversationsData",
        data: conversations,
      });
    } catch (error) {
      console.error("ClaudeRunnerPanel: Error loading conversations:", error);
      this._postMessage({
        command: "logConversationsError",
        error:
          error instanceof Error
            ? error.message
            : "Failed to load conversations",
      });
    }
  }

  private async _handleRequestLogConversation(filePath: string): Promise<void> {
    try {
      const conversationData =
        await this.logsService.loadConversation(filePath);
      this._postMessage({
        command: "logConversationData",
        data: conversationData,
      });
    } catch (error) {
      console.error("ClaudeRunnerPanel: Error loading conversation:", error);
      this._postMessage({
        command: "logConversationError",
        error:
          error instanceof Error
            ? error.message
            : "Failed to load conversation",
      });
    }
  }

  private async _handleRecheckClaude(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<void> {
    // Recheck Claude installation with ULTRA-FAST detection service
    try {
      // Clear cache to force fresh detection
      ClaudeDetectionService.clearCache();

      // Use comprehensive detection service
      const detectionResult =
        await ClaudeDetectionService.detectClaude(preferredShell);

      // Update ALL Claude-related state consistently
      // Only upgrade, never downgrade the installation status
      if (detectionResult.isInstalled || !this._uiState.claudeInstalled) {
        this._uiState.claudeInstalled = detectionResult.isInstalled;
      }
      this._uiState.claudeVersion = detectionResult.version ?? "Not Available";
      this._uiState.claudeVersionAvailable = detectionResult.isInstalled;
      this._uiState.claudeVersionError = detectionResult.error;
      this._uiState.claudeVersionLoading = false;

      // After success, write back to context.globalState so the new value survives reload
      this.context.globalState.update("claude.detected", detectionResult);

      this._updateWebview();
    } catch (error) {
      console.warn(
        "ClaudeRunnerPanel: Claude installation recheck failed:",
        error,
      );
      // Only downgrade if we never had a successful detection
      if (!this._uiState.claudeInstalled) {
        this._uiState.claudeInstalled = false;
      }
      this._uiState.claudeVersionAvailable = false;
      this._uiState.claudeVersionError =
        error instanceof Error ? error.message : "Recheck failed";
      this._updateWebview();
    }
  }

  public toggleAdvancedTabs(): void {
    this._uiState.showAdvancedTabs = !this._uiState.showAdvancedTabs;
    this._updateWebview();
  }

  /**
   * Update Claude status from external source (e.g., extension async detection)
   */
  public updateClaudeStatus(isInstalled: boolean, version?: string): void {
    this._uiState.claudeInstalled = isInstalled;
    this._uiState.claudeVersionAvailable = isInstalled;
    this._uiState.claudeVersion =
      version ?? (isInstalled ? "Detected" : "Not Available");
    this._uiState.claudeVersionLoading = false;
    this._uiState.claudeVersionError = undefined;
    this._updateWebview();
  }

  public dispose(): void {
    this._view = undefined;
  }
}
