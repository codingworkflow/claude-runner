const fs = require("fs");
const path = require("path");
const os = require("os");

console.log("=== Command Detection Debug ===");

// Test the actual global commands directory
const globalCommandsPath = path.join(os.homedir(), ".claude", "commands");
console.log(`Global commands path: ${globalCommandsPath}`);
console.log(`Directory exists: ${fs.existsSync(globalCommandsPath)}`);

if (fs.existsSync(globalCommandsPath)) {
  try {
    const files = fs.readdirSync(globalCommandsPath);
    console.log(`Files found: ${files.length}`);
    console.log(`Files: ${files.join(", ")}`);

    const commands = [];

    for (const file of files) {
      if (file.endsWith(".md")) {
        const fullPath = path.join(globalCommandsPath, file);
        const name = path.basename(file, ".md");

        console.log(`\nProcessing file: ${file}`);
        console.log(`Full path: ${fullPath}`);
        console.log(`Command name: ${name}`);

        // Try to read the file for description
        let description = "";
        try {
          const content = fs.readFileSync(fullPath, "utf8");
          console.log(`File content: "${content}"`);

          // Extract first line as description
          const lines = content.split("\n");
          const firstLine = lines[0]?.trim();
          if (firstLine) {
            description = firstLine.replace(/^#+\s*|^\/\/\s*/, "").trim();
          }
          console.log(`Extracted description: "${description}"`);
        } catch (readError) {
          console.error(`Could not read file ${fullPath}:`, readError);
        }

        commands.push({
          name,
          path: fullPath,
          description,
          isProject: false,
        });
      }
    }

    console.log(`\n=== Final Results ===`);
    console.log(`Total commands found: ${commands.length}`);
    commands.forEach((cmd) => {
      console.log(`- ${cmd.name}: "${cmd.description}" (${cmd.path})`);
    });
  } catch (error) {
    console.error("Error reading directory:", error);
  }
} else {
  console.log("Global commands directory does not exist");
}

console.log("\n=== Extension Path Simulation ===");
// Simulate what the extension is doing
async function testExtensionLogic() {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");

    // Scan global commands
    const globalCommandsPath = path.join(os.homedir(), ".claude", "commands");
    console.log(`Extension scanning: ${globalCommandsPath}`);

    if (!fs.existsSync(globalCommandsPath)) {
      console.log("Extension: Directory does not exist");
      return [];
    }

    const files = fs.readdirSync(globalCommandsPath);
    console.log(`Extension found files:`, files);

    const commands = [];

    for (const file of files) {
      if (file.endsWith(".md")) {
        const fullPath = path.join(globalCommandsPath, file);
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
          console.warn(
            `Extension: Could not read command file ${fullPath}:`,
            readError,
          );
        }

        console.log(
          `Extension found command: ${name} at ${fullPath} with description: ${description}`,
        );

        commands.push({
          name,
          path: fullPath,
          description,
          isProject: false,
        });
      }
    }

    console.log(`Extension returning ${commands.length} commands`);
    return commands;
  } catch (error) {
    console.error("Extension error:", error);
    return [];
  }
}

testExtensionLogic().then((results) => {
  console.log("\n=== Extension Results ===");
  console.log("Commands:", results);
});
