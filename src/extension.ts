import * as vscode from "vscode";
import { ClaudeRunnerPanel } from "./providers/ClaudeRunnerPanel";
import { CommandsWebviewProvider } from "./providers/CommandsWebviewProvider";
import { UsageLogsWebviewProvider } from "./providers/UsageLogsWebviewProvider";
import { ClaudeCodeService } from "./services/ClaudeCodeService";
import { TerminalService } from "./services/TerminalService";
import { ConfigurationService } from "./services/ConfigurationService";
import { ClaudeDetectionService } from "./services/ClaudeDetectionService";
import { UsageReportService } from "./services/UsageReportService";
import { LogsService } from "./services/LogsService";
import { detectParallelTasksCount } from "./utils/detectParallelTasksCount";

let claudeRunnerPanel: ClaudeRunnerPanel | undefined;
let commandsWebviewProvider: CommandsWebviewProvider | undefined;
let usageLogsWebviewProvider: UsageLogsWebviewProvider | undefined;
let claudeCodeService: ClaudeCodeService;
let terminalService: TerminalService;
let configurationService: ConfigurationService;
let usageReportService: UsageReportService;
let logsService: LogsService;

export async function activate(context: vscode.ExtensionContext) {
  // Clear ALL cached state to prevent corruption
  context.workspaceState.update("claudeRunnerUIState", undefined);
  context.globalState.update("claudeRunnerGlobalState", undefined);
  context.workspaceState.update("lastActiveTab", undefined); // Force chat default

  // Initialize basic configuration service first
  configurationService = new ConfigurationService();

  // Do the one-time Claude detection here and nowhere else. Persist the result.
  const result = await ClaudeDetectionService.detectClaude("auto");
  context.globalState.update("claude.detected", result);

  // Detect parallel tasks count once at startup
  const parallelTasks = await detectParallelTasksCount();
  context.globalState.update("claude.parallelTasks", parallelTasks);

  const isClaudeInstalled = result.isInstalled;
  if (isClaudeInstalled) {
    // Initialize services only if Claude is installed
    claudeCodeService = new ClaudeCodeService(configurationService);
    terminalService = new TerminalService(configurationService);
  }

  // Initialize Usage and Logs services (these work without Claude)
  usageReportService = new UsageReportService();
  logsService = new LogsService();

  // Register commands (some will show error messages if Claude not installed)
  const commands = [
    vscode.commands.registerCommand("claude-runner.showPanel", () => {
      showClaudeRunnerPanel(context, isClaudeInstalled);
    }),

    vscode.commands.registerCommand(
      "claude-runner.runInteractive",
      async () => {
        if (!isClaudeInstalled) {
          showClaudeNotInstalledMessage();
          return;
        }
        await runInteractiveMode();
      },
    ),

    vscode.commands.registerCommand(
      "claude-runner.runTask",
      async (task?: string) => {
        if (!isClaudeInstalled) {
          showClaudeNotInstalledMessage();
          return;
        }
        await runTaskMode(task);
      },
    ),

    vscode.commands.registerCommand("claude-runner.selectModel", async () => {
      if (!isClaudeInstalled) {
        showClaudeNotInstalledMessage();
        return;
      }
      await selectModel();
    }),

    vscode.commands.registerCommand("claude-runner.openSettings", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "claudeRunner",
      );
    }),

    vscode.commands.registerCommand("claude-runner.openInEditor", async () => {
      await openClaudeRunnerInEditor(context, isClaudeInstalled);
    }),

    vscode.commands.registerCommand("claude-runner.toggleAdvancedTabs", () => {
      if (claudeRunnerPanel) {
        claudeRunnerPanel.toggleAdvancedTabs();
      }
    }),

    vscode.commands.registerCommand("claude-runner.recheckClaude", async () => {
      // The recheck is handled by the webview message, not directly by this command
      // This command is registered to appear in package.json but actual logic is in the panel
    }),

    vscode.commands.registerCommand("claude-runner.refreshUsageReport", () => {
      usageLogsWebviewProvider?.refreshUsageReport();
    }),

    vscode.commands.registerCommand("claude-runner.refreshLogs", () => {
      usageLogsWebviewProvider?.refreshLogs();
    }),
  ];

  // Register all disposables
  context.subscriptions.push(...commands);

  // Create webview provider (it will handle the not-installed state internally)
  claudeRunnerPanel = new ClaudeRunnerPanel(
    context,
    claudeCodeService,
    terminalService,
    configurationService,
    isClaudeInstalled,
  );

  // Create Commands webview provider with access to main panel's root path
  commandsWebviewProvider = new CommandsWebviewProvider(
    context.extensionUri,
    context,
    () =>
      claudeRunnerPanel?.getCurrentRootPath() ??
      getCurrentWorkspacePath() ??
      "",
    (callback: (newPath: string) => void) => {
      // Subscribe to root path changes from the main panel's controller
      if (claudeRunnerPanel) {
        const subscription =
          claudeRunnerPanel.subscribeToRootPathChanges(callback);
        context.subscriptions.push(subscription);
      }
    },
  );

  // Create Usage & Logs webview provider
  usageLogsWebviewProvider = new UsageLogsWebviewProvider(
    context.extensionUri,
    context,
    usageReportService,
    logsService,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "claude-runner.mainView",
      claudeRunnerPanel,
    ),
    vscode.window.registerWebviewViewProvider(
      CommandsWebviewProvider.viewType,
      commandsWebviewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      UsageLogsWebviewProvider.viewType,
      usageLogsWebviewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // No async detection needed - already done in startup
}

export function deactivate() {
  claudeRunnerPanel?.dispose();
}

