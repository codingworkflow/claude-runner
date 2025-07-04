# E2E Testing Guide: UI Workflow Testing

This guide explains how to write proper end-to-end tests for VS Code extensions that simulate complete user workflows with real component integration.

## What Are E2E Tests?

E2E (End-to-End) tests simulate the complete user journey from UI interactions through to backend execution. They test the entire system as a user would experience it.

**Example User Journey:**

```
User opens dropdown → Selects workflow → Clicks Load → Clicks Run → Clicks Pause → Clicks Resume → Sees completion
```

## File Structure

```
tests/
├── e2e/
│   └── WorkflowE2E.test.ts        # Complete user journey tests
├── integration/
│   └── ServiceIntegration.test.ts # Component interaction tests
├── unit/
│   └── Parser.test.ts             # Individual component tests
└── docs/
    └── E2E-Testing-Guide.md       # This guide
```

## Key Principles

### ✅ DO: Use Real Components

```typescript
// ✅ GOOD: Import and use real types and services
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import {
  ClaudeWorkflow,
  WorkflowExecution,
} from "../../src/types/WorkflowTypes";

// Use actual WorkflowExecution type from source code
let workflowExecution: WorkflowExecution;
```

### ❌ DON'T: Duplicate Types

```typescript
// ❌ BAD: Duplicating interfaces in tests
interface TestWorkflowExecution {
  workflow: TestWorkflow;
  status: string;
  // Duplicating source code types = maintenance nightmare
}
```

### ✅ DO: Real Script Execution

```typescript
// ✅ GOOD: Execute actual scripts and capture real output
const { spawn } = require("child_process");
const result = await new Promise<string>((resolve, reject) => {
  const child = spawn("bash", [scriptPath]);
  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  child.on("close", (code) => {
    if (code === 0) resolve(output.trim());
    else reject(new Error(`Script failed: ${code}`));
  });
});
```

### ❌ DON'T: Fake Execution

```typescript
// ❌ BAD: Pretending to execute without actually running anything
function fakeExecute() {
  return Promise.resolve("✓ fake success");
}
```

### ✅ DO: External Fixtures

```typescript
// ✅ GOOD: Use external fixture files
const workflowPath = path.join(fixturesPath, "workflows", "test.yml");
const content = fs.readFileSync(workflowPath, "utf-8");
const workflow = WorkflowParser.parseYaml(content);
```

### ❌ DON'T: Inline Test Data

```typescript
// ❌ BAD: Inline YAML in tests (bad practice)
const inlineWorkflow = `
name: test
jobs:
  test:
    steps: []
`;
```

## UI Simulation Pattern

### State Management

```typescript
// UI State Types (can define test-specific UI types)
interface UIState {
  selectedWorkflow: string;
  isLoadButtonEnabled: boolean;
  isPauseButtonVisible: boolean;
  isResumeButtonVisible: boolean;
  loadingText: string;
}

// Event Handlers
interface UIEvents {
  onWorkflowSelected: (workflow: string) => void;
  onLoadButtonClick: () => void;
  onPauseButtonClick: () => void;
  onResumeButtonClick: () => void;
}
```

### Button Click Simulation

```typescript
// ✅ GOOD: Simulate actual user interactions
function simulateLoadButtonClick(): void {
  console.log(
    `🖱️  USER: Clicking Load button (enabled: ${uiState.isLoadButtonEnabled})`,
  );
  if (uiState.isLoadButtonEnabled && uiState.selectedWorkflow) {
    loadWorkflowFromUI(uiState.selectedWorkflow);
  }
}

function simulatePauseButtonClick(): void {
  console.log(
    `🖱️  USER: Clicking Pause button (visible: ${uiState.isPauseButtonVisible})`,
  );
  if (uiState.isPauseButtonVisible) {
    pauseWorkflow();
    updateUIState();
  }
}
```

### State Updates

