# End-to-End Test Plan for Claude Runner VSCode Extension

## Overview

This document outlines the plan for implementing TRUE end-to-end (E2E) tests for the Claude Runner VSCode extension. These tests will run actual VSCode instances and interact with real UI elements, webviews, and commands - no mocking of core functionality.

## Test Framework Strategy

### Primary Framework: Real VSCode Instance Testing

- **`vscode-extension-tester`**: Selenium WebDriver-based tool for REAL UI automation of VSCode
- **`@vscode/test-electron`**: Official VSCode testing for API integration and extension lifecycle
- **Mocha**: Test framework for both tools
- **Real Claude CLI**: Tests will use actual Claude CLI installation (when available)

### Test Environment Options

- **Host Machine Testing**: Full E2E tests with real VSCode UI (preferred for comprehensive testing)
- **CI/CD with Display**: Using xvfb for headless but real VSCode instances
- **Dev Container Limitations**: Note that true E2E UI testing is limited in containers

## Test Architecture

### Directory Structure (Real E2E Testing)

```
tests/
├── unit/                           # Pure unit tests (isolated logic)
│   ├── services/
│   │   ├── claude-service.test.ts
│   │   ├── config-service.test.ts
│   │   └── utils.test.ts
│   └── webview/
│       └── message-logic.test.ts
├── integration/                    # VSCode API tests (real VSCode, no UI)
│   ├── fixtures/
│   │   ├── sample-workspace/
│   │   └── test-projects/
│   ├── suite/
│   │   ├── index.ts                # Test suite entry point
│   │   ├── extension.test.ts       # Extension activation
│   │   ├── commands.test.ts        # Command execution
│   │   └── configuration.test.ts   # Settings persistence
│   └── runTest.ts              # VSCode test runner
├── e2e/                            # TRUE end-to-end UI tests
│   ├── fixtures/
│   │   ├── test-workspace/
│   │   └── claude-mock/            # Mock Claude CLI for UI tests
│   ├── page-objects/
│   │   ├── ClaudeRunnerPanel.ts
│   │   ├── VSCodeWorkbench.ts
│   │   └── WebviewView.ts
│   ├── specs/
│   │   ├── extension-activation.spec.ts
│   │   ├── webview-interactions.spec.ts
│   │   ├── command-execution.spec.ts
│   │   └── full-workflows.spec.ts
│   └── utils/
│       ├── setup.ts
│       └── claude-mock-setup.ts
└── .vscode-test.js                 # VSCode test configuration
```

## Dependencies and Setup

### Required Dependencies (Real E2E Testing)

```json
{
  "devDependencies": {
    "@vscode/test-electron": "^2.3.8",
    "@vscode/test-cli": "^0.0.4",
    "vscode-extension-tester": "^8.0.0",
    "mocha": "^10.2.0",
    "@types/mocha": "^10.0.6",
    "selenium-webdriver": "^4.15.0",
    "@types/selenium-webdriver": "^4.1.19",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.8"
  }
}
```

### System Dependencies (For Real VSCode Testing)

```dockerfile
# For CI/CD environments that need real VSCode UI testing
RUN apt-get update && apt-get install -y \
    # Display server for headless UI testing
    xvfb \
    # VSCode runtime dependencies
    libasound2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libgconf-2-4 \
    libxrandr2 \
    libasound2-dev \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0
```

### Package.json Scripts (Real E2E Testing)

```json
{
  "scripts": {
    "test:unit": "jest tests/unit",
    "test:unit:watch": "jest tests/unit --watch",
    "test:integration": "vscode-test",
    "test:integration:headless": "xvfb-run -a vscode-test",
    "test:e2e:setup": "extest setup-tests",
    "test:e2e:run": "extest run-tests tests/e2e/specs/*.spec.ts",
    "test:e2e:headed": "extest run-tests tests/e2e/specs/*.spec.ts --headed",
    "test:e2e": "npm run test:e2e:setup && npm run test:e2e:run",
    "test:e2e:headless": "xvfb-run -a npm run test:e2e",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e:headless",
    "test:ci": "npm run compile && npm run lint && npm run test:all",
    "pretest": "npm run compile && npm run lint"
  }
}
```

## Test Categories and Requirements

### 1. Unit Tests (Business Logic Only)

**File**: `tests/unit/services/claude-service.test.ts`

**Requirements Checklist**:

- [ ] Claude CLI version detection logic
- [ ] Command construction and parsing logic
- [ ] Configuration validation and defaults
- [ ] Error handling and message formatting
- [ ] Model selection and validation logic
- [ ] Path resolution and sanitization

