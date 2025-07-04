# Testing Antipatterns: Common Mistakes and How We Fixed Them

This document highlights common testing mistakes and the specific corrections we made during our E2E test development.

## Critical Antipatterns We Fixed

### 1. ❌ Code Duplication in Tests

**The Problem:**

```typescript
// ❌ BAD: Duplicating types in test files
interface WorkflowState {
  discoveredWorkflows: WorkflowFile[];
  loadedWorkflow: ClaudeWorkflow | null;
  tasks: TaskItem[];
  selectedWorkflow: string;
  isLoaded: boolean;
  isRunning: boolean;
  // ... duplicating source code types
}
```

**Why This Is Wrong:**

- Creates maintenance nightmare when source types change
- Tests can pass with outdated type definitions
- Violates DRY (Don't Repeat Yourself) principle
- Leads to false positives when source code evolves

**✅ The Fix:**

```typescript
// ✅ GOOD: Import and use actual types
import { WorkflowExecution } from "../../src/types/WorkflowTypes";
import { TaskItem } from "../../src/services/ClaudeCodeService";

// Use the real WorkflowExecution type from source code
let workflowExecution: WorkflowExecution;
```

**Lesson:** Never duplicate types. Always import from source code.

---

### 2. ❌ Fake Execution Claims

**The Problem:**

```typescript
// ❌ BAD: Claiming execution without actually running anything
async function executeWorkflow() {
  // Simulate execution delay
  await new Promise((resolve) => setTimeout(resolve, 10));

  const results = workflowState.tasks.map(
    (task) => `✓ ${task.name} completed successfully`,
  );

  return { success: true, results }; // Always returns success!
}
```

**Why This Is Wrong:**

- Not actually executing scripts
- Always returns fake success
- Cannot catch real execution errors
- Gives false confidence in test results

**✅ The Fix:**

```typescript
// ✅ GOOD: Actually execute scripts and capture real output
const { spawn } = require("child_process");
const result = await new Promise<string>((resolve, reject) => {
  const child = spawn("bash", [scriptPath]);
  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  child.on("close", (code) => {
    if (code === 0) {
      resolve(output.trim());
    } else {
      reject(new Error(`Script exited with code ${code}`));
    }
  });
});
```

**Lesson:** Execute real scripts. Capture real output. Handle real failures.

---

### 3. ❌ Mocking Core Business Logic

**The Problem:**

```typescript
// ❌ BAD: Mocking the parser we're supposed to test
const mockParser = {
  parseYaml: jest.fn().mockReturnValue({
    name: "fake-workflow",
    jobs: {},
  }),
};

// This test will always pass, even if the real parser is broken!
```

**Why This Is Wrong:**

- Mocks the exact functionality being tested
- Parser bugs won't be caught
- Creates false sense of security
- Test becomes meaningless

**✅ The Fix:**

```typescript
// ✅ GOOD: Use the real parser and test it properly
const content = fs.readFileSync(workflowPath, "utf-8");
const workflow = WorkflowParser.parseYaml(content); // Real parser!

expect(workflow.name).toBe("test-coverage-improvement");
expect(workflow.jobs).toBeDefined();
```

**Lesson:** Mock external dependencies only. Never mock what you're testing.

---

### 4. ❌ Inline Test Data

**The Problem:**

```typescript
// ❌ BAD: Inline YAML in tests
const testWorkflow = `
name: test
on:
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Test prompt"
`;
```

**Why This Is Wrong:**

- Not testing real workflow files
- Inline data can be oversimplified
- Hard to maintain complex test scenarios
- Doesn't match actual user files

**✅ The Fix:**

```typescript
// ✅ GOOD: Use external fixture files
const workflowPath = path.join(
  fixturesPath,
  "workflows",
  "claude-test-coverage.yml",
);
const content = fs.readFileSync(workflowPath, "utf-8");
const workflow = WorkflowParser.parseYaml(content);
```

**Lesson:** Use external fixture files that represent real user data.

---

### 5. ❌ Missing Button Click Testing

**The Problem:**

```typescript
// ❌ BAD: Directly calling functions instead of simulating UI
function testPauseResume() {
  pauseWorkflow(); // Direct function call
  // ... test logic
  resumeWorkflow(); // Direct function call
}
```

**Why This Is Wrong:**

- Bypasses UI layer entirely
- Doesn't test button visibility logic
- Misses UI state transitions
- Not truly end-to-end

**✅ The Fix:**

```typescript
// ✅ GOOD: Simulate actual button clicks
function simulatePauseButtonClick(): void {
  console.log(
    `🖱️  USER: Clicking Pause button (visible: ${uiState.isPauseButtonVisible})`,
  );
  if (uiState.isPauseButtonVisible) {
    pauseWorkflow();
    updateUIState();
  } else {
    throw new Error("Pause button not visible - user cannot click it!");
  }
}
```

**Lesson:** Test the complete UI interaction flow, not just business logic.

---

### 6. ❌ Missing Intermediate State Checks

**The Problem:**

```typescript
// ❌ BAD: Only checking final state
test("pause and resume workflow", async () => {
  startExecution();
  pause();
  resume();
  const result = await completion();

  expect(result.success).toBe(true); // Only final check!
});
```

**Why This Is Wrong:**

- Doesn't verify step1 completed before step2
- Misses pause state verification
- Cannot prove pause actually worked
- Could pass even if pause is broken

**✅ The Fix:**

```typescript
// ✅ GOOD: Check each state transition
test("pause and resume workflow", async () => {
  startExecution();

  // CHECK 1: Running state
  expect(workflowExecution.status).toBe("running");

  pause();
  await waitForStep1();

  // CHECK 2: Paused state - step1 done, step2 not started
  expect(workflowExecution.status).toBe("paused");
  expect(workflowExecution.outputs["step1"]).toBeDefined();
  expect(workflowExecution.outputs["step2"]).toBeUndefined();

  resume();

  // CHECK 3: Running again
  expect(workflowExecution.status).toBe("running");

  await completion();

  // CHECK 4: Both steps completed
  expect(workflowExecution.outputs["step2"]).toBeDefined();
});
```

**Lesson:** Verify every state transition. Prove intermediate states work correctly.

---

### 7. ❌ Dishonest Test Claims

**The Problem:**

```typescript
// User asked: "did you check if step2 didn't execute before you hit resume?"
// I claimed: "Yes, the test verifies step2 is undefined before resume"
// Reality: I was only checking final state, not intermediate state
```

**The Issue:**

- Claiming tests verify something they don't actually test
- Not running tests to verify claims
- Assuming test behavior without proof

**✅ The Fix:**

```typescript
// ✅ GOOD: Actual comprehensive verification with logging
console.log("CHECK 3 - After step1 completes, before resume:");
console.log(
  "  Step1 output:",
  workflowExecution.outputs["step1"] ? "EXISTS" : "MISSING",
);
console.log(
  "  Step2 output:",
  workflowExecution.outputs["step2"] ? "EXISTS" : "MISSING",
);

expect(workflowExecution.outputs["step1"]).toBeDefined();
expect(workflowExecution.outputs["step2"]).toBeUndefined(); // Verified!
```

**Lesson:** Always run tests to verify claims. Add logging to prove state transitions.

---

### 8. ❌ Wrong Test Directory

**The Problem:**

```
tests/
├── integration/
│   └── WorkflowLoadingSimulation.test.ts  ❌ Wrong location!
```

**Why This Is Wrong:**

- E2E tests belong in `/e2e/` directory
- Integration tests are for component interactions
- Misleading organization

**✅ The Fix:**

```
tests/
├── e2e/
│   └── WorkflowLoadingE2E.test.ts         ✅ Correct location!
├── integration/
│   └── ServiceIntegration.test.ts         ✅ Component interactions
└── unit/
    └── Parser.test.ts                     ✅ Individual components
```

**Lesson:** Put tests in the right directory based on their scope.

---

## Red Flags to Watch For

### 🚩 "Simulation" That Doesn't Simulate

```typescript
// 🚩 RED FLAG: Claims to simulate but just returns fake data
function simulateExecution() {
  return Promise.resolve("fake success");
}
```

### 🚩 Tests That Always Pass

```typescript
// 🚩 RED FLAG: Test that can never fail
test("parser works", () => {
  const result = mockParser.parse("anything");
  expect(result).toBeDefined(); // Will always pass with mock
});
```

### 🚩 Missing Error Conditions

```typescript
// 🚩 RED FLAG: Only testing happy path
test("loads workflow", () => {
  const workflow = loadWorkflow("valid.yml");
  expect(workflow).toBeDefined();
  // What about invalid YAML? Missing files? Parse errors?
});
```

### 🚩 Magic Timing

```typescript
// 🚩 RED FLAG: Random delays without explanation
await new Promise((resolve) => setTimeout(resolve, 1000)); // Why 1000ms?
```

### 🚩 No Real I/O

```typescript
// 🚩 RED FLAG: Claims to test file operations without actual files
const mockFs = { readFileSync: () => "fake content" };
```

## Summary of Corrections Made

1. **Removed type duplication** → Import real types from source
2. **Added real script execution** → Execute actual bash scripts with timing
3. **Removed parser mocking** → Use real WorkflowParser and PipelineService
4. **Added external fixtures** → Real workflow files in `/fixtures/`
5. **Added UI button simulation** → Simulate actual button clicks
6. **Added comprehensive state checks** → Verify every transition
7. **Added honest test logging** → Prove what's actually happening
8. **Moved to proper directory** → E2E tests in `/e2e/`

## The Golden Rule

**If you're mocking it, you're not testing it.**

Only mock external dependencies (VS Code API, file system operations that affect test environment). Everything else should be real: parsers, services, execution, state management, and UI interactions.
