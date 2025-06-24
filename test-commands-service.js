// Test the CommandsService directly
const { CommandsService } = require("./out/services/CommandsService.js");

// Mock vscode context
const mockContext = {
  extensionUri: { fsPath: "/mock/extension" },
  globalState: { get: () => undefined, update: () => Promise.resolve() },
  workspaceState: { get: () => undefined, update: () => Promise.resolve() },
};

async function testCommandsService() {
  console.log("=== Testing CommandsService ===");

  const service = new CommandsService(mockContext);

  // Set root path to current workspace
  service.setRootPath("/workspaces/vsix/claude-runner");

  console.log("Scanning commands...");

  try {
    const result = await service.scanCommands();

    console.log("\n=== Results ===");
    console.log(`Global commands found: ${result.globalCommands.length}`);
    result.globalCommands.forEach((cmd) => {
      console.log(`- ${cmd.name}: "${cmd.description}" (${cmd.path})`);
    });

    console.log(`\nProject commands found: ${result.projectCommands.length}`);
    result.projectCommands.forEach((cmd) => {
      console.log(`- ${cmd.name}: "${cmd.description}" (${cmd.path})`);
    });

    if (result.globalCommands.length === 0) {
      console.log(
        "\n❌ ISSUE: No global commands detected despite files existing",
      );
      console.log("Expected: 2 commands (lint, test)");
    } else {
      console.log("\n✅ SUCCESS: Global commands detected correctly");
    }
  } catch (error) {
    console.error("Error testing service:", error);
  }
}

testCommandsService();
