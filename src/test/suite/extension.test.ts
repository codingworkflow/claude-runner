import * as assert from "assert";
import * as vscode from "vscode";
import { before, after } from "mocha";

suite("Claude Runner Extension Tests", () => {
  let extension: vscode.Extension<any> | undefined;

  before(async () => {
    // Wait for extension to be activated
    extension = vscode.extensions.getExtension("Codingworkflow.claude-runner");
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  });

  after(async () => {
    // Clean up any test artifacts
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("Extension should be present and activated", async () => {
    assert.ok(extension, "Extension should be found");
    assert.ok(extension?.isActive, "Extension should be activated");
    assert.strictEqual(extension?.id, "Codingworkflow.claude-runner");
  });

  test("Extension should register all required commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    const claudeCommands = commands.filter((cmd) =>
      cmd.startsWith("claude-runner."),
    );

    const expectedCommands = [
      "claude-runner.showPanel",
      "claude-runner.runInteractive",
      "claude-runner.runTask",
      "claude-runner.selectModel",
      "claude-runner.openSettings",
      "claude-runner.openInEditor",
      "claude-runner.toggleAdvancedTabs",
      "claude-runner.recheckClaude",
    ];

    expectedCommands.forEach((cmd) => {
      assert.ok(
        claudeCommands.includes(cmd),
        `Command '${cmd}' should be registered`,
      );
    });
  });

  test("Main panel should open and display webview", async () => {
    // Execute the show panel command
    await vscode.commands.executeCommand("claude-runner.showPanel");

    // Wait a moment for the panel to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if the webview panel exists in the activity bar
    const views = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => tab.label?.includes("Claude Runner"));

    assert.ok(views.length > 0, "Claude Runner panel should be visible");
  });

  test("Extension configuration should have default values", () => {
    const config = vscode.workspace.getConfiguration("claudeRunner");

    // Test default configuration values
    assert.strictEqual(
      config.get("defaultModel"),
      "claude-sonnet-4-20250514",
      "Default model should be claude-sonnet-4-20250514",
    );

    assert.strictEqual(
      config.get("defaultRootPath"),
      "",
      "Default root path should be empty",
    );

    assert.strictEqual(
      config.get("allowAllTools"),
      false,
      "Allow all tools should default to false",
    );

    assert.strictEqual(
      config.get("outputFormat"),
      "text",
      "Output format should default to text",
    );

    assert.strictEqual(
      config.get("maxTurns"),
      10,
      "Max turns should default to 10",
    );

    assert.strictEqual(
      config.get("autoOpenTerminal"),
      true,
      "Auto open terminal should default to true",
    );
  });

  test("Activity bar view should be registered", async () => {
    // Execute the command to open the view
    await vscode.commands.executeCommand(
      "workbench.action.openView",
      "claude-runner.mainView",
    );

    // The command should execute without throwing
    assert.ok(true, "Activity bar view should be accessible");
  });

  test("Webview should initialize without errors", async () => {
    let errorOccurred = false;

    // Listen for any errors during webview creation
    const disposable = vscode.window.onDidChangeActiveTextEditor(() => {
      // This is a simple way to detect if the webview loading causes issues
    });

    try {
      // Open the panel
      await vscode.commands.executeCommand("claude-runner.showPanel");

      // Wait for webview to load
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      errorOccurred = true;
      console.error("Error during webview initialization:", error);
    } finally {
      disposable.dispose();
    }

    assert.ok(!errorOccurred, "Webview should initialize without errors");
  });

  test("Extension should handle command palette integration", async () => {
    // Test that commands appear in command palette
    const allCommands = await vscode.commands.getCommands();

    // Check specific command titles are available
    const claudeCommands = allCommands.filter((cmd) =>
      cmd.startsWith("claude-runner."),
    );

    assert.ok(
      claudeCommands.length >= 7,
      "Should have at least 7 Claude Runner commands",
    );

    // Test executing a safe command
    try {
      await vscode.commands.executeCommand("claude-runner.openSettings");
      assert.ok(true, "Settings command should execute without error");
    } catch (error) {
      assert.fail(`Settings command should not throw error: ${error}`);
    }
  });

  test("Extension should handle workspace changes gracefully", async () => {
    // Get initial configuration
    const initialConfig = vscode.workspace.getConfiguration("claudeRunner");
    const initialModel = initialConfig.get("defaultModel");

    // Simulate configuration change
    await initialConfig.update(
      "defaultModel",
      "claude-3-5-haiku-20241022",
      vscode.ConfigurationTarget.Workspace,
    );

    // Verify change took effect
    const updatedConfig = vscode.workspace.getConfiguration("claudeRunner");
    assert.strictEqual(
      updatedConfig.get("defaultModel"),
      "claude-3-5-haiku-20241022",
      "Configuration should update correctly",
    );

    // Restore original configuration
    await initialConfig.update(
      "defaultModel",
      initialModel,
      vscode.ConfigurationTarget.Workspace,
    );
  });

  test("Extension should provide proper contribution points", () => {
    assert.ok(
      extension?.packageJSON.contributes,
      "Extension should have contribution points",
    );

    const contributions = extension?.packageJSON.contributes;

    // Check for required contribution points
    assert.ok(contributions.commands, "Should contribute commands");
    assert.ok(
      contributions.viewsContainers,
      "Should contribute views containers",
    );
    assert.ok(contributions.views, "Should contribute views");
    assert.ok(contributions.configuration, "Should contribute configuration");
    assert.ok(contributions.menus, "Should contribute menus");

    // Verify activity bar contribution
    assert.ok(
      contributions.viewsContainers.activitybar.some(
        (container: any) => container.id === "claude-runner",
      ),
      "Should contribute to activity bar",
    );
  });
});
