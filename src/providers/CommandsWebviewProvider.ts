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

    this.subscribeToRootPathChanges((newRootPath: string) => {
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
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, "dist"),
      ],
    };

    webviewView.webview.html = this._getCommandsHtml(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.command) {
        case "scanCommands":
          this.handleScanCommands(data.rootPath || this.getMainPanelRootPath());
          break;
        case "openFile":
        case "editCommand":
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

    const rootPath = this.getMainPanelRootPath();
    this._view.webview.postMessage({
      type: "setRootPath",
      rootPath: rootPath,
    });
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
      this._commandsService.setRootPath(rootPath);
      const { globalCommands, projectCommands } =
        await this._commandsService.scanCommands();

      if (this._view) {
        this._view.webview.postMessage({
          command: "commandScanResult",
          globalCommands,
          projectCommands,
        });

        // Also send the current root path to keep webview in sync
        this._view.webview.postMessage({
          command: "setRootPath",
          rootPath: rootPath,
        });
      }
    } catch (error) {
      if (this._view) {
        this._view.webview.postMessage({
          command: "commandScanResult",
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

  private _getCommandsHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js"),
    );

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Commands</title>
      </head>
      <body>
        <div id="root"></div>
        <script>
          window.initialViewType = 'commands';
        </script>
        <script src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