```typescript
// ✅ GOOD: Update UI state based on business logic state
function updateUIState(): void {
  const hasWorkflowLoaded = workflowExecution.workflow.name !== "";

  uiState.isLoadButtonEnabled =
    uiState.selectedWorkflow !== "" && !hasWorkflowLoaded;
  uiState.isRunButtonVisible =
    hasWorkflowLoaded && workflowExecution.status === "pending";
  uiState.isPauseButtonVisible = workflowExecution.status === "running";
  uiState.isResumeButtonVisible = workflowExecution.status === "paused";

  if (workflowExecution.status === "running") {
    uiState.loadingText = `Running step ${workflowExecution.currentStep + 1}...`;
  } else if (workflowExecution.status === "paused") {
    uiState.loadingText = `Paused at step ${workflowExecution.currentStep + 1}`;
  } else if (workflowExecution.status === "completed") {
    uiState.loadingText = "Workflow completed";
  }
}
```

## Real Execution with Timing

### Script-Based Testing

```typescript
// ✅ GOOD: Create real scripts for timing control
// tests/fixtures/scripts/step1.sh
#!/bin/bash
echo "step1 starting execution"
sleep 3  # Real 3-second delay for pause testing
echo "step1 executed successfully"
exit 0
```

### Pause/Resume Testing

```typescript
test("should pause during execution and resume properly", async () => {
  // Load workflow with real 3s script
  simulateWorkflowSelection(".github/workflows/executable-test.yml");
  simulateLoadButtonClick();

  // Start execution
  const executionPromise = simulateRunButtonClick();

  // Verify initial running state
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(uiState.isPauseButtonVisible).toBe(true);
  expect(workflowExecution.status).toBe("running");

  // Pause after 0.5s (step1 still running due to 3s sleep)
  setTimeout(() => {
    simulatePauseButtonClick();
  }, 500);

  // Wait for step1 to complete while paused
  await new Promise((resolve) => setTimeout(resolve, 3600));

  // Verify paused state
  expect(workflowExecution.status).toBe("paused");
  expect(uiState.isResumeButtonVisible).toBe(true);
  expect(workflowExecution.outputs["step1"]).toBeDefined();
  expect(workflowExecution.outputs["step2"]).toBeUndefined();

  // Resume and complete
  simulateResumeButtonClick();
  await executionPromise;

  // Verify completion
  expect(workflowExecution.status).toBe("completed");
  expect(workflowExecution.outputs["step2"]).toBeDefined();
});
```

## Proper Mocking Strategy

### ✅ DO: Mock External Dependencies Only

```typescript
// ✅ GOOD: Mock VS Code API (external dependency)
const mockContext = {
  extensionPath: "/test",
  globalStorageUri: { fsPath: "/tmp/test-storage" },
};

// ✅ GOOD: Mock file system operations that would affect test environment
jest
  .spyOn(PipelineService.prototype as any, "ensureDirectories")
  .mockImplementation(() => Promise.resolve());
```

### ❌ DON'T: Mock Core Business Logic

```typescript
// ❌ BAD: Mocking the parser (this is what we're testing!)
const mockParser = {
  parseYaml: jest.fn().mockReturnValue({ name: "fake" }),
};

// ❌ BAD: Mocking execution logic
const mockExecution = {
  executeWorkflow: jest.fn().mockResolvedValue({ success: true }),
};
```

### ✅ DO: Use Real Parser Integration

```typescript
// ✅ GOOD: Use actual WorkflowParser
const workflow = WorkflowParser.parseYaml(content);
const tasks = pipelineService.workflowToTaskItems(workflow);

// This tests the REAL parsing logic, not a mock
expect(workflow.name).toBe("test-coverage-improvement");
expect(tasks[0].id).toBe("task_cli_installation_service_1");
```

## Comprehensive Test Structure

### Multi-Checkpoint Verification

