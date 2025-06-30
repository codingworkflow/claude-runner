import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";
import { CLIInstallationService } from "../../../src/services/CLIInstallationService";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

// Mock all dependencies at the top
jest.mock("fs");
jest.mock("child_process");
jest.mock("util");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPromisify = promisify as jest.MockedFunction<typeof promisify>;

// Create a mock execAsync function
const mockExecAsync = jest.fn();

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
  environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
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

    // Setup promisify mock
    mockPromisify.mockReturnValue(mockExecAsync as typeof exec);

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
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("setupCLI", () => {
    it("should successfully set up CLI when file exists and is accessible", async () => {
      const vscodeModule = await import("vscode");
      mockFs.existsSync.mockReturnValue(true);

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockFs.existsSync).toHaveBeenCalledWith(mockCLIPath);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(mockCLIPath, 0o755);
      expect(vscodeModule.window.showInformationMessage).toHaveBeenCalledWith(
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
      const vscodeModule = await import("vscode");
      mockFs.existsSync.mockReturnValue(true);
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await CLIInstallationService.setupCLI(mockContext);

      expect(vscodeModule.window.showWarningMessage).toHaveBeenCalledWith(
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
        "C:\\Users\\TestUser\\.local\\bin",
        { recursive: true },
      );
    });

    it("should fall back to shell profile when directories fail", async () => {
      process.env.HOME = "/home/user";
      process.env.SHELL = "/bin/bash";

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

      // Should not throw and should handle gracefully
      expect(mockFs.symlinkSync).toHaveBeenCalledWith(
        mockCLIPath,
        "/usr/local/bin/claude-runner",
      );
    });
  });

  describe("Installation failure handling and recovery", () => {
    it("should try multiple strategies when first strategy fails", async () => {
      process.env.HOME = "/home/user";

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
      mockExecAsync.mockRejectedValue(timeoutError);

      await CLIInstallationService.setupCLI(mockContext);

      expect(mockExecAsync).toHaveBeenCalledWith("claude-runner --help", {
        timeout: 5000,
      });
    });

    it("should detect invalid CLI response", async () => {
      const vscodeModule = await import("vscode");
      mockExecAsync.mockResolvedValue({
        stdout: "Some other command output",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(vscodeModule.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );
    });
  });

  describe("Installation status reporting", () => {
    it("should show success message when CLI is accessible", async () => {
      const vscodeModule = await import("vscode");
      mockExecAsync.mockResolvedValue({
        stdout: "Claude Runner CLI --help",
        stderr: "",
      });

      await CLIInstallationService.setupCLI(mockContext);

      expect(vscodeModule.window.showInformationMessage).toHaveBeenCalledWith(
        "Claude Runner CLI is now available in terminal. Try: claude-runner --help",
        { modal: false },
      );
    });

    it("should show manual instructions when automated setup fails", async () => {
      const vscodeModule = await import("vscode");
      vscodeModule.window.showWarningMessage.mockResolvedValue(
        "Show Instructions",
      );

      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await CLIInstallationService.setupCLI(mockContext);

      expect(vscodeModule.window.showWarningMessage).toHaveBeenCalledWith(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      );

      // Simulate user clicking "Show Instructions"
      const showInstructionsCall =
        vscodeModule.window.showWarningMessage.mock.calls[0];
      if (showInstructionsCall) {
        const [, buttonText] = showInstructionsCall;
        expect(buttonText).toBe("Show Instructions");
      }
    });
  });

  describe("Shell profile detection", () => {
    it("should prioritize zsh profile for zsh shell", async () => {
      process.env.HOME = "/home/user";
      process.env.SHELL = "/bin/zsh";

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
