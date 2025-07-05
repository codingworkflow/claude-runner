# CLI Dependency Analysis and Removal Plan

## Executive Summary

This document provides a comprehensive analysis of CLI dependencies in the Claude Runner VSCode extension and outlines a complete removal plan. The analysis covers all CLI-dependent code, session management, error handling, and configuration systems that would be affected by CLI removal.

## Current CLI Dependency Analysis

### 1. Core CLI-Dependent Services

#### CLIInstallationService (`src/services/CLIInstallationService.ts`)

- **Purpose**: Manages CLI installation and PATH setup
- **Dependencies**: `child_process.exec`, filesystem operations
- **Impact**: Entire service becomes obsolete
- **Lines to Remove**: Entire file (273 lines)

#### ClaudeDetectionService (`src/services/ClaudeDetectionService.ts`)

- **Purpose**: Detects Claude CLI installation and version
- **Dependencies**: `child_process.exec`, shell detection
- **Impact**: Critical for current architecture
- **Lines to Remove**: Entire file (229 lines)

#### ClaudeCodeService (`src/services/ClaudeCodeService.ts`)

- **Purpose**: Primary CLI interface for task execution
- **Dependencies**: `child_process.spawn`, command building
- **Impact**: Requires complete rewrite for direct API integration
- **Lines to Remove**: Lines 1, 62-73, 130-137, 139-166, 706-974, 866-940, 942-959

### 2. CLI Process Management

#### Process Spawning Locations

1. **ClaudeCodeService.executeCommand()** (lines 866-940)

   - Spawns `claude` CLI process
   - Manages stdout/stderr streams
   - Handles process lifecycle

2. **ClaudeExecutor.executeCommand()** (`src/core/services/ClaudeExecutor.ts`)

   - Similar functionality for core workflow engine
   - Lines 447-565 (process management)
   - Lines 567-639 (command building)

3. **CLI Detection** (ClaudeDetectionService)
   - Multi-shell parallel execution
   - Version checking via CLI

#### Process Cancellation

- **ClaudeCodeService.cancelCurrentTask()** (lines 851-860)
- **ClaudeExecutor.cancelCurrentTask()**
- Signal handling (SIGTERM) for process cleanup

### 3. CLI Command Building Architecture

#### Command Construction Patterns

1. **Base Commands**: `["claude", "-p", prompt, "--model", model]`
2. **Session Management**: `["-r", sessionId]` for resume
3. **Tool Permissions**: `["--dangerously-skip-permissions"]`
4. **Output Formats**: `["--output-format", "json"]`

#### Affected Methods

- `ClaudeCodeService.buildTaskCommand()` (lines 756-824)
- `ClaudeCodeService.buildInteractiveCommand()` (lines 826-849)
- `ClaudeExecutor.buildCommand()` (lines 567-639)

### 4. Session Management Through CLI

#### Session ID Extraction

- **Source**: CLI JSON output `session_id` field
- **Location**: `parseTaskResult()` methods
- **Usage**: Session continuation between tasks

#### Session Persistence

- **TaskItem.sessionId**: Stores CLI-generated session IDs
- **WorkflowState.sessionMappings**: Maps steps to CLI sessions
- **JSON Logs**: Persists CLI session information

#### Session Continuation

- **Sequential Tasks**: Auto-resume from previous CLI session
- **Explicit References**: `resumeFromTaskId` pointing to CLI sessions
- **Workflow Variables**: Template resolution of CLI session IDs

### 5. CLI-Specific Error Handling

#### Exit Code Handling

- **Code 0**: Success processing
- **Code 127**: "CLI not found" specific error messages
- **Code 1**: Rate limiting detection from CLI output

#### Error Patterns

- **Rate Limits**: `Claude AI usage limit reached|timestamp` parsing
- **CLI Not Found**: Custom error messages for missing CLI
- **Process Failures**: Spawn errors and timeout handling

#### Recovery Mechanisms

- **Rate Limit Retry**: Automatic resume after CLI rate limit
- **Process Restart**: CLI process respawning
- **Session Recovery**: CLI session restoration

