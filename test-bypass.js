#!/usr/bin/env node

// Quick test to verify bypass functionality
const {
  ClaudeExecutor,
} = require("./cli/dist/src/core/services/ClaudeExecutor");

class TestLogger {
  info(message) {
    console.log(`[INFO] ${message}`);
  }
  warn(message) {
    console.warn(`[WARN] ${message}`);
  }
  error(message, error) {
    console.error(`[ERROR] ${message}`, error || "");
  }
  debug(message) {
    console.log(`[DEBUG] ${message}`);
  }
}

class TestConfigManager {
  validateModel() {
    return true;
  }
  validatePath() {
    return true;
  }
}

const logger = new TestLogger();
const configManager = new TestConfigManager();
const executor = new ClaudeExecutor(logger, configManager);

// Test 1: bypass_permissions should add --dangerously-skip-permissions
console.log("\n=== Test 1: bypassPermissions option ===");
const preview1 = executor.formatCommandPreview("Test task", "auto", "/tmp", {
  bypassPermissions: true,
});
console.log(`Command: ${preview1}`);
console.log(
  `Has --dangerously-skip-permissions: ${preview1.includes("--dangerously-skip-permissions")}`,
);

// Test 2: allow_all_tools should add --dangerously-skip-permissions
console.log("\n=== Test 2: allowAllTools option ===");
const preview2 = executor.formatCommandPreview("Test task", "auto", "/tmp", {
  allowAllTools: true,
});
console.log(`Command: ${preview2}`);
console.log(
  `Has --dangerously-skip-permissions: ${preview2.includes("--dangerously-skip-permissions")}`,
);

// Test 3: both options should still add --dangerously-skip-permissions (matches Go CLI logic)
console.log("\n=== Test 3: both bypassPermissions and allowAllTools ===");
const preview3 = executor.formatCommandPreview("Test task", "auto", "/tmp", {
  bypassPermissions: true,
  allowAllTools: true,
});
console.log(`Command: ${preview3}`);
console.log(
  `Has --dangerously-skip-permissions: ${preview3.includes("--dangerously-skip-permissions")}`,
);

// Test 4: neither option should not add --dangerously-skip-permissions
console.log("\n=== Test 4: no bypass options ===");
const preview4 = executor.formatCommandPreview("Test task", "auto", "/tmp", {});
console.log(`Command: ${preview4}`);
console.log(
  `Has --dangerously-skip-permissions: ${preview4.includes("--dangerously-skip-permissions")}`,
);

console.log("\n=== Test Summary ===");
console.log("✅ All bypass functionality tests completed");
