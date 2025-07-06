import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export class CLIInstallationService {
  private static readonly CLI_SYMLINK_NAME = "claude-runner";

  /**
   * Set up the CLI to be available in terminal
   * This runs during extension activation
   */
  static async setupCLI(context: vscode.ExtensionContext): Promise<void> {
    try {
      const extensionPath = context.extensionPath;
      const cliPath = path.join(extensionPath, "cli", "claude-runner");

      // Check if CLI file exists and is executable
      if (!fs.existsSync(cliPath)) {
        console.warn("Claude Runner CLI not found in extension package");
        return;
      }

      // Make sure the CLI is executable
      try {
        fs.chmodSync(cliPath, 0o755);
      } catch (error) {
        console.warn("Could not make CLI executable:", error);
      }

      // Try to add to PATH using different strategies
      await this.addToPath(cliPath);

      // Show success message
      const result = await this.testCLIAccess();
      if (result.success) {
        vscode.window.showInformationMessage(
          "Claude Runner CLI is now available in terminal. Try: claude-runner --help",
          { modal: false },
        );
      } else {
        // Show manual installation instructions
        this.showManualInstructions(cliPath);
      }
    } catch (error) {
      console.error("Failed to setup Claude Runner CLI:", error);
      // Don't show error to user - CLI is optional feature
    }
  }

  /**
   * Add CLI to PATH using various strategies
   */
  private static async addToPath(cliPath: string): Promise<void> {
    const strategies = [
      () => this.createSymlinkInUsrLocalBin(cliPath),
      () => this.createSymlinkInUserBin(cliPath),
      () => this.addToShellProfile(cliPath),
    ];

    for (const strategy of strategies) {
      try {
        await strategy();
        return; // Success, stop trying other strategies
      } catch {
        // Try next strategy
        continue;
      }
    }
  }

  /**
   * Strategy 1: Create symlink in /usr/local/bin (requires sudo on some systems)
   */
  private static async createSymlinkInUsrLocalBin(
    cliPath: string,
  ): Promise<void> {
    const symlinkPath = `/usr/local/bin/${this.CLI_SYMLINK_NAME}`;

    // Check if /usr/local/bin exists and is writable
    if (!fs.existsSync("/usr/local/bin")) {
      throw new Error("/usr/local/bin does not exist");
    }

    // Remove existing symlink if it exists
    if (fs.existsSync(symlinkPath)) {
      fs.unlinkSync(symlinkPath);
    }

    fs.symlinkSync(cliPath, symlinkPath);
  }

  /**
   * Strategy 2: Create symlink in user's bin directory
   */
  private static async createSymlinkInUserBin(cliPath: string): Promise<void> {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error("Could not determine home directory");
    }

    const userBinDir = path.join(homeDir, ".local", "bin");
    const symlinkPath = path.join(userBinDir, this.CLI_SYMLINK_NAME);

    // Create ~/.local/bin if it doesn't exist
    if (!fs.existsSync(userBinDir)) {
      fs.mkdirSync(userBinDir, { recursive: true });
    }

    // Remove existing symlink if it exists
    if (fs.existsSync(symlinkPath)) {
      fs.unlinkSync(symlinkPath);
    }

    fs.symlinkSync(cliPath, symlinkPath);

    // Add ~/.local/bin to PATH if not already there
    await this.ensureInPath(userBinDir);
  }

  /**
   * Strategy 3: Add alias to shell profile
   */
  private static async addToShellProfile(cliPath: string): Promise<void> {
    const homeDir = process.env.HOME;
    if (!homeDir) {
      throw new Error("Could not determine home directory");
    }

    const shell = process.env.SHELL?.split("/").pop();
    if (!shell) {
      throw new Error(
        "Could not detect shell - SHELL environment variable not set",
      );
    }
    const profileFiles = this.getShellProfileFiles(shell, homeDir);

    const aliasLine = `alias ${this.CLI_SYMLINK_NAME}="${cliPath}"`;

    for (const profileFile of profileFiles) {
      try {
        if (fs.existsSync(profileFile)) {
          const content = fs.readFileSync(profileFile, "utf-8");

          // Check if alias already exists
          if (content.includes(`alias ${this.CLI_SYMLINK_NAME}=`)) {
            // Update existing alias
            const updatedContent = content.replace(
              new RegExp(`alias ${this.CLI_SYMLINK_NAME}=.*`, "g"),
              aliasLine,
            );
            fs.writeFileSync(profileFile, updatedContent);
          } else {
            // Add new alias
            fs.appendFileSync(
              profileFile,
              `\n# Claude Runner CLI\n${aliasLine}\n`,
            );
          }
          return; // Success
        }
      } catch (error) {
        continue; // Try next profile file
      }
    }

    throw new Error("Could not update any shell profile");
  }

  /**
   * Get shell profile files to try
   */
  private static getShellProfileFiles(
    shell: string,
    homeDir: string,
  ): string[] {
    const profileFiles = [
      path.join(homeDir, ".profile"),
      path.join(homeDir, ".bashrc"),
      path.join(homeDir, ".bash_profile"),
    ];

    if (shell === "zsh") {
      profileFiles.unshift(path.join(homeDir, ".zshrc"));
    } else if (shell === "fish") {
      profileFiles.unshift(
        path.join(homeDir, ".config", "fish", "config.fish"),
      );
    }

    return profileFiles;
  }

  /**
   * Ensure directory is in PATH
   */
  private static async ensureInPath(directory: string): Promise<void> {
    const currentPath = process.env.PATH ?? "";
    if (!currentPath.includes(directory)) {
      // We can't modify PATH for the current session, but we can suggest it
      // The shell profile strategy above handles adding to PATH permanently
    }
  }

  /**
   * Test if CLI is accessible
   */
  private static async testCLIAccess(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { stdout } = await execAsync(`${this.CLI_SYMLINK_NAME} --help`, {
        timeout: 5000,
      });
      return { success: stdout.includes("Claude Runner CLI") };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Show manual installation instructions
   */
  private static showManualInstructions(cliPath: string): void {
    const message =
      `Claude Runner CLI could not be automatically added to PATH. ` +
      `To use it in terminal, run: ln -s "${cliPath}" /usr/local/bin/claude-runner`;

    vscode.window
      .showWarningMessage(
        "Claude Runner CLI setup incomplete",
        "Show Instructions",
      )
      .then((selection) => {
        if (selection === "Show Instructions") {
          vscode.window.showInformationMessage(message, { modal: true });
        }
      });
  }

  /**
   * Clean up CLI installation (called during deactivation)
   */
  static async cleanupCLI(): Promise<void> {
    try {
      // Remove symlinks
      const symlinks = [
        `/usr/local/bin/${this.CLI_SYMLINK_NAME}`,
        path.join(
          process.env.HOME ?? "",
          ".local",
          "bin",
          this.CLI_SYMLINK_NAME,
        ),
      ];

      for (const symlink of symlinks) {
        if (fs.existsSync(symlink)) {
          try {
            fs.unlinkSync(symlink);
          } catch (error) {
            // Ignore errors during cleanup
          }
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}