**Test Cases** (These remain unit tests with mocks):

```typescript
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";

describe("ClaudeCodeService (Unit)", () => {
  let service: ClaudeCodeService;

  beforeEach(() => {
    service = new ClaudeCodeService();
  });

  it("should construct valid claude command", () => {
    const command = service.buildCommand({
      model: "claude-3-5-sonnet-20241022",
      task: "test task",
      rootPath: "/workspace",
    });
    expect(command).toContain("claude");
    expect(command).toContain("--model");
    expect(command).toContain("claude-3-5-sonnet-20241022");
  });

  it("should validate model names", () => {
    expect(service.isValidModel("claude-3-5-sonnet-20241022")).toBe(true);
    expect(service.isValidModel("invalid-model")).toBe(false);
  });

  it("should sanitize paths correctly", () => {
    const sanitized = service.sanitizePath("/path/with spaces/file.txt");
    expect(sanitized).toBe('"/path/with spaces/file.txt"');
  });
});
```

### 2. Integration Tests (Real VSCode, No UI)

**File**: `tests/integration/suite/extension.test.ts`

**Requirements Checklist**:

- [ ] Extension activates in real VSCode instance
- [ ] Commands register correctly via VSCode API
- [ ] Configuration integrates with VSCode settings API
- [ ] Webview panel provider initializes correctly
- [ ] Services are properly instantiated
- [ ] Extension lifecycle events work correctly

**Test Cases** (Real VSCode, but no UI interaction):

```typescript
import * as vscode from "vscode";
import * as assert from "assert";
import * as path from "path";

suiteSetup(async function () {
  // Wait for extension to activate
  this.timeout(30000);
});

test("Extension should activate", async function () {
  this.timeout(10000);
  const ext = vscode.extensions.getExtension("claude-runner.claude-runner");
  assert.ok(ext, "Extension should be found");

  if (!ext.isActive) {
    await ext.activate();
  }
  assert.ok(ext.isActive, "Extension should be active");
});

test("Commands should be registered", async () => {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(
    commands.includes("claude-runner.openPanel"),
    "openPanel command should be registered",
  );
  assert.ok(
    commands.includes("claude-runner.runTask"),
    "runTask command should be registered",
  );
});

test("Configuration should persist", async () => {
  const config = vscode.workspace.getConfiguration("claude-runner");

  // Test setting and getting configuration
  await config.update(
    "defaultModel",
    "claude-3-5-sonnet-20241022",
    vscode.ConfigurationTarget.Workspace,
  );
  const model = config.get("defaultModel");
  assert.strictEqual(model, "claude-3-5-sonnet-20241022");
});

test("Panel provider should be available", async () => {
  // Test that webview panel can be created (but don't test UI)
  const result = await vscode.commands.executeCommand(
    "claude-runner.openPanel",
  );
  assert.ok(result !== undefined, "Panel should open successfully");
});
```

### 3. E2E UI Tests (Real VSCode, Real Interactions)

**File**: `tests/e2e/specs/webview-interactions.spec.ts`

**Requirements Checklist** (REAL UI Testing):

- [ ] Extension panel opens in VSCode activity bar
- [ ] Webview loads and displays actual UI
- [ ] Model selector dropdown works with real clicks
- [ ] Root path selection opens real file browser
- [ ] Allow All Tools toggle actually toggles state
- [ ] Tab switching between Chat/Pipeline/Config works
- [ ] Chat prompt input accepts real text input
- [ ] Pipeline task management (add/remove/reorder) works
- [ ] Real buttons can be clicked and respond

**Test Cases** (REAL UI interactions using Selenium):