### 6. Configuration Dependencies

#### CLI-Related Settings

- **Model Selection**: Maps to CLI `--model` flag
- **Tool Permissions**: Controls `--dangerously-skip-permissions`
- **Output Formats**: CLI output format selection
- **Verbose Mode**: CLI verbose flag

#### Validation

- **Model Validation**: Ensures CLI supports the model
- **Path Validation**: Validates CLI execution directories
- **Command Validation**: Tests CLI command construction

### 7. Terminal Integration

#### TerminalService (`src/services/TerminalService.ts`)

- **Interactive Mode**: Spawns CLI in terminal
- **Command Building**: Constructs CLI commands for terminal
- **Lines Affected**: 49-55, 181-216

## CLI Removal Impact Assessment

### 1. Files Requiring Complete Removal

```
src/services/CLIInstallationService.ts        (273 lines)
src/services/ClaudeDetectionService.ts        (229 lines)
```

### 2. Files Requiring Major Refactoring

```
src/services/ClaudeCodeService.ts             (1,316 lines → ~400 lines)
src/core/services/ClaudeExecutor.ts           (782 lines → ~300 lines)
src/services/TerminalService.ts               (217 lines → ~100 lines)
src/services/ConfigurationService.ts          (Validation updates)
```

### 3. Files Requiring Minor Updates

```
src/extension.ts                              (Remove CLI detection)
src/controllers/RunnerController.ts           (Update service dependencies)
src/types/WorkflowTypes.ts                    (Remove CLI-specific types)
cli/claude-runner.js                          (Entire CLI package obsolete)
```

### 4. Test Files Requiring Updates

```
tests/unit/services/ClaudeCodeService.test.ts
tests/unit/services/ClaudeDetectionService.test.ts
tests/unit/core/services/ClaudeExecutor.*.test.ts
tests/integration/CLI*.test.ts
tests/e2e/*.test.ts
```

## Replacement Strategy for CLI Functionality

### 1. Direct API Integration

- **Replace CLI Process**: Direct HTTP calls to Anthropic API
- **Session Management**: Client-side session state management
- **Authentication**: API key management instead of CLI authentication

### 2. Session Management Redesign

- **Remove CLI Sessions**: Replace with client-side conversation state
- **State Persistence**: Local conversation history storage
- **Continuation Logic**: Message history management for context

### 3. Error Handling Simplification

- **Remove CLI Errors**: No more process exit codes or spawn errors
- **API Error Handling**: HTTP status codes and API-specific errors
- **Rate Limiting**: API header-based rate limit information

### 4. Configuration Simplification

- **Remove CLI Detection**: No installation or PATH management
- **Simplify Settings**: Remove CLI-specific configuration options
- **Direct API Config**: API endpoint and authentication settings

## Files to be Removed Completely

```
/src/services/CLIInstallationService.ts
/src/services/ClaudeDetectionService.ts
/cli/                                   (Entire directory)
/scripts/test-claude-detection.js
```

## Files Requiring CLI Reference Removal

### Core Services

- `src/services/ClaudeCodeService.ts:1,62-73,130-137,139-166,706-974,866-940,942-959`
- `src/core/services/ClaudeExecutor.ts:1,18,42-47,107-112,235-239,447-565,567-639`
- `src/services/TerminalService.ts:49-55,181-216`

### Extension Setup

- `src/extension.ts:37-38,44-56,169`
- `src/controllers/RunnerController.ts` (Service initialization updates)

### Types and Interfaces

- `src/types/WorkflowTypes.ts` (Remove CLI-specific interfaces)
- Remove `CommandResult` interface
- Remove CLI-specific `TaskOptions` properties

### Configuration

- `package.json` (Remove CLI-related scripts and dependencies)
- Remove CLI build scripts from `Makefile`
- Update VSCode settings schema

## Cross-Reference with STATE_CONSOLIDATION_PLAN.md

### Alignment with State Consolidation

The CLI removal aligns perfectly with the state consolidation plan:

