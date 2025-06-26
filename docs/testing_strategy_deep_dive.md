# Testing Strategy Deep Dive: vscode-runme vs claude-runner

## E2E Testing Analysis

### vscode-runme E2E Testing Approach

#### Technology Stack

- **Framework**: WebdriverIO v8
- **Service**: wdio-vscode-service (specialized for VS Code extensions)
- **Test Runner**: Mocha
- **Browser**: VS Code instance (not traditional browser)

#### Configuration Highlights

```javascript
// tests/e2e/wdio.conf.ts
export const config: Options.Testrunner = {
  capabilities: [{
    browserName: 'vscode',
    browserVersion: 'stable',
    'wdio:vscodeOptions': {
      extensionPath,
      workspacePath,
      filePath: path.join(workspacePath, 'tests', 'fixtures', 'README.md'),
      userSettings: {
        'terminal.integrated.defaultProfile.osx': 'bash',
      },
    },
  }],

  framework: 'mocha',
  specFileRetries: 1,
  waitforTimeout: 30 * 1000,

  // Screenshot on failure
  afterTest: async function (test, __, { passed }) {
    if (!passed) {
      const screenshotDir = path.join(__dirname, 'logs', 'screenshots')
      await browser.saveScreenshot(path.join(screenshotDir, `${test.parent} - ${test.title}.png`))
    }
  },
}
```

#### E2E Testing Patterns

##### 1. Page Object Pattern

```typescript
// tests/e2e/pageobjects/notebook.page.ts
export class RunmeNotebook {
  async getCell(content: string): Promise<NotebookCell> {
    const cells = await $$(".cell-editor");
    for (const cell of cells) {
      const text = await cell.getText();
      if (text.includes(content)) {
        return new NotebookCell(cell);
      }
    }
    throw new Error(`Cell with content "${content}" not found`);
  }

  async focusDocument(): Promise<void> {
    const editor = await $(".notebook-editor");
    await editor.click();
  }
}
```

##### 2. Cell Interaction Pattern

```typescript
// tests/e2e/pageobjects/cell.page.ts
export class NotebookCell {
  constructor(private element: WebdriverIO.Element) {}

  async run(waitForSuccess = true): Promise<void> {
    const runButton = await this.element.$(".run-button");
    await runButton.click();

    if (waitForSuccess) {
      await this.getStatusBar().waitForSuccess();
    }
  }

  async getCellOutput(type: OutputType): Promise<string[]> {
    switch (type) {
      case OutputType.TerminalView:
        return this.getTerminalOutput();
      case OutputType.ShellOutput:
        return this.getShellOutput();
      case OutputType.Display:
        return this.getDisplayOutput();
    }
  }
}
```

##### 3. Test Helpers

```typescript
// tests/e2e/helpers/index.ts
export async function clearAllOutputs(workbench: Workbench): Promise<void> {
  await tryExecuteCommand(workbench, "notebook.clearAllCellsOutputs");
}

export async function killAllTerminals(workbench: Workbench): Promise<void> {
  const bottomBar = workbench.getBottomBar();
  const terminalView = await bottomBar.openTerminalView();
  await terminalView.killAll();
}

export async function getTerminalText(workbench: Workbench): Promise<string> {
  const bottomBar = workbench.getBottomBar();
  const terminalView = await bottomBar.openTerminalView();
  return terminalView.getText();
}
```

#### Test Categories

##### 1. Basic Functionality Tests

```typescript
it("basic hello world, run twice back-to-back", async () => {
  const cell = await notebook.getCell('echo "Hello World!');

  // Running 2x to avoid regression with terminal/process disposal
  await cell.run();
  await cell.run();

  expect(await cell.getCellOutput(OutputType.TerminalView)).toStrictEqual([
    "Hello World!",
  ]);
});
```

##### 2. Complex Interaction Tests

```typescript
it("stdin example", async () => {
  const cell = await notebook.getCell("node ./scripts/stdin.js");
  await cell.run(false);

  const workbench = await browser.getWorkbench();
  const bottomBar = workbench.getBottomBar();

  // User interaction simulation
  const terminalView = await bottomBar.openTerminalView();
  await terminalView.wait(1000);
  await browser.keys(["I love it", Key.Enter, "Great", Key.Enter]);

  await cell.getStatusBar().waitForSuccess();

  const text = await getTerminalText(workbench);
  expect(text).toContain("What do you think of Node.js? I love it");
});
```

##### 3. Environment Variable Tests

```typescript
it("support changes to $PATH", async () => {
  const cell = await notebook.getCell(
    'export PATH="/some/path:$PATH"\necho $PATH',
  );
  await cell.run(false);
  await browser.pause(1000);
  await browser.keys(Key.Enter);
  await cell.focus();
  await cell.getStatusBar().waitForSuccess();
});
```

---

### Proposed E2E Testing Strategy for claude-runner

