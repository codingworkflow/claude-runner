# Test Fixtures

This directory contains test fixtures for the Claude Runner extension test suite.

## Structure

```
fixtures/
├── workflows/          # GitHub workflow files for testing
│   ├── claude-test-coverage.yml    # Real workflow from .github/workflows/
│   ├── claude-test.yml             # Real workflow from .github/workflows/
│   └── simple-test.yml             # Simple test workflow
└── README.md           # This file
```

## Workflow Fixtures

### claude-test-coverage.yml

- **Source**: Copy of `.github/workflows/claude-test-coverage.yml`
- **Purpose**: Complex workflow with multiple Claude tasks and multiline prompts
- **Use Cases**: Testing complex workflow parsing, task extraction, multi-step execution

### claude-test.yml

- **Source**: Copy of `.github/workflows/claude-test.yml`
- **Purpose**: Simple workflow with single-line prompts
- **Use Cases**: Testing basic workflow parsing, simple task execution

### simple-test.yml

- **Purpose**: Basic GitHub Actions workflow without Claude-specific tasks
- **Use Cases**: Testing fallback parsing for standard workflows

## Usage

These fixtures are used by the `WorkflowSimulationWorkspace` in:

- `tests/helpers/simulation/WorkflowSimulationWorkspace.ts`
- `tests/integration/WorkflowLoadingSimulation.test.ts`

The simulation workspace automatically loads these fixtures when initialized with the fixtures path:

```typescript
const fixturesPath = path.join(__dirname, "../fixtures");
const workspace = new WorkflowSimulationWorkspace(fixturesPath);
```

## Maintenance

When updating the actual workflows in `.github/workflows/`, remember to:

1. Update the corresponding fixture files
2. Update test expectations if workflow structure changes
3. Run the workflow simulation tests to ensure compatibility
