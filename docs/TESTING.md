# Claude Runner Extension Testing Guide

## Overview

This document provides a comprehensive guide to testing the Claude Runner VS Code extension, including the automated CI/CD pipeline and local testing procedures.

## Testing Architecture

### Two-Phase Testing Strategy

#### Without Claude CLI: Detection Tests

- Purpose: Validate extension behavior when Claude CLI is not installed
- Key Tests: Detection logic, error handling, UI states
- Environment: Clean environment without Claude CLI

#### With Claude CLI: Integration Tests

- Purpose: Validate full functionality with Claude CLI available
- Key Tests: CLI integration, end-to-end workflows, complete UI flows
- Environment: Environment with Claude CLI installed

## GitHub Actions CI/CD Pipeline

### Main Pipeline (`test-pipeline.yml`)

Automated on: Push to main/develop, Pull requests

Jobs:

1. **test-without-claude**: Without Claude CLI testing in VS Code dev container
2. **test-with-claude**: With Claude CLI testing with CLI installation
3. **test-report**: Comprehensive results summary

Key Features:

- Docker containerization for isolation
- Xvfb for headless VS Code testing
- VSIX package building and validation
- Artifact sharing between test stages
- Comprehensive error handling

### Docker E2E Pipeline (`docker-e2e.yml`)

Automated on: Manual trigger, Weekly schedule

Features:

- Custom Docker images for testing
- Matrix strategy for both test stages
- Advanced artifact collection
- Comprehensive environment setup

## Local Testing Commands

### Quick Test Commands

```bash
# Test Claude CLI detection
npm run test:claude-detection

# Simulate CI Without Claude CLI
npm run test:ci:without-claude-cli

# Simulate CI With Claude CLI
npm run test:ci:with-claude-cli

# Main window VS Code test
npm run test:main-window
```

### Individual Test Categories

```bash
# Unit tests
npm run test:unit
make test-unit

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

## Test Coverage

### VS Code Extension Tests

- Main Window Loading: Extension activation, UI rendering, panel display
- Command Registration: All extension commands properly registered
- Configuration: Default settings, user preferences, workspace settings
- Error Handling: Graceful failure modes, user-friendly messages

### Claude CLI Detection Tests

- Path Detection: Searches common installation paths
- Shell Detection: Tests across multiple shell environments
- NPM Detection: Finds globally installed packages
- Version Validation: Verifies compatible CLI versions

### Logs Processing Tests

- Project Management: List projects, handle missing directories
- Conversation Loading: Parse JSONL files, extract metadata
- Data Processing: Token counting, usage analysis, timestamp handling
- Error Resilience: Malformed files, missing data, large datasets

### Conversation Flow Tests

- Interactive Chat: Session startup, prompt handling, error states
- Task Execution: Single tasks, output formatting, error handling
- Pipeline Processing: Multiple tasks, parallel execution, partial failures
- State Management: UI persistence, configuration updates, workspace state

## Test Environment Setup

### Prerequisites

- Node.js 18+
- VS Code test dependencies
- Docker (for containerized testing)
- Xvfb (for headless testing in CI)

### Local Setup

```bash
# Install dependencies
npm install

# Build extension
npm run compile
npm run package

# Run basic tests
npm run test:unit
npm run test:main-window
```

### CI Environment Simulation

```bash
# Without Claude CLI
make test-ci-without-claude-cli

# Install Claude CLI for With Claude CLI tests
npm install -g @anthropic-ai/claude-code

# With Claude CLI
make test-ci-with-claude-cli
```

## Test Data and Fixtures

### Sample Conversations

```
tests/fixtures/logs/
├── sample-conversation.jsonl      # Basic Python function request
└── complex-conversation.jsonl     # JavaScript debugging with tools
```

### Mock Data

- Claude CLI command responses
- VS Code API interactions
- File system operations
- Network requests

## Debugging Failed Tests

### 1. Local Reproduction

```bash
# Run the same tests that failed in CI
npm run test:ci:without-claude-cli  # or with-claude-cli

# Run specific test categories
npm run test:main-window
npm run test:e2e
```

### 2. CI Artifact Analysis

- Download VSIX packages from failed runs
- Check test reports and logs
- Review GitHub Actions summary

### 3. Docker Testing

```bash
# Build and run Docker test environment
docker build -f docker/Dockerfile.test .
docker run --rm -e TEST_STAGE=without-claude-cli image-name
```

## Adding New Tests

### For Detection Logic

Edit `scripts/test-claude-detection.js`:

```javascript
async testNewDetectionScenario() {
  // Add new detection test
}
```

### For E2E Workflows

Create in `tests/e2e/`:

```typescript
describe("New Workflow", () => {
  test("should handle new scenario", async () => {
    // Test implementation
  });
});
```

### For VS Code Integration

Add to `src/test/suite/`:

```typescript
suite("New Feature Tests", () => {
  test("should work in VS Code", async () => {
    // VS Code specific test
  });
});
```

## Performance Benchmarks

### Test Execution Times

- Unit Tests: ~30 seconds
- Main Window Test: ~2-3 minutes
- E2E Tests: ~5-10 minutes
- Full CI Pipeline: ~15-20 minutes

### Resource Usage

- Memory: ~2GB for VS Code tests
- CPU: Moderate usage during compilation
- Network: VS Code downloads, package installs

## Security and Best Practices

### CI Security

- No real API keys in tests
- Mock configurations for all external services
- Isolated Docker containers
- Automatic artifact cleanup

### Test Data Security

- No sensitive information in test fixtures
- Mock user data only
- Temporary file cleanup

### Best Practices

- Tests are deterministic and repeatable
- Comprehensive error handling
- Clear test documentation
- Fast feedback loops

## Troubleshooting Common Issues

### "Extension Not Found"

```bash
# Rebuild extension
npm run compile
npm run package
```

### "VS Code Test Timeout"

```bash
# Increase timeout or run with display
export DISPLAY=:99
npm run test:main-window
```

### "Claude CLI Detection Fails"

```bash
# Run detection script directly
npm run test:claude-detection
```

### "Docker Build Fails"

```bash
# Check Docker setup
docker --version
docker build --no-cache -f docker/Dockerfile.test .
```

## Contributing to Tests

### Test Guidelines

1. Tests should be fast and reliable
2. Use descriptive test names
3. Include both positive and negative cases
4. Mock external dependencies
5. Clean up test artifacts

### Pull Request Testing

- All CI tests must pass
- New features require corresponding tests
- Test coverage should not decrease
- Performance regressions are flagged

### Review Process

- Automated CI feedback
- Manual testing verification
- Code review for test quality
- Performance impact assessment

## Monitoring and Metrics

### CI Success Rates

- Track test pass/fail rates over time
- Monitor test execution times
- Identify flaky tests

### Coverage Metrics

- Line coverage for all source files
- Branch coverage for critical paths
- Integration coverage for workflows

### Performance Metrics

- Test execution time trends
- Resource usage patterns
- CI pipeline efficiency
