import * as vscode from "vscode";
import { CommandsService } from "../services/CommandsService";

export class CommandsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-runner.commandsView";
  private _view?: vscode.WebviewView;
  private readonly _commandsService: CommandsService;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly getMainPanelRootPath: () => string,
    private readonly subscribeToRootPathChanges: (
      callback: (newPath: string) => void,
    ) => void,
  ) {
    this._commandsService = new CommandsService(_context);

    // Listen for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.scanCommands();
    });

    // Subscribe to root path changes from main panel
    this.subscribeToRootPathChanges((newRootPath: string) => {
      console.log(
        "CommandsWebviewProvider: Root path changed to:",
        newRootPath,
      );
      if (this._view) {
        this.handleScanCommands(newRootPath);
      }
    });
  }

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

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "scanCommands":
          this.handleScanCommands(data.rootPath || this.getMainPanelRootPath());
          break;
        case "openFile":
          this.handleOpenFile(data.path);
          break;
        case "createCommand":
          this.handleCreateCommand(data.name, data.isGlobal, data.rootPath);
          break;
        case "deleteCommand":
          this.handleDeleteCommand(data.path);
          break;
      }
    });

    // Send current root path from main panel to webview first
    const rootPath = this.getMainPanelRootPath();
    console.log(
      "CommandsWebviewProvider: Initializing with rootPath from main panel:",
      rootPath,
    );
    this._view.webview.postMessage({
      type: "setRootPath",
      rootPath: rootPath,
    });

    // Then do initial scan with that path
    this.handleScanCommands(rootPath);
  }

  public scanCommands() {
    if (this._view) {
      const rootPath = this.getMainPanelRootPath();
      this.handleScanCommands(rootPath);
    }
  }

  public addGlobalCommand() {
    if (this._view) {
      this._view.webview.postMessage({
        type: "showAddForm",
        section: "global",
      });
    }
  }

  public addProjectCommand() {
    if (this._view) {
      this._view.webview.postMessage({
        type: "showAddForm",
        section: "project",
      });
    }
  }

  private async handleScanCommands(rootPath: string) {
    try {
      console.log(
        "CommandsWebviewProvider: handleScanCommands called with rootPath:",
        rootPath,
      );
      this._commandsService.setRootPath(rootPath);
      const { globalCommands, projectCommands } =
        await this._commandsService.scanCommands();

      console.log(
        "CommandsWebviewProvider: Found",
        globalCommands.length,
        "global commands",
      );
      console.log(
        "CommandsWebviewProvider: Found",
        projectCommands.length,
        "project commands",
      );

      if (this._view) {
        this._view.webview.postMessage({
          type: "commandScanResult",
          globalCommands,
          projectCommands,
        });

        // Also send the current root path to keep webview in sync
        this._view.webview.postMessage({
          type: "setRootPath",
          rootPath: rootPath,
        });
      }
    } catch (error) {
      console.error("Failed to scan commands:", error);
      if (this._view) {
        this._view.webview.postMessage({
          type: "commandScanResult",
          globalCommands: [],
          projectCommands: [],
        });
      }
    }
  }

  private async handleOpenFile(path: string) {
    try {
      const document = await vscode.workspace.openTextDocument(path);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  private async handleCreateCommand(
    name: string,
    isGlobal: boolean,
    rootPath: string,
  ) {
    try {
      this._commandsService.setRootPath(rootPath);
      await this._commandsService.createCommand(name, isGlobal);
      vscode.window.showInformationMessage(
        `Created ${isGlobal ? "global" : "project"} command: ${name}`,
      );
      this.handleScanCommands(rootPath);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create command: ${error}`);
    }
  }

  private async handleDeleteCommand(path: string) {
    try {
      await this._commandsService.deleteCommand(path);
      vscode.window.showInformationMessage("Command deleted successfully");
      this.scanCommands();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete command: ${error}`);
    }
  }

  private getCurrentWorkspacePath(): string {
    return (
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
      process.env.HOME ??
      ""
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Commands</title>
        <style>
          /* Native VSCode styling using CSS variables */
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
            line-height: 1.4;
          }

          .section {
            margin-bottom: 24px;
          }

          .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-widget-border);
          }

          .section-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .command-count {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            min-width: 16px;
            text-align: center;
          }

          .add-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            padding: 4px 8px;
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .add-button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }

          .command-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .command-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background-color: var(--vscode-list-hoverBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            transition: all 0.15s ease;
          }

          .command-item:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-focusBorder);
          }

          .command-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .command-name {
            font-weight: 500;
            color: var(--vscode-foreground);
            font-size: 13px;
          }

          .command-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.9;
          }

          .command-actions {
            display: flex;
            gap: 4px;
          }

          .action-button {
            background: none;
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            border-radius: 2px;
            padding: 4px 6px;
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            transition: all 0.15s ease;
          }

          .action-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
            border-color: var(--vscode-focusBorder);
          }

          .no-commands {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 12px;
          }

          .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            font-size: 12px;
          }

          .add-form {
            display: none;
            flex-direction: column;
            gap: 8px;
            padding: 12px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            margin-bottom: 12px;
          }

          .add-form.visible {
            display: flex;
          }

          .form-input {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: var(--vscode-font-size);
            font-family: var(--vscode-font-family);
          }

          .form-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
          }

          .form-buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
          }

          .primary-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
          }

          .primary-button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }

          .primary-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .secondary-button {
            background: none;
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            border-radius: 2px;
            padding: 6px 12px;
            font-size: 12px;
            cursor: pointer;
          }

          .secondary-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div id="app">
          <!-- Global Commands Section -->
          <div class="section">
            <div class="section-header">
              <h3 class="section-title">
                Global Commands
                <span class="command-count" id="globalCount">0</span>
              </h3>
              <button class="add-button" id="addGlobalBtn">
                Add Global
              </button>
            </div>
            
            <div class="add-form" id="globalAddForm">
              <input type="text" class="form-input" id="globalCommandName" placeholder="Enter command name" />
              <div class="form-buttons">
                <button class="primary-button" id="createGlobalBtn">Create</button>
                <button class="secondary-button" id="cancelGlobalBtn">Cancel</button>
              </div>
            </div>

            <div class="command-list" id="globalCommands">
              <div class="loading">Scanning for global commands...</div>
            </div>
          </div>

          <!-- Project Commands Section -->
          <div class="section">
            <div class="section-header">
              <h3 class="section-title">
                Project Commands
                <span class="command-count" id="projectCount">0</span>
              </h3>
              <button class="add-button" id="addProjectBtn">
                Add Project
              </button>
            </div>
            
            <div class="add-form" id="projectAddForm">
              <input type="text" class="form-input" id="projectCommandName" placeholder="Enter command name" />
              <div class="form-buttons">
                <button class="primary-button" id="createProjectBtn">Create</button>
                <button class="secondary-button" id="cancelProjectBtn">Cancel</button>
              </div>
            </div>

            <div class="command-list" id="projectCommands">
              <div class="loading">Scanning for project commands...</div>
            </div>
          </div>
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          let currentRootPath = '';

          // Wait for DOM to load
          document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            // Get initial root path from extension
            vscode.postMessage({ type: 'scanCommands', rootPath: '' });
          });

          function setupEventListeners() {
            // Add button listeners
            document.getElementById('addGlobalBtn').addEventListener('click', () => showAddForm('global'));
            document.getElementById('addProjectBtn').addEventListener('click', () => showAddForm('project'));
            
            // Create button listeners
            document.getElementById('createGlobalBtn').addEventListener('click', () => createCommand('global'));
            document.getElementById('createProjectBtn').addEventListener('click', () => createCommand('project'));
            
            // Cancel button listeners
            document.getElementById('cancelGlobalBtn').addEventListener('click', () => hideAddForm('global'));
            document.getElementById('cancelProjectBtn').addEventListener('click', () => hideAddForm('project'));
            
            // Enter key listeners for input fields
            document.getElementById('globalCommandName').addEventListener('keydown', (e) => {
              if (e.key === 'Enter') createCommand('global');
            });
            document.getElementById('projectCommandName').addEventListener('keydown', (e) => {
              if (e.key === 'Enter') createCommand('project');
            });
          }

          // Listen for messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
              case 'commandScanResult':
                updateCommandLists(message.globalCommands, message.projectCommands);
                break;
              case 'showAddForm':
                showAddForm(message.section);
                break;
              case 'setRootPath':
                currentRootPath = message.rootPath;
                break;
            }
          });

          function updateCommandLists(globalCommands, projectCommands) {
            updateCommandList('globalCommands', 'globalCount', globalCommands);
            updateCommandList('projectCommands', 'projectCount', projectCommands);
          }

          function updateCommandList(containerId, countId, commands) {
            const container = document.getElementById(containerId);
            const countElement = document.getElementById(countId);
            
            countElement.textContent = commands.length;
            
            if (commands.length === 0) {
              container.innerHTML = '<div class="no-commands">No commands found</div>';
              return;
            }

            container.innerHTML = commands.map(cmd => {
              const cmdId = 'cmd_' + Math.random().toString(36).substring(2);
              return '<div class="command-item" data-cmd-id="' + cmdId + '">' +
                '<div class="command-info">' +
                  '<div class="command-name">' + escapeHtml(cmd.name) + '</div>' +
                  (cmd.description ? '<div class="command-description">' + escapeHtml(cmd.description) + '</div>' : '') +
                '</div>' +
                '<div class="command-actions">' +
                  '<button class="action-button edit-btn" data-path="' + escapeHtml(cmd.path) + '">Edit</button>' +
                  '<button class="action-button delete-btn" data-path="' + escapeHtml(cmd.path) + '">Delete</button>' +
                '</div>' +
              '</div>';
            }).join('');

            // Add event listeners to action buttons
            container.querySelectorAll('.edit-btn').forEach(btn => {
              btn.addEventListener('click', () => editCommand(btn.dataset.path));
            });
            container.querySelectorAll('.delete-btn').forEach(btn => {
              btn.addEventListener('click', () => deleteCommand(btn.dataset.path));
            });
          }

          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }

          function showAddForm(section) {
            document.getElementById(section + 'AddForm').classList.add('visible');
            document.getElementById(section + 'CommandName').focus();
          }

          function hideAddForm(section) {
            document.getElementById(section + 'AddForm').classList.remove('visible');
            document.getElementById(section + 'CommandName').value = '';
          }

          function createCommand(section) {
            const input = document.getElementById(section + 'CommandName');
            const name = input.value.trim();
            
            if (!name) return;

            vscode.postMessage({
              type: 'createCommand',
              name: name,
              isGlobal: section === 'global',
              rootPath: currentRootPath
            });

            hideAddForm(section);
          }

          function editCommand(path) {
            vscode.postMessage({ type: 'openFile', path: path });
          }

          function deleteCommand(path) {
            if (confirm('Are you sure you want to delete this command?')) {
              vscode.postMessage({ type: 'deleteCommand', path: path });
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
