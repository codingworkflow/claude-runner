// Mock for vscode module in tests

module.exports = {
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    createWebviewPanel: jest.fn(),
    showOpenDialog: jest.fn(),
    withProgress: jest.fn(),
    registerWebviewViewProvider: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    visibleTextEditors: [],
    onDidCloseTerminal: jest.fn(),
    createTerminal: jest.fn(),
  },
  commands: {
    executeCommand: jest.fn(),
    registerCommand: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
    workspaceFolders: [],
    onDidChangeWorkspaceFolders: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    openTextDocument: jest.fn(),
  },
  Uri: {
    file: jest.fn((path) => ({ fsPath: path })),
    joinPath: jest.fn(),
    parse: jest.fn((uri) => ({ toString: () => uri })),
  },
  ExtensionContext: jest.fn(),
  EventEmitter: jest.fn(),
  env: {
    clipboard: {
      writeText: jest.fn(),
    },
    openExternal: jest.fn(),
  },
  ConfigurationTarget: {
    Workspace: 1,
    Global: 2,
    WorkspaceFolder: 3,
  },
  ProgressLocation: {
    Notification: 15,
    Window: 10,
    SourceControl: 1,
  },
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3,
  },
};