```typescript
import {
  VSBrowser,
  ActivityBar,
  SideBarView,
  WebView,
} from "vscode-extension-tester";
import { expect } from "chai";

describe("Claude Runner E2E UI Tests", () => {
  let driver: WebDriver;
  let browser: VSBrowser;

  before(async function () {
    this.timeout(30000);
    browser = VSBrowser.instance;
    driver = browser.driver;
  });

  it("should open Claude Runner panel from activity bar", async function () {
    this.timeout(10000);

    const activityBar = new ActivityBar();
    const viewControl = activityBar.getViewControl("Claude Runner");
    expect(viewControl).to.not.be.undefined;

    const sideBarView = await viewControl!.openView();
    expect(sideBarView).to.not.be.undefined;
  });

  it("should load webview content", async function () {
    this.timeout(15000);

    const activityBar = new ActivityBar();
    const view = await activityBar.getViewControl("Claude Runner")!.openView();
    const webview = view.content.getWebview();

    await webview.switchToFrame();

    // Check that actual UI elements are present
    const modelSelector = await webview.findWebElement(
      '[data-testid="model-selector"]',
    );
    expect(modelSelector).to.not.be.undefined;

    const chatTab = await webview.findWebElement('[data-testid="chat-tab"]');
    expect(chatTab).to.not.be.undefined;

    await webview.switchBack();
  });

  it("should interact with model selector", async function () {
    this.timeout(10000);

    const activityBar = new ActivityBar();
    const view = await activityBar.getViewControl("Claude Runner")!.openView();
    const webview = view.content.getWebview();

    await webview.switchToFrame();

    // Click model selector
    const modelSelector = await webview.findWebElement(
      '[data-testid="model-selector"]',
    );
    await modelSelector.click();

    // Select a model
    const sonnetOption = await webview.findWebElement(
      '[data-value="claude-3-5-sonnet-20241022"]',
    );
    await sonnetOption.click();

    // Verify selection
    const selectedValue = await modelSelector.getAttribute("value");
    expect(selectedValue).to.equal("claude-3-5-sonnet-20241022");

    await webview.switchBack();
  });

  it("should switch between tabs", async function () {
    this.timeout(10000);

    const activityBar = new ActivityBar();
    const view = await activityBar.getViewControl("Claude Runner")!.openView();
    const webview = view.content.getWebview();

    await webview.switchToFrame();

    // Click Pipeline tab
    const pipelineTab = await webview.findWebElement(
      '[data-testid="pipeline-tab"]',
    );
    await pipelineTab.click();

    // Verify pipeline content is visible
    const pipelineContent = await webview.findWebElement(
      '[data-testid="pipeline-content"]',
    );
    const isDisplayed = await pipelineContent.isDisplayed();
    expect(isDisplayed).to.be.true;

    await webview.switchBack();
  });
});
```

### 4. E2E Command Execution Tests (Real Workflow)

**File**: `tests/e2e/specs/command-execution.spec.ts`

**Requirements Checklist** (REAL end-to-end workflow):

- [ ] Task execution through UI creates real terminal
- [ ] Chat mode opens actual terminal session
- [ ] Pipeline mode executes multiple tasks sequentially
- [ ] Real Claude CLI integration (with fallback to mock)
- [ ] Terminal output is captured and displayed
- [ ] Error handling shows real error messages in UI
- [ ] Command cancellation actually stops processes
- [ ] File selection works with real file browser

**E2E Test Cases** (Full workflow testing):

