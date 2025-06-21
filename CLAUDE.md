# CLAUDE.md

This file provides guidance to Claude Code when working with the Claude Runner VSCode extension.

## Build & Development Commands

### Setup and Installation

```bash
# Install dependencies
make setup
# or
npm install
```

### Development

```bash
# Start development environment
make dev
# or
npm run watch

# Build project
make build
# or
npm run build
```

### Testing

```bash
# Run all tests
make test
# or
npm run test

# Watch mode for tests
make test-watch
# or
npm run test:watch
```

### Code Quality

```bash
# Run linter and fix issues
make lint
# or
npm run lint

# Run all validation (tests + linting) - Note: UI tests may fail in headless environments
make validate

# Run SonarQube analysis
make sonar

# Scan for secrets in codebase
make scan-secrets
# or
npm run scan-secrets      # Scan staged files
npm run scan-secrets:all  # Scan all files
```

#### SonarQube Configuration

To use SonarQube analysis, create a `.sonar` file with your configuration:

```bash
# Create .sonar configuration file
echo 'SONAR_HOST_URL=https://sonarqube.114.be.tn' > .sonar
echo 'SONAR_LOGIN=your-sonar-token-here' >> .sonar

# Run analysis
make sonar
```

**Note**: The `.sonar` file is automatically added to `.gitignore` to protect sensitive tokens.

#### Secrets Scanning

The project includes automatic secrets scanning to prevent committing sensitive information:

**Pre-commit Protection:**

- Automatically scans staged files for secrets before each commit
- Blocks commits containing critical or high-severity secrets
- Runs as part of the Husky pre-commit hook

**Manual Scanning:**

```bash
# Scan all files for secrets
make scan-secrets
npm run scan-secrets:all

# Scan only staged files
npm run scan-secrets
```

**Detected Secret Types:**

- API Keys, Bearer Tokens, JWT Tokens
- SonarQube, GitHub, AWS credentials
- SSH Private Keys
- Generic secrets and passwords

**Security Features:**

- Three severity levels: Critical, High, Medium
- Smart file filtering (ignores node_modules, dist, etc.)
- Context-aware detection (skips comments)
- Clear remediation guidance

### Core Functionality Status

- ✅ **Build**: Compiles successfully without errors
- ✅ **Linting**: ESLint passes with zero issues
- ✅ **UI Fixed**: Task input now shows correctly when clicking "Task" mode
- ✅ **Code Simplified**: Removed dead code and overcomplicated logic following DRY/KISS principles
- ✅ **Task Feedback**: Tasks now show proper running/finished/error states with results display
- ✅ **State Persistence**: Panel correctly restores mode, task status, and results when switching panels
- ⚠️ **Tests**: Unit tests compile but UI tests require graphics libraries for VSCode integration

### Recent Fixes (Latest Session)

1. **Fixed broken UI**: Task input prompt now appears when switching to "Task" mode
2. **Simplified App.tsx**: Reduced from 300+ lines to 200+ lines using DRY/KISS principles
3. **Removed dead code**: Eliminated unused FinalApp.tsx and fixed import references
4. **Fixed build issues**: Resolved TypeScript JSX configuration and StatusBar return path errors
5. **Fixed test compilation**: Updated Mocha imports and TypeScript configuration for proper test builds
6. **Fixed task completion feedback**: Added proper visual indicators for running/finished/error states with results display
7. **Fixed state persistence**: Panel now properly restores mode selection, task status, and results when switching between panels
8. **Fixed hanging task execution**: Improved process handling with proper stdin closure and timeout protection
9. **Fixed JSON output parsing**: Extracts only the 'result' field from JSON responses instead of showing full JSON structure
10. **UI Improvements**:
    - Fixed Browse button size to be more compact with consistent width and proper padding (4px 10px)
    - Reorganized Root Path component to appear at the top without label in both Chat and Pipeline panels
    - Added Parallel Tasks Configuration below Chat panel for configuring parallelTasksCount (1-8)
    - Fixed TypeScript errors in parallel tasks command execution
    - Fixed input and button height alignment issues for consistent UI
    - Added "Add Prompt" button in Chat panel that allows users to input an initial prompt (10 lines textarea)
    - When prompt is provided, interactive session starts with `-p "prompt"` with proper shell escaping
    - Improved overall UI consistency following DRY/KISS principles
