import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

import * as vscode from "vscode";
import { TerminalService } from "../../../src/services/TerminalService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";

// Mock dependencies
jest.mock("../../../src/services/ConfigurationService");
jest.mock("../../../src/services/ClaudeCodeService");
jest.mock("vscode", () => ({
  window: {
    createTerminal: jest.fn(),
    onDidCloseTerminal: jest.fn(),
    showInformationMessage: jest.fn(),
    showQuickPick: jest.fn(),
    terminals: [],
  },
  ThemeIcon: jest.fn((iconName) => ({ iconName })),
}));

// Create typed mock objects
const mockConfigService = {
  getConfiguration: jest.fn(),
  getModelDisplayName: jest.fn(),
  updateConfiguration: jest.fn(),
  onConfigurationChanged: jest.fn(),
  getAvailableModels: jest.fn(),
  validateModel: jest.fn(),
  validatePath: jest.fn(),
} as unknown as jest.Mocked<ConfigurationService>;

const mockClaudeCodeService = {
  buildInteractiveCommand: jest.fn(),
  checkInstallation: jest.fn(),
  runTask: jest.fn(),
  runTaskPipeline: jest.fn(),
  cancelCurrentTask: jest.fn(),
  buildCommand: jest.fn(),
  formatCommandPreview: jest.fn(),
  validateModel: jest.fn(),
  getAvailableModels: jest.fn(),
  getModelDisplayName: jest.fn(),
  parseTaskFile: jest.fn(),
  runInteractiveCommand: jest.fn(),
  openTaskInTerminal: jest.fn(),
  runPipelineInTerminal: jest.fn(),
  showTerminalSelection: jest.fn(),
  killAllRunningTasks: jest.fn(),
  isTaskRunning: jest.fn(),
  getCurrentExecutionId: jest.fn(),
} as unknown as jest.Mocked<ClaudeCodeService>;

const mockTerminal = {
  name: "Test Terminal",
  sendText: jest.fn(),
  show: jest.fn(),
  dispose: jest.fn(),
  processId: Promise.resolve(1234),
  creationOptions: {},
  exitStatus: undefined,
  state: { isInteractedWith: false },
  shellIntegration: undefined,
  hide: jest.fn(),
} as unknown as jest.Mocked<vscode.Terminal>;

const mockTerminal2 = {
  name: "Test Terminal 2",
  sendText: jest.fn(),
  show: jest.fn(),
  dispose: jest.fn(),
  processId: Promise.resolve(1235),
  creationOptions: {},
  exitStatus: undefined,
  state: { isInteractedWith: false },
  shellIntegration: undefined,
  hide: jest.fn(),
} as unknown as jest.Mocked<vscode.Terminal>;

// Mock implementations
const MockedConfigurationService = ConfigurationService as jest.MockedClass<
  typeof ConfigurationService
>;
const MockedClaudeCodeService = ClaudeCodeService as jest.MockedClass<
  typeof ClaudeCodeService
>;

MockedConfigurationService.mockImplementation(() => mockConfigService);
MockedClaudeCodeService.mockImplementation(() => mockClaudeCodeService);

