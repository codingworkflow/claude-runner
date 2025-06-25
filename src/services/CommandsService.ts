import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

export interface CommandFile {
  name: string;
  path: string;
  description: string;
  isProject: boolean;
}

export class CommandsService {
  private rootPath: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Initialize with workspace folder as default
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.rootPath = workspaceFolder?.uri.fsPath;
  }

  /**
   * Set the root path for command scanning
   */
  setRootPath(rootPath: string): void {
    this.rootPath = rootPath;
  }

  /**
   * Scan for commands in both global and project directories
   */
  async scanCommands(): Promise<{
    globalCommands: CommandFile[];
    projectCommands: CommandFile[];
  }> {
    try {
      // Scan global commands
      const globalCommandsPath = path.join(os.homedir(), ".claude", "commands");
      const globalCommands = await this.scanCommandsInDirectory(
        globalCommandsPath,
        false,
      );

      // Scan project commands
      const projectCommands: CommandFile[] = [];
      if (this.rootPath) {
        const projectCommandsPath = path.join(
          this.rootPath,
          ".claude",
          "commands",
        );
        projectCommands.push(
          ...(await this.scanCommandsInDirectory(projectCommandsPath, true)),
        );
      }

      return {
        globalCommands,
        projectCommands,
      };
    } catch (error) {
      console.error("Error scanning commands:", error);
      return {
        globalCommands: [],
        projectCommands: [],
      };
    }
  }

  /**
   * Scan commands in a specific directory
   */
  private async scanCommandsInDirectory(
    dirPath: string,
    isProject: boolean,
  ): Promise<CommandFile[]> {
    try {
      // Check if directory exists
      try {
        await fs.access(dirPath);
      } catch {
        return [];
      }

      const files = await fs.readdir(dirPath);

      const commands: CommandFile[] = [];

      for (const file of files) {
        if (file.endsWith(".md")) {
          const fullPath = path.join(dirPath, file);
          const name = path.basename(file, ".md");

          // Try to read the file for description
          let description = "";
          try {
            const content = await fs.readFile(fullPath, "utf8");
            // Extract first line as description
            const lines = content.split("\n");
            const firstLine = lines[0]?.trim();
            if (firstLine) {
              description = firstLine.replace(/^#+\s*|^\/\/\s*/, "").trim();
            }
          } catch (readError) {
            console.warn(`Could not read command file ${fullPath}:`, readError);
          }

          commands.push({
            name,
            path: fullPath,
            description,
            isProject,
          });
        }
      }

      return commands;
    } catch (error) {
      console.error(`Error scanning commands directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Open a command file in the editor
   */
  async openCommandFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.window.showTextDocument(uri);
    } catch (error) {
      console.error("Error opening command file:", error);
      vscode.window.showErrorMessage(
        `Failed to open command file: ${filePath}`,
      );
    }
  }

  /**
   * Create a new command file
   */
  async createCommand(name: string, isGlobal: boolean): Promise<void> {
    try {
      const commandsDir = isGlobal
        ? path.join(os.homedir(), ".claude", "commands")
        : this.rootPath
          ? path.join(this.rootPath, ".claude", "commands")
          : null;

      if (!commandsDir) {
        vscode.window.showErrorMessage(
          "No workspace selected for project command",
        );
        return;
      }

      // Ensure directory exists
      await fs.mkdir(commandsDir, { recursive: true });

      const filePath = path.join(commandsDir, `${name}.md`);

      // Check if file already exists
      try {
        await fs.access(filePath);
        vscode.window.showErrorMessage(`Command '${name}' already exists`);
        return;
      } catch {
        // File doesn't exist, we can create it
      }

      // Create basic command template
      const template = `# ${name}\n\nDescribe what this command does here.\n\n!echo "Implement your command here"\n`;

      await fs.writeFile(filePath, template);

      // Open the new file
      await this.openCommandFile(filePath);

      vscode.window.showInformationMessage(
        `Created ${isGlobal ? "global" : "project"} command: ${name}`,
      );
    } catch (error) {
      console.error("Error creating command:", error);
      vscode.window.showErrorMessage(`Failed to create command: ${name}`);
    }
  }

  /**
   * Delete a command file
   */
  async deleteCommand(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      const name = path.basename(filePath, ".md");
      vscode.window.showInformationMessage(`Deleted command: ${name}`);
    } catch (error) {
      console.error("Error deleting command:", error);
      vscode.window.showErrorMessage(
        `Failed to delete command: ${path.basename(filePath, ".md")}`,
      );
    }
  }
}