```typescript
import {
  VSBrowser,
  ActivityBar,
  TerminalView,
  BottomBarPanel,
} from "vscode-extension-tester";
import { expect } from "chai";
import * as path from "path";

describe("Claude Runner E2E Command Execution", () => {
  let driver: WebDriver;

  before(async function () {
    this.timeout(30000);
    driver = VSBrowser.instance.driver;
  });

  beforeEach(async function () {
    // Setup mock Claude CLI if real one not available
    await setupMockClaudeForE2E();
  });

  it("should execute task through UI and open terminal", async function () {
    this.timeout(20000);

    // Open Claude Runner panel
    const activityBar = new ActivityBar();
    const view = await activityBar.getViewControl("Claude Runner")!.openView();
    const webview = view.content.getWebview();

    await webview.switchToFrame();

    // Switch to Task mode
    const taskTab = await webview.findWebElement('[data-testid="task-tab"]');
    await taskTab.click();

    // Enter a task
    const taskInput = await webview.findWebElement(
      '[data-testid="task-input"]',
    );
    await taskInput.clear();
    await taskInput.sendKeys("List files in current directory");

    // Click execute
    const executeButton = await webview.findWebElement(
      '[data-testid="execute-task"]',
    );
    await executeButton.click();

    await webview.switchBack();

    // Verify terminal opened
    const bottomBar = new BottomBarPanel();
    await bottomBar.openTerminalView();

    const terminalView = new TerminalView();
    const terminals = await terminalView.getChannelNames();

    expect(terminals).to.include("Claude Runner");
  });

  it("should start chat session and interact with terminal", async function () {
    this.timeout(25000);

    const activityBar = new ActivityBar();
    const view = await activityBar.getViewControl("Claude Runner")!.openView();
    const webview = view.content.getWebview();

    await webview.switchToFrame();

    // Make sure we're on Chat tab
    const chatTab = await webview.findWebElement('[data-testid="chat-tab"]');
    await chatTab.click();

    // Add initial prompt
    const addPromptButton = await webview.findWebElement(
      '[data-testid="add-prompt-button"]',
    );
    await addPromptButton.click();

    const promptTextarea = await webview.findWebElement(
      '[data-testid="chat-prompt"]',
    );
    await promptTextarea.sendKeys("Help me analyze this codebase");

    // Start chat session
    const startChatButton = await webview.findWebElement(
      '[data-testid="start-chat"]',
    );
    await startChatButton.click();

    await webview.switchBack();

    // Verify interactive terminal opened
    const bottomBar = new BottomBarPanel();
    await bottomBar.openTerminalView();

    const terminalView = new TerminalView();
    const terminals = await terminalView.getChannelNames();

    expect(terminals).to.include("Claude Chat");

    // Check that terminal has content (mock or real)
    const terminalText = await terminalView.getText();
    expect(terminalText.length).to.be.greaterThan(0);
  });

  it("should handle pipeline execution", async function () {
    this.timeout(30000);

    const activityBar = new ActivityBar();
    const view = await activityBar.getViewControl("Claude Runner")!.openView();
    const webview = view.content.getWebview();

    await webview.switchToFrame();

    // Switch to Pipeline tab
    const pipelineTab = await webview.findWebElement(
      '[data-testid="pipeline-tab"]',
    );
    await pipelineTab.click();

    // Add multiple tasks
    const addTaskButton = await webview.findWebElement(
      '[data-testid="add-task-button"]',
    );

    // First task
    await addTaskButton.click();
    const taskInput1 = await webview.findWebElement(
      '[data-testid="pipeline-task-input"]',
    );
    await taskInput1.sendKeys("Analyze project structure");

    // Second task
    await addTaskButton.click();
    const taskInputs = await webview.findWebElements(
      '[data-testid="pipeline-task-input"]',
    );
    await taskInputs[1].sendKeys("Generate documentation");

    // Execute pipeline
    const executePipelineButton = await webview.findWebElement(
      '[data-testid="execute-pipeline"]',
    );
    await executePipelineButton.click();

    await webview.switchBack();

    // Verify terminal shows pipeline execution
    const bottomBar = new BottomBarPanel();
    await bottomBar.openTerminalView();

    const terminalView = new TerminalView();
    const terminalText = await terminalView.getText();

    // Should show pipeline execution (mock or real)
    expect(terminalText).to.include("pipeline");
  });
});

// Helper function to setup mock Claude CLI for E2E tests
async function setupMockClaudeForE2E() {
  // Create a mock claude executable in PATH for E2E testing
  // This allows UI tests to work without requiring real Claude CLI
  // Implementation would create a temporary script that mimics claude behavior
}
```

### 4. State Persistence Tests

**File**: `tests/e2e/specs/state-persistence.spec.ts`

**Requirements Checklist**:

- [ ] UI state persists across panel close/reopen
- [ ] Configuration changes are saved
- [ ] Task history is maintained
- [ ] Session state survives VS Code restart
- [ ] Workspace-specific settings work

### 5. Error Handling Tests

**File**: `tests/e2e/specs/error-handling.spec.ts`

**Requirements Checklist**:

- [ ] Claude CLI not installed shows proper error screen
- [ ] Invalid model selection shows error
- [ ] File path errors are handled gracefully
- [ ] Command execution errors display correctly
- [ ] Network/timeout errors are handled
- [ ] Shell detection failures show shell selector

### 6. Visual Regression Tests

**File**: `tests/e2e/specs/visual-regression.spec.ts`

**Requirements Checklist**:

- [ ] Panel layout renders correctly
- [ ] Tab content displays properly
- [ ] Button states are visually correct
- [ ] Error screens match expected design
- [ ] Loading states are consistent
- [ ] Responsive layout works

## Mock Strategy

### Claude CLI Mocking for Integration Tests

```typescript
// tests/integration/utils/mock-claude.ts
export class MockClaudeService {
  static setupEnvironmentMocks() {
    // Mock Claude CLI executable detection
    // Simulate different installation scenarios
    // Control command execution responses
    process.env.CLAUDE_MOCK_MODE = "true";
  }

  static mockSuccessfulExecution(command: string, output: string) {
    // Mock successful Claude command execution
  }

  static mockFailedExecution(command: string, error: string) {
    // Mock failed Claude command execution
  }
}
```