1. **Simplified State Management**: Removing CLI processes eliminates complex process state tracking
2. **Unified Execution Model**: Direct API calls replace the CLI execution abstraction layer
3. **Reduced Complexity**: No more CLI process management, spawn errors, or shell detection
4. **Cleaner Architecture**: Aligns with the proposed ExecutionController refactor

### State Management Benefits

- **Remove CLI Process State**: No more `currentProcess` tracking
- **Simplified Session Management**: Client-side conversation state vs CLI session IDs
- **Unified Error Handling**: API errors only, no process exit codes
- **Cleaner Pause/Resume**: State-based pausing vs process management

## Migration Challenges

### 1. Session Continuity

- **Challenge**: CLI sessions provide context continuity
- **Solution**: Message history management for conversation context

### 2. Tool Integration

- **Challenge**: CLI provides tool access (file system, bash, etc.)
- **Solution**: Implement direct tool integrations or use alternative approaches

### 3. Rate Limiting

- **Challenge**: CLI handles rate limiting automatically
- **Solution**: Implement client-side rate limit handling using API headers

### 4. Authentication

- **Challenge**: CLI manages Anthropic authentication
- **Solution**: Direct API key management in extension settings

## Implementation Phases

### Phase 1: Preparation (Week 1)

1. **Create Direct API Service**: New `AnthropicAPIService` to replace CLI
2. **Design New Session Management**: Client-side conversation state
3. **Update Configuration**: New settings for API integration
4. **Plan Data Migration**: Convert existing CLI sessions to new format

### Phase 2: Core Replacement (Week 2)

1. **Replace ClaudeCodeService**: Swap CLI calls with API calls
2. **Update ClaudeExecutor**: Remove CLI dependencies
3. **Refactor Session Management**: Implement conversation history
4. **Update Error Handling**: Replace CLI errors with API errors

### Phase 3: Integration (Week 3)

1. **Update Controllers**: Remove CLI service dependencies
2. **Refactor Terminal Integration**: Remove CLI spawning
3. **Update State Management**: Align with consolidation plan
4. **Migration Testing**: Ensure functionality preservation

### Phase 4: Cleanup (Week 4)

1. **Remove CLI Services**: Delete obsolete files
2. **Clean Up Configuration**: Remove CLI settings
3. **Update Tests**: Replace CLI mocks with API mocks
4. **Documentation**: Update architecture documentation

## Success Metrics

### Code Reduction

- **Total Lines Removed**: ~800 lines (CLI services + CLI commands)
- **Complexity Reduction**: Eliminate process management complexity
- **Dependency Reduction**: Remove child_process dependencies

### Architecture Improvement

- **Single Responsibility**: Services focus on business logic, not process management
- **Testability**: API mocking simpler than process mocking
- **Reliability**: Remove process spawn failures and shell dependencies

### User Experience

- **Faster Startup**: No CLI detection required
- **Simpler Installation**: No CLI installation management
- **More Reliable**: Fewer failure points (no process spawning)

## Risk Mitigation

### Functionality Preservation

- **Feature Parity**: Ensure all CLI features available via API
- **Session Continuity**: Maintain conversation context without CLI sessions
- **Error Handling**: Provide equivalent error recovery mechanisms

### Migration Safety

- **Gradual Migration**: Phase implementation to minimize disruption
- **Fallback Support**: Temporary CLI compatibility during transition
- **Testing Coverage**: Comprehensive testing of new API integration

### User Impact

- **Seamless Transition**: Users should not notice functionality changes
- **Configuration Migration**: Automatic settings migration
- **Error Messages**: Clear error messages for any migration issues

## Conclusion

The CLI removal represents a significant architectural simplification that aligns with the STATE_CONSOLIDATION_PLAN.md goals. By eliminating CLI dependencies, the extension becomes more reliable, maintainable, and performant while reducing complexity and improving testability.

The phased approach ensures safe migration while the comprehensive analysis ensures all CLI dependencies are identified and properly handled in the transition to direct API integration.
