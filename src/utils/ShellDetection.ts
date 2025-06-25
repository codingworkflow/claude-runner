import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ShellDetectionOptions {
  command: string;
  preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh";
  timeout?: number;
}

export interface ShellDetectionResult {
  success: boolean;
  output?: string;
  error?: string;
  shellUsed?: string;
}

/**
 * Shared utility for running commands with multi-shell detection
 * Used by ClaudeVersionService, ClaudeCodeService, and ClaudeRunnerPanel
 */
export class ShellDetection {
  private static readonly shellPaths = {
    bash: "/bin/bash",
    zsh: "/bin/zsh",
    fish: "/usr/local/bin/fish", // Homebrew on Intel Mac
    fishAppleSilicon: "/opt/homebrew/bin/fish", // Homebrew on Apple Silicon
    sh: "/bin/sh",
  };

  public static async runCommand(
    options: ShellDetectionOptions,
  ): Promise<ShellDetectionResult> {
    const { command, preferredShell = "auto", timeout = 10000 } = options;

    // If user specified a shell, try it first
    if (preferredShell !== "auto") {
      const shellPath =
        this.shellPaths[preferredShell as keyof typeof this.shellPaths];
      if (shellPath) {
        try {
          const { stdout } = await execAsync(command, {
            timeout,
            env: process.env,
            shell: shellPath,
          });

          // Command succeeded with preferred shell
          return {
            success: true,
            output: stdout.trim(),
            shellUsed: `${preferredShell} (${shellPath})`,
          };
        } catch (error) {
          // Command failed with preferred shell, trying auto mode
        }
      }
    }

    // Auto mode: try multiple shells in parallel
    const shellsToTry = [
      { name: "bash", path: "/bin/bash" }, // Common default on Linux
      { name: "zsh", path: "/bin/zsh" }, // Common on macOS
      { name: "fish", path: "/usr/local/bin/fish" }, // Fish via Homebrew
      { name: "fish", path: "/opt/homebrew/bin/fish" }, // Fish via Apple Silicon Homebrew
      { name: "sh", path: "/bin/sh" }, // Fallback
    ];

    const promises = shellsToTry.map((shell) =>
      execAsync(command, {
        timeout,
        env: process.env,
        shell: shell.path,
      }).then((result) => ({
        success: true,
        output: result.stdout.trim(),
        shellUsed: `${shell.name} (${shell.path})`,
      })),
    );

    try {
      const result = await Promise.race(promises);
      return result;
    } catch (error) {
      return {
        success: false,
        error: "Command failed with all available shells",
      };
    }
  }

  /**
   * Convenience method for Claude CLI detection
   */
  public static async checkClaudeInstallation(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<boolean> {
    const result = await this.runCommand({
      command: "claude --version",
      preferredShell,
      timeout: 10000,
    });
    return result.success;
  }

  /**
   * Convenience method for Claude version detection
   */
  public static async getClaudeVersion(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<ShellDetectionResult> {
    return this.runCommand({
      command: "claude --version",
      preferredShell,
      timeout: 2000,
    });
  }
}
