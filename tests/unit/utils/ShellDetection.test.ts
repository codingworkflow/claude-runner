// Mock child_process with a factory function
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

// Create a module-level mock that can be controlled from tests
const mockExecAsync = jest.fn();

// Mock util.promisify to always return our controlled mock
jest.mock("util", () => {
  const originalUtil = jest.requireActual("util");
  return {
    ...originalUtil,
    promisify: jest.fn(() => mockExecAsync),
  };
});

import { ShellDetection } from "../../../src/utils/ShellDetection";
import type { ShellDetectionOptions } from "../../../src/utils/ShellDetection";

// Extended options type for testing invalid shell values
type TestShellDetectionOptions = Omit<
  ShellDetectionOptions,
  "preferredShell"
> & {
  preferredShell?: ShellDetectionOptions["preferredShell"] | "invalid";
};

describe("ShellDetection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("runCommand", () => {
    describe("preferred shell execution", () => {
      it("should execute command with preferred bash shell successfully", async () => {
        const mockStdout = "command output";
        mockExecAsync.mockResolvedValue({ stdout: mockStdout, stderr: "" });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "bash",
          timeout: 5000,
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: true,
          output: "command output",
          shellUsed: "bash (/bin/bash)",
        });
        expect(mockExecAsync).toHaveBeenCalledWith("test command", {
          timeout: 5000,
          env: process.env,
          shell: "/bin/bash",
        });
      });

      it("should execute command with preferred zsh shell successfully", async () => {
        const mockStdout = "zsh output";
        mockExecAsync.mockResolvedValue({ stdout: mockStdout, stderr: "" });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "zsh",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: true,
          output: "zsh output",
          shellUsed: "zsh (/bin/zsh)",
        });
        expect(mockExecAsync).toHaveBeenCalledWith("test command", {
          timeout: 10000,
          env: process.env,
          shell: "/bin/zsh",
        });
      });

      it("should execute command with preferred fish shell successfully", async () => {
        const mockStdout = "fish output";
        mockExecAsync.mockResolvedValue({ stdout: mockStdout, stderr: "" });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "fish",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: true,
          output: "fish output",
          shellUsed: "fish (/usr/local/bin/fish)",
        });
      });

      it("should execute command with preferred sh shell successfully", async () => {
        const mockStdout = "sh output";
        mockExecAsync.mockResolvedValue({ stdout: mockStdout, stderr: "" });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "sh",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: true,
          output: "sh output",
          shellUsed: "sh (/bin/sh)",
        });
      });

      it("should fall back to auto mode when preferred shell fails", async () => {
        let callCount = 0;
        mockExecAsync.mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call (preferred shell) fails
            return Promise.reject(new Error("Shell not found"));
          } else {
            // Subsequent calls (auto mode) succeed
            return Promise.resolve({ stdout: "auto mode output", stderr: "" });
          }
        });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "bash",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result.success).toBe(true);
        expect(result.output).toBe("auto mode output");
        expect(mockExecAsync).toHaveBeenCalledTimes(6); // 1 for preferred + 5 for auto mode
      });

      it("should handle whitespace in command output", async () => {
        const mockStdout = "  output with whitespace  ";
        mockExecAsync.mockResolvedValue({ stdout: mockStdout, stderr: "" });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "bash",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result.output).toBe("output with whitespace");
      });
    });

    describe("auto mode execution", () => {
      it("should try multiple shells in parallel and return first successful result", async () => {
        mockExecAsync.mockImplementation((command, options) => {
          // Simulate bash succeeding first
          if (
            options &&
            typeof options === "object" &&
            "shell" in options &&
            options.shell === "/bin/bash"
          ) {
            return Promise.resolve({ stdout: "bash success", stderr: "" });
          } else {
            return Promise.reject(new Error("Shell failed"));
          }
        });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "auto",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: true,
          output: "bash success",
          shellUsed: "bash (/bin/bash)",
        });
      });

      it("should try all shells when auto mode is default", async () => {
        mockExecAsync.mockImplementation((command, options) => {
          // Simulate zsh succeeding fastest
          if (
            options &&
            typeof options === "object" &&
            "shell" in options &&
            options.shell === "/bin/zsh"
          ) {
            return Promise.resolve({ stdout: "zsh success", stderr: "" });
          } else {
            // Other shells fail slower
            return new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Shell failed")), 100);
            });
          }
        });

        const options: ShellDetectionOptions = {
          command: "test command",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: true,
          output: "zsh success",
          shellUsed: "zsh (/bin/zsh)",
        });
      });

      it("should handle fish shell with different paths", async () => {
        mockExecAsync.mockImplementation((command, options) => {
          // Simulate Apple Silicon fish succeeding fastest
          if (
            options &&
            typeof options === "object" &&
            "shell" in options &&
            options.shell === "/opt/homebrew/bin/fish"
          ) {
            return Promise.resolve({
              stdout: "fish apple silicon",
              stderr: "",
            });
          } else {
            // Other shells fail slower
            return new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Shell failed")), 100);
            });
          }
        });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "auto",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: true,
          output: "fish apple silicon",
          shellUsed: "fish (/opt/homebrew/bin/fish)",
        });
      });
    });

    describe("error handling", () => {
      it("should return error when all shells fail", async () => {
        mockExecAsync.mockRejectedValue(new Error("Command not found"));

        const options: ShellDetectionOptions = {
          command: "nonexistent-command",
          preferredShell: "auto",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result).toEqual({
          success: false,
          error: "Command failed with all available shells",
        });
      });

      it("should handle timeout errors", async () => {
        mockExecAsync.mockRejectedValue(new Error("Command timed out"));

        const options: ShellDetectionOptions = {
          command: "slow-command",
          timeout: 100,
        };

        const result = await ShellDetection.runCommand(options);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Command failed with all available shells");
      }, 10000);

      it("should handle invalid preferred shell gracefully", async () => {
        mockExecAsync.mockImplementation((command, options) => {
          // Auto mode should kick in - bash succeeds
          if (
            options &&
            typeof options === "object" &&
            "shell" in options &&
            options.shell === "/bin/bash"
          ) {
            return Promise.resolve({ stdout: "bash fallback", stderr: "" });
          } else {
            return Promise.reject(new Error("Shell failed"));
          }
        });

        const options: TestShellDetectionOptions = {
          command: "test command",
          preferredShell: "invalid",
        };

        const result = await ShellDetection.runCommand(
          options as ShellDetectionOptions,
        );

        expect(result).toEqual({
          success: true,
          output: "bash fallback",
          shellUsed: "bash (/bin/bash)",
        });
      });
    });

    describe("shell path resolution", () => {
      it("should use correct shell paths for different shell types", async () => {
        const shellTests = [
          { shell: "bash", expectedPath: "/bin/bash" },
          { shell: "zsh", expectedPath: "/bin/zsh" },
          { shell: "fish", expectedPath: "/usr/local/bin/fish" },
          { shell: "sh", expectedPath: "/bin/sh" },
        ] as const;

        for (const { shell, expectedPath } of shellTests) {
          mockExecAsync.mockClear();
          mockExecAsync.mockResolvedValue({
            stdout: `${shell} output`,
            stderr: "",
          });

          const options: ShellDetectionOptions = {
            command: "test command",
            preferredShell: shell,
          };

          await ShellDetection.runCommand(options);

          expect(mockExecAsync).toHaveBeenCalledWith("test command", {
            timeout: 10000,
            env: process.env,
            shell: expectedPath,
          });
        }
      });
    });

    describe("shell compatibility checking", () => {
      it("should verify shell availability through execution", async () => {
        mockExecAsync.mockImplementation((command, options) => {
          const shellPath =
            options && typeof options === "object" && "shell" in options
              ? options.shell
              : "";

          if (shellPath === "/bin/bash") {
            return Promise.resolve({ stdout: "bash available", stderr: "" });
          } else {
            return Promise.reject(new Error("Shell not available"));
          }
        });

        const options: ShellDetectionOptions = {
          command: "echo test",
          preferredShell: "bash",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result.success).toBe(true);
        expect(result.shellUsed).toBe("bash (/bin/bash)");
      });

      it("should detect incompatible shells and try alternatives", async () => {
        mockExecAsync.mockImplementation((command, options) => {
          const shellPath =
            options && typeof options === "object" && "shell" in options
              ? options.shell
              : "";

          if (shellPath === "/bin/zsh") {
            // zsh fails
            return Promise.reject(new Error("zsh not compatible"));
          } else if (shellPath === "/bin/bash") {
            // bash succeeds
            return Promise.resolve({ stdout: "bash compatible", stderr: "" });
          } else {
            return Promise.reject(new Error("Shell failed"));
          }
        });

        const options: ShellDetectionOptions = {
          command: "test command",
          preferredShell: "zsh",
        };

        const result = await ShellDetection.runCommand(options);

        expect(result.success).toBe(true);
        expect(result.shellUsed).toBe("bash (/bin/bash)");
      });
    });
  });

  describe("checkClaudeInstallation", () => {
    it("should return true when Claude CLI is available", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "claude 1.0.0", stderr: "" });

      const result = await ShellDetection.checkClaudeInstallation();

      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
        timeout: 10000,
        env: process.env,
        shell: "/bin/bash",
      });
    });

    it("should return false when Claude CLI is not available", async () => {
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      const result = await ShellDetection.checkClaudeInstallation();

      expect(result).toBe(false);
    });

    it("should use preferred shell for Claude installation check", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "claude 1.0.0", stderr: "" });

      await ShellDetection.checkClaudeInstallation("zsh");

      expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
        timeout: 10000,
        env: process.env,
        shell: "/bin/zsh",
      });
    });
  });

  describe("getClaudeVersion", () => {
    it("should return successful result with Claude version", async () => {
      const versionOutput = "claude 1.2.3";
      mockExecAsync.mockResolvedValue({ stdout: versionOutput, stderr: "" });

      const result = await ShellDetection.getClaudeVersion();

      expect(result).toEqual({
        success: true,
        output: "claude 1.2.3",
        shellUsed: "bash (/bin/bash)",
      });
      expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
        timeout: 2000,
        env: process.env,
        shell: "/bin/bash",
      });
    });

    it("should return error result when Claude version command fails", async () => {
      mockExecAsync.mockRejectedValue(new Error("Command failed"));

      const result = await ShellDetection.getClaudeVersion();

      expect(result).toEqual({
        success: false,
        error: "Command failed with all available shells",
      });
    });

    it("should use preferred shell for version detection", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "claude 1.0.0", stderr: "" });

      await ShellDetection.getClaudeVersion("fish");

      expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
        timeout: 2000,
        env: process.env,
        shell: "/usr/local/bin/fish",
      });
    });

    it("should use shorter timeout for version detection", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "claude 1.0.0", stderr: "" });

      await ShellDetection.getClaudeVersion();

      expect(mockExecAsync).toHaveBeenCalledWith(
        "claude --version",
        expect.objectContaining({
          timeout: 2000,
        }),
      );
    });
  });
});
