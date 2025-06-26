// Mock for vscode module in tests

module.exports = {
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    createWebviewPanel: jest.fn(),
    showOpenDialog: jest.fn(),
  },
  commands: {
    executeCommand: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
    workspaceFolders: [],
    onDidChangeWorkspaceFolders: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
  },
  Uri: {
    file: jest.fn((path) => ({ fsPath: path })),
    joinPath: jest.fn(),
  },
  ExtensionContext: jest.fn(),
  EventEmitter: jest.fn(),
  env: {
    clipboard: {
      writeText: jest.fn(),
    },
  },
  ConfigurationTarget: {
    Workspace: 1,
    Global: 2,
    WorkspaceFolder: 3,
  },
};
