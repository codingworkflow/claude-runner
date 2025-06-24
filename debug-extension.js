// Simple test to debug the extension logic without the full VSCode context

const path = require("path");
const fs = require("fs");
const os = require("os");

// Simulate the scanCommandsInDirectory method
async function scanCommandsInDirectory(dirPath, isProject) {
  try {
    console.log(`Scanning commands directory: ${dirPath}`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return [];
    }

    const files = fs.readdirSync(dirPath);
    console.log(`Found files in ${dirPath}:`, files);

    const commands = [];

    for (const file of files) {
      if (file.endsWith(".md")) {
        const fullPath = path.join(dirPath, file);
        const name = path.basename(file, ".md");

        // Try to read the file for description
        let description = "";
        try {
          const content = fs.readFileSync(fullPath, "utf8");
          // Extract first line as description - just use the first line as-is
          const lines = content.split("\n");
          const firstLine = lines[0]?.trim();
          if (firstLine) {
            description = firstLine.replace(/^#+\s*|^\/\/\s*/, "").trim();
          }
        } catch (readError) {
          console.warn(`Could not read command file ${fullPath}:`, readError);
        }

        console.log(
          `Found command: ${name} at ${fullPath} with description: ${description}`,
        );

        commands.push({
          name,
          path: fullPath,
          description,
          isProject,
        });
      }
    }

    console.log(`Returning ${commands.length} commands from ${dirPath}`);
    return commands;
  } catch (error) {
    console.error(`Error scanning commands directory ${dirPath}:`, error);
    return [];
  }
}

// Simulate the main scanCommands method
async function scanCommands(rootPath) {
  try {
    console.log("\n=== Starting Command Scan ===");

    // Scan global commands
    const globalCommandsPath = path.join(os.homedir(), ".claude", "commands");
    console.log(`Global commands path: ${globalCommandsPath}`);
    const globalCommands = await scanCommandsInDirectory(
      globalCommandsPath,
      false,
    );

    // Scan project commands
    const projectCommandsPath = path.join(rootPath, ".claude", "commands");
    console.log(`Project commands path: ${projectCommandsPath}`);
    const projectCommands = await scanCommandsInDirectory(
      projectCommandsPath,
      true,
    );

    // This is where the extension would send results back to webview
    const results = {
      globalCommands,
      projectCommands,
    };

    console.log("\n=== FINAL RESULTS ===");
    console.log(
      "Results that would be sent to webview:",
      JSON.stringify(results, null, 2),
    );

    return results;
  } catch (error) {
    console.error("Error scanning commands:", error);
    return {
      globalCommands: [],
      projectCommands: [],
    };
  }
}

// Test with the current workspace
const testRootPath = "/workspaces/vsix/claude-runner";
console.log(`Testing with root path: ${testRootPath}`);

scanCommands(testRootPath);
