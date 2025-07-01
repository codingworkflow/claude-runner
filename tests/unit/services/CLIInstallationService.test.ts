import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";
import * as fs from "fs";
import * as vscode from "vscode";

// Create a mock execAsync function
const mockExecAsync = jest.fn() as jest.MockedFunction<
  (
    command: string,
    options?: { timeout?: number },
  ) => Promise<{ stdout: string; stderr: string }>
>;

// Mock all dependencies at the top
jest.mock("fs");
jest.mock("vscode");

// Mock child_process and util together
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

// Mock promisify to return our mockExecAsync
jest.mock("util", () => ({
  promisify: jest.fn().mockReturnValue(mockExecAsync),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockVscode = vscode as jest.Mocked<typeof vscode>;

// Import the service after mocks are set up
import { CLIInstallationService } from "../../../src/services/CLIInstallationService";

// Mock VSCode context
const mockContext = {
  extensionPath: "/mock/extension/path",
  subscriptions: [],
  workspaceState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn(),
  },
  globalState: {
    get: jest.fn(),
    update: jest.fn(),
    keys: jest.fn(),
    setKeysForSync: jest.fn(),
  },
  asAbsolutePath: jest.fn(),
  storagePath: "/mock/storage",
  globalStoragePath: "/mock/global/storage",
  logPath: "/mock/log",
  extensionUri: {} as vscode.Uri,
  environmentVariableCollection: {
    getScoped: jest.fn(),
    persistent: true,
    description: "Mock environment variable collection",
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    get: jest.fn(),
    forEach: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  } as unknown as vscode.GlobalEnvironmentVariableCollection,
  extensionMode: 1,
  logUri: {} as vscode.Uri,
  storageUri: {} as vscode.Uri,
  globalStorageUri: {} as vscode.Uri,
  secrets: {} as vscode.SecretStorage,
  extension: {} as vscode.Extension<unknown>,
  languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation,
} as vscode.ExtensionContext;

describe("CLIInstallationService", () => {
  const originalEnv = process.env;
  const mockCLIPath = "/mock/extension/path/cli/claude-runner";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    // Default mock implementations
    mockFs.existsSync.mockImplementation((path) => {
      if (path === mockCLIPath) {
        return true;
      }
      if (path === "/usr/local/bin") {
        return true;
      }
      return false;
    });

    mockFs.chmodSync.mockImplementation(() => {});
    mockFs.symlinkSync.mockImplementation(() => {});
    mockFs.unlinkSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => "");
    mockFs.readFileSync.mockReturnValue("");
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.appendFileSync.mockImplementation(() => {});

    // Mock execAsync to return success by default
    mockExecAsync.mockResolvedValue({
      stdout: "Claude Runner CLI --help",
      stderr: "",
    });

    // Setup VSCode mocks with proper return types
    mockVscode.window.showInformationMessage.mockResolvedValue(undefined);
    mockVscode.window.showWarningMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("setupCLI", () => {
    it("should successfully set up CLI when file exists and is accessible", async () => {
      // Mock successful file operations
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      // Mock successful CLI access test
      mockExecAsync.mockResolvedValue({
        stdout: "Claude Runner CLI --help",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.existsSync).toHaveBeenCalledWith(mockCLIPath);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(mockCLIPath, 0o755);
      expect(mockExecAsync).toHaveBeenCalledWith("claude-runner --help", {
        timeout: 5000,
      });
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Claude Runner CLI is now available in terminal. Try: claude-runner --help",
        { modal: false },
      );
    });

    it("should handle missing CLI file gracefully", async () => {
      const consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      mockFs.existsSync.mockReturnValue(false);

      await CLIInstallationService.setupCLI(mockContext);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Claude Runner CLI not found in extension package",
      );
      expect(mockFs.chmodSync).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should handle chmod errors gracefully", async () => {
      const consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const chmodError = new Error("Permission denied");
      mockFs.existsSync.mockReturnValue(true);
      mockFs.chmodSync.mockImplementation(() => {
        throw chmodError;
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Could not make CLI executable:",
        chmodError,
      );

      consoleWarnSpy.mockRestore();
    });

    it("should show manual instructions when CLI access test fails", async () => {
      // Mock successful file operations so addToPath succeeds
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockExecAsync).toHaveBeenCalledWith("claude-runner --help", {
        timeout: 5000,
      });
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );
    });

    it("should handle general setup errors silently", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const setupError = new Error("General setup failure");
      mockFs.existsSync.mockImplementation(() => {
        throw setupError;
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to setup Claude Runner CLI:",
        setupError,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Installation path resolution across platforms", () => {
    it("should create symlink in /usr/local/bin when directory exists", async () => {
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        return path === "/usr/local/bin" || path === mockCLIPath;
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.symlinkSync).toHaveBeenCalledWith(
        mockCLIPath,
        "/usr/local/bin/claude-runner",
      );
    });

    it("should fall back to user bin directory when /usr/local/bin unavailable", async () => {
      process.env.HOME = "/home/user";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        return false;
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith("/home/user/.local/bin", {
        recursive: true,
      });
      expect(mockFs.symlinkSync).toHaveBeenCalledWith(
        mockCLIPath,
        "/home/user/.local/bin/claude-runner",
      );
    });

    it("should use USERPROFILE on Windows when HOME unavailable", async () => {
      delete process.env.HOME;
      process.env.USERPROFILE = "C:\\Users\\TestUser";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        return false;
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        "C:\\Users\\TestUser/.local/bin",
        { recursive: true },
      );
    });

    it("should resolve correct CLI path from extension context", async () => {
      const customContext = {
        ...mockContext,
        extensionPath: "/custom/extension/path",
      };

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/custom/extension/path/cli/claude-runner") {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });
      mockExecAsync.mockResolvedValue({
        stdout: "Claude Runner CLI",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(customContext);

      expect(mockFs.chmodSync).toHaveBeenCalledWith(
        "/custom/extension/path/cli/claude-runner",
        0o755,
      );
      expect(mockFs.symlinkSync).toHaveBeenCalledWith(
        "/custom/extension/path/cli/claude-runner",
        "/usr/local/bin/claude-runner",
      );
    });

    it("should handle platform-specific path separators", async () => {
      process.env.HOME = "/home/user";
      process.env.USERPROFILE = "C:\\Users\\TestUser";

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        return false;
      });
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await CLIInstallationService.setupCLI(mockContext);

      // Should use the correct path based on available environment variables
      expect(mockFs.mkdirSync).toHaveBeenCalledWith("/home/user/.local/bin", {
        recursive: true,
      });
    });

    it("should fall back to shell profile when directories fail", async () => {
      process.env.HOME = "/home/user";
      process.env.SHELL = "/bin/bash";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/home/user/.bashrc") {
          return true;
        }
        return false;
      });

      mockFs.symlinkSync.mockImplementation(() => {
        throw new Error("Symlink failed");
      });
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error("mkdir failed");
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        "/home/user/.bashrc",
        '\n# Claude Runner CLI\nalias claude-runner="/mock/extension/path/cli/claude-runner"\n',
      );
    });

    it("should handle missing home directory gracefully", async () => {
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      // Mock CLI access test failure
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return true; // /usr/local/bin exists
        }
        if (path === mockCLIPath) {
          return true;
        }
        return false;
      });

      await CLIInstallationService.setupCLI(mockContext);

      // Should fall back to /usr/local/bin when home dir is unavailable
      expect(mockFs.symlinkSync).toHaveBeenCalledWith(
        mockCLIPath,
        "/usr/local/bin/claude-runner",
      );
    });
  });

  describe("Installation failure handling and recovery", () => {
    it("should try multiple strategies when first strategy fails", async () => {
      process.env.HOME = "/home/user";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return true;
        }
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/home/user/.bashrc") {
          return true;
        }
        return false;
      });

      // Make first strategy fail
      mockFs.symlinkSync.mockImplementationOnce(() => {
        throw new Error("Permission denied");
      });

      await CLIInstallationService.setupCLI(mockContext);

      // Should have attempted multiple strategies
      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });

    it("should remove existing symlinks before creating new ones", async () => {
      const symlinkPath = "/usr/local/bin/claude-runner";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        return (
          path === "/usr/local/bin" ||
          path === mockCLIPath ||
          path === symlinkPath
        );
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(symlinkPath);
      expect(mockFs.symlinkSync).toHaveBeenCalledWith(mockCLIPath, symlinkPath);
    });

    it("should update existing alias in shell profile", async () => {
      process.env.HOME = "/home/user";
      process.env.SHELL = "/bin/bash";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/home/user/.bashrc") {
          return true;
        }
        return false;
      });

      mockFs.symlinkSync.mockImplementation(() => {
        throw new Error("Symlink failed");
      });
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error("mkdir failed");
      });

      const existingContent =
        'export PATH=$PATH:/usr/local/bin\nalias claude-runner="/old/path/cli"\necho "Profile loaded"';
      mockFs.readFileSync.mockReturnValue(existingContent);

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/home/user/.bashrc",
        expect.stringContaining(
          'alias claude-runner="/mock/extension/path/cli/claude-runner"',
        ),
      );
    });
  });

  describe("Version compatibility checking", () => {
    it("should validate CLI access with help command", async () => {
      const helpOutput =
        "Claude Runner CLI v1.0.0\nUsage: claude-runner [options]";

      // Mock successful file operations so addToPath succeeds
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockResolvedValue({
        stdout: helpOutput,
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockExecAsync).toHaveBeenCalledWith("claude-runner --help", {
        timeout: 5000,
      });
    });

    it("should handle CLI access timeout", async () => {
      const timeoutError = new Error("Command timeout");

      // Mock successful file operations so addToPath succeeds
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockRejectedValue(timeoutError);

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockExecAsync).toHaveBeenCalledWith("claude-runner --help", {
        timeout: 5000,
      });
    });

    it("should detect invalid CLI response", async () => {
      // Mock successful file operations so addToPath succeeds
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockResolvedValue({
        stdout: "Some other command output",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );
    });
  });

  describe("Installation status reporting", () => {
    it("should show success message when CLI is accessible", async () => {
      // Mock successful file operations so addToPath succeeds
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockResolvedValue({
        stdout: "Claude Runner CLI --help",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Claude Runner CLI is now available in terminal. Try: claude-runner --help",
        { modal: false },
      );
    });

    it("should show manual instructions when automated setup fails", async () => {
      // Mock successful file operations so addToPath succeeds
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockVscode.window.showWarningMessage.mockResolvedValue(undefined);

      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );
    });

    it("should report installation status correctly when CLI test succeeds", async () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockResolvedValue({
        stdout: "Claude Runner CLI v1.2.3\nUsage: claude-runner [options]",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockExecAsync).toHaveBeenCalledWith("claude-runner --help", {
        timeout: 5000,
      });
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        "Claude Runner CLI is now available in terminal. Try: claude-runner --help",
        { modal: false },
      );
    });

    it("should report installation status correctly when CLI test fails", async () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );
      expect(mockVscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it("should handle CLI validation with timeout", async () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockRejectedValue(new Error("Operation timed out"));

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockExecAsync).toHaveBeenCalledWith("claude-runner --help", {
        timeout: 5000,
      });
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it("should validate CLI output contains expected signature", async () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      // Test with output that doesn't contain "Claude Runner CLI"
      mockExecAsync.mockResolvedValue({
        stdout: "Some other CLI tool help output",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );
    });

    it("should show warning message with correct parameters", async () => {
      const customPath = "/custom/ext/path";
      const customContext = {
        ...mockContext,
        extensionPath: customPath,
      };

      mockFs.existsSync.mockImplementation((path) => {
        if (path === `${customPath}/cli/claude-runner`) {
          return true;
        }
        if (path === "/usr/local/bin") {
          return true;
        }
        return false;
      });

      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await CLIInstallationService.setupCLI(customContext);

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );
    });
  });

  describe("Shell profile detection", () => {
    it("should prioritize zsh profile for zsh shell", async () => {
      process.env.HOME = "/home/user";
      process.env.SHELL = "/bin/zsh";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/home/user/.zshrc") {
          return true;
        }
        return false;
      });

      mockFs.symlinkSync.mockImplementation(() => {
        throw new Error("Symlink failed");
      });
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error("mkdir failed");
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        "/home/user/.zshrc",
        expect.stringContaining("alias claude-runner="),
      );
    });

    it("should handle fish shell configuration", async () => {
      process.env.HOME = "/home/user";
      process.env.SHELL = "/usr/bin/fish";
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/home/user/.config/fish/config.fish") {
          return true;
        }
        return false;
      });

      mockFs.symlinkSync.mockImplementation(() => {
        throw new Error("Symlink failed");
      });
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error("mkdir failed");
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        "/home/user/.config/fish/config.fish",
        expect.stringContaining("alias claude-runner="),
      );
    });

    it("should fall back to bash profiles when shell unknown", async () => {
      process.env.HOME = "/home/user";
      delete process.env.SHELL;
      // Mock CLI access test failure to avoid success message
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      mockFs.existsSync.mockImplementation((path) => {
        if (path === "/usr/local/bin") {
          return false;
        }
        if (path === mockCLIPath) {
          return true;
        }
        if (path === "/home/user/.bashrc") {
          return true;
        }
        return false;
      });

      mockFs.symlinkSync.mockImplementation(() => {
        throw new Error("Symlink failed");
      });
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error("mkdir failed");
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        "/home/user/.bashrc",
        expect.stringContaining("alias claude-runner="),
      );
    });
  });

  describe("cleanupCLI", () => {
    it("should remove symlinks during cleanup", async () => {
      process.env.HOME = "/home/user";

      mockFs.existsSync.mockImplementation((path) => {
        return (
          path === "/usr/local/bin/claude-runner" ||
          path === "/home/user/.local/bin/claude-runner"
        );
      });

      await CLIInstallationService.cleanupCLI();

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        "/usr/local/bin/claude-runner",
      );
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        "/home/user/.local/bin/claude-runner",
      );
    });

    it("should handle cleanup errors gracefully", async () => {
      process.env.HOME = "/home/user";

      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      // Should not throw
      await expect(
        CLIInstallationService.cleanupCLI(),
      ).resolves.toBeUndefined();
    });

    it("should skip non-existent symlinks during cleanup", async () => {
      process.env.HOME = "/home/user";
      mockFs.existsSync.mockReturnValue(false);

      await CLIInstallationService.cleanupCLI();

      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it("should handle missing HOME environment variable during cleanup", async () => {
      delete process.env.HOME;

      mockFs.existsSync.mockImplementation((path) => {
        return path === "/usr/local/bin/claude-runner";
      });

      await CLIInstallationService.cleanupCLI();

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        "/usr/local/bin/claude-runner",
      );
      // Should handle the empty home path gracefully
    });
  });
});
