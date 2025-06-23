# Build and Install Guide

## Quick Start

### Build Extension

```bash
# Build VSIX package
make build-vsix
```

### Install in VS Code

```bash
# Install locally
make install-local

# Install in devcontainer
make install-devcontainer
```

## Environment Requirements

- Node.js: v23+ (current: v23.11.1)
- VS Code: v1.85.0+
- Make: For build commands

## Build Process

The extension uses TypeScript and webpack for building:

1. Setup: `make setup` - Install dependencies
2. Compile: `make build` - Compile TypeScript
3. Package: `make build-vsix` - Create VSIX file
4. Install: `make install-local` - Install in VS Code

## Installation Methods

### Local Development

```bash
make dev-prepare    # Uninstall old + build new
make dev-install    # Install new version
```

### Devcontainer/Codespaces

```bash
make install-devcontainer    # Shows install options
make serve-vsix             # HTTP server for download
```

### Manual Install

1. Build: `make build-vsix`
2. VS Code → Extensions → Install from VSIX
3. Select: `dist/claude-runner-*.vsix`

## Testing

```bash
# Run all tests
make test

# Test stages (like CI)
make test-ci-without-claude-cli    # Without Claude CLI
make test-ci-with-claude-cli       # With Claude CLI

# Individual test types
make test-unit
make test-main-window
make test-e2e
```

## Development Workflow

```bash
# Start development
make dev              # Watch mode + setup

# Build and test
make build-vsix       # Build package
make test             # Run tests
make lint             # Check code quality

# Install for testing
make dev-prepare      # Clean install
make dev-install      # Install new version
```

## File Structure

```
dist/
├── extension.js         # Main extension code
├── webview.js          # UI components
└── claude-runner-*.vsix # Extension package
```

## Troubleshooting

### Build Issues

- Run `make clean` then `make build-vsix`
- Check Node.js version: `node --version`

### Install Issues

- Use `make uninstall-extension` first
- Try `make serve-vsix` for devcontainer

### Test Issues

- Check VS Code is closed during tests
- Run `make test-claude-detection` first
