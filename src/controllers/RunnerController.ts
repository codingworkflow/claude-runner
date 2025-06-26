import * as vscode from "vscode";
import { BehaviorSubject } from "rxjs";
import { RunnerCommand, UIState, EventBus } from "../types/runner";
import { ClaudeCodeService, TaskItem } from "../services/ClaudeCodeService";
import { TerminalService } from "../services/TerminalService";
import { ConfigurationService } from "../services/ConfigurationService";
import { PipelineService } from "../services/PipelineService";
import { UsageReportService } from "../services/UsageReportService";
import { ClaudeVersionService } from "../services/ClaudeVersionService";
import { ClaudeDetectionService } from "../services/ClaudeDetectionService";
import { LogsService } from "../services/LogsService";
import { CommandsService, CommandFile } from "../services/CommandsService";
import { getModelIds } from "../models/ClaudeModels";

export interface ControllerCallbacks {
  onUsageReportData?: (data: unknown) => void;
  onUsageReportError?: (error: string) => void;
  onLogProjectsData?: (data: unknown) => void;
  onLogProjectsError?: (error: string) => void;
  onLogConversationsData?: (data: unknown) => void;
  onLogConversationsError?: (error: string) => void;
  onLogConversationData?: (data: unknown) => void;
  onLogConversationError?: (error: string) => void;
  onCommandScanResult?: (data: {
    globalCommands: CommandFile[];
    projectCommands: CommandFile[];
  }) => void;
}

export class RunnerController implements EventBus {
  readonly state$ = new BehaviorSubject<UIState>(this.getInitialState());
  private callbacks: ControllerCallbacks = {};
  private readonly commandsService: CommandsService;