#### Recommended Stack

```json
{
  "devDependencies": {
    "@wdio/cli": "^8.44.1",
    "@wdio/local-runner": "^8.44.1",
    "@wdio/mocha-framework": "^8.41.0",
    "@wdio/spec-reporter": "^8.43.0",
    "wdio-vscode-service": "^6.1.3",
    "webdriverio": "^8.40.5"
  }
}
```

#### Configuration Template

```typescript
// tests/e2e/wdio.conf.ts
import { Options } from "@wdio/types";
import path from "path";

export const config: Options.Testrunner = {
  runner: "local",
  specs: ["./tests/e2e/specs/**/*.e2e.ts"],
  maxInstances: 1,

  capabilities: [
    {
      browserName: "vscode",
      browserVersion: "stable",
      "wdio:vscodeOptions": {
        extensionPath: path.resolve(__dirname, "../.."),
        workspacePath: path.join(__dirname, "test-workspace"),
        userSettings: {
          "claudeRunner.defaultModel": "claude-3-5-sonnet-latest",
          "claudeRunner.allowAllTools": true,
        },
      },
    },
  ],

  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 600000,
  },

  before: async function () {
    // Initialize test environment
    await browser.executeWorkbench(async (vscode) => {
      await vscode.commands.executeCommand("claude-runner.recheckClaude");
    });
  },

  afterTest: async function (test, context, { passed }) {
    if (!passed) {
      await browser.saveScreenshot(`./logs/${test.title}.png`);
    }
  },
};
```

#### Page Objects for claude-runner

##### 1. Claude Runner Panel

```typescript
// tests/e2e/pageobjects/ClaudeRunnerPanel.ts
export class ClaudeRunnerPanel {
  get chatInput() {
    return $("#chat-input");
  }
  get sendButton() {
    return $("#send-button");
  }
  get modelSelector() {
    return $("#model-selector");
  }
  get pathSelector() {
    return $("#path-selector");
  }

  async sendMessage(message: string): Promise<void> {
    await this.chatInput.setValue(message);
    await this.sendButton.click();
  }

  async selectModel(model: string): Promise<void> {
    await this.modelSelector.click();
    await $(`option[value="${model}"]`).click();
  }

  async waitForResponse(): Promise<string> {
    const response = await $(".response-content");
    await response.waitForDisplayed({ timeout: 30000 });
    return response.getText();
  }
}
```

##### 2. Pipeline Panel

```typescript
// tests/e2e/pageobjects/PipelinePanel.ts
export class PipelinePanel {
  async addTask(prompt: string): Promise<void> {
    const addButton = await $(".add-task-button");
    await addButton.click();

    const promptInput = await $(".task-prompt-input:last-child");
    await promptInput.setValue(prompt);
  }

  async runPipeline(): Promise<void> {
    const runButton = await $(".run-pipeline-button");
    await runButton.click();
  }

  async waitForCompletion(): Promise<TaskResult[]> {
    const progressTracker = await $(".progress-tracker");
    await progressTracker.waitUntil(
      async () => {
        const status = await progressTracker.getAttribute("data-status");
        return status === "completed" || status === "failed";
      },
      { timeout: 120000 },
    );

    return this.getTaskResults();
  }
}
```

#### Test Scenarios

##### 1. Basic Claude Interaction

```typescript
// tests/e2e/specs/basic-interaction.e2e.ts
describe("Claude Runner Basic Interaction", () => {
  let panel: ClaudeRunnerPanel;

  before(async () => {
    await browser.executeWorkbench(async (vscode) => {
      await vscode.commands.executeCommand("claude-runner.showPanel");
    });
    panel = new ClaudeRunnerPanel();
  });

  it("should execute a simple task", async () => {
    await panel.selectModel("claude-3-5-sonnet-latest");
    await panel.sendMessage("List all files in the current directory");

    const response = await panel.waitForResponse();
    expect(response).toContain("ls");
  });
});
```

##### 2. Pipeline Execution

```typescript
// tests/e2e/specs/pipeline-execution.e2e.ts
describe("Pipeline Execution", () => {
  it("should execute a multi-step pipeline", async () => {
    const pipeline = new PipelinePanel();

    // Add tasks
    await pipeline.addTask("Analyze the project structure");
    await pipeline.addTask("Identify potential improvements");
    await pipeline.addTask("Generate a refactoring plan");

    // Run pipeline
    await pipeline.runPipeline();

    // Wait for completion
    const results = await pipeline.waitForCompletion();

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe("completed");
    expect(results[1].status).toBe("completed");
    expect(results[2].status).toBe("completed");
  });
});
```

##### 3. Terminal Integration