### VSCode API Integration

- Use VSCode's built-in testing capabilities for API mocking
- Mock terminal creation and management through VSCode API
- Mock file system operations using VSCode workspace API
- Test configuration persistence through VSCode settings API

### E2E Testing Mocks

````typescript
// tests/e2e/utils/webdriver-setup.ts
export class E2ETestSetup {
  static async setupMockClaude() {
    // Setup mock Claude CLI for E2E tests
    // Create fake executable in test environment
    // Configure test workspace with mock responses
  }
}

## Configuration Files

### VSCode Test Configuration (Real VSCode)
```javascript
// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  files: 'out/tests/integration/**/*.test.js',
  workspaceFolder: './tests/integration/fixtures/sample-workspace',
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true
  },
  // Use stable VSCode for consistent testing
  version: 'stable',
  // Launch args for headless testing
  launchArgs: [
    '--disable-extensions',
    '--disable-workspace-trust',
    '--disable-telemetry'
  ]
});
````

### E2E Test Configuration (Real UI Testing)

```typescript
// tests/e2e/utils/setup.ts
import { VSBrowser, WebDriver } from "vscode-extension-tester";
import * as path from "path";

export async function setupE2ETests(): Promise<WebDriver> {
  const browser = VSBrowser.instance;

  // Configure for extension testing
  await browser.start({
    // Use specific VSCode version for consistency
    vscodeVersion: "1.85.0",

    // Extension to test
    extensionDevelopmentPath: path.resolve(__dirname, "../../../"),

    // Test workspace
    testWorkspace: path.resolve(__dirname, "../fixtures/test-workspace"),

    // Browser settings
    settings: {
      // Disable other extensions during testing
      "extensions.autoUpdate": false,
      "extensions.autoCheckUpdates": false,
      "workbench.startupEditor": "none",
    },

    // For CI environments
    cleanUp: true,

    // Headless mode for CI
    headless: process.env.CI === "true",
  });

  return browser.driver;
}

export async function teardownE2ETests(): Promise<void> {
  await VSBrowser.instance.quit();
}
```

### Integration Test Suite Setup (Dev Container)

```typescript
// tests/integration/suite/index.ts
import * as path from "path";
import * as Mocha from "mocha";
import * as glob from "glob";
import { setupContainerMocks } from "../../mocks/container-setup";

