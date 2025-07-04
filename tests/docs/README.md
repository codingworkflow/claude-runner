# Testing Documentation

This directory contains comprehensive guides for writing effective tests in the Claude Runner VS Code extension.

## Testing Guides

### 📋 [E2E Testing Guide](./E2E-Testing-Guide.md)

Complete guide for writing end-to-end tests that simulate full user workflows with real component integration.

**Key Topics:**

- UI workflow simulation with button clicks
- Real script execution with timing control
- Proper mocking strategies (external dependencies only)
- Multi-checkpoint state verification
- Import patterns for real types and services

### ⚠️ [Testing Antipatterns](./Testing-Antipatterns.md)

Critical mistakes to avoid and the specific corrections we made during test development.

**Key Topics:**

- Code duplication fixes
- Fake execution claims and real solutions
- Mocking business logic (and why not to)
- Missing UI interaction testing
- Dishonest test verification

### 🔍 [Integration Test Analysis](./Integration-Test-Analysis.md)

Analysis of `WorkflowExecution.test.ts` showing over-mocking antipatterns and how to fix them.

**Key Topics:**

- Over-mocking core business logic
- Testing deprecated session formats
- False integration claims vs reality
- Proper integration test boundaries
- Fixed integration test examples

### ✅ [Integration Test Fix Summary](./Integration-Test-Fix-Summary.md)

Before/after comparison showing the complete fix of `WorkflowExecution.test.ts`.

**Key Topics:**

- Side-by-side before/after code comparison
- Test results: false positives → real integration
- Session reference validation proof
- Real parser and service integration
- Complete antipattern corrections

## Test Organization

```
tests/
├── e2e/                           # End-to-end workflow tests
│   └── WorkflowLoadingE2E.test.ts # Complete UI → execution flow
├── integration/                   # Component interaction tests
│   └── *.test.ts                  # Service integration testing
├── unit/                          # Individual component tests
│   └── *.test.ts                  # Isolated component testing
├── fixtures/                      # Test data and scripts
│   ├── scripts/                   # Executable test scripts
│   │   ├── step1.sh              # Real bash scripts with timing
│   │   └── step2.sh
│   └── workflows/                 # Real workflow YAML files
│       ├── claude-test-coverage.yml
│       ├── executable-test.yml
│       └── simple-test.yml
└── docs/                          # Testing documentation
    ├── README.md                  # This index
    ├── E2E-Testing-Guide.md       # How to write E2E tests
    └── Testing-Antipatterns.md    # What NOT to do
```

## Quick Reference

### Running Tests

```bash
# All tests
make test

# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# Specific test file
npm run test:unit -- --testPathPattern="WorkflowLoadingE2E.test.ts"

# With verbose output
npm run test:unit -- --testPathPattern="E2E" --verbose
```

### Test Writing Checklist

**✅ E2E Test Requirements:**

- [ ] Tests complete user journey (UI → backend → results)
- [ ] Imports real types from source code (no duplication)
- [ ] Uses external fixture files (no inline test data)
- [ ] Executes real scripts with actual timing
- [ ] Simulates UI button clicks (not direct function calls)
- [ ] Verifies intermediate states (not just final outcome)
- [ ] Mocks only external dependencies (VS Code API, file system)
- [ ] Uses real parser/service integration
- [ ] Tests error conditions and edge cases
- [ ] Located in `/tests/e2e/` directory

**❌ Common Mistakes to Avoid:**

- [ ] Duplicating types in test files
- [ ] Mocking core business logic
- [ ] Fake execution with always-success results
- [ ] Inline YAML/JSON test data
- [ ] Direct function calls instead of UI simulation
- [ ] Only testing happy path
- [ ] Missing intermediate state verification
- [ ] Wrong test directory classification

## Key Principles

### The Golden Rule

**"If you're mocking it, you're not testing it."**

Only mock external dependencies. Test everything else with real components.

### Mock Boundaries

```
✅ Mock These (External Dependencies):
- VS Code API calls
- File system operations that affect test environment
- Network requests
- Process spawning (for non-test scripts)

❌ Don't Mock These (What You're Testing):
- Workflow parser
- Pipeline service
- UI state management
- Task execution logic
- Session reference validation
```

### Testing Pyramid

```
     E2E Tests (Few)
    🎯 Complete user journeys
   UI simulation + real execution

    Integration Tests (Some)
   🔧 Component interactions
  Service coordination testing

      Unit Tests (Many)
     ⚙️ Individual components
    Fast, focused, isolated
```

## Examples

### ✅ Good E2E Test Pattern

```typescript
test("should demonstrate complete UI workflow", async () => {
  // 1. Setup with real components
  populateWorkflowDropdown();

  // 2. Simulate user actions
  simulateWorkflowSelection("workflow.yml");
  simulateLoadButtonClick();

  // 3. Verify UI state changes
  expect(uiState.isRunButtonVisible).toBe(true);

  // 4. Execute with real scripts
  const executionPromise = simulateRunButtonClick();

  // 5. Test pause/resume flow
  setTimeout(() => simulatePauseButtonClick(), 500);
  await new Promise((resolve) => setTimeout(resolve, 3600));

  // 6. Verify intermediate state
  expect(workflowExecution.status).toBe("paused");
  expect(workflowExecution.outputs["step1"]).toBeDefined();
  expect(workflowExecution.outputs["step2"]).toBeUndefined();

  // 7. Resume and complete
  simulateResumeButtonClick();
  await executionPromise;

  // 8. Verify final state
  expect(workflowExecution.status).toBe("completed");
  expect(workflowExecution.outputs["step2"]).toBeDefined();
});
```

This test pattern demonstrates:

- Real UI simulation
- Actual script execution
- Comprehensive state verification
- Complete user journey testing

## Contributing

When adding new tests:

1. **Read the guides first** - Understand E2E principles and antipatterns
2. **Use the checklist** - Ensure your test follows best practices
3. **Review existing tests** - Follow established patterns
4. **Test your tests** - Run them to verify they work as expected
5. **Update documentation** - Add new patterns or corrections to guides
