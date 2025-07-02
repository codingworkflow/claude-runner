import { jest } from "@jest/globals";

export interface VSCodeMockOverrides {
  window?: Partial<typeof import("vscode").window>;
  workspace?: Partial<typeof import("vscode").workspace>;
  Uri?: Partial<typeof import("vscode").Uri>;
  [key: string]: any;
}

export const createVSCodeMock = (overrides: VSCodeMockOverrides = {}) => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showOpenDialog: jest.fn(),
    createWebviewPanel: jest.fn(),
    withProgress: jest.fn(),
    createStatusBarItem: jest.fn(),
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    ...overrides.window,
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
      has: jest.fn(),
      inspect: jest.fn(),
    })),
    workspaceFolders: [],
    onDidChangeWorkspaceFolders: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    onDidCreateFiles: jest.fn(),
    onDidDeleteFiles: jest.fn(),
    onDidChangeTextDocument: jest.fn(),
    ...overrides.workspace,
  },
  Uri: {
    file: jest.fn((path: string) => ({ fsPath: path, toString: () => path })),
    joinPath: jest.fn(),
    parse: jest.fn(),
    ...overrides.Uri,
  },
  ConfigurationTarget: {
    Workspace: 1,
    Global: 2,
    WorkspaceFolder: 3,
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ViewColumn: {
    Active: -1,
    One: 1,
    Two: 2,
    Three: 3,
  },
  ...overrides,
});

export const createWebviewMock = () => ({
  postMessage: jest.fn(),
  html: "",
  cspSource: "vscode-webview:",
  asWebviewUri: jest.fn((uri) => uri),
});

export const createExtensionContextMock = () => ({
  subscriptions: [],
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn(() => []),
  },
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn(() => []),
    setKeysForSync: jest.fn(),
  },
  extensionPath: "/test/extension/path",
  extensionUri: { fsPath: "/test/extension/path" },
  environmentVariableCollection: {
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    get: jest.fn(),
    forEach: jest.fn(),
    clear: jest.fn(),
    delete: jest.fn(),
  },
  secrets: {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
    onDidChange: jest.fn(),
  },
});

export const createServiceMock = <T>(methods: (keyof T)[]): jest.Mocked<T> => {
  return methods.reduce(
    (mock, method) => ({
      ...mock,
      [method]: jest.fn(),
    }),
    {} as jest.Mocked<T>,
  );
};

export const createChildProcessMock = () => {
  const mockProcess = {
    stdin: {
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeAllListeners: jest.fn(),
    },
    stdout: {
      on: jest.fn(),
      once: jest.fn(),
      removeAllListeners: jest.fn(),
      pipe: jest.fn(),
      read: jest.fn(),
      setEncoding: jest.fn(),
    },
    stderr: {
      on: jest.fn(),
      once: jest.fn(),
      removeAllListeners: jest.fn(),
      pipe: jest.fn(),
      read: jest.fn(),
      setEncoding: jest.fn(),
    },
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    kill: jest.fn(),
    pid: 12345,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: "",
  };

  return mockProcess;
};

export const createConsoleMock = () => ({
  log: jest.spyOn(console, "log").mockImplementation(),
  warn: jest.spyOn(console, "warn").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
  debug: jest.spyOn(console, "debug").mockImplementation(),
  info: jest.spyOn(console, "info").mockImplementation(),
});

export const mockChildProcess = () => {
  const mockExec = jest.fn();
  const mockSpawn = jest.fn();

  jest.doMock(
    "child_process",
    () => ({
      exec: mockExec,
      spawn: mockSpawn,
    }),
    { virtual: true },
  );

  return {
    exec: mockExec,
    spawn: mockSpawn,
    createMockProcess: createChildProcessMock,
  };
};

export const setupTimerMocks = () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  return {
    advanceTime: (ms: number) => jest.advanceTimersByTime(ms),
    runAllTimers: () => jest.runAllTimers(),
    runOnlyPendingTimers: () => jest.runOnlyPendingTimers(),
  };
};