function showClaudeRunnerPanel(
  context: vscode.ExtensionContext,
  isClaudeInstalled: boolean,
) {
  if (!claudeRunnerPanel) {
    claudeRunnerPanel = new ClaudeRunnerPanel(
      context,
      claudeCodeService,
      terminalService,
      configurationService,
      isClaudeInstalled,
    );
  }

  // Focus the Claude Runner view
  vscode.commands.executeCommand("claude-runner.mainView.focus");
}

async function runInteractiveMode() {
  if (!claudeCodeService || !terminalService) {
    showClaudeNotInstalledMessage();
    return;
  }

  try {
    const config = configurationService.getConfiguration();
    const model = config.defaultModel;
    const rootPath = config.defaultRootPath || getCurrentWorkspacePath();

    if (!rootPath) {
      vscode.window.showErrorMessage(
        "No workspace folder or root path configured",
      );
      return;
    }

    await terminalService.runInteractive(model, rootPath, config.allowAllTools);

    vscode.window.showInformationMessage("Claude interactive session started");
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start interactive mode: ${error}`,
    );
  }
}

async function runTaskMode(task?: string) {
  if (!claudeCodeService) {
    showClaudeNotInstalledMessage();
    return;
  }

  try {
    if (!task) {
      task = await vscode.window.showInputBox({
        prompt: "Enter task or prompt for Claude",
        placeHolder:
          'e.g., "Explain this function", "Add error handling", etc.',
      });
    }

    if (!task) {
      return; // User cancelled
    }

    const config = configurationService.getConfiguration();
    const model = config.defaultModel;
    const rootPath = config.defaultRootPath || getCurrentWorkspacePath();

    if (!rootPath) {
      vscode.window.showErrorMessage(
        "No workspace folder or root path configured",
      );
      return;
    }

    const result = await claudeCodeService.runTask(task, model, rootPath, {
      allowAllTools: config.allowAllTools,
      outputFormat: config.outputFormat,
      maxTurns: config.maxTurns,
      verbose: config.showVerboseOutput,
    });

    // Show result in a new editor
    const doc = await vscode.workspace.openTextDocument({
      content: result,
      language: config.outputFormat === "json" ? "json" : "markdown",
    });

    await vscode.window.showTextDocument(doc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to run task: ${error}`);
  }
}

async function selectModel() {
  const models = [
    {
      label: "Claude Opus 4",
      value: "claude-opus-4-20250514",
      description: "Most capable, highest cost",
    },
    {
      label: "Claude Sonnet 4",
      value: "claude-sonnet-4-20250514",
      description: "Balanced performance and cost",
    },
    {
      label: "Claude Sonnet 3.7",
      value: "claude-3-7-sonnet-20250219",
      description: "Good performance, moderate cost",
    },
    {
      label: "Claude Haiku 3.5",
      value: "claude-3-5-haiku-20241022",
      description: "Fastest, lowest cost",
    },
  ];

  const selected = await vscode.window.showQuickPick(models, {
    placeHolder: "Select Claude model",
    matchOnDescription: true,
  });

  if (selected) {
    await configurationService.updateConfiguration(
      "defaultModel",
      selected.value,
    );
    vscode.window.showInformationMessage(`Model changed to ${selected.label}`);
  }
}

function getCurrentWorkspacePath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders?.[0]?.uri.fsPath;
}

async function openClaudeRunnerInEditor(
  context: vscode.ExtensionContext,
  isClaudeInstalled: boolean,
): Promise<void> {
  try {
    // Create a new provider instance for the editor context
    const editorProvider = new ClaudeRunnerPanel(
      context,
      claudeCodeService,
      terminalService,
      configurationService,
      isClaudeInstalled,
    );

    // Determine target column for the panel
    const lastCol = Math.max(
      ...vscode.window.visibleTextEditors.map(
        (editor) => editor.viewColumn ?? 0,
      ),
    );
    const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0;

    if (!hasVisibleEditors) {
      await vscode.commands.executeCommand("workbench.action.newGroupRight");
    }

    const targetCol = hasVisibleEditors
      ? Math.max(lastCol + 1, 1)
      : vscode.ViewColumn.Two;

    // Create the webview panel in editor
    const newPanel = vscode.window.createWebviewPanel(
      "claude-runner-editor",
      "Claude Runner",
      targetCol,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    // Set icon for the tab
    newPanel.iconPath = {
      light: vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "claude-light.svg",
      ),
      dark: vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "claude-dark.svg",
      ),
    };

    // Initialize the webview using the provider's method
    await editorProvider.resolveWebviewPanel(newPanel);

    // Add disposal listener
    newPanel.onDidDispose(
      () => {
        editorProvider.dispose();
      },
      null,
      context.subscriptions,
    );

    // Small delay to ensure panel is ready, then lock the editor group
    setTimeout(async () => {
      try {
        await vscode.commands.executeCommand(
          "workbench.action.lockEditorGroup",
        );
      } catch (error) {
        console.warn("Failed to lock editor group:", error);
      }
    }, 100);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to open Claude Runner in editor: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// REMOVED: Replaced with ClaudeDetectionService.detectClaude()
// No longer needed - ClaudeDetectionService provides unified detection

function showClaudeNotInstalledMessage() {
  vscode.window
    .showErrorMessage(
      "Claude Code CLI is required to use this extension.",
      "Install Instructions",
      "Install Command",
    )
    .then((selection) => {
      if (selection === "Install Instructions") {
        vscode.env.openExternal(
          vscode.Uri.parse(
            "https://docs.anthropic.com/en/docs/claude-code/setup",
          ),
        );
      } else if (selection === "Install Command") {
        vscode.env.openExternal(
          vscode.Uri.parse(
            "https://www.npmjs.com/package/@anthropic-ai/claude-code",
          ),
        );
      }
    });
}
