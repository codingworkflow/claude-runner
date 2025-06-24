import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { RunnerController } from "../../controllers/RunnerController";
import { ClaudeCodeService } from "../../services/ClaudeCodeService";
import { TerminalService } from "../../services/TerminalService";
import { ConfigurationService } from "../../services/ConfigurationService";
import { PipelineService } from "../../services/PipelineService";
import { UsageReportService } from "../../services/UsageReportService";
import { ClaudeVersionService } from "../../services/ClaudeVersionService";
import { LogsService } from "../../services/LogsService";

interface CommandFile {
  name: string;
  path: string;
  description: string;
  isProject: boolean;
}

describe("Command Detection Integration Tests", () => {
  let tempDir: string;
  let globalCommandsDir: string;
  let projectCommandsDir: string;
  let controller: RunnerController;
  let context: vscode.ExtensionContext;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-test-"));
    globalCommandsDir = path.join(tempDir, ".claude", "commands");
    projectCommandsDir = path.join(tempDir, "project", ".claude", "commands");

    // Create the directory structure
    fs.mkdirSync(globalCommandsDir, { recursive: true });
    fs.mkdirSync(projectCommandsDir, { recursive: true });

    // Mock vscode context
    context = {
      globalState: {
        get: () => undefined,
        update: () => Promise.resolve(),
      },
      workspaceState: {
        get: () => undefined,
        update: () => Promise.resolve(),
      },
      extensionUri: vscode.Uri.file(tempDir),
    } as any;

    // Create mock services
    const claudeCodeService = {} as ClaudeCodeService;
    const terminalService = {} as TerminalService;
    const configService = {} as ConfigurationService;
    const pipelineService = {} as PipelineService;
    const usageReportService = {} as UsageReportService;
    const claudeVersionService = {} as ClaudeVersionService;
    const logsService = {} as LogsService;

    controller = new RunnerController(
      context,
      claudeCodeService,
      terminalService,
      configService,
      pipelineService,
      usageReportService,
      claudeVersionService,
      logsService,
      [],
    );
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Global Command Detection", () => {
    it("should detect global commands in ~/.claude/commands/", async () => {
      // Create test command files
      const lintContent = "lint all project file";
      const testContent =
        "Run unit tests and integration and ensure they pass.";

      fs.writeFileSync(path.join(globalCommandsDir, "lint.md"), lintContent);
      fs.writeFileSync(path.join(globalCommandsDir, "test.md"), testContent);

      // Set up callback to capture results
      let capturedResults:
        | { globalCommands: CommandFile[]; projectCommands: CommandFile[] }
        | undefined;

      controller.setCallbacks({
        onCommandScanResult: (data) => {
          capturedResults = data;
        },
      });

      // Test the actual scanning method by calling the controller directly
      // We need to access the private method for testing
      const scanMethod = (controller as any).scanCommands;
      await scanMethod.call(controller, path.join(tempDir, "project"));

      // Give some time for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify results
      assert.ok(capturedResults, "Should have captured command scan results");
      assert.strictEqual(
        capturedResults.globalCommands.length,
        2,
        "Should detect 2 global commands",
      );

      const lintCommand = capturedResults.globalCommands.find(
        (cmd) => cmd.name === "lint",
      );
      const testCommand = capturedResults.globalCommands.find(
        (cmd) => cmd.name === "test",
      );

      assert.ok(lintCommand, "Should find lint command");
      assert.ok(testCommand, "Should find test command");

      assert.strictEqual(lintCommand.description, "lint all project file");
      assert.strictEqual(
        testCommand.description,
        "Run unit tests and integration and ensure they pass.",
      );
      assert.strictEqual(lintCommand.isProject, false);
      assert.strictEqual(testCommand.isProject, false);
    });

    it("should handle empty global commands directory", async () => {
      // Don't create any files in the global commands directory

      let capturedResults:
        | { globalCommands: CommandFile[]; projectCommands: CommandFile[] }
        | undefined;

      controller.setCallbacks({
        onCommandScanResult: (data) => {
          capturedResults = data;
        },
      });

      const scanMethod = (controller as any).scanCommands;
      await scanMethod.call(controller, path.join(tempDir, "project"));

      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(capturedResults, "Should have captured command scan results");
      assert.strictEqual(
        capturedResults.globalCommands.length,
        0,
        "Should detect 0 global commands",
      );
    });

    it("should handle non-existent global commands directory", async () => {
      // Remove the global commands directory
      fs.rmSync(globalCommandsDir, { recursive: true, force: true });

      let capturedResults:
        | { globalCommands: CommandFile[]; projectCommands: CommandFile[] }
        | undefined;

      controller.setCallbacks({
        onCommandScanResult: (data) => {
          capturedResults = data;
        },
      });

      const scanMethod = (controller as any).scanCommands;
      await scanMethod.call(controller, path.join(tempDir, "project"));

      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(capturedResults, "Should have captured command scan results");
      assert.strictEqual(
        capturedResults.globalCommands.length,
        0,
        "Should detect 0 global commands",
      );
    });

    it("should only detect .md files", async () => {
      // Create various file types
      fs.writeFileSync(path.join(globalCommandsDir, "lint.md"), "lint command");
      fs.writeFileSync(path.join(globalCommandsDir, "test.txt"), "test file"); // Should be ignored
      fs.writeFileSync(
        path.join(globalCommandsDir, "script.js"),
        "script file",
      ); // Should be ignored
      fs.writeFileSync(
        path.join(globalCommandsDir, "readme.md"),
        "readme command",
      );

      let capturedResults:
        | { globalCommands: CommandFile[]; projectCommands: CommandFile[] }
        | undefined;

      controller.setCallbacks({
        onCommandScanResult: (data) => {
          capturedResults = data;
        },
      });

      const scanMethod = (controller as any).scanCommands;
      await scanMethod.call(controller, path.join(tempDir, "project"));

      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(capturedResults, "Should have captured command scan results");
      assert.strictEqual(
        capturedResults.globalCommands.length,
        2,
        "Should detect only 2 .md files",
      );

      const commands = capturedResults.globalCommands
        .map((cmd) => cmd.name)
        .sort();
      assert.deepStrictEqual(
        commands,
        ["lint", "readme"],
        "Should only detect .md files",
      );
    });
  });

  describe("Real World Global Command Detection", () => {
    it("should detect actual global commands from ~/.claude/commands/", async () => {
      // Test with the actual global commands directory
      const actualGlobalDir = path.join(os.homedir(), ".claude", "commands");

      console.log(
        `Testing actual global commands directory: ${actualGlobalDir}`,
      );
      console.log(`Directory exists: ${fs.existsSync(actualGlobalDir)}`);

      if (fs.existsSync(actualGlobalDir)) {
        const files = fs.readdirSync(actualGlobalDir);
        console.log(`Files in actual directory: ${files.join(", ")}`);

        let capturedResults:
          | { globalCommands: CommandFile[]; projectCommands: CommandFile[] }
          | undefined;

        controller.setCallbacks({
          onCommandScanResult: (data) => {
            capturedResults = data;
            console.log("Captured results:", data);
          },
        });

        // Test with actual home directory
        const scanMethod = (controller as any).scanCommands;
        await scanMethod.call(controller, path.join(tempDir, "project"));

        await new Promise((resolve) => setTimeout(resolve, 500));

        assert.ok(capturedResults, "Should have captured command scan results");
        console.log(
          `Found ${capturedResults.globalCommands.length} global commands`,
        );

        capturedResults.globalCommands.forEach((cmd) => {
          console.log(
            `Command: ${cmd.name} at ${cmd.path} - "${cmd.description}"`,
          );
        });

        // Should find the lint.md and test.md files we know exist
        const lintCommand = capturedResults.globalCommands.find(
          (cmd) => cmd.name === "lint",
        );
        const testCommand = capturedResults.globalCommands.find(
          (cmd) => cmd.name === "test",
        );

        if (files.includes("lint.md")) {
          assert.ok(lintCommand, "Should find lint command");
          console.log(
            `Lint command found: ${lintCommand.name} - ${lintCommand.description}`,
          );
        }

        if (files.includes("test.md")) {
          assert.ok(testCommand, "Should find test command");
          console.log(
            `Test command found: ${testCommand.name} - ${testCommand.description}`,
          );
        }
      } else {
        console.log(
          "Skipping test - actual global commands directory does not exist",
        );
      }
    });
  });

  describe("Direct Directory Scanning Method", () => {
    it("should directly test scanCommandsInDirectory method", async () => {
      // Create test files
      fs.writeFileSync(
        path.join(globalCommandsDir, "lint.md"),
        "lint all project file",
      );
      fs.writeFileSync(
        path.join(globalCommandsDir, "test.md"),
        "Run unit tests and integration and ensure they pass.",
      );

      // Test the private method directly
      const scanDirMethod = (controller as any).scanCommandsInDirectory;
      const results = await scanDirMethod.call(
        controller,
        globalCommandsDir,
        false,
      );

      console.log("Direct scan results:", results);

      assert.strictEqual(results.length, 2, "Should find 2 commands");
      assert.ok(
        results.find((cmd: CommandFile) => cmd.name === "lint"),
        "Should find lint command",
      );
      assert.ok(
        results.find((cmd: CommandFile) => cmd.name === "test"),
        "Should find test command",
      );
    });

    it("should test with actual home directory path", async () => {
      const actualGlobalDir = path.join(os.homedir(), ".claude", "commands");

      if (fs.existsSync(actualGlobalDir)) {
        console.log(`Testing direct scan of: ${actualGlobalDir}`);

        const scanDirMethod = (controller as any).scanCommandsInDirectory;
        const results = await scanDirMethod.call(
          controller,
          actualGlobalDir,
          false,
        );

        console.log(`Direct scan found ${results.length} commands:`, results);

        results.forEach((cmd: CommandFile) => {
          console.log(`- ${cmd.name}: ${cmd.description} (${cmd.path})`);
        });

        assert.ok(Array.isArray(results), "Should return an array");
      } else {
        console.log("Skipping - actual directory does not exist");
      }
    });
  });
});