```typescript
test("should demonstrate complete UI workflow", async () => {
  // STEP 1: Dropdown population
  populateWorkflowDropdown();
  expect(uiState.workflowDropdownOptions.length).toBeGreaterThan(0);
  expect(uiState.isLoadButtonEnabled).toBe(false);

  // STEP 2: Workflow selection
  simulateWorkflowSelection("workflow.yml");
  expect(uiState.selectedWorkflow).toBe("workflow.yml");
  expect(uiState.isLoadButtonEnabled).toBe(true);

  // STEP 3: Load workflow
  simulateLoadButtonClick();
  expect(workflowExecution.workflow.name).toBe("executable-test");
  expect(uiState.isRunButtonVisible).toBe(true);

  // STEP 4: Execute workflow
  const executionPromise = simulateRunButtonClick();
  expect(uiState.isPauseButtonVisible).toBe(true);

  // STEP 5: Pause execution
  setTimeout(() => simulatePauseButtonClick(), 500);
  await new Promise((resolve) => setTimeout(resolve, 3600));
  expect(uiState.isResumeButtonVisible).toBe(true);

  // STEP 6: Resume execution
  simulateResumeButtonClick();
  await executionPromise;
  expect(workflowExecution.status).toBe("completed");
});
```

## Common Mistakes to Avoid

### ❌ Code Duplication

```typescript
// ❌ BAD: Duplicating types
interface MyWorkflowExecution {
  // Copying types from source code
}

// ✅ GOOD: Import real types
import { WorkflowExecution } from "../../src/types/WorkflowTypes";
```

### ❌ Fake Execution Claims

```typescript
// ❌ BAD: Claiming execution without actually running
test("executes workflow", () => {
  const result = { success: true, output: "fake" };
  expect(result.success).toBe(true); // Not actually executing anything!
});
```

### ❌ Missing Intermediate Checks

```typescript
// ❌ BAD: Only checking final state
test("pause and resume", async () => {
  startExecution();
  pause();
  resume();
  await completion();
  expect(finalState).toBe("completed"); // Missing intermediate verification
});

// ✅ GOOD: Check each state transition
test("pause and resume", async () => {
  startExecution();
  expect(state).toBe("running");

  pause();
  expect(state).toBe("paused");
  expect(step1Completed).toBe(true);
  expect(step2Started).toBe(false);

  resume();
  expect(state).toBe("running");

  await completion();
  expect(state).toBe("completed");
  expect(step2Completed).toBe(true);
});
```

### ❌ No Real UI State Testing

```typescript
// ❌ BAD: Not testing button visibility
function pause() {
  workflowState.paused = true;
}

// ✅ GOOD: Test actual UI button states
function simulatePauseButtonClick() {
  if (uiState.isPauseButtonVisible) {
    pauseWorkflow();
    updateUIState();
  } else {
    throw new Error("Pause button not visible");
  }
}
```

## File Organization

```
tests/
├── e2e/
│   └── WorkflowLoadingE2E.test.ts     # Complete workflows
├── fixtures/
│   ├── scripts/
│   │   ├── step1.sh                   # Real executable scripts
│   │   └── step2.sh
│   └── workflows/
│       ├── claude-test-coverage.yml   # Real workflow files
│       ├── executable-test.yml
│       └── simple-test.yml
└── docs/
    └── E2E-Testing-Guide.md           # This guide
```

## Running E2E Tests

```bash
# Run E2E tests only
npm run test:e2e

# Run specific E2E test
npm run test:unit -- --testPathPattern="WorkflowLoadingE2E.test.ts"

# Run with verbose output
npm run test:unit -- --testPathPattern="E2E" --verbose
```

## Summary

E2E tests should:

1. ✅ **Import real types** from source code
2. ✅ **Execute real scripts** with actual timing
3. ✅ **Use external fixtures** instead of inline data
4. ✅ **Simulate complete user journeys** with UI interactions
5. ✅ **Verify intermediate states** not just final outcomes
6. ✅ **Mock only external dependencies** (VS Code API, file system)
7. ✅ **Test real parser integration** without mocking business logic
8. ✅ **Verify UI state transitions** (button visibility, loading text)

Remember: E2E tests should prove the complete system works as users expect, from UI clicks through to real execution results.
