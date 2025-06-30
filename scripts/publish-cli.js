#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Publishes the CLI package to npm
 */
function publishCLI() {
  const cliDir = path.join(__dirname, "..", "cli");

  console.log("📦 Publishing Claude Runner CLI to npm...");

  // Ensure CLI is built
  console.log("🔨 Building CLI...");
  execSync("npm run build-cli", {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });

  // Check if package.json exists in CLI directory
  const cliPackageJson = path.join(cliDir, "package.json");
  if (!fs.existsSync(cliPackageJson)) {
    console.error("❌ CLI package.json not found!");
    process.exit(1);
  }

  // Publish CLI package
  console.log("🚀 Publishing to npm...");
  try {
    execSync("npm publish", { cwd: cliDir, stdio: "inherit" });
    console.log("✅ CLI published successfully!");
  } catch (error) {
    console.error("❌ Failed to publish CLI:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  publishCLI();
}

module.exports = { publishCLI };
