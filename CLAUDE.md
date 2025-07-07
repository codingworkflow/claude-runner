# CLAUDE.md

This file provides guidance to Claude Code when working with the Claude Runner VSCode extension.

## Build & Development Commands

### Coding Guidelines

#### VSCode Extension Architecture

**VSCode-Specific Constraints:**

- Use `vscode.WebviewViewProvider` pattern for UI panels, not standard web routing
- All UI state must flow through extension host via `postMessage`/`onDidReceiveMessage`
- Leverage VSCode's built-in theming system with `--vscode-*` CSS variables
- Use `vscode.ExtensionContext` for state persistence, not localStorage or sessionStorage
- Follow VSCode's lifecycle patterns: activation/deactivation with proper disposable cleanup

**Extension Host Patterns:**

- Services in `src/services/` handle all business logic and external APIs
- Controllers in `src/controllers/` manage state and orchestrate services
- Use Observable pattern (`rxjs`) for state management between extension and webview
- Implement proper disposal pattern: all subscriptions must be disposed in cleanup

#### React Component Architecture

**State Management Rules:**

- **No Local React State**: Components receive ALL state as props from extension host
- **Controlled Components Only**: All form inputs controlled by extension state
- **Single Source of Truth**: Extension host owns all application state
- **Props-Down Pattern**: State flows down through props, events flow up through callbacks

**Component Structure:**

```
src/components/
├── common/          # Reusable UI components (Button, Input, Toggle)
├── panels/          # Tab-specific panels (ChatPanel, PipelinePanel)
├── hooks/           # Custom hooks (useVSCodeAPI for communication)
└── styles.css      # Global styles using VSCode CSS variables
```

**Component Design Rules:**

- Use `React.memo()` for all components to prevent unnecessary re-renders
- Keep components pure: same props = same output
- Use custom hook `useVSCodeAPI()` for all extension communication
- Components should not make assumptions about data - validate props

#### CSS and Theming

**VSCode Theme Integration:**

- **Primary Rule**: Use `--vscode-*` CSS variables exclusively for colors
- **No Custom Colors**: Avoid hardcoded colors or external color schemes
- **Theme Compatibility**: UI must work with all VSCode themes (light/dark/high-contrast)

**CSS Architecture:**

- Single stylesheet `src/components/styles.css` with component-specific classes
- Use utility classes sparingly - prefer semantic component classes
- CSS Grid/Flexbox for layouts, avoid positioning hacks
- Responsive design within panel constraints (no fixed widths)

**CSS Naming Convention:**

```css
/* Component-specific classes */
.chat-panel {
}
.task-item {
}
.status-badge {
}

/* State-based classes */
.status-running {
}
.task-item.current-task {
}
.button.disabled {
}
```

#### Communication Patterns

**Extension ↔ Webview:**

- Use `MessageRouter` for structured command handling
- All messages must be type-safe with interfaces
- Handle errors gracefully - no UI freezing on failed commands
- Use async/await for extension operations, handle timeouts

**Service Layer:**

- Services are stateless - state lives in controllers
- One service per external concern (Claude API, Terminal, File System)
- Services throw typed errors that controllers handle
- Use dependency injection pattern in constructors

#### Code Quality Rules

**TypeScript Standards:**

- Enable strict mode - no `any` types allowed (linter will catch violations)
- Use interfaces for all props and data structures
- Prefer union types over enums for string constants
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- NEVER use `any` - always use proper types or `unknown` when type is truly unknown

**Error Handling:**

- Extension operations must handle all error cases
- Show user-friendly error messages via `vscode.window.showErrorMessage`
- Log technical details to console, not user-facing messages
- Graceful degradation when services are unavailable

**Performance Rules:**

- Minimize webview re-renders: use React.memo and careful prop design
- Debounce user input that triggers extension operations
- Use observables to batch state updates
- Lazy load services that aren't immediately needed

#### File Organization

**Naming Conventions:**

- Components: PascalCase (e.g., `ChatPanel.tsx`)
- Services: PascalCase with "Service" suffix (e.g., `ClaudeCodeService.ts`)
- Types: PascalCase with descriptive names (e.g., `TaskItem`, `UIState`)
- CSS classes: kebab-case (e.g., `.chat-panel`, `.status-running`)

**Import Structure:**

```typescript
// External imports first
import * as vscode from "vscode";
import React from "react";

// Internal imports by layer
import { ClaudeCodeService } from "../services/ClaudeCodeService";
import { UIState } from "../types/runner";
import Button from "../common/Button";
```

#### Don't Do These

**VSCode Extension Don'ts:**

- Don't use standard web APIs (fetch, localStorage) - use VSCode APIs
- Don't assume file system access - use VSCode workspace APIs
- Don't create multiple webview instances - reuse existing panels
- Don't bypass VSCode's security model

**React Don'ts:**

- Don't use React Router or browser navigation
- Don't use React Context for state - use extension host
- Don't make direct API calls from components
- Don't use useEffect for side effects - use callbacks

**CSS Don'ts:**

- Don't override VSCode's base styles aggressively
- Don't use CSS frameworks (Bootstrap, Tailwind)
- Don't hardcode measurements - use relative units
- Don't create complex CSS animations in extension UI

