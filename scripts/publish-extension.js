#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");

/**
 * Publishes the VSCode extension to marketplace
 */
function publishExtension() {
  const rootDir = path.join(__dirname, "..");

  console.log("📦 Publishing Claude Runner Extension to VSCode Marketplace...");

  // Build extension
  console.log("🔨 Building extension...");
  execSync("npm run compile-production", { cwd: rootDir, stdio: "inherit" });

  // Package extension
  console.log("📦 Packaging extension...");
  execSync("npm run package", { cwd: rootDir, stdio: "inherit" });

  // Publish to marketplace
  console.log("🚀 Publishing to VSCode Marketplace...");
  try {
    execSync("vsce publish", { cwd: rootDir, stdio: "inherit" });
    console.log("✅ Extension published successfully!");
  } catch (error) {
    console.error("❌ Failed to publish extension:", error.message);
    console.log("💡 Make sure you have vsce installed and are logged in:");
    console.log("   npm install -g @vscode/vsce");
    console.log("   vsce login <publisher>");
    process.exit(1);
  }
}

if (require.main === module) {
  publishExtension();
}

module.exports = { publishExtension };