11. **Performance Optimizations**:
    - Removed 500ms delay on UI initialization that was causing freeze/lag when switching views
    - Eliminated double HTML setting in webview initialization
    - Simplified webview message handling to reduce unnecessary state comparisons and re-renders
    - Added React.memo to all components to prevent unnecessary re-renders
    - Removed complex state tracking and simplified to direct prop passing
    - Reduced webview-main.ts from 150+ lines to ~60 lines following KISS principle
    - UI now loads instantly when switching to the extension view
12. **State Management Overhaul**:
    - Consolidated all UI state into a single `_uiState` object in ClaudeRunnerPanel as the single source of truth
    - Fixed state loss issues when switching between Chat and Pipeline tabs
    - Fixed "Allow All Tools" toggle state persistence
    - Fixed chat prompt text being lost on tab switches
    - Added proper state synchronization for all UI elements including:
      - activeTab state to track current tab
      - chatPrompt and showChatPrompt for the prompt feature
      - parallelTasksCount integrated into main state flow
    - Removed configuration-based state reads - UI state is now the source of truth
    - Configuration is only updated when actions are performed (e.g., starting chat session)
    - Fixed pipeline task duplication issue by properly maintaining tasks array state
    - All components now receive state as props from extension, no local state conflicts
13. **Fixed State Management Issues**:
    - Implemented single source of truth for ALL UI state in extension (\_uiState)
    - Removed all local React state - components are now fully controlled
    - Fixed state loss when switching between Chat and Pipeline tabs
    - Fixed "Allow All Tools" toggle state persistence
    - Fixed chat prompt text persistence when switching tabs
    - Fixed pipeline tasks duplication issue by maintaining consistent task array
    - All state changes now flow unidirectionally: React -> Extension -> React
    - Ensured tasks array is always initialized (never undefined) to prevent rendering issues
    - Fixed task naming to generate unique sequential numbers even when tasks are added/removed
14. **Critical Chat State Fix**:
    - Moved model, rootPath, and allowAllTools from configuration to UI state
    - Configuration is now only read on initialization and saved when actions are performed
    - UI state is the single source of truth for all values shown in the UI
    - Fixed issue where allowAllTools was being read from saved config instead of current UI state
    - Configuration is only updated when user actually starts a chat/task, not on every UI change
15. **Smart Shell Detection & Claude Installation Check**:
    - Added unified multi-shell detection for Claude CLI across all services
    - Created shared `ShellDetection` utility used by ClaudeVersionService, ClaudeCodeService, and ClaudeRunnerPanel
    - Auto mode tries shells in order of likelihood: zsh → bash → fish (Homebrew) → fish (Apple Silicon) → sh
    - Added shell selector in Claude installation error screen only (not in main UI)
    - Enhanced recheck button with visual feedback: ⏳ Checking → ✅ Found / ❌ Not Found
    - Fixed Claude detection for fish shell users and other non-bash shells
    - Added proper logging and error handling for shell detection debugging
    - Removed shell configuration from main settings (appears only when needed for troubleshooting)

### Version Management

```bash
# Sync version from VERSION file to package.json
make sync-version
# or
npm run sync-version

# Bump semantic version
make version-patch    # 0.2.3 → 0.2.4
make version-minor    # 0.2.3 → 0.3.0
make version-major    # 0.2.3 → 1.0.0

# Or using npm
npm run version:patch
npm run version:minor
npm run version:major
```

### Assets

```bash
# Generate extension icons from logo
make generate-icons
# or
npm run generate-icons

# Prepare marketplace assets and README
make prepare-marketplace
# or
npm run prepare-marketplace
```

### Building and Installation

```bash
# Build VSIX package
make build
# or
npm run package

# Install extension locally
make install-local

# Install in devcontainer
make install-devcontainer

# Serve VSIX via HTTP
make serve-vsix
```

## Architecture Overview

Claude Runner is a VSCode extension that provides a user-friendly interface for executing Claude Code commands directly within the development environment. It supports both interactive terminal sessions and programmatic task execution.

### Key Components

1. **Extension Host** (`src/extension.ts`)

   - Extension activation and command registration
   - VSCode API integration and lifecycle management
   - Terminal and process management coordination

2. **Webview Panel** (`src/providers/ClaudeRunnerPanel.ts`)

   - Main UI panel provider using VSCode webview API
   - Message passing between extension and webview
   - State management and persistence