  // Public method to get current state value
  public getCurrentState(): UIState {
    return this.state$.value;
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly claudeCodeService: ClaudeCodeService,
    private readonly terminalService: TerminalService,
    private readonly configService: ConfigurationService,
    private readonly pipelineService: PipelineService,
    private readonly usageReportService: UsageReportService,
    private readonly claudeVersionService: ClaudeVersionService,
    private readonly logsService: LogsService,
    private readonly availablePipelines: string[] = [],
  ) {
    // Initialize commands service
    this.commandsService = new CommandsService(context);

    // Set up pipeline service root path
    const currentState = this.state$.value;
    if (currentState.rootPath) {
      this.pipelineService.setRootPath(currentState.rootPath);
      this.commandsService.setRootPath(currentState.rootPath);
    }

    // Listen for workspace changes
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await this.loadAvailablePipelines();
    });
  }

  readonly send = (cmd: RunnerCommand): void => {
    switch (cmd.kind) {
      case "getInitialState":
        // State is already available via state$, no action needed
        break;
      case "startInteractive":
        void this.startInteractive(cmd.prompt);
        break;
      case "runTask":
        void this.runTask(cmd.task, cmd.outputFormat);
        break;
      case "runTasks":
        void this.runTasks(cmd.tasks, cmd.outputFormat);
        break;
      case "cancelTask":
        void this.cancelTask();
        break;
      case "updateModel":
        this.updateModel(cmd.model);
        break;
      case "updateRootPath":
        void this.updateRootPath(cmd.path);
        break;
      case "updateAllowAllTools":
        this.updateAllowAllTools(cmd.allow);
        break;
      case "browseFolder":
        void this.browseFolder();
        break;
      case "updateActiveTab":
        this.updateActiveTab(cmd.tab);
        break;
      case "updateChatPrompt":
        this.updateChatPrompt(cmd.prompt);
        break;
      case "updateShowChatPrompt":
        this.updateShowChatPrompt(cmd.show);
        break;
      case "updateOutputFormat":
        this.updateOutputFormat(cmd.format);
        break;
      case "savePipeline":
        void this.savePipeline(cmd.name, cmd.description, cmd.tasks);
        break;
      case "loadPipeline":
        void this.loadPipeline(cmd.name);
        break;
      case "pipelineAddTask":
        this.pipelineAddTask(cmd.newTask);
        break;
      case "pipelineRemoveTask":
        this.pipelineRemoveTask(cmd.taskId);
        break;
      case "pipelineUpdateTaskField":
        this.pipelineUpdateTaskField(cmd.taskId, cmd.field, cmd.value);
        break;
      case "updateParallelTasksCount":
        void this.updateParallelTasksCount(cmd.value);
        break;
      case "requestUsageReport":
        void this.requestUsageReport(cmd.period, cmd.hours, cmd.startHour);
        break;
      case "requestLogProjects":
        void this.requestLogProjects();
        break;
      case "requestLogConversations":
        void this.requestLogConversations(cmd.projectName);
        break;
      case "requestLogConversation":
        void this.requestLogConversation(cmd.filePath);
        break;
      case "recheckClaude":
        void this.recheckClaude(cmd.shell);
        break;
      case "scanCommands":
        void this.scanCommands(cmd.rootPath);
        break;
      case "openFile":
        void this.openFile(cmd.path);
        break;
      case "createCommand":
        void this.createCommand(cmd.name, cmd.isGlobal, cmd.rootPath);
        break;
      case "deleteCommand":
        void this.deleteCommand(cmd.path);
        break;
      case "webviewError":
        console.error("Webview error:", cmd.error);
        break;
      default: {
        // TypeScript exhaustiveness check - this will error if we miss a case
        const _exhaustive: never = cmd;
        console.warn("Unknown command:", _exhaustive);
      }
    }
  };

  private getInitialState(): UIState {
    // Initialize UI state from configuration
    const config = this.configService.getConfiguration();

    // Get cached Claude detection result
    const cached = this.context.globalState.get<{
      isInstalled: boolean;
      version?: string;
      shell?: string;
      error?: string;
    }>("claude.detected");

    // Get last active tab from workspace state
    const lastActiveTab =
      this.context.workspaceState.get<string>("lastActiveTab");
    const activeTab =
      lastActiveTab === "windows"
        ? "chat"
        : ((lastActiveTab as "chat" | "pipeline" | "usage" | "logs") ?? "chat");

    return {
      // Configuration that can be changed in UI
      model: config.defaultModel,
      rootPath: config.defaultRootPath ?? this.getCurrentWorkspacePath() ?? "",
      allowAllTools: config.allowAllTools,
      parallelTasksCount:
        this.context.globalState.get<number>("claude.parallelTasks") ?? 1,

      // Tab state
      activeTab,
      showAdvancedTabs: false,

      // Pipeline state
      outputFormat: "json",
      tasks: [],
      currentTaskIndex: undefined,

      // Task execution state
      lastTaskResults: undefined,
      taskCompleted: false,
      taskError: false,

      // Chat state
      chatPrompt: "",
      showChatPrompt: false,

      // Claude version state
      claudeVersion: cached?.version ?? "Not Available",
      claudeVersionAvailable: cached?.isInstalled ?? false,
      claudeVersionError: cached?.error,
      claudeVersionLoading: false,

      // Claude installation state
      claudeInstalled: cached?.isInstalled ?? false,
    };
  }

  private updateState(updates: Partial<UIState>): void {
    const newState = { ...this.state$.value, ...updates };
    this.state$.next(newState);
  }

  private async startInteractive(prompt?: string): Promise<void> {
    try {
      const currentState = this.state$.value;

      await this.terminalService.runInteractive(
        currentState.model,
        currentState.rootPath,
        currentState.allowAllTools,
        prompt,
      );

      // Save current UI state to configuration after successful start
      await this.configService.updateConfiguration(
        "defaultModel",
        currentState.model,
      );
      await this.configService.updateConfiguration(
        "defaultRootPath",
        currentState.rootPath,
      );
      await this.configService.updateConfiguration(
        "allowAllTools",
        currentState.allowAllTools,
      );

      vscode.window.showInformationMessage(
        "Interactive Claude session started",
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start interactive session: ${error}`,
      );
    }
  }

  private async runTask(
    task: string,
    outputFormat: "text" | "json" = "text",
  ): Promise<void> {
    try {
      // Clear previous task state and set running status
      this.updateState({
        taskCompleted: false,
        taskError: false,
        lastTaskResults: undefined,
      });

      const currentState = this.state$.value;
      const result = await this.claudeCodeService.runTask(
        task,
        currentState.model,
        currentState.rootPath,
        {
          allowAllTools: currentState.allowAllTools,
          outputFormat: outputFormat,
        },
      );

      // Update with successful results
      this.updateState({
        taskCompleted: true,
        taskError: false,
        lastTaskResults: result,
      });
    } catch (error) {
      // Update with error results
      this.updateState({
        taskCompleted: true,
        taskError: true,
        lastTaskResults: `Error: ${error}`,
      });
      vscode.window.showErrorMessage(`Failed to run task: ${error}`);
    }
  }

  private async runTasks(
    tasks: TaskItem[],
    outputFormat: "text" | "json" = "json",
  ): Promise<void> {
    try {
      // Filter to only run pending tasks
      const pendingTasks = tasks.filter((task) => task.status === "pending");

      if (pendingTasks.length === 0) {
        vscode.window.showInformationMessage(
          "No pending tasks to run. All tasks have been completed or errored.",
        );
        return;
      }

      // Clear previous task state and set running status
      this.updateState({
        taskCompleted: false,
        taskError: false,
        lastTaskResults: undefined,
        tasks: [...tasks],
        currentTaskIndex: undefined,
      });

      const currentState = this.state$.value;
      await this.claudeCodeService.runTaskPipeline(
        pendingTasks,
        currentState.model,
        currentState.rootPath,
        {
          allowAllTools: true, // Pipelines always run in dangerous mode
          outputFormat: outputFormat,
        },
        // onProgress callback
        async (updatedTasks: TaskItem[], currentIndex: number) => {
          const currentState = this.state$.value;
          const taskMap = new Map(currentState.tasks.map((t) => [t.id, t]));
          updatedTasks.forEach((task) => {
            taskMap.set(task.id, task);
          });
          const newTasks = Array.from(taskMap.values());

          // Find the actual index in the full task list
          const runningTask = updatedTasks[currentIndex];
          const currentTaskIndex = newTasks.findIndex(
            (t) => t.id === runningTask?.id,
          );

          this.updateState({
            tasks: newTasks,
            currentTaskIndex,
          });
        },
        // onComplete callback
        async (completedTasks: TaskItem[]) => {
          const currentState = this.state$.value;
          const taskMap = new Map(currentState.tasks.map((t) => [t.id, t]));
          completedTasks.forEach((task) => {
            taskMap.set(task.id, task);
          });

          this.updateState({
            tasks: Array.from(taskMap.values()),
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
          const currentState = this.state$.value;
          const taskMap = new Map(currentState.tasks.map((t) => [t.id, t]));
          errorTasks.forEach((task) => {
            taskMap.set(task.id, task);
          });

          this.updateState({
            tasks: Array.from(taskMap.values()),
            taskCompleted: true,
            taskError: true,
            currentTaskIndex: undefined,
            lastTaskResults: `Pipeline failed: ${error}`,
          });

          vscode.window.showErrorMessage(`Task pipeline failed: ${error}`);
        },
      );
    } catch (error) {
      this.updateState({
        taskCompleted: true,
        taskError: true,
        currentTaskIndex: undefined,
        lastTaskResults: `Error: ${error}`,
      });
      vscode.window.showErrorMessage(`Failed to run task pipeline: ${error}`);
    }
  }

  private async cancelTask(): Promise<void> {
    try {
      this.claudeCodeService.cancelCurrentTask();

      // Clear task state on cancellation but keep tasks array
      this.updateState({
        taskCompleted: false,
        taskError: false,
        lastTaskResults: undefined,
        currentTaskIndex: undefined,
      });

      vscode.window.showInformationMessage("Task cancelled");
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to cancel task: ${error}`);
    }
  }

  private updateModel(model: string): void {
    // Don't allow model changes during running tasks
    if (this.claudeCodeService.isTaskRunning()) {
      vscode.window.showWarningMessage(
        "Cannot change model while a task is running. Please cancel the current task first.",
      );
      return;
    }

    this.updateState({ model });
  }

  private async updateRootPath(path: string): Promise<void> {
    this.updateState({ rootPath: path });
    this.pipelineService.setRootPath(path);
    this.commandsService.setRootPath(path);
    await this.loadAvailablePipelines();
  }

  private updateAllowAllTools(allow: boolean): void {
    this.updateState({ allowAllTools: allow });
  }

  private async browseFolder(): Promise<void> {
    const currentState = this.state$.value;
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      canSelectFiles: false,
      canSelectFolders: true,
      openLabel: "Select Root Directory",
      defaultUri: currentState.rootPath
        ? vscode.Uri.file(currentState.rootPath)
        : undefined,
    };

    const result = await vscode.window.showOpenDialog(options);
    if (result?.[0]) {
      const selectedPath = result[0].fsPath;
      this.updateState({ rootPath: selectedPath });
      this.pipelineService.setRootPath(selectedPath);
      await this.loadAvailablePipelines();
    }
  }

  private updateActiveTab(tab: "chat" | "pipeline" | "usage" | "logs"): void {
    this.updateState({ activeTab: tab });
    this.context.workspaceState.update("lastActiveTab", tab);
  }

  private updateChatPrompt(prompt: string): void {
    this.updateState({ chatPrompt: prompt });
  }

  private updateShowChatPrompt(show: boolean): void {
    this.updateState({ showChatPrompt: show });
  }

  private updateOutputFormat(format: "text" | "json"): void {
    this.updateState({ outputFormat: format });
  }

  private async updateParallelTasksCount(value: number): Promise<void> {
    try {
      if (value < 1 || value > 8) {
        throw new Error("Value must be between 1 and 8");
      }

      this.updateState({ parallelTasksCount: value });

      const currentState = this.state$.value;
      const result = await this.claudeCodeService.executeCommand(
        [
          "claude",
          "config",
          "set",
          "--global",
          "parallelTasksCount",
          value.toString(),
        ],
        currentState.rootPath ?? process.cwd(),
      );

      if (!result.success) {
        throw new Error(result.error ?? "Failed to set parallelTasksCount");
      }

      vscode.window.showInformationMessage(
        `Parallel tasks count updated to ${value}`,
      );
    } catch (error) {
      console.error("Failed to set parallelTasksCount:", error);
      // Revert UI state on error
      const cachedValue =
        this.context.globalState.get<number>("claude.parallelTasks") ?? 1;
      this.updateState({ parallelTasksCount: cachedValue });
      vscode.window.showErrorMessage(
        `Failed to update parallel tasks count: ${error}`,
      );
    }
  }

  private pipelineAddTask(newTask: TaskItem): void {
    const currentState = this.state$.value;
    const tasks = currentState.tasks || [];

    // Ensure unique ID
    if (!newTask.id || tasks.find((t) => t.id === newTask.id)) {
      // NOSONAR S2245 - Math.random() is safe for non-cryptographic task IDs in VSCode extension
      newTask.id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // If pipeline has already completed or errored, reset completion state
    const updates: Partial<UIState> = {
      tasks: [...tasks, newTask],
    };

    if (currentState.taskCompleted || currentState.taskError) {
      updates.taskCompleted = false;
      updates.taskError = false;
      updates.currentTaskIndex = undefined;
    }

    this.updateState(updates);
  }

  private pipelineRemoveTask(taskId: string): void {
    const currentState = this.state$.value;
    if (currentState.tasks) {
      this.updateState({
        tasks: currentState.tasks.filter((task) => task.id !== taskId),
      });
    }
  }

  private pipelineUpdateTaskField(
    taskId: string,
    field: keyof TaskItem,
    value: unknown,
  ): void {
    const currentState = this.state$.value;
    if (currentState.tasks) {
      const taskIndex = currentState.tasks.findIndex(
        (task) => task.id === taskId,
      );
      if (taskIndex > -1) {
        const newTasks = [...currentState.tasks];
        const task = newTasks[taskIndex];
        (task as unknown as Record<string, unknown>)[field] = value;

        this.updateState({ tasks: newTasks });
      }
    }
  }

  private async savePipeline(
    name: string,
    description: string,
    tasks: TaskItem[],
  ): Promise<void> {
    try {
      const currentState = this.state$.value;
      await this.pipelineService.savePipeline(
        name,
        description,
        tasks,
        currentState.model,
        currentState.allowAllTools,
      );
      await this.loadAvailablePipelines();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save pipeline: ${error}`);
    }
  }

  private async loadPipeline(name: string): Promise<void> {
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
      this.updateState({
        taskCompleted: false,
        taskError: false,
        lastTaskResults: undefined,
        currentTaskIndex: undefined,
        tasks,
      });

      vscode.window.showInformationMessage(
        `Pipeline '${name}' loaded successfully with ${tasks.length} tasks`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unexpected error loading pipeline: ${error}`,
      );
    }
  }

  private async requestUsageReport(
    period: "today" | "week" | "month" | "hourly",
    hours?: number,
    startHour?: number,
  ): Promise<void> {
    try {
      const report = await this.usageReportService.generateReport(
        period,
        hours,
        startHour,
      );
      this.callbacks.onUsageReportData?.(report);
    } catch (error) {
      console.error("Error generating usage report:", error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Failed to generate usage report";
      this.callbacks.onUsageReportError?.(errorMsg);
    }
  }

  private async requestLogProjects(): Promise<void> {
    try {
      const projects = await this.logsService.listProjects();
      this.callbacks.onLogProjectsData?.(projects);
    } catch (error) {
      console.error("Error loading log projects:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Failed to load projects";
      this.callbacks.onLogProjectsError?.(errorMsg);
    }
  }

  private async requestLogConversations(projectName: string): Promise<void> {
    try {
      const conversations =
        await this.logsService.listConversations(projectName);
      this.callbacks.onLogConversationsData?.(conversations);
    } catch (error) {
      console.error("Error loading conversations:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Failed to load conversations";
      this.callbacks.onLogConversationsError?.(errorMsg);
    }
  }

  private async requestLogConversation(filePath: string): Promise<void> {
    try {
      const conversationData =
        await this.logsService.loadConversation(filePath);
      this.callbacks.onLogConversationData?.(conversationData);
    } catch (error) {
      console.error("Error loading conversation:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Failed to load conversation";
      this.callbacks.onLogConversationError?.(errorMsg);
    }
  }

  private async recheckClaude(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<void> {
    try {
      ClaudeDetectionService.clearCache();
      const detectionResult =
        await ClaudeDetectionService.detectClaude(preferredShell);

      const currentState = this.state$.value;
      // Only upgrade, never downgrade the installation status
      const claudeInstalled =
        detectionResult.isInstalled || currentState.claudeInstalled;

      this.updateState({
        claudeInstalled,
        claudeVersion: detectionResult.version ?? "Not Available",
        claudeVersionAvailable: detectionResult.isInstalled,
        claudeVersionError: detectionResult.error,
        claudeVersionLoading: false,
      });

      // Save to global state
      this.context.globalState.update("claude.detected", detectionResult);
    } catch (error) {
      console.warn("Claude installation recheck failed:", error);
      const currentState = this.state$.value;

      this.updateState({
        claudeInstalled: currentState.claudeInstalled, // Don't downgrade if we had success before
        claudeVersionAvailable: false,
        claudeVersionError:
          error instanceof Error ? error.message : "Recheck failed",
      });
    }
  }

  private async loadAvailablePipelines(): Promise<void> {
    // This would need to be handled differently - perhaps emit as a separate observable
    // For now, just update the service
    await this.pipelineService.listPipelines();
    // Available pipelines loaded in the background
  }

  private getCurrentWorkspacePath(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders?.[0]?.uri.fsPath;
  }

  public toggleAdvancedTabs(): void {
    const currentState = this.state$.value;
    this.updateState({ showAdvancedTabs: !currentState.showAdvancedTabs });
  }

  public updateClaudeStatus(isInstalled: boolean, version?: string): void {
    this.updateState({
      claudeInstalled: isInstalled,
      claudeVersionAvailable: isInstalled,
      claudeVersion: version ?? (isInstalled ? "Detected" : "Not Available"),
      claudeVersionLoading: false,
      claudeVersionError: undefined,
    });
  }

  public isTaskRunning(): boolean {
    return this.claudeCodeService?.isTaskRunning() ?? false;
  }

  public getAvailableModels(): string[] {
    return getModelIds();
  }

  public setCallbacks(callbacks: ControllerCallbacks): void {
    this.callbacks = callbacks;
  }

  private async scanCommands(rootPath: string): Promise<void> {
    try {
      // Update commands service with current root path
      this.commandsService.setRootPath(rootPath);

      // Scan commands using the service
      const result = await this.commandsService.scanCommands();

      // Send results back to webview
      this.callbacks.onCommandScanResult?.(result);
    } catch (error) {
      console.error(
        "RunnerController.scanCommands: Error scanning commands:",
        error,
      );
      this.callbacks.onCommandScanResult?.({
        globalCommands: [],
        projectCommands: [],
      });
    }
  }

  private async openFile(filePath: string): Promise<void> {
    await this.commandsService.openCommandFile(filePath);
  }

  private async createCommand(
    name: string,
    isGlobal: boolean,
    rootPath: string,
  ): Promise<void> {
    // Update commands service with current root path
    this.commandsService.setRootPath(rootPath);
    await this.commandsService.createCommand(name, isGlobal);
    await this.scanCommands(rootPath);
  }

  private async deleteCommand(filePath: string): Promise<void> {
    const fileName = filePath.split("/").pop()?.replace(".md", "") ?? "command";
    const confirmed = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the command "${fileName}"?`,
      { modal: true },
      "Delete",
    );

    if (confirmed === "Delete") {
      await this.commandsService.deleteCommand(filePath);
      const currentState = this.state$.value;
      await this.scanCommands(currentState.rootPath);
    }
  }
}