export function run(): Promise<void> {
  // Setup container-specific mocks
  setupContainerMocks();

  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 20000, // Increased timeout for container environment
    slow: 10000,
    reporter: "spec",
  });

  const testsRoot = path.resolve(__dirname, "..");

  return new Promise((resolve, reject) => {
    glob("**/**.test.js", { cwd: testsRoot }, (err, files) => {
      if (err) {
        return reject(err);
      }

      // Filter out tests that require UI in container environment
      const containerSafeTests = files.filter(
        (f) => !f.includes("ui-") && !f.includes("visual-"),
      );

      containerSafeTests.forEach((f) =>
        mocha.addFile(path.resolve(testsRoot, f)),
      );

      try {
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed in container.`));
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}
```

### Jest Configuration for Unit Tests

```javascript
// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/unit/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/test/**"],
  setupFilesAfterEnv: ["<rootDir>/tests/mocks/jest-setup.ts"],
  moduleNameMapping: {
    "^vscode$": "<rootDir>/tests/mocks/vscode-api.ts",
  },
  testTimeout: 10000,
};
```

## Test Data and Fixtures

### Sample Workspace

```
tests/e2e/fixtures/sample-workspace/
├── package.json
├── src/
│   ├── main.ts
│   └── utils.ts
├── README.md
└── .vscode/
    └── settings.json
```

### Test Projects

- JavaScript project
- TypeScript project
- Python project
- Multi-language project

## Page Objects (Real UI Testing)

### VSCode Workbench Page Object

```typescript
// tests/e2e/page-objects/VSCodeWorkbench.ts
import {
  ActivityBar,
  SideBarView,
  ViewSection,
  WebDriver,
} from "vscode-extension-tester";

export class VSCodeWorkbench {
  constructor(private driver: WebDriver) {}

  async openClaudeRunnerPanel(): Promise<SideBarView> {
    const activityBar = new ActivityBar();
    const viewControl = activityBar.getViewControl("Claude Runner");
    if (!viewControl) {
      throw new Error("Claude Runner not found in activity bar");
    }
    return await viewControl.openView();
  }

  async getClaudeRunnerSection(): Promise<ViewSection> {
    const view = await this.openClaudeRunnerPanel();
    return await view.getContent().getSection("Claude Runner");
  }

  async executeCommand(command: string): Promise<void> {
    await this.driver.executeScript(`
      return vscode.commands.executeCommand('${command}');
    `);
  }

  async isExtensionActive(): Promise<boolean> {
    const result = await this.driver.executeScript(`
      const ext = vscode.extensions.getExtension('claude-runner.claude-runner');
      return ext && ext.isActive;
    `);
    return result as boolean;
  }
}
```

### Claude Runner Panel Page Object

```typescript
// tests/e2e/page-objects/ClaudeRunnerPanel.ts
import { WebView, WebDriver } from "vscode-extension-tester";
import { By, until } from "selenium-webdriver";

export class ClaudeRunnerPanel {
  constructor(
    private webview: WebView,
    private driver: WebDriver,
  ) {}

  async switchToWebviewFrame(): Promise<void> {
    await this.webview.switchToFrame();
  }

  async switchBack(): Promise<void> {
    await this.webview.switchBack();
  }

  async selectModel(model: string): Promise<void> {
    await this.switchToWebviewFrame();
    try {
      const selector = await this.driver.wait(
        until.elementLocated(By.css('[data-testid="model-selector"]')),
        5000,
      );
      await selector.click();

      const option = await this.driver.wait(
        until.elementLocated(By.css(`[data-value="${model}"]`)),
        5000,
      );
      await option.click();
    } finally {
      await this.switchBack();
    }
  }

  async setRootPath(path: string): Promise<void> {
    await this.switchToWebviewFrame();
    try {
      const pathInput = await this.driver.findElement(
        By.css('[data-testid="root-path-input"]'),
      );
      await pathInput.clear();
      await pathInput.sendKeys(path);
    } finally {
      await this.switchBack();
    }
  }

  async clickTab(tabName: "chat" | "pipeline" | "config"): Promise<void> {
    await this.switchToWebviewFrame();
    try {
      const tab = await this.driver.findElement(
        By.css(`[data-testid="${tabName}-tab"]`),
      );
      await tab.click();

      // Wait for tab content to be visible
      await this.driver.wait(
        until.elementLocated(By.css(`[data-testid="${tabName}-content"]`)),
        5000,
      );
    } finally {
      await this.switchBack();
    }
  }

  async executeTask(task: string): Promise<void> {
    await this.switchToWebviewFrame();
    try {
      // Ensure we're on task tab
      await this.clickTab("chat");

      const taskInput = await this.driver.findElement(
        By.css('[data-testid="task-input"]'),
      );
      await taskInput.clear();
      await taskInput.sendKeys(task);

      const executeButton = await this.driver.findElement(
        By.css('[data-testid="execute-task"]'),
      );
      await executeButton.click();

      // Wait for execution to start
      await this.driver.wait(
        until.elementLocated(By.css('[data-testid="task-running"]')),
        5000,
      );
    } finally {
      await this.switchBack();
    }
  }

  async addPipelineTask(task: string): Promise<void> {
    await this.switchToWebviewFrame();
    try {
      await this.clickTab("pipeline");

      const addButton = await this.driver.findElement(
        By.css('[data-testid="add-task-button"]'),
      );
      await addButton.click();

      const taskInput = await this.driver.findElement(
        By.css('[data-testid="pipeline-task-input"]:last-child'),
      );
      await taskInput.sendKeys(task);
    } finally {
      await this.switchBack();
    }
  }

  async startChatSession(prompt?: string): Promise<void> {
    await this.switchToWebviewFrame();
    try {
      await this.clickTab("chat");

      if (prompt) {
        const addPromptButton = await this.driver.findElement(
          By.css('[data-testid="add-prompt-button"]'),
        );
        await addPromptButton.click();

        const promptInput = await this.driver.findElement(
          By.css('[data-testid="chat-prompt"]'),
        );
        await promptInput.sendKeys(prompt);
      }

      const startButton = await this.driver.findElement(
        By.css('[data-testid="start-chat"]'),
      );
      await startButton.click();
    } finally {
      await this.switchBack();
    }
  }

  async waitForTaskCompletion(timeout: number = 30000): Promise<void> {
    await this.switchToWebviewFrame();
    try {
      await this.driver.wait(
        until.elementLocated(
          By.css('[data-testid="task-completed"], [data-testid="task-error"]'),
        ),
        timeout,
      );
    } finally {
      await this.switchBack();
    }
  }
}
```

### Mock Claude CLI for E2E Testing

```typescript
// tests/e2e/utils/claude-mock-setup.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export async function setupMockClaudeForE2E(): Promise<string> {
  // Create a mock claude executable for E2E tests
  const mockClaudePath = path.join(os.tmpdir(), "claude-mock");

  const mockScript = `#!/bin/bash
# Mock Claude CLI for E2E testing

case "$1" in
  "chat")
    echo "Starting mock chat session..."
    echo "Mock response: I'm ready to help with your project!"
    ;;
  "--version")
    echo "Claude CLI 1.0.0 (mock)"
    ;;
  *)
    echo "Mock Claude executed with: $*"
    echo "Mock response for task: $*"
    ;;
esac
`;

  fs.writeFileSync(mockClaudePath, mockScript);
  fs.chmodSync(mockClaudePath, "755");

  // Add to PATH for the test session
  const currentPath = process.env.PATH || "";
  process.env.PATH = `${path.dirname(mockClaudePath)}:${currentPath}`;

  return mockClaudePath;
}

export function cleanupMockClaude(mockPath: string): void {
  if (fs.existsSync(mockPath)) {
    fs.unlinkSync(mockPath);
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow (Real E2E Testing)

```yaml
# .github/workflows/extension-tests.yml
name: Extension Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "18"
      - name: Install dependencies
        run: npm ci
      - name: Run Unit Tests
        run: npm run test:unit
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

  integration-tests:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "18"
      - name: Install dependencies
        run: npm ci
      - name: Setup display (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb libasound2 libgbm1 libgtk-3-0 libnss3
      - name: Compile extension
        run: npm run compile
      - name: Run Integration Tests
        run: |
          if [ "$RUNNER_OS" == "Linux" ]; then
            xvfb-run -a npm run test:integration
          else
            npm run test:integration
          fi
        shell: bash
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: integration-test-results-${{ matrix.os }}
          path: |
            .vscode-test/
            test-results/

  e2e-tests:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "18"
      - name: Install dependencies
        run: npm ci
      - name: Setup display and dependencies (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            xvfb \
            libasound2 \
            libgbm1 \
            libgtk-3-0 \
            libnss3 \
            libxss1 \
            libgconf-2-4 \
            libxrandr2 \
            libpangocairo-1.0-0 \
            libatk1.0-0 \
            libcairo-gobject2 \
            libgdk-pixbuf2.0-0
      - name: Setup mock Claude CLI
        run: |
          # Create mock claude executable for E2E tests
          mkdir -p $HOME/bin
          echo '#!/bin/bash' > $HOME/bin/claude
          echo 'echo "Mock Claude response for: $*"' >> $HOME/bin/claude
          chmod +x $HOME/bin/claude
          echo "$HOME/bin" >> $GITHUB_PATH
      - name: Compile extension
        run: npm run compile
      - name: Setup E2E Tests
        run: npm run test:e2e:setup
      - name: Run E2E Tests
        run: |
          if [ "$RUNNER_OS" == "Linux" ]; then
            xvfb-run -a npm run test:e2e:run
          else
            npm run test:e2e:run
          fi
        shell: bash
        env:
          CI: true
      - name: Upload E2E test artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-test-artifacts-${{ matrix.os }}
          path: |
            test-results/
            screenshots/
            logs/
```

### Makefile Integration (Real E2E Testing)

```makefile
# Add to existing Makefile
# Unit tests (fast, no VSCode required)
test-unit:
	npm run test:unit

# Integration tests (real VSCode, no UI)
test-integration:
	npm run test:integration

test-integration-headless:
	xvfb-run -a npm run test:integration

# E2E tests (real VSCode with UI automation)
test-e2e-setup:
	npm run test:e2e:setup

test-e2e:
	npm run test:e2e

test-e2e-headless:
	xvfb-run -a npm run test:e2e

test-e2e-headed:
	npm run test:e2e:headed

# Full test suite
test-all: test-unit test-integration test-e2e
	@echo "All extension tests completed"

# CI-friendly test command
test-ci:
	@if [ "$(shell uname)" = "Linux" ]; then \
		make test-unit && make test-integration-headless && make test-e2e-headless; \
	else \
		make test-unit && make test-integration && make test-e2e; \
	fi

# Development testing (headed mode for debugging)
test-dev:
	make test-unit && make test-integration && make test-e2e-headed
```

## Implementation Phases

### Phase 1: Foundation Testing (Week 1)

- [ ] Setup Jest for unit testing of business logic
- [ ] Install and configure `@vscode/test-electron` for integration tests
- [ ] Install and configure `vscode-extension-tester` for E2E tests
- [ ] Create test workspace and fixtures
- [ ] Implement basic extension activation tests

### Phase 2: Integration Testing (Week 2)

- [ ] Test extension lifecycle (activation, deactivation)
- [ ] Test command registration and execution via VSCode API
- [ ] Test configuration persistence through VSCode settings
- [ ] Test webview panel creation and messaging
- [ ] Add mock Claude CLI for integration tests

### Phase 3: E2E UI Testing (Week 3)

- [ ] Setup Selenium-based page objects for VSCode UI
- [ ] Test real webview interactions (clicks, form submissions)
- [ ] Test tab switching and navigation
- [ ] Test model selection and configuration UI
- [ ] Test task input and execution through UI
- [ ] Test pipeline creation and management

### Phase 4: Complete Workflows (Week 4)

- [ ] Test complete task execution workflow (UI → terminal)
- [ ] Test chat session workflow (UI → interactive terminal)
- [ ] Test pipeline execution workflow
- [ ] Test error handling and recovery flows
- [ ] Test file selection and path configuration
- [ ] Setup CI/CD with platform matrix testing
- [ ] Add visual regression testing capabilities

## Success Criteria

### Test Coverage (Real E2E)

- [ ] 90%+ unit test coverage of business logic and services
- [ ] 100% of VSCode API integrations tested with real VSCode
- [ ] All webview UI interactions tested with real clicks and inputs
- [ ] Complete user workflows tested end-to-end
- [ ] Error scenarios tested with real error conditions
- [ ] Cross-platform compatibility validated

### Quality Gates (Real E2E)

- [ ] All unit tests pass consistently
- [ ] Integration tests pass with real VSCode instances
- [ ] E2E tests pass with real UI interactions
- [ ] Tests complete within reasonable time limits
- [ ] Zero flaky tests in stable environment
- [ ] Cross-platform compatibility verified
- [ ] Real Claude CLI integration validated (when available)

### Maintenance (Real E2E)

- [ ] Page objects maintained for VSCode UI changes
- [ ] Mock Claude CLI kept in sync with real CLI behavior
- [ ] Test selectors updated when webview UI changes
- [ ] CI environment kept stable with proper dependencies
- [ ] Platform-specific test variations maintained
- [ ] Visual regression baselines updated as needed

## Notes and Considerations

### Real E2E Testing Approach

- **Actual VSCode Instances**: Tests run in real VSCode windows with full UI
- **Real User Interactions**: Selenium WebDriver clicks actual buttons, types in real inputs
- **Genuine Workflows**: Complete user journeys from panel opening to command execution
- **Real Terminal Integration**: Actual terminals are created and commands executed
- **Authentic Webview Testing**: Real webview content interaction, not mocked

### What IS Tested End-to-End

- Extension activation in real VSCode environment
- Actual webview UI interactions (clicks, form submissions, tab switching)
- Real terminal creation and command execution
- File picker dialogs and native VSCode UI integration
- Claude CLI integration (real CLI when available, mock for CI)
- Visual layout and responsive behavior
- Cross-platform behavior differences
- Complete user workflows from start to finish

### Testing Environment Requirements

- **Host Machine**: Full E2E testing requires host OS (not containers)
- **Display Server**: xvfb for Linux CI, native display for development
- **Real VSCode**: Download and run actual VSCode instances
- **System Dependencies**: Full VSCode runtime requirements
- **Mock Claude CLI**: For CI environments without real Claude installation

### Performance Expectations

- Unit tests: < 2 minutes
- Integration tests: < 5 minutes
- E2E tests: < 15 minutes (includes VSCode startup/shutdown)
- VSCode instance startup: 5-10 seconds per test suite
- Full test suite: < 25 minutes total

### Development vs CI Testing

- **Local Development**: Full headed E2E tests for debugging and validation
- **CI/CD**: Headless E2E tests with mock Claude CLI for automated testing
- **Platform Matrix**: Test on Windows, macOS, and Linux for comprehensive coverage
- **Mock Strategy**: Smart mocking that preserves E2E workflow while enabling CI

### Maintenance Strategy

- Real E2E tests validate complete user experience
- Mock Claude CLI for CI while preserving workflow integrity
- Platform-specific testing for cross-OS compatibility
- Regular validation with real Claude CLI in development
- Visual regression testing for UI changes