describe("TerminalService", () => {
  let service: TerminalService;
  let mockOnDidCloseTerminal: jest.Mock;
  let terminalCallCount: number;

  const mockConfig = {
    defaultModel: "claude-3-5-sonnet-20241022",
    defaultRootPath: "/workspace",
    allowAllTools: false,
    outputFormat: "text" as const,
    maxTurns: 10,
    showVerboseOutput: false,
    terminalName: "Claude Interactive",
    autoOpenTerminal: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default config
    mockConfigService.getConfiguration.mockReturnValue(mockConfig);
    mockConfigService.getModelDisplayName.mockReturnValue("Claude 3.5 Sonnet");

    // Setup ClaudeCodeService mock
    mockClaudeCodeService.buildInteractiveCommand.mockReturnValue([
      "claude",
      "--model",
      "claude-3-5-sonnet-20241022",
      "--prompt",
      "test prompt",
    ]);

    // Mock terminal creation - alternate between terminals for different calls
    terminalCallCount = 0;
    (vscode.window.createTerminal as jest.Mock).mockImplementation(() => {
      terminalCallCount++;
      return terminalCallCount === 1 ? mockTerminal : mockTerminal2;
    });

    // Mock onDidCloseTerminal
    mockOnDidCloseTerminal = jest.fn();
    (vscode.window.onDidCloseTerminal as jest.Mock).mockImplementation(
      mockOnDidCloseTerminal,
    );

    // Reset terminals array
    (vscode.window.terminals as vscode.Terminal[]).length = 0;

    // Reset terminal mocks
    (mockTerminal.show as jest.Mock).mockClear();
    (mockTerminal.sendText as jest.Mock).mockClear();
    (mockTerminal.dispose as jest.Mock).mockClear();
    (mockTerminal2.show as jest.Mock).mockClear();
    (mockTerminal2.sendText as jest.Mock).mockClear();
    (mockTerminal2.dispose as jest.Mock).mockClear();

    service = new TerminalService(mockConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with configuration service", () => {
      expect(vscode.window.onDidCloseTerminal).toHaveBeenCalled();
      expect(service.getTerminalCount()).toBe(0);
    });

    it("should set up terminal close handler", () => {
      const closeHandler = (vscode.window.onDidCloseTerminal as jest.Mock).mock
        .calls[0][0];
      expect(typeof closeHandler).toBe("function");
    });
  });

  describe("runInteractive", () => {
    it("should create new terminal and run interactive command", async () => {
      const terminal = await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        true,
        "test prompt",
      );

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: "Claude Interactive - Claude 3.5 Sonnet",
        cwd: "/workspace",
        iconPath: { iconName: "terminal" },
      });

      expect(
        mockClaudeCodeService.buildInteractiveCommand,
      ).toHaveBeenCalledWith("claude-3-5-sonnet-20241022", true, "test prompt");

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        "claude --model claude-3-5-sonnet-20241022 --prompt test prompt",
      );

      expect(mockTerminal.show).toHaveBeenCalled();
      expect(terminal).toBe(mockTerminal);
    });

    it("should reuse existing terminal for same configuration", async () => {
      // First call creates terminal
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      // Mock terminal as active
      (vscode.window.terminals as vscode.Terminal[]).push(mockTerminal);

      // Second call should reuse terminal
      (vscode.window.createTerminal as jest.Mock).mockClear();
      const terminal = await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
      expect(terminal).toBe(mockTerminal);
      expect(mockTerminal.show).toHaveBeenCalledWith(true);
    });

    it("should create new terminal when existing is inactive", async () => {
      // First call creates terminal
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      // Mock terminal as inactive (not in terminals array)
      (vscode.window.terminals as vscode.Terminal[]).length = 0;

      // Second call should create new terminal
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(2);
    });

    it("should not auto-open terminal when configured", async () => {
      mockConfigService.getConfiguration.mockReturnValue({
        ...mockConfig,
        autoOpenTerminal: false,
      });

      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      expect(mockTerminal.show).not.toHaveBeenCalled();
    });

    it("should handle interactive command without prompt", async () => {
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      expect(
        mockClaudeCodeService.buildInteractiveCommand,
      ).toHaveBeenCalledWith("claude-3-5-sonnet-20241022", false, undefined);
    });
  });

  describe("runCommand", () => {
    it("should create terminal and run command", async () => {
      const terminal = await service.runCommand(
        "npm test",
        "/workspace",
        "Test Terminal",
      );

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: "Test Terminal",
        cwd: "/workspace",
        iconPath: { iconName: "run" },
      });

      expect(mockTerminal.sendText).toHaveBeenCalledWith("npm test");
      expect(mockTerminal.show).toHaveBeenCalled();
      expect(terminal).toBe(mockTerminal);
    });

    it("should use default terminal name when not provided", async () => {
      await service.runCommand("ls -la", "/workspace");

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: "Claude Interactive",
        cwd: "/workspace",
        iconPath: { iconName: "run" },
      });
    });

    it("should not auto-open terminal when configured", async () => {
      mockConfigService.getConfiguration.mockReturnValue({
        ...mockConfig,
        autoOpenTerminal: false,
      });

      await service.runCommand("echo 'test'", "/workspace");

      expect(mockTerminal.show).not.toHaveBeenCalled();
    });
  });

  describe("createTerminalWithModel", () => {
    it("should create terminal with model information", async () => {
      const terminal = await service.createTerminalWithModel(
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: "Claude - Claude 3.5 Sonnet",
        cwd: "/workspace",
        iconPath: { iconName: "terminal" },
      });

      const expectedCommands = [
        'echo "# Claude Runner - Claude 3.5 Sonnet"',
        'echo "# Working directory: /workspace"',
        'echo "# Model: claude-3-5-sonnet-20241022"',
        'echo ""',
        'echo "# Ready to run Claude commands!"',
      ];

      expectedCommands.forEach((command, index) => {
        expect(mockTerminal.sendText).toHaveBeenNthCalledWith(
          index + 1,
          command,
        );
      });

      expect(terminal).toBe(mockTerminal);
    });
  });

  describe("terminal management", () => {
    beforeEach(() => {
      // Reset terminals array
      (vscode.window.terminals as vscode.Terminal[]).length = 0;
    });

    it("should get active terminals", async () => {
      // Add terminals to VSCode's terminals array
      (vscode.window.terminals as vscode.Terminal[]).push(mockTerminal);

      // First create a terminal to add it to internal map
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      const activeTerminals = service.getActiveTerminals();
      expect(activeTerminals).toContain(mockTerminal);
    });

    it("should find terminal by name", () => {
      (vscode.window.terminals as vscode.Terminal[]).push(mockTerminal);

      const found = service.findTerminalByName("Test Terminal");
      expect(found).toBe(mockTerminal);
    });

    it("should return undefined when terminal not found by name", () => {
      (vscode.window.terminals as vscode.Terminal[]).length = 0;

      const found = service.findTerminalByName("Non-existent Terminal");
      expect(found).toBeUndefined();
    });

    it("should get terminal count", async () => {
      (vscode.window.terminals as vscode.Terminal[]).push(mockTerminal);

      // Create a terminal to add it to internal map
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      const count = service.getTerminalCount();
      expect(count).toBe(1);
    });

    it("should dispose terminal by key", async () => {
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      service.disposeTerminal("claude-3-5-sonnet-20241022-/workspace");

      expect(mockTerminal.dispose).toHaveBeenCalled();
    });

    it("should dispose all terminals", async () => {
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );
      await service.runInteractive("claude-3-haiku-20240307", "/other", false);

      service.disposeAllTerminals();

      expect(mockTerminal.dispose).toHaveBeenCalledTimes(1);
      expect(mockTerminal2.dispose).toHaveBeenCalledTimes(1);
    });

    it("should handle disposing non-existent terminal", () => {
      service.disposeTerminal("non-existent-key");
      expect(mockTerminal.dispose).not.toHaveBeenCalled();
    });
  });

  describe("showTerminalSelection", () => {
    it("should show information message when no active terminals", async () => {
      (vscode.window.terminals as vscode.Terminal[]).length = 0;

      const result = await service.showTerminalSelection();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        "No active Claude terminals found",
      );
      expect(result).toBeUndefined();
    });

    it("should show single terminal automatically", async () => {
      (vscode.window.terminals as vscode.Terminal[]).push(mockTerminal);
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      const result = await service.showTerminalSelection();

      expect(mockTerminal.show).toHaveBeenCalled();
      expect(result).toBe(mockTerminal);
    });

    it("should show quick pick for multiple terminals", async () => {
      (vscode.window.terminals as vscode.Terminal[]).push(
        mockTerminal,
        mockTerminal2,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window.showQuickPick as any).mockResolvedValue({
        label: "Test Terminal",
        terminal: mockTerminal,
      });

      // Create terminals to add them to internal map
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );
      await service.runInteractive("claude-3-haiku-20240307", "/other", false);

      const result = await service.showTerminalSelection();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          { label: "Test Terminal", terminal: mockTerminal },
        ]),
        { placeHolder: "Select terminal to show" },
      );

      expect(mockTerminal.show).toHaveBeenCalled();
      expect(result).toBe(mockTerminal);
    });

    it("should return undefined when quick pick is cancelled", async () => {
      (vscode.window.terminals as vscode.Terminal[]).push(
        mockTerminal,
        mockTerminal2,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window.showQuickPick as any).mockResolvedValue(undefined);

      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );
      await service.runInteractive("claude-3-haiku-20240307", "/other", false);

      const result = await service.showTerminalSelection();

      expect(result).toBeUndefined();
    });
  });

  describe("buildClaudeCommand", () => {
    it("should build basic claude command", () => {
      const command = service.buildClaudeCommand("claude-3-5-sonnet-20241022");

      expect(command).toBe("claude --model claude-3-5-sonnet-20241022");
    });

    it("should build command with task", () => {
      const command = service.buildClaudeCommand(
        "claude-3-5-sonnet-20241022",
        "Write a test",
      );

      expect(command).toBe(
        'claude -p "Write a test" --model claude-3-5-sonnet-20241022',
      );
    });

    it("should build command with all options", () => {
      const command = service.buildClaudeCommand(
        "claude-3-5-sonnet-20241022",
        "Complex task",
        {
          allowAllTools: true,
          outputFormat: "json",
          maxTurns: 5,
          verbose: true,
        },
      );

      expect(command).toBe(
        'claude -p "Complex task" --model claude-3-5-sonnet-20241022 --output-format json --max-turns 5 --verbose --dangerously-skip-permissions',
      );
    });

    it("should not include default values", () => {
      const command = service.buildClaudeCommand(
        "claude-3-5-sonnet-20241022",
        "Simple task",
        {
          outputFormat: "text",
          maxTurns: 10,
          verbose: false,
          allowAllTools: false,
        },
      );

      expect(command).toBe(
        'claude -p "Simple task" --model claude-3-5-sonnet-20241022',
      );
    });

    it("should handle partial options", () => {
      const command = service.buildClaudeCommand(
        "claude-3-5-sonnet-20241022",
        undefined,
        {
          verbose: true,
          maxTurns: 15,
        },
      );

      expect(command).toBe(
        "claude --model claude-3-5-sonnet-20241022 --max-turns 15 --verbose",
      );
    });
  });

  describe("terminal cleanup on close", () => {
    it("should remove terminal from internal map when closed", async () => {
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );

      // Simulate terminal close by calling the cleanup handler
      const closeHandler = (vscode.window.onDidCloseTerminal as jest.Mock).mock
        .calls[0][0] as (terminal: vscode.Terminal) => void;
      closeHandler(mockTerminal);

      // The terminal should be removed from internal tracking
      (vscode.window.terminals as vscode.Terminal[]).length = 0;
      const activeTerminals = service.getActiveTerminals();
      expect(activeTerminals).toHaveLength(0);
    });

    it("should handle close event for unknown terminal", async () => {
      const unknownTerminal = { name: "Unknown Terminal" } as vscode.Terminal;

      // This should not throw an error
      const closeHandler = (vscode.window.onDidCloseTerminal as jest.Mock).mock
        .calls[0][0] as (terminal: vscode.Terminal) => void;
      expect(() => closeHandler(unknownTerminal)).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle configuration service errors", async () => {
      mockConfigService.getConfiguration.mockImplementation(() => {
        throw new Error("Configuration error");
      });

      await expect(
        service.runInteractive(
          "claude-3-5-sonnet-20241022",
          "/workspace",
          false,
        ),
      ).rejects.toThrow("Configuration error");
    });

    it("should handle claude code service errors", async () => {
      mockClaudeCodeService.buildInteractiveCommand.mockImplementation(() => {
        throw new Error("Command build error");
      });

      await expect(
        service.runInteractive(
          "claude-3-5-sonnet-20241022",
          "/workspace",
          false,
        ),
      ).rejects.toThrow("Command build error");
    });

    it("should handle terminal creation errors", async () => {
      (vscode.window.createTerminal as jest.Mock).mockImplementation(() => {
        throw new Error("Terminal creation failed");
      });

      await expect(
        service.runCommand("test command", "/workspace"),
      ).rejects.toThrow("Terminal creation failed");
    });

    it("should handle model display name errors", async () => {
      mockConfigService.getModelDisplayName.mockImplementation(() => {
        throw new Error("Model name error");
      });

      await expect(
        service.createTerminalWithModel("invalid-model", "/workspace"),
      ).rejects.toThrow("Model name error");
    });

    it("should handle quick pick errors", async () => {
      (vscode.window.terminals as vscode.Terminal[]).push(
        mockTerminal,
        mockTerminal2,
      );
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/workspace",
        false,
      );
      await service.runInteractive("claude-3-haiku-20240307", "/other", false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window.showQuickPick as any).mockRejectedValue(
        new Error("Quick pick failed"),
      );

      await expect(service.showTerminalSelection()).rejects.toThrow(
        "Quick pick failed",
      );
    });

    it("should handle terminal sendText errors", async () => {
      const errorTerminal = {
        ...mockTerminal,
        sendText: jest.fn().mockImplementation(() => {
          throw new Error("SendText failed");
        }),
      };

      (vscode.window.createTerminal as jest.Mock).mockReturnValue(
        errorTerminal,
      );

      await expect(service.runCommand("test", "/workspace")).rejects.toThrow(
        "SendText failed",
      );
    });

    it("should handle terminal show errors", async () => {
      const errorTerminal = {
        ...mockTerminal,
        sendText: jest.fn(),
        show: jest.fn().mockImplementation(() => {
          throw new Error("Show failed");
        }),
      };

      (vscode.window.createTerminal as jest.Mock).mockReturnValue(
        errorTerminal,
      );

      await expect(service.runCommand("test", "/workspace")).rejects.toThrow(
        "Show failed",
      );
    });

    it("should handle terminal disposal errors", async () => {
      // Create a mock terminal that throws when disposed
      const errorTerminal = {
        ...mockTerminal,
        dispose: jest.fn().mockImplementation(() => {
          throw new Error("Dispose failed");
        }),
      };

      // Mock createTerminal to return our error terminal
      (vscode.window.createTerminal as jest.Mock).mockReturnValueOnce(
        errorTerminal,
      );

      // Create a terminal through the public API
      await service.runInteractive(
        "claude-3-5-sonnet-20241022",
        "/test/path",
        false,
        "test prompt",
      );

      // Now try to dispose it - should throw
      const terminalKey = "claude-3-5-sonnet-20241022-/test/path";
      expect(() => service.disposeTerminal(terminalKey)).toThrow(
        "Dispose failed",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty terminal name in build command", () => {
      const command = service.buildClaudeCommand("", "test");
      expect(command).toBe('claude -p "test" --model ');
    });

    it("should handle special characters in task prompt", () => {
      const command = service.buildClaudeCommand(
        "claude-3-5-sonnet-20241022",
        'Task with "quotes" and $pecial chars',
      );

      expect(command).toBe(
        'claude -p "Task with "quotes" and $pecial chars" --model claude-3-5-sonnet-20241022',
      );
    });

    it("should handle zero max turns", () => {
      const command = service.buildClaudeCommand(
        "claude-3-5-sonnet-20241022",
        "test",
        { maxTurns: 0 },
      );

      // Zero is falsy so it won't be included in the command according to the implementation
      expect(command).toBe(
        'claude -p "test" --model claude-3-5-sonnet-20241022',
      );
    });

    it("should handle empty workspace path", async () => {
      await service.runCommand("test", "");

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: "Claude Interactive",
        cwd: "",
        iconPath: { iconName: "run" },
      });
    });

    it("should handle invalid terminal key in dispose", () => {
      expect(() => service.disposeTerminal("")).not.toThrow();
      expect(() => service.disposeTerminal("invalid-key")).not.toThrow();
    });

    it("should handle concurrent terminal creation", async () => {
      const terminal1 = { ...mockTerminal, name: "Terminal 1" };
      const terminal2 = { ...mockTerminal2, name: "Terminal 2" };
      const terminal3 = { ...mockTerminal, name: "Terminal 3" };

      (vscode.window.createTerminal as jest.Mock)
        .mockReturnValueOnce(terminal1)
        .mockReturnValueOnce(terminal2)
        .mockReturnValueOnce(terminal3);

      const promises = [
        service.runInteractive("model1", "/path1", false),
        service.runInteractive("model2", "/path2", false),
        service.runInteractive("model3", "/path3", false),
      ];

      const terminals = await Promise.all(promises);

      expect(terminals).toHaveLength(3);
      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(3);
    });

    it("should handle terminal reuse with different parameters", async () => {
      const model = "test-model";
      const rootPath = "/test/path";

      // First call
      const terminal1 = await service.runInteractive(model, rootPath, false);
      (vscode.window.terminals as vscode.Terminal[]).push(terminal1);

      // Second call with same model/path should reuse
      const terminal2 = await service.runInteractive(model, rootPath, true);

      expect(terminal1).toBe(terminal2);
      expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    });

    it("should handle empty task in buildClaudeCommand", () => {
      const command = service.buildClaudeCommand("model", "");
      expect(command).toBe("claude --model model");
    });

    it("should handle special characters in paths", async () => {
      const specialPath = "/path/with spaces/and-special chars/@#$%";

      await service.runCommand("test", specialPath);

      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: mockConfig.terminalName,
        cwd: specialPath,
        iconPath: { iconName: "run" },
      });
    });
  });
});
