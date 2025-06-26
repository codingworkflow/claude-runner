# Claude Runner

A Visual Studio Code extension that provides a seamless interface for executing Claude Code commands directly from your development environment.

[Visual Studio Market place](https://marketplace.visualstudio.com/items?itemName=Codingworkflow.claude-runner)

## Features

- **Model Selection**: Choose from all available Claude models (Opus 4, Sonnet 4, Sonnet 3.7, Haiku 3.5)
- **Interactive Mode**: Launch Claude in a terminal
- **Task Mode**: Execute specific prompts and view results in a new terminal
- **Pipeline System**: Define and execute reusable task sequences with model flexibility
- **Execution Logging**: Comprehensive logging of all pipeline runs with metrics
- **Estimated cost**: Modern webview-based interface integrated with VS Code (credit for ccusage for workflow)
- **Conversation logs**: Parse and review conversation logs directly in vscode

## Installation

### Prerequisites

1. **Claude Code CLI**: This extension requires the Claude Code CLI to be installed and available in your PATH.
   - Visit [Claude Code](https://claude.ai/code) for installation instructions
   - Verify installation with `claude --version`

### From VSIX

1. Download the latest `.vsix` file from releases
2. In VS Code, open Command Palette (`Ctrl/Cmd+Shift+P`)
3. Run `Extensions: Install from VSIX...`
4. Select the downloaded `.vsix` file

## Usage

### Quick Start

1. Open the Claude Runner panel from the Activity Bar
2. Select your preferred Claude model
3. Configure the root path (defaults to current workspace)
4. Choose between Interactive or Task mode

### Interactive Mode

Click **Run Interactive** to:

- Open a new terminal with Claude ready for conversation
- Use the selected model and root path
- Interact directly with Claude in the terminal

### Task Mode

Click **Run Task** to:

- Enter a specific prompt or task
- Execute in the background with chosen model
- View results in a new editor tab
- Configure advanced options (output format, max turns, etc.)

### Pipeline Mode

Define and execute multi-task workflows:

- **Create Pipelines**: Chain multiple tasks with dependencies
- **Model Flexibility**: Use different models for different tasks
- **Session Continuity**: Tasks can share context
- **Save & Load**: Store pipelines for reuse
- **Real-time Progress**: Monitor task execution with live updates

#### Creating a Pipeline

1. Add tasks in the Task tab
2. Configure each task:
   - Name and description
   - Model selection (per-task)
   - Prompt
   - Session continuation settings
3. Click "Save as Pipeline"
4. Enter pipeline name and description

#### Loading a Pipeline

1. Select from available pipelines dropdown
2. Click "Load Pipeline"
3. Modify if needed
4. Run the pipeline

See `examples/` directory for sample pipelines.

### Model Selection

Choose from available Claude models:

- **Claude Opus 4**: Most capable, highest cost (Not available if you use Pro subscription)
- **Claude Sonnet 4**: Balanced performance and cost
- **Claude Sonnet 3.7**: Good performance, moderate cost
- **Claude Haiku 3.5**: Fastest, lowest cost

### Configuration

Access settings through:

- VS Code Settings (`Ctrl/Cmd+,`) → Search "Claude Runner"
- Command Palette → "Claude Runner: Open Settings"
- Settings panel in the Claude Runner view

Key settings:

- Default model selection
- Root path configuration
- Tool permission settings

## Commands

Available through Command Palette (`Ctrl/Cmd+Shift+P`):

- `Claude Runner: Show Panel` - Open the main panel
- `Claude Runner: Run Interactive Mode` - Quick interactive launch
- `Claude Runner: Run Task` - Quick task execution
- `Claude Runner: Select Model` - Change default model
- `Claude Runner: Open Settings` - Access configuration

## Tool Permissions

The extension provides control over Claude's tool access:

- **Allow All Tools**: Uses `--dangerously-skip-permissions` flag
- **Default**: Claude asks for permission before using tools

  **Security Note**: "Allow All Tools" bypasses safety prompts. Use with caution in trusted environments only.

## Advanced Features

### Task Mode Options

- **Output Format**: Text, JSON, or Streaming JSON
- **Max Turns**: Limit conversation length (1-50)
- **Verbose Output**: Show detailed execution information
- **Custom System Prompts**: Add additional instructions

### Terminal Integration

- Automatic terminal creation and management
- Working directory set to configured root path

## Development

### Setup

```bash
# Install dependencies
make setup

# Build extension only (compile) and uninstall extension
make dev-preprare

# install extension
make dev-install

# Run tests
make test

# Build for production
make build-vsix
```

### Project Structure

```
src/
├── extension.ts           # Main extension entry point
├── providers/            # VS Code providers
├── services/            # Business logic services
└── src/            # React-based UI
    ├── App.tsx         # Main app component
    └── components/     # React components
```

### Architecture

The extension follows a clean architecture pattern:

- **Extension Host**: Manages VS Code integration and lifecycle
- **Services Layer**: Handles Claude Code CLI interaction and configuration
- **Webview UI**: React-based interface for user interaction
- **Message Passing**: Communication between extension and webview

## Troubleshooting

### Claude Code Not Found

```bash
# Check installation
claude --version

# If not found, install Claude Code CLI
# Visit https://claude.ai/code for instructions
```

### Permission Issues

- Ensure Claude Code CLI has necessary permissions
- Check workspace folder permissions
- Verify tool permission settings

### Terminal Issues

- Check VS Code terminal settings
- Verify shell configuration
- Try restarting VS Code

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `make validate` to check code quality
6. Submit a pull request

## License

GPL-3.0 - See [LICENSE](LICENSE) file for details.

## Support

- Report issues on GitHub
- Check troubleshooting section
- Review Claude Code documentation

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Credit

[Ccusage](https://github.com/ryoppippi/ccusage) for the idea of usage parsing.

[Claaude code log](https://github.com/daaain/claude-code-log) for the idea of parsing conversations.

[Anthropic team](https://docs.anthropic.com/en/docs/claude-code/sdk) for the great Claude code & the SDK.
