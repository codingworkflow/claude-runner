import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ClaudeDetectionResult {
  isInstalled: boolean;
  version?: string;
  shell?: string;
  error?: string;
}

/**
 * ULTRA-FAST Claude CLI Detection Service
 *
 * DESIGN PRINCIPLES:
 * - DRY: Single method for both installation check AND version detection
 * - KISS: Simple, fast, parallel shell detection
 * - PERFORMANCE: 3s timeout per shell, parallel execution
 * - CACHING: Cache results for 5 minutes to avoid repeated checks
 */
export class ClaudeDetectionService {
  private static detectionCache: {
    result: ClaudeDetectionResult;
    timestamp: number;
  } | null = null;

  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private static readonly SHELL_TIMEOUT = 3000; // 3 seconds per shell (vs 10s before)
  private static readonly TOTAL_TIMEOUT = 10000; // 10 seconds total (vs 50s before)

  /**
   * UNIFIED detection method - replaces both checkInstallation and getVersion
   * Uses parallel shell detection for maximum speed
   */
  public static async detectClaude(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<ClaudeDetectionResult> {
    // Return cached result if still valid
    if (
      this.detectionCache &&
      Date.now() - this.detectionCache.timestamp < this.CACHE_DURATION
    ) {
      return this.detectionCache.result;
    }

    try {
      const result = await this.performDetection(preferredShell);

      // Prevent a later shell failure from overwriting an earlier success
      if (result.isInstalled) {
        this.detectionCache = {
          result,
          timestamp: Date.now(),
        };
      }

      return result;
    } catch (error) {
      const failureResult: ClaudeDetectionResult = {
        isInstalled: false,
        error: error instanceof Error ? error.message : "Detection failed",
      };

      // Don't cache failures - retry next time
      return failureResult;
    }
  }

  /**
   * FAST detection with smart shell priority and parallel execution
   */
  private static async performDetection(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<ClaudeDetectionResult> {
    const command = "claude --version";

    // If specific shell preferred, try it first
    if (preferredShell && preferredShell !== "auto") {
      try {
        const result = await this.tryShell(command, preferredShell);
        return result;
      } catch {
        // Preferred shell failed, fall back to auto detection
      }
    }

    // Smart shell priority: current shell first, then common shells
    const currentShell = this.detectCurrentShell();
    const shellsToTry = this.getShellPriority(currentShell);

    // PARALLEL execution instead of sequential - MUCH faster
    const shellPromises = shellsToTry.map(async (shellInfo) => {
      try {
        const result = await this.tryShell(
          command,
          shellInfo.name,
          shellInfo.path,
        );
        return { success: true as const, result, shell: shellInfo };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : "Unknown error",
          shell: shellInfo,
          result: undefined as ClaudeDetectionResult | undefined,
        };
      }
    });

    // Race condition: return first successful result OR aggregate failures
    const results = await Promise.allSettled(shellPromises);

    // Find first successful result
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success) {
        return result.value.result;
      }
    }

    // All shells failed
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason)
      .join("; ");

    return {
      isInstalled: false,
      error: `Claude CLI not found in any shell. Errors: ${errors}`,
    };
  }

  /**
   * Try executing claude command in specific shell
   */
  private static async tryShell(
    command: string,
    shellName: string,
    shellPath?: string,
  ): Promise<ClaudeDetectionResult> {
    const execOptions = {
      timeout: this.SHELL_TIMEOUT,
      env: process.env,
      shell: shellPath ?? shellName,
    };

    const { stdout } = await execAsync(command, execOptions);
    const version = stdout.trim();

    return {
      isInstalled: true,
      version,
      shell: shellPath ? `${shellName} (${shellPath})` : shellName,
    };
  }

  /**
   * Detect current shell environment
   */
  private static detectCurrentShell(): string {
    const shell = process.env.SHELL?.split("/").pop() ?? process.env.SHELL_NAME;
    if (!shell) {
      throw new Error(
        "Could not detect shell - SHELL environment variable not set",
      );
    }
    return shell;
  }

  /**
   * Get shell priority list with current shell first
   */
  private static getShellPriority(currentShell: string) {
    const allShells = [
      { name: "bash", path: "/bin/bash" },
      { name: "zsh", path: "/bin/zsh" },
      { name: "fish", path: "/usr/local/bin/fish" },
      { name: "fish", path: "/opt/homebrew/bin/fish" },
      { name: "sh", path: "/bin/sh" },
    ];

    // Put current shell first
    const currentShellEntry = allShells.find((s) => s.name === currentShell);
    const otherShells = allShells.filter((s) => s.name !== currentShell);

    return currentShellEntry ? [currentShellEntry, ...otherShells] : allShells;
  }

  /**
   * Clear detection cache (useful for manual recheck)
   */
  public static clearCache(): void {
    this.detectionCache = null;
  }

  /**
   * Get cached result without performing detection
   */
  public static getCachedResult(): ClaudeDetectionResult | null {
    if (
      this.detectionCache &&
      Date.now() - this.detectionCache.timestamp < this.CACHE_DURATION
    ) {
      return this.detectionCache.result;
    }
    return null;
  }

  /**
   * Legacy compatibility: Installation check only
   */
  public static async checkInstallation(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<boolean> {
    const result = await this.detectClaude(preferredShell);
    return result.isInstalled;
  }

  /**
   * Legacy compatibility: Version detection only
   */
  public static async getVersion(
    preferredShell?: "auto" | "bash" | "zsh" | "fish" | "sh",
  ): Promise<{ version: string; isAvailable: boolean; error?: string }> {
    const result = await this.detectClaude(preferredShell);
    return {
      version: result.version ?? "Not Available",
      isAvailable: result.isInstalled,
      error: result.error,
    };
  }
}
