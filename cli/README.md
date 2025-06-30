# Claude Runner CLI

Standalone command-line interface for executing Claude Code workflows and commands.

## Installation

### Via npm (Global)

```bash
npm install -g claude-runner-cli
```

### Via npm (Local)

```bash
npm install claude-runner-cli
npx claude-runner --help
```

## Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) must be installed and available in your PATH
- Node.js 18.0.0 or higher

## Usage

### Commands

```bash
# List Claude workflows in a directory
claude-runner list [directory]

# Validate a workflow file
claude-runner validate <workflow.yml>

# Execute a workflow
claude-runner run <workflow.yml>
```

### Options

- `--verbose` - Show detailed output
- `--path, -p <directory>` - Set execution directory (default: current)

### Examples

```bash
# List workflows in default directory (.github/workflows)
claude-runner list

# List workflows in specific directory
claude-runner list custom-workflows

# Validate a workflow
claude-runner validate .github/workflows/claude-test.yml

# Run a workflow
claude-runner run .github/workflows/claude-integration-test.yml

# Run with verbose output
claude-runner run workflow.yml --verbose

# Run from specific directory
claude-runner run workflow.yml --path /path/to/project
```

## Workflow Format

The CLI executes YAML workflows with Claude pipeline steps:

```yaml
name: Claude Workflow Example
on: [push]
jobs:
  claude-job:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Analyze this codebase and suggest improvements"
          model: "claude-sonnet-4-20250514"
          working_directory: "."
```

## Uninstallation

```bash
# If installed globally
npm uninstall -g claude-runner-cli

# If installed locally
npm uninstall claude-runner-cli
```

## License

GPL-3.0 - See [LICENSE](../LICENSE) file for details.
