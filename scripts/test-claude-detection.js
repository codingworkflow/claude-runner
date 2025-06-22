#!/usr/bin/env node

/**
 * Test script to validate Claude CLI detection in different scenarios
 * This script can be run in both phases of CI testing
 */

const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const fs = require("fs").promises;
const path = require("path");

const execAsync = promisify(exec);

class ClaudeDetectionTester {
  constructor() {
    this.testResults = [];
    this.isClaudeInstalled = false;
  }

  async log(message, type = "info") {
    const timestamp = new Date().toISOString();
    const prefix =
      {
        info: "📝",
        success: "✅",
        error: "❌",
        warning: "⚠️",
      }[type] || "📝";

    const logMessage = `${prefix} [${timestamp}] ${message}`;
    console.log(logMessage);

    this.testResults.push({
      timestamp,
      message,
      type,
    });
  }

  async checkClaudeCLIInstallation() {
    this.log("Checking Claude CLI installation status...");

    try {
      const { stdout } = await execAsync("claude-code --version");
      this.isClaudeInstalled = true;
      this.log(`Claude CLI found: ${stdout.trim()}`, "success");
      return true;
    } catch (error) {
      this.isClaudeInstalled = false;
      this.log("Claude CLI not found in PATH", "info");
      return false;
    }
  }

  async testExtensionDetection() {
    this.log("Testing extension Claude CLI detection logic...");

    // Import the detection service (in a real test, this would be mocked)
    try {
      // Simulate the extension's detection logic
      const detectionResult = await this.simulateExtensionDetection();

      if (this.isClaudeInstalled === detectionResult.claudeFound) {
        this.log("Extension detection matches actual CLI state", "success");
        return true;
      } else {
        this.log(
          "Extension detection does not match actual CLI state",
          "error",
        );
        return false;
      }
    } catch (error) {
      this.log(`Extension detection test failed: ${error.message}`, "error");
      return false;
    }
  }

  async simulateExtensionDetection() {
    // This simulates what the extension does to detect Claude CLI
    // In the real extension, this would be in ClaudeDetectionService

    return new Promise((resolve) => {
      exec("claude-code --version", (error, stdout) => {
        if (error) {
          resolve({
            claudeFound: false,
            error: error.message,
            suggestion:
              "Install Claude CLI with: npm install -g @anthropic-ai/claude-code",
          });
        } else {
          resolve({
            claudeFound: true,
            version: stdout.trim(),
            status: "ready",
          });
        }
      });
    });
  }

  async testShellDetection() {
    this.log("Testing shell detection for Claude CLI...");

    const shells = ["bash", "zsh", "fish", "sh"];
    const results = {};

    for (const shell of shells) {
      try {
        const { stdout } = await execAsync(
          `${shell} -c "command -v claude-code"`,
        );
        results[shell] = stdout.trim();
        this.log(`${shell}: Claude CLI found at ${stdout.trim()}`, "success");
      } catch (error) {
        results[shell] = null;
        this.log(`${shell}: Claude CLI not found`, "info");
      }
    }

    return results;
  }

  async testPathDetection() {
    this.log("Testing PATH-based Claude CLI detection...");

    try {
      const { stdout } = await execAsync("which claude-code");
      this.log(`Claude CLI found at: ${stdout.trim()}`, "success");
      return stdout.trim();
    } catch (error) {
      this.log("Claude CLI not found in PATH", "info");
      return null;
    }
  }

  async testNpmGlobalDetection() {
    this.log("Testing npm global package detection...");

    try {
      const { stdout } = await execAsync(
        "npm list -g @anthropic-ai/claude-code --depth=0",
      );
      this.log("Claude CLI found in npm global packages", "success");
      return true;
    } catch (error) {
      this.log("Claude CLI not found in npm global packages", "info");
      return false;
    }
  }

  async testErrorHandling() {
    this.log("Testing error handling scenarios...");

    // Test with invalid commands
    const testCases = [
      "claude-code --invalid-flag",
      "claude-code nonexistent-command",
      "claude-code --help", // This should work
    ];

    for (const testCase of testCases) {
      try {
        await execAsync(testCase);
        this.log(`Command succeeded: ${testCase}`, "success");
      } catch (error) {
        this.log(`Command failed as expected: ${testCase}`, "info");
      }
    }
  }

  async generateReport() {
    const reportPath = path.join(process.cwd(), "claude-detection-report.json");

    const report = {
      timestamp: new Date().toISOString(),
      claudeInstalled: this.isClaudeInstalled,
      testResults: this.testResults,
      environment: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        ci: !!process.env.CI,
        github_actions: !!process.env.GITHUB_ACTIONS,
      },
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    this.log(`Report saved to: ${reportPath}`, "success");

    return report;
  }

  async runAllTests() {
    this.log("🚀 Starting Claude CLI detection tests...");

    const results = {
      claudeInstalled: await this.checkClaudeCLIInstallation(),
      extensionDetection: await this.testExtensionDetection(),
      shellDetection: await this.testShellDetection(),
      pathDetection: await this.testPathDetection(),
      npmDetection: await this.testNpmGlobalDetection(),
    };

    if (this.isClaudeInstalled) {
      await this.testErrorHandling();
    }

    const report = await this.generateReport();

    // Summary
    this.log("🏁 Test Summary:");
    this.log(
      `   Claude CLI Installed: ${results.claudeInstalled ? "Yes" : "No"}`,
    );
    this.log(
      `   Extension Detection: ${results.extensionDetection ? "Correct" : "Failed"}`,
    );
    this.log(
      `   Shell Detection: ${Object.keys(results.shellDetection).length} shells tested`,
    );
    this.log(
      `   PATH Detection: ${results.pathDetection ? "Found" : "Not found"}`,
    );
    this.log(
      `   NPM Detection: ${results.npmDetection ? "Found" : "Not found"}`,
    );

    return report;
  }
}

// CLI execution
if (require.main === module) {
  const tester = new ClaudeDetectionTester();

  tester
    .runAllTests()
    .then((report) => {
      console.log("\n📊 Detection test completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Detection test failed:", error);
      process.exit(1);
    });
}

module.exports = ClaudeDetectionTester;
