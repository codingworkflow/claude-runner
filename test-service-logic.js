// Test the service logic directly using the same patterns
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

async function scanCommandsInDirectory(dirPath, isProject) {
  try {
    console.log(`Scanning commands directory: ${dirPath}`);

    // Check if directory exists
    try {
      await fs.access(dirPath);
    } catch {
      console.log(`Directory does not exist: ${dirPath}`);
      return [];
    }

    const files = await fs.readdir(dirPath);
    console.log(`Found files in ${dirPath}:`, files);

    const commands = [];

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

async function scanCommands(rootPath) {
  try {
    console.log("=== Starting Command Scan (Service Logic) ===");

    // Scan global commands
    const globalCommandsPath = path.join(os.homedir(), ".claude", "commands");
    const globalCommands = await scanCommandsInDirectory(
      globalCommandsPath,
      false,
    );

    // Scan project commands
    const projectCommands = [];
    if (rootPath) {
      const projectCommandsPath = path.join(rootPath, ".claude", "commands");
      projectCommands.push(
        ...(await scanCommandsInDirectory(projectCommandsPath, true)),
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

// Test with actual workspace
async function testServiceLogic() {
  const rootPath = "/workspaces/vsix/claude-runner";
  console.log(`Testing service logic with root path: ${rootPath}`);

  const result = await scanCommands(rootPath);

  console.log("\n=== SERVICE LOGIC RESULTS ===");
  console.log(`Global commands: ${result.globalCommands.length}`);
  result.globalCommands.forEach((cmd) => {
    console.log(`- ${cmd.name}: "${cmd.description}" (${cmd.path})`);
  });

  console.log(`\nProject commands: ${result.projectCommands.length}`);
  result.projectCommands.forEach((cmd) => {
    console.log(`- ${cmd.name}: "${cmd.description}" (${cmd.path})`);
  });

  // Validation
  if (result.globalCommands.length === 0) {
    console.log("\n❌ ISSUE: Service logic failed to detect global commands");
  } else {
    console.log("\n✅ SUCCESS: Service logic works correctly");
  }
}

testServiceLogic();