## Strict Development Rules

<coding>
Don't add code comments unless asked. The enhancement will be automatically rejected like adding excessive logs.
Logging must comply with overall project logging practice using proper error levels.
Rules for modifying files are enforced and any breach will get modifications rejected.
TypeScript – respect strict mode and ESLint configuration
React (JSX/TSX) – respect functional components and hooks patterns
CSS – use VSCode CSS variables exclusively, no custom styling
VSCode Extension – follow extension lifecycle and webview patterns
Keep the code DRY and organized
Use proper file organization following src/ structure
When doing refactoring never create _refactor, _fix, _integrate, _new, _temp files. Always fix the original target. REMEMBER this rule.
Don't add fallbacks or keep functions as fallback if asked to remove them.
When migrating code, don't try to leave fallbacks or add retro compatibility.
All changes must pass linting and TypeScript compilation.
</coding>

### File Naming Rules

**FORBIDDEN File Patterns:**

- `_fix.*` - Never create fix files
- `_refactor.*` - Never create refactor files
- `_integrate.*` - Never create integration temp files
- `_new.*` - Never create new temp files
- `_temp.*` - Never create temp files
- `_backup.*` - Never create backup files

**Required Naming Conventions:**

- Components: `PascalCase.tsx` (e.g., `ChatPanel.tsx`)
- Services: `PascalCase.ts` with `Service` suffix (e.g., `ClaudeCodeService.ts`)
- Types: `PascalCase.ts` (e.g., `WorkflowTypes.ts`)
- Utilities: `camelCase.ts` (e.g., `detectParallelTasksCount.ts`)
- Test files: `*.test.ts` alongside source files
- CSS classes: `kebab-case` (e.g., `.chat-panel`, `.status-running`)

### Testing Rules

**Development Container:**

- All tests run in devcontainer environment
- Use `make test` for consistent testing across environments
- VSCode extension tests require proper devcontainer setup

**Mocking Rules:**

- Mocks should NEVER cover core business logic
- Don't rewrite the app in tests - use actual components/services
- Mock only external dependencies (VSCode API, file system, processes)
- Test from simplest to most complex scenarios
- Use `src/test/__mocks__/` for shared mocks
- Don't over complicate tests logic and mock and introduce complexity

**Test Structure:**

```typescript
// Good: Testing component behavior, mocking VSCode API
const mockVSCodeAPI = {
  postMessage: jest.fn(),
};

// Bad: Reimplementing business logic in test
const mockComplexBusinessLogic = {
  // Don't recreate service logic here
};
```

### Logging Rules

**Error Levels (Strict):**

- `console.error()` - Critical errors only (service failures, invalid state)
- `console.warn()` - Warning conditions (deprecated usage, fallbacks)
- `console.log()` - Essential information only (extension activation, command execution)
- `console.debug()` - Development debugging (remove before commit)

**Forbidden Logging:**

```typescript
// Don't add excessive logging
console.log("Entering function X");
console.log("Variable Y value:", y);
console.log("Processing step 1, 2, 3...");

// Use minimal, meaningful logging
console.error("Claude Code CLI not found", error);
console.log("Extension activated successfully");
```

### File Modification Rules

**Use Targeted Edits:**

- Use `file_edit` for modifications, not full file rewrites
- Make compact, focused changes
- Use `file_write` only for new files

**File Organization:**

- Keep files in proper `src/` structure
- Don't create files everywhere - follow established patterns
- All new/modified files MUST pass linting
- TypeScript strict mode compliance required

**Quality Gates:**

- ESLint must pass without warnings
- TypeScript compilation must succeed
- Jest tests must pass
- No dead code or unused imports

### Setup and Installation

For installation instructions and prerequisites, see [README.md](README.md#installation).

```bash
# Install dependencies
make setup
```

### Development

```bash
# Start development environment
make dev

# Build project
make build
```

### Testing

```bash
# Run all tests (Jest unit tests + E2E tests + VSCode integration tests)
make test

# Run only Jest unit tests
npm run test:unit

# Run E2E tests (complete workflow testing with UI simulation)
npm run test:e2e

# Unit test coverage
npm run test:unit:coverage
```

### Code Quality

```bash
# Run linter and fix issues
make lint

# Run all validation (tests + linting)
make validate
```

See `Makefile` for additional commands including SonarQube analysis, secrets scanning, version management, and asset generation.

### Core Functionality Status

- ✅ **Build**: Compiles successfully without errors
- ✅ **Linting**: ESLint passes with zero issues
- ✅ **UI Fixed**: Task input now shows correctly when clicking "Task" mode
- ✅ **Code Simplified**: Removed dead code and overcomplicated logic following DRY/KISS principles
- ✅ **Task Feedback**: Tasks now show proper running/finished/error states with results display
- ✅ **State Persistence**: Panel correctly restores mode, task status, and results when switching panels
- ✅ **Tests**: Complete test suite with Jest unit tests and VSCode extension integration tests

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
```

## Project Overview

For general project information including:

- Features and capabilities
- Installation instructions
- Usage examples and configuration
- Model selection details
- Troubleshooting guide

See [README.md](README.md) for complete user documentation.