```typescript
// tests/e2e/specs/terminal-integration.e2e.ts
describe("Terminal Integration", () => {
  it("should create and interact with terminal", async () => {
    // Start interactive mode
    await browser.executeWorkbench(async (vscode) => {
      await vscode.commands.executeCommand("claude-runner.runInteractive");
    });

    // Get terminal
    const workbench = await browser.getWorkbench();
    const bottomBar = workbench.getBottomBar();
    const terminalView = await bottomBar.openTerminalView();

    // Wait for Claude prompt
    await browser.waitUntil(async () => {
      const text = await terminalView.getText();
      return text.includes("Human:");
    });

    // Send command
    await browser.keys(["help", Key.Enter]);

    // Verify response
    await browser.waitUntil(async () => {
      const text = await terminalView.getText();
      return text.includes("Assistant:");
    });
  });
});
```

##### 4. Configuration Changes

```typescript
// tests/e2e/specs/configuration.e2e.ts
describe("Configuration Management", () => {
  it("should respect configuration changes", async () => {
    // Change configuration
    await browser.executeWorkbench(async (vscode) => {
      const config = vscode.workspace.getConfiguration("claudeRunner");
      await config.update("defaultModel", "claude-3-opus-latest");
      await config.update("outputFormat", "json");
    });

    // Verify changes are reflected
    const panel = new ClaudeRunnerPanel();
    const selectedModel = await panel.modelSelector.getValue();
    expect(selectedModel).toBe("claude-3-opus-latest");
  });
});
```

#### Test Data Management

##### Fixtures

```typescript
// tests/e2e/fixtures/pipelines.ts
export const testPipelines = {
  simple: {
    name: "Simple Analysis",
    tasks: [{ prompt: "List project dependencies", resumePrevious: false }],
  },
  complex: {
    name: "Full Refactor",
    tasks: [
      { prompt: "Analyze codebase", resumePrevious: false },
      { prompt: "Suggest improvements", resumePrevious: true },
      { prompt: "Generate refactoring plan", resumePrevious: true },
    ],
  },
};
```

##### Mock Responses

```typescript
// tests/e2e/mocks/claude-responses.ts
export const mockResponses = {
  fileList: {
    sessionId: "test-session-123",
    result: "src/\n  extension.ts\n  services/\n  components/\npackage.json",
  },
  analysis: {
    sessionId: "test-session-456",
    result: "Project structure follows MVC pattern...",
  },
};
```

#### CI/CD Integration

##### GitHub Actions Configuration

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Install VS Code
        run: |
          sudo snap install --classic code
          code --version

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          DISPLAY: ":99.0"

      - name: Upload screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-screenshots
          path: tests/e2e/logs/screenshots
```

#### Performance Testing

```typescript
// tests/e2e/specs/performance.e2e.ts
describe("Performance Tests", () => {
  it("should handle large pipelines efficiently", async () => {
    const startTime = Date.now();

    const pipeline = new PipelinePanel();

    // Add 10 tasks
    for (let i = 0; i < 10; i++) {
      await pipeline.addTask(`Task ${i}: Analyze component ${i}`);
    }

    await pipeline.runPipeline();
    const results = await pipeline.waitForCompletion();

    const duration = Date.now() - startTime;

    expect(results).toHaveLength(10);
    expect(duration).toBeLessThan(300000); // 5 minutes max

    // Log performance metrics
    console.log(`Pipeline execution time: ${duration}ms`);
    console.log(`Average per task: ${duration / 10}ms`);
  });
});
```

---

## Testing Best Practices Comparison

### vscode-runme Strengths

1. **Comprehensive Coverage**: Tests notebooks, terminals, UI, and integrations
2. **Real Environment**: Tests run in actual VS Code instance
3. **Complex Scenarios**: Handles stdin, environment variables, background tasks
4. **Visual Debugging**: Screenshots on failure
5. **Performance Monitoring**: Execution timing and metrics

### claude-runner Opportunities

1. **Adopt WebdriverIO**: Industry-standard e2e testing
2. **Page Object Pattern**: Maintainable test structure
3. **Visual Regression**: Add screenshot comparison
4. **Performance Benchmarks**: Track execution times
5. **Mock Strategies**: Balance real vs mocked Claude interactions

### Implementation Roadmap

#### Phase 1: Foundation (Week 1-2)

- Set up WebdriverIO with wdio-vscode-service
- Create basic page objects
- Write first smoke tests
- Configure CI pipeline

#### Phase 2: Core Features (Week 3-4)

- Test chat interactions
- Test pipeline execution
- Test terminal integration
- Add error scenarios

#### Phase 3: Advanced Testing (Week 5-6)

- Performance benchmarks
- Visual regression tests
- Accessibility testing
- Load testing for concurrent operations

#### Phase 4: Maintenance (Ongoing)

- Regular test review
- Flaky test investigation
- Coverage improvement
- Documentation updates

This comprehensive testing strategy will significantly improve claude-runner's reliability and maintainability while providing confidence for future development.
