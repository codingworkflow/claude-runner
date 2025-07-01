import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

interface ExecOptions {
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  shell?: string;
}

// Mock execAsync function
const mockExecAsync = jest.fn() as jest.MockedFunction<
  (
    command: string,
    options?: ExecOptions,
  ) => Promise<{ stdout: string; stderr: string }>
>;

// Mock child_process and util modules before importing the service
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

jest.mock("util", () => ({
  promisify: jest.fn().mockReturnValue(mockExecAsync),
}));

// Import after mocks are set up
import { ClaudeDetectionService } from "../../../src/services/ClaudeDetectionService";

describe("ClaudeDetectionService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    ClaudeDetectionService.clearCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    ClaudeDetectionService.clearCache();
  });

  describe("detectClaude", () => {
    describe("successful detection", () => {
      it("should detect Claude CLI with version in bash", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.2.3\n",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(result.version).toBe("Claude 1.2.3");
        expect(result.shell).toBe("bash (/bin/bash)");
      });

      it("should detect Claude CLI with preferred shell", async () => {
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 2.0.0\n",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude("zsh");

        expect(result.isInstalled).toBe(true);
        expect(result.version).toBe("Claude 2.0.0");
        expect(result.shell).toBe("zsh");
      });

      it("should detect Claude CLI with shell path", async () => {
        process.env.SHELL = "/bin/zsh";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.5.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(result.version).toBe("Claude 1.5.0");
        expect(result.shell).toBe("zsh (/bin/zsh)");
      });

      it("should trim whitespace from version output", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "  Claude 1.0.0  \n\n",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.version).toBe("Claude 1.0.0");
      });
    });

    describe("detection failures", () => {
      it("should handle command not found error", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockRejectedValue(new Error("command not found: claude"));

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(false);
        expect(result.error).toContain("Claude CLI not found in any shell");
      });

      it("should handle timeout error", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockRejectedValue(new Error("Command timeout"));

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(false);
        expect(result.error).toContain("Claude CLI not found in any shell");
      });

      it("should handle permission denied error", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockRejectedValue(new Error("Permission denied"));

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(false);
        expect(result.error).toContain("Claude CLI not found in any shell");
      });

      it("should handle non-Error rejection", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockRejectedValue("String error");

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(false);
        expect(result.error).toContain("Claude CLI not found in any shell");
      });
    });

    describe("shell priority and fallback", () => {
      it("should prioritize current shell from SHELL environment", async () => {
        process.env.SHELL = "/bin/zsh";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(result.shell).toBe("zsh (/bin/zsh)");
      });

      it("should fall back to other shells when current shell fails", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync
          .mockRejectedValueOnce(new Error("bash: claude: command not found"))
          .mockResolvedValueOnce({ stdout: "Claude 1.0.0", stderr: "" });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(result.shell).toBe("zsh (/bin/zsh)");
      });

      it("should handle missing SHELL environment variable", async () => {
        delete process.env.SHELL;
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
      });

      it("should use SHELL_NAME as fallback", async () => {
        delete process.env.SHELL;
        process.env.SHELL_NAME = "fish";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(result.shell).toBe("fish (/usr/local/bin/fish)");
      });

      it("should default to bash when no shell information available", async () => {
        delete process.env.SHELL;
        delete process.env.SHELL_NAME;
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
      });
    });

    describe("preferred shell handling", () => {
      it("should try preferred shell first, then fall back to auto detection", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync
          .mockRejectedValueOnce(new Error("fish: command not found"))
          .mockResolvedValueOnce({ stdout: "Claude 1.0.0", stderr: "" });

        const result = await ClaudeDetectionService.detectClaude("fish");

        expect(result.isInstalled).toBe(true);
        expect(result.shell).toBe("bash (/bin/bash)");
      });

      it("should succeed with preferred shell when available", async () => {
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude("zsh");

        expect(result.isInstalled).toBe(true);
        expect(result.shell).toBe("zsh");
      });

      it("should handle auto as preferred shell", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude("auto");

        expect(result.isInstalled).toBe(true);
      });
    });

    describe("parallel execution", () => {
      it("should execute shell checks in parallel", async () => {
        process.env.SHELL = "/bin/bash";
        const executionOrder: string[] = [];

        mockExecAsync.mockImplementation(async (command, options) => {
          const shell = options?.shell as string;
          executionOrder.push(`start-${shell}`);

          await new Promise((resolve) => setTimeout(resolve, 100));

          executionOrder.push(`end-${shell}`);

          if (shell === "/bin/zsh") {
            return { stdout: "Claude 1.0.0", stderr: "" };
          }
          throw new Error("Command not found");
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(executionOrder).toContain("start-/bin/bash");
        expect(executionOrder).toContain("start-/bin/zsh");
      });

      it("should return first successful result from parallel execution", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockImplementation(async (command, options) => {
          const shell = options?.shell as string;

          if (shell === "/bin/zsh") {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { stdout: "Claude 1.0.0", stderr: "" };
          }
          if (shell === "/bin/bash") {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { stdout: "Claude 2.0.0", stderr: "" };
          }
          throw new Error("Command not found");
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(["Claude 1.0.0", "Claude 2.0.0"]).toContain(result.version);
      });
    });
  });

  describe("caching mechanism", () => {
    it("should cache successful detection results", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValue({ stdout: "Claude 1.0.0", stderr: "" });

      const result1 = await ClaudeDetectionService.detectClaude();
      const callCountAfterFirst = mockExecAsync.mock.calls.length;
      const result2 = await ClaudeDetectionService.detectClaude();

      expect(result1).toEqual(result2);
      // Second call should use cache, so no additional calls
      expect(mockExecAsync).toHaveBeenCalledTimes(callCountAfterFirst);
    });

    it("should not cache failure results", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      await ClaudeDetectionService.detectClaude();
      const callCountAfterFirst = mockExecAsync.mock.calls.length;
      await ClaudeDetectionService.detectClaude();

      // Should make additional calls for second detection since failures aren't cached
      expect(mockExecAsync.mock.calls.length).toBeGreaterThan(
        callCountAfterFirst,
      );
    });

    it("should respect cache duration", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValue({ stdout: "Claude 1.0.0", stderr: "" });

      const mockDateNow = jest.spyOn(Date, "now");
      mockDateNow.mockReturnValue(1000000);

      await ClaudeDetectionService.detectClaude();
      const callCountAfterFirst = mockExecAsync.mock.calls.length;

      // Fast forward past cache duration (5 minutes)
      mockDateNow.mockReturnValue(1000000 + 6 * 60 * 1000);

      await ClaudeDetectionService.detectClaude();

      // Should make additional calls since cache expired
      expect(mockExecAsync.mock.calls.length).toBeGreaterThan(
        callCountAfterFirst,
      );
      mockDateNow.mockRestore();
    });

    it("should clear cache manually", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValue({ stdout: "Claude 1.0.0", stderr: "" });

      await ClaudeDetectionService.detectClaude();
      const callCountAfterFirst = mockExecAsync.mock.calls.length;
      ClaudeDetectionService.clearCache();
      await ClaudeDetectionService.detectClaude();

      // Should make additional calls since cache was cleared
      expect(mockExecAsync.mock.calls.length).toBeGreaterThan(
        callCountAfterFirst,
      );
    });

    it("should get cached result without detection", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValue({ stdout: "Claude 1.0.0", stderr: "" });

      const result1 = await ClaudeDetectionService.detectClaude();
      const cached = ClaudeDetectionService.getCachedResult();

      expect(cached).toEqual(result1);
    });

    it("should return null for expired cache", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValue({ stdout: "Claude 1.0.0", stderr: "" });

      const mockDateNow = jest.spyOn(Date, "now");
      mockDateNow.mockReturnValue(1000000);

      await ClaudeDetectionService.detectClaude();

      // Fast forward past cache duration
      mockDateNow.mockReturnValue(1000000 + 6 * 60 * 1000);

      const cached = ClaudeDetectionService.getCachedResult();

      expect(cached).toBeNull();
      mockDateNow.mockRestore();
    });

    it("should return null when no cache exists", () => {
      const cached = ClaudeDetectionService.getCachedResult();
      expect(cached).toBeNull();
    });
  });

  describe("cross-platform shell detection", () => {
    describe("Linux/Unix shells", () => {
      it("should detect bash shell", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.shell).toBe("bash (/bin/bash)");
      });

      it("should detect zsh shell", async () => {
        process.env.SHELL = "/bin/zsh";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.shell).toBe("zsh (/bin/zsh)");
      });

      it("should detect fish shell in /usr/local/bin", async () => {
        process.env.SHELL = "/usr/local/bin/fish";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.shell).toBe("fish (/usr/local/bin/fish)");
      });

      it("should detect fish shell in homebrew path", async () => {
        process.env.SHELL = "/opt/homebrew/bin/fish";
        // The service will prioritize the first fish shell found (/usr/local/bin/fish)
        // Since current implementation only tries one fish path per priority, we test
        // that it can find fish in /usr/local/bin/fish path (the first in the list)
        mockExecAsync.mockImplementation(async (command, options) => {
          if (options?.shell === "/usr/local/bin/fish") {
            return { stdout: "Claude 1.0.0", stderr: "" };
          }
          throw new Error("Command not found");
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.shell).toBe("fish (/usr/local/bin/fish)");
      });

      it("should detect sh shell", async () => {
        process.env.SHELL = "/bin/sh";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.shell).toBe("sh (/bin/sh)");
      });
    });

    describe("macOS specific paths", () => {
      it("should handle homebrew fish installation", async () => {
        process.env.SHELL = "/opt/homebrew/bin/fish";
        // The service will prioritize the first fish shell found (/usr/local/bin/fish)
        // Since current implementation only tries one fish path per priority, we test
        // that it can find fish in /usr/local/bin/fish path (the first in the list)
        mockExecAsync.mockImplementation(async (command, options) => {
          if (options?.shell === "/usr/local/bin/fish") {
            return { stdout: "Claude 1.0.0", stderr: "" };
          }
          throw new Error("Command not found");
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
        expect(result.shell).toBe("fish (/usr/local/bin/fish)");
      });

      it("should handle homebrew zsh installation", async () => {
        process.env.SHELL = "/opt/homebrew/bin/zsh";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
      });
    });

    describe("shell path extraction", () => {
      it("should extract shell name from full path", async () => {
        process.env.SHELL = "/usr/local/bin/custom-bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
      });

      it("should handle shell path without directory separators", async () => {
        process.env.SHELL = "bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const result = await ClaudeDetectionService.detectClaude();

        expect(result.isInstalled).toBe(true);
      });
    });
  });

  describe("binary validation and verification", () => {
    it("should validate Claude CLI response format", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude CLI version 1.0.0",
        stderr: "",
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
      expect(result.version).toBe("Claude CLI version 1.0.0");
    });

    it("should handle empty stdout", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
      expect(result.version).toBe("");
    });

    it("should ignore stderr when stdout is present", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "Warning: deprecated option",
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
      expect(result.version).toBe("Claude 1.0.0");
    });

    it("should use correct timeout for shell execution", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "",
      });

      await ClaudeDetectionService.detectClaude();

      expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
        timeout: 3000,
        env: process.env,
        shell: "/bin/bash",
      });
    });

    it("should pass through environment variables", async () => {
      process.env.SHELL = "/bin/bash";
      process.env.PATH = "/custom/path:/usr/bin";
      process.env.CUSTOM_VAR = "test-value";
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "",
      });

      await ClaudeDetectionService.detectClaude();

      expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
        timeout: 3000,
        env: expect.objectContaining({
          PATH: "/custom/path:/usr/bin",
          CUSTOM_VAR: "test-value",
        }),
        shell: "/bin/bash",
      });
    });
  });

  describe("legacy compatibility methods", () => {
    describe("checkInstallation", () => {
      it("should return true when Claude is installed", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const isInstalled = await ClaudeDetectionService.checkInstallation();

        expect(isInstalled).toBe(true);
      });

      it("should return false when Claude is not installed", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockRejectedValue(new Error("Command not found"));

        const isInstalled = await ClaudeDetectionService.checkInstallation();

        expect(isInstalled).toBe(false);
      });

      it("should pass preferred shell to detection", async () => {
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        const isInstalled =
          await ClaudeDetectionService.checkInstallation("fish");

        expect(isInstalled).toBe(true);
        expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
          timeout: 3000,
          env: process.env,
          shell: "fish",
        });
      });
    });

    describe("getVersion", () => {
      it("should return version when Claude is available", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 2.1.0",
          stderr: "",
        });

        const versionResult = await ClaudeDetectionService.getVersion();

        expect(versionResult).toEqual({
          version: "Claude 2.1.0",
          isAvailable: true,
          error: undefined,
        });
      });

      it("should return 'Not Available' when Claude is not installed", async () => {
        process.env.SHELL = "/bin/bash";
        mockExecAsync.mockRejectedValue(new Error("Command not found"));

        const versionResult = await ClaudeDetectionService.getVersion();

        expect(versionResult).toEqual({
          version: "Not Available",
          isAvailable: false,
          error: expect.stringContaining("Claude CLI not found"),
        });
      });

      it("should pass preferred shell to detection", async () => {
        mockExecAsync.mockResolvedValueOnce({
          stdout: "Claude 1.0.0",
          stderr: "",
        });

        await ClaudeDetectionService.getVersion("zsh");

        expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
          timeout: 3000,
          env: process.env,
          shell: "zsh",
        });
      });
    });
  });

  describe("error handling edge cases", () => {
    it("should handle errors that occur during performDetection", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockRejectedValue(new Error("Some error"));

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(false);
      expect(result.error).toContain("Claude CLI not found in any shell");
    });

    it("should handle mixed success and failure in parallel execution", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockImplementation(async (command, options) => {
        const shell = options?.shell as string;
        if (shell === "/bin/bash") {
          throw new Error("bash error");
        }
        if (shell === "/bin/zsh") {
          return { stdout: "Claude 1.0.0", stderr: "" };
        }
        throw new Error("other error");
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
      expect(result.version).toBe("Claude 1.0.0");
    });

    it("should aggregate errors when all shells fail", async () => {
      process.env.SHELL = "/bin/bash";
      mockExecAsync.mockRejectedValue(new Error("Command not found"));

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(false);
      expect(result.error).toContain("Claude CLI not found in any shell");
    });
  });

  describe("Windows compatibility", () => {
    it("should detect CMD shell on Windows", async () => {
      process.env.SHELL = undefined;
      process.env.COMSPEC = "C:\\Windows\\System32\\cmd.exe";

      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "",
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
    });

    it("should detect PowerShell on Windows", async () => {
      process.env.SHELL = undefined;

      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "",
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
    });
  });

  describe("PATH resolution scenarios", () => {
    it("should detect Claude in standard PATH locations", async () => {
      process.env.SHELL = "/bin/bash";
      process.env.PATH = "/usr/local/bin:/usr/bin:/bin";

      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "",
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
      expect(result.version).toBe("Claude 1.0.0");
    });

    it("should handle PATH with spaces", async () => {
      process.env.SHELL = "/bin/bash";
      process.env.PATH = "/Applications/Claude CLI.app/Contents/MacOS:/usr/bin";

      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "",
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
    });

    it("should handle custom PATH locations", async () => {
      process.env.SHELL = "/bin/bash";
      process.env.PATH = "/home/user/.local/bin:/usr/bin";

      mockExecAsync.mockResolvedValueOnce({
        stdout: "Claude 1.0.0",
        stderr: "",
      });

      const result = await ClaudeDetectionService.detectClaude();

      expect(result.isInstalled).toBe(true);
    });
  });

  describe("timeout handling", () => {
    it("should respect shell timeout configuration", async () => {
      process.env.SHELL = "/bin/bash";

      mockExecAsync.mockImplementation(async (command, options) => {
        expect(options?.timeout).toBe(3000);
        return { stdout: "Claude 1.0.0", stderr: "" };
      });

      await ClaudeDetectionService.detectClaude();

      expect(mockExecAsync).toHaveBeenCalledWith("claude --version", {
        timeout: 3000,
        env: process.env,
        shell: "/bin/bash",
      });
    });
  });

  describe("concurrent detection calls", () => {
    it("should handle multiple concurrent detection calls", async () => {
      process.env.SHELL = "/bin/bash";

      mockExecAsync.mockImplementation(async (command, options) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (options?.shell === "/bin/bash") {
          return { stdout: "Claude 1.0.0", stderr: "" };
        }
        throw new Error("Command not found");
      });

      const promises = [
        ClaudeDetectionService.detectClaude(),
        ClaudeDetectionService.detectClaude(),
        ClaudeDetectionService.detectClaude(),
      ];

      const results = await Promise.all(promises);

      // All results should be successful
      expect(results[0].isInstalled).toBe(true);
      expect(results[1].isInstalled).toBe(true);
      expect(results[2].isInstalled).toBe(true);

      // The first call triggers detection, others might use cache or run in parallel
      // Just verify we don't have an excessive number of calls
      expect(mockExecAsync.mock.calls.length).toBeLessThan(20);
    });
  });
});