3. **Services Layer** (`src/services/`)

   - `ClaudeCodeService`: Manages Claude Code command execution
   - `TerminalService`: Handles terminal integration and session management
   - `ConfigurationService`: Settings persistence and retrieval
   - `ModelService`: Claude model metadata and selection logic

4. **React UI** (`src/webview/`)
   - React-based webview application with TypeScript
   - Components for model selection, path configuration, and execution
   - Tailwind CSS for consistent styling and responsive design

### Data Flow

1. User interacts with webview UI (model selection, path configuration, task input)
2. Webview sends messages to extension host via VSCode message API
3. Extension validates inputs and constructs Claude Code commands
4. Commands executed via terminal integration or subprocess
5. Results processed and displayed back to user through webview or terminal

### Configuration System

The extension supports multiple configuration layers:

- User settings via VSCode settings API
- Workspace-specific configurations
- Session-based temporary settings
- Model and tool permission presets

## Code Quality Guidelines

### TypeScript Standards

- **Strict Mode**: All TypeScript files use strict mode with comprehensive type checking
- **Interface Design**: Prefer interfaces over types for object shapes
- **Error Handling**: Use Result/Either patterns for error-prone operations
- **Null Safety**: Explicit null/undefined handling with optional chaining

### React Component Guidelines

- **Functional Components**: Use functional components with hooks exclusively
- **Component Composition**: Prefer composition over inheritance
- **State Management**: Use context for global state, local state for component-specific data
- **Event Handling**: Implement proper event delegation and cleanup

### VSCode Extension Best Practices

- **Resource Management**: Proper disposal of disposables and event listeners
- **API Usage**: Use appropriate VSCode APIs for the intended functionality
- **Error Handling**: Graceful error handling with user-friendly messages
- **Performance**: Lazy loading and efficient resource utilization

### Command Execution Safety

- **Input Validation**: Sanitize all user inputs before command construction
- **Path Handling**: Use proper path resolution and validation
- **Permission Checks**: Validate permissions before file system operations
- **Command Injection**: Prevent command injection through proper escaping

### UI/UX Standards

- **Accessibility**: Follow WCAG guidelines for accessible UI components
- **Responsiveness**: Ensure UI works across different panel sizes
- **Loading States**: Provide clear feedback during long-running operations
- **Error Display**: Clear, actionable error messages with recovery suggestions

## Development Workflow

### Local Development

1. Use `make dev` to start watch mode during development
2. Reload extension in VSCode using F5 or Command Palette
3. Test with different Claude models and configurations
4. Validate terminal integration across different shells

### Testing Strategy

- **Unit Tests**: Service layer and utility functions
- **Integration Tests**: Extension activation and webview communication
- **E2E Tests**: Full workflow testing with mock Claude Code responses
- **Manual Testing**: Real Claude Code integration testing

### Debugging

- Use VSCode's extension debugging capabilities
- Console logging in webview for UI debugging
- Extension host debugging for service layer issues
- Terminal output monitoring for command execution

## Dependencies and Security

### Core Dependencies

- VSCode Extension API for platform integration
- React and TypeScript for UI development
- Node.js child_process for command execution
- Path and file system utilities for safe file operations

### Security Considerations

- **Command Injection**: All user inputs are sanitized before command execution
- **Path Traversal**: Path inputs are validated and normalized
- **Permission Model**: Respect VSCode's security boundaries
- **Sensitive Data**: No sensitive data stored in plain text

### External Dependencies

- Claude Code CLI must be installed and accessible in PATH
- Git integration for workspace context (optional)
- Terminal access for interactive mode functionality

## Model Integration

### Supported Models

The extension supports all current Claude models:

- Claude Opus 4 (most capable, highest cost)
- Claude Sonnet 4 (balanced performance and cost)
- Claude Sonnet 3.7 (good performance, moderate cost)
- Claude Haiku 3.5 (fastest, lowest cost)

### Model Selection Logic

- Default to Claude Sonnet 4 for general use
- Allow user override via dropdown selection
- Persist user preferences per workspace
- Validate model availability before execution

### Command Construction

- Use proper model flags based on Claude Code documentation
- Handle model-specific capabilities and limitations
- Provide fallbacks for deprecated model versions
- Support both alias and full model names
