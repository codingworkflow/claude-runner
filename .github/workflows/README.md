# GitHub Actions CI/CD Pipeline

This directory contains the GitHub Actions workflows for testing the Claude Runner VS Code extension.

## Pipeline Overview

Our CI/CD pipeline consists of two main phases that test the extension in different environments:

### 🔍 Phase 1: Detection Tests (Without Claude CLI)

**Purpose**: Validate that the extension correctly detects when Claude CLI is not installed

**What it tests**:

- Extension loads and activates properly
- UI correctly shows "Claude CLI not found" state
- Detection logic works as expected
- Error handling for missing dependencies
- Core functionality that doesn't require Claude CLI

**Environment**: Clean container without Claude CLI installed

### 🔗 Phase 2: Integration Tests (With Claude CLI)

**Purpose**: Validate full extension functionality with Claude CLI available

**What it tests**:

- Extension detects Claude CLI correctly
- All UI states work properly
- Chat, task, and pipeline functionality
- Claude CLI integration works
- End-to-end workflows complete successfully

**Environment**: Container with Claude CLI installed via npm

## Workflows

### 1. `test-pipeline.yml` - Main CI Pipeline

**Triggers**:

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

**Jobs**:

#### `test-without-claude`

- Runs in VS Code dev container
- Verifies Claude CLI is NOT installed
- Builds extension VSIX package
- Runs unit tests
- Runs main window load test
- Tests Claude CLI detection logic
- Uploads VSIX artifact for Phase 2

#### `test-with-claude`

- Runs in VS Code dev container
- Downloads VSIX from Phase 1
- Installs Claude CLI via npm
- Verifies Claude CLI installation
- Runs main window test with CLI present
- Runs full E2E test suite
- Tests CLI integration functionality

#### `test-report`

- Generates comprehensive test report
- Shows results from both phases
- Creates GitHub Actions summary

### 2. `docker-e2e.yml` - Advanced Docker Testing

**Triggers**:

- Manual workflow dispatch
- Weekly schedule (Sundays at 2 AM)

**Features**:

- Uses custom Docker containers for isolation
- Matrix strategy for testing both phases
- Xvfb for headless VS Code testing
- Advanced artifact collection
- Comprehensive environment setup

## Test Commands

### Local Development

```bash
# Test Claude CLI detection
npm run test:claude-detection
make test-claude-detection

# Run Phase 1 tests (simulate CI without Claude)
npm run test:ci:phase1
make test-ci-phase1

# Run Phase 2 tests (simulate CI with Claude)
npm run test:ci:phase2
make test-ci-phase2
```

### Individual Test Categories

```bash
# Unit tests only
npm run test:unit
make test-unit

# Main window VS Code test
npm run test:main-window
make test-main-window

# End-to-end tests
npm run test:e2e
make test-e2e

# Integration tests
npm run test:integration
make test-integration

# All tests with coverage
npm run test:all:coverage
make test-all-coverage
```

## Test Structure

```
├── .github/workflows/
│   ├── test-pipeline.yml     # Main CI pipeline
│   ├── docker-e2e.yml        # Docker-based testing
│   └── README.md            # This file
├── scripts/
│   └── test-claude-detection.js  # Claude CLI detection tester
├── tests/
│   ├── e2e/                 # End-to-end tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
├── src/test/
│   ├── suite/              # VS Code extension tests
│   └── services/           # Unit tests
└── out/                    # Compiled test files
```

## Environment Requirements

### For VS Code Extension Tests

- Node.js 18+
- VS Code test environment
- Xvfb for headless testing (in CI)
- Extension build tools (vsce)

### For Docker Tests

- Docker with buildx support
- Multi-stage builds
- Isolated test environments

## Test Data and Fixtures

### Sample Conversations (`tests/fixtures/logs/`)

- `sample-conversation.jsonl` - Basic chat interaction
- `complex-conversation.jsonl` - Tool usage and debugging

### Mock Services

- Claude CLI command mocking
- VS Code API mocking
- File system mocking for logs

## Error Handling

The pipeline is designed to handle various failure scenarios:

### Expected Failures

- E2E tests without real API keys (logged as warnings)
- UI tests in headless environments (fallback logic)
- Network timeouts (retry logic)

### Hard Failures

- Extension build failures
- Main window load failures
- Critical detection logic failures

## Debugging CI Issues

### View Test Logs

1. Go to GitHub Actions tab
2. Select the failed workflow run
3. Expand the failed job
4. Check step logs for detailed output

### Download Artifacts

- VSIX packages from successful builds
- Test reports and screenshots
- Docker container logs

### Local Reproduction

```bash
# Reproduce Phase 1 locally (without Claude CLI)
make test-ci-phase1

# Install Claude CLI and test Phase 2
npm install -g @anthropic-ai/claude-code
make test-ci-phase2
```

## Adding New Tests

### For Detection Logic

Add tests to `scripts/test-claude-detection.js`

### For E2E Workflows

Add tests to `tests/e2e/`

### For VS Code Integration

Add tests to `src/test/suite/`

### For Service Logic

Add tests to `src/test/services/`

## Performance Considerations

### Timeouts

- Main window tests: 10 minutes
- E2E tests: 15 minutes
- Docker builds: 20 minutes

### Caching

- Node.js dependencies cached
- Docker layers cached
- VS Code downloads cached

### Parallel Execution

- Phase 1 and Phase 2 run sequentially (Phase 2 needs Phase 1 artifacts)
- Within phases, tests run in parallel where safe
- Docker matrix tests run in parallel

## Security Considerations

### API Keys

- No real API keys used in CI
- Mock configurations for testing
- Sensitive data in secrets (when needed)

### Container Security

- Official Microsoft VS Code dev containers
- Minimal additional dependencies
- No privileged container access

### Artifact Security

- VSIX packages are public artifacts
- Test reports contain no sensitive data
- Automatic cleanup after retention period
