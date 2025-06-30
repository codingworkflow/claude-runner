# Test Inventory and Coverage Analysis

## Project Overview

- **Total Source Files**: 91 (TypeScript/TSX)
- **Total Test Files**: 31
- **Test Coverage Ratio**: ~34% (31 test files for 91 source files)

## Existing Test Inventory

### Unit Tests (20 files)

#### Services Layer (12 files)

- `ClaudeCodeService.test.ts` - Core Claude CLI service functionality
- `ClaudeCodeService.pause-first-task.test.ts` - Pause functionality for first task
- `ClaudeCodeService.pause-resume.test.ts` - Pause/resume workflow operations
- `ClaudeCodeService.pause-simple.test.ts` - Simple pause scenarios
- `ConfigurationService.test.ts` - Configuration management
- `PipelineService.test.ts` - Pipeline execution logic
- `UsageReportService.test.ts` - Usage tracking and reporting
- `UsageReportService.simple.test.ts` - Basic usage report scenarios
- `UsageReportService.aggregation.test.ts` - Usage data aggregation
- `WorkflowParser.test.ts` - Workflow parsing logic
- `WorkflowService.test.ts` - Workflow management
- `WorkflowStateService.test.ts` - Workflow state management

#### Components Layer (5 files)

- `ConditionalStepBuilder.test.tsx` - Conditional workflow step builder
- `PipelineControls.test.tsx` - Pipeline control UI components
- `PipelineControls.resume-button.test.tsx` - Resume button functionality
- `PipelineControls.button-workflow.test.tsx` - Button workflow interactions
- `PipelineDialog.test.tsx` - Pipeline dialog component
- `ProgressTracker.test.tsx` - Progress tracking component
- `TaskList.test.tsx` - Task list display component

#### Core Layer (2 files)

- `ConfigManager.test.ts` - Core configuration management
- `VSCodeStorage.test.ts` - VSCode storage adapter

#### Extension Layer (1 file)

- `extension.test.ts` - Main extension activation/deactivation
- `main-window-load.test.ts` - Main window loading tests

### Integration Tests (6 files)

- `ConditionalWorkflowExecution.test.ts` - End-to-end conditional workflow execution
- `ExitCode1Handling.test.ts` - Error handling for exit code 1
- `PauseResumeWorkflow.test.ts` - Complete pause/resume workflow scenarios
- `RealRateLimitWorkflow.test.ts` - Rate limiting behavior testing
- `UsageReportFlow.test.ts` - Complete usage reporting flow
- `WorkflowExecution.test.ts` - Full workflow execution scenarios

### E2E Tests (2 files)

- `CLIRateLimitHandling.test.js` - CLI rate limit handling end-to-end
- `LogsService.test.ts` - Logs service end-to-end functionality

### Test Support Files (3 files)

- `__mocks__/vscode.js` - VSCode API mocking
- `setup.ts` - Test environment setup
- `runTest.ts` - Test runner configuration

## Untested Code Areas

### Services Layer (Missing 8 unit tests)

- `CLIInstallationService.ts` - Claude CLI installation management
- `ClaudeDetectionService.ts` - Claude CLI detection logic
- `ClaudeService.ts` - Core Claude service wrapper
- `ClaudeVersionService.ts` - Version detection and management
- `CommandsService.ts` - Command execution service
- `LogsService.ts` - Logging service (has E2E but no unit tests)
- `TerminalService.ts` - Terminal interaction service
- `WorkflowJsonLogger.ts` - JSON workflow logging

### Core Services (Missing 3 unit tests)

- `ClaudeExecutor.ts` - Core Claude execution engine
- `WorkflowEngine.ts` - Workflow execution engine
- `WorkflowParser.ts` (core version) - Core workflow parsing

### Controllers (Missing 1 unit test)

- `RunnerController.ts` - Main application controller

### Providers (Missing 3 unit tests)

- `ClaudeRunnerPanel.ts` - Main panel provider
- `CommandsWebviewProvider.ts` - Commands webview provider
- `UsageLogsWebviewProvider.ts` - Usage logs webview provider

### Components (Missing 25 unit tests)

#### Panels (9 components)

- `ChatPanel.tsx` - Chat interface panel
- `CommandsPanel.tsx` - Commands management panel
- `ConfigPanel.tsx` - Configuration panel
- `GlobalCommandsPanel.tsx` - Global commands panel
- `LogsPanel.tsx` - Logs display panel
- `PipelinePanel.tsx` - Pipeline management panel
- `ProjectCommandsPanel.tsx` - Project-specific commands panel
- `UsageReportPanel.tsx` - Usage reporting panel
- `WorkflowPanel.tsx` - Workflow management panel

#### Common Components (12 components)

- `BaseCommandsPanel.tsx` - Base commands panel component
- `Button.tsx` - Reusable button component
- `Card.tsx` - Card layout component
- `ClaudeVersionDisplay.tsx` - Claude version display
- `CommandForm.tsx` - Command input form
- `CommandList.tsx` - Command list display
- `Input.tsx` - Input field component
- `ModelSelector.tsx` - Model selection component
- `ParallelTasksConfig.tsx` - Parallel tasks configuration
- `PathSelector.tsx` - Path selection component
- `ShellSelector.tsx` - Shell selection component
- `TabNavigation.tsx` - Tab navigation component
- `Toggle.tsx` - Toggle switch component

#### Views (3 components)

- `CommandsView.tsx` - Commands view container
- `MainView.tsx` - Main application view
- `UsageView.tsx` - Usage statistics view

#### App Components (3 components)

- `UnifiedApp.tsx` - Main unified application
- `UsageLogsApp.tsx` - Usage logs application
- `ViewRouter.tsx` - View routing component

### Utilities (Missing 7 unit tests)

- `ShellDetection.ts` - Shell detection utility
- `detectParallelTasksCount.ts` - Parallel tasks detection
- `errorHandlers.ts` - Error handling utilities
- `responseHandlers.ts` - Response handling utilities
- `testUsageReport.ts` - Usage report testing utility
- `webviewHelpers.ts` - Webview helper functions

### Hooks (Missing 2 unit tests)

- `useCommandForm.ts` - Command form hook
- `useVSCodeAPI.ts` - VSCode API communication hook

### Webview Components (Missing 4 unit tests)

- `MessageRouter.ts` - Message routing for webview
- `main.ts` - Main webview entry point
- `template.ts` - Webview template generation
- `index.ts` - Webview exports

### Adapters (Missing 5 unit tests)

- `VSCodeConfigSource.ts` - VSCode configuration source
- `VSCodeFileSystem.ts` - VSCode file system adapter
- `VSCodeLogger.ts` - VSCode logging adapter
- `VSCodeNotification.ts` - VSCode notification adapter
- `WorkflowStorageAdapter.ts` - Workflow storage adapter

### Models and Types (Missing 4 unit tests)

- `ClaudeModels.ts` - Claude model definitions
- `Task.ts` - Task model
- `Workflow.ts` - Workflow model
- `ExtensionContext.tsx` - Extension context provider

## Test Plan for Improved Coverage

### Priority 1: Critical Services (Unit Tests)

1. **CLIInstallationService.test.ts**

   - Test CLI installation detection and setup processes

2. **ClaudeDetectionService.test.ts**

   - Test Claude CLI detection across different environments

3. **ClaudeService.test.ts**

   - Test core Claude service wrapper functionality

4. **ClaudeVersionService.test.ts**

   - Test version detection and compatibility checking

5. **CommandsService.test.ts**

   - Test command execution and management

6. **TerminalService.test.ts**

   - Test terminal interaction and command execution

7. **RunnerController.test.ts**

   - Test main application controller orchestration

8. **ClaudeExecutor.test.ts**
   - Test core Claude execution engine

### Priority 2: Core Components (Unit Tests)

9. **Button.test.tsx**

   - Test button component states and interactions

10. **Input.test.tsx**

    - Test input field validation and state management

11. **Toggle.test.tsx**

    - Test toggle switch functionality

12. **ModelSelector.test.tsx**

    - Test model selection and validation

13. **CommandForm.test.tsx**

    - Test command form validation and submission

14. **CommandList.test.tsx**

    - Test command list display and interactions

15. **TabNavigation.test.tsx**

    - Test tab navigation and state management

16. **ChatPanel.test.tsx**
    - Test chat interface functionality

### Priority 3: Utilities and Helpers (Unit Tests)

17. **ShellDetection.test.ts**

    - Test shell detection across different platforms

18. **detectParallelTasksCount.test.ts**

    - Test parallel task count detection logic

19. **errorHandlers.test.ts**

    - Test error handling and recovery mechanisms

20. **responseHandlers.test.ts**

    - Test response processing and formatting

21. **webviewHelpers.test.ts**

    - Test webview utility functions

22. **useCommandForm.test.ts**

    - Test command form hook behavior

23. **useVSCodeAPI.test.ts**

    - Test VSCode API communication hook

24. **MessageRouter.test.ts**
    - Test webview message routing

### Priority 4: Adapters and Storage (Unit Tests)

25. **VSCodeConfigSource.test.ts**

    - Test VSCode configuration source adapter

26. **VSCodeFileSystem.test.ts**

    - Test VSCode file system operations

27. **VSCodeLogger.test.ts**

    - Test VSCode logging adapter

28. **VSCodeNotification.test.ts**

    - Test VSCode notification system

29. **WorkflowStorageAdapter.test.ts**
    - Test workflow storage operations

### Priority 5: Models and Complex Components (Unit Tests)

30. **Task.test.ts**

    - Test task model validation and operations

31. **Workflow.test.ts**

    - Test workflow model and state management

32. **ClaudeModels.test.ts**

    - Test model definitions and validation

33. **UnifiedApp.test.tsx**

    - Test main application component integration

34. **ViewRouter.test.tsx**

    - Test view routing and navigation

35. **ConfigPanel.test.tsx**

    - Test configuration panel functionality

36. **WorkflowPanel.test.tsx**

    - Test workflow management panel

37. **PipelinePanel.test.tsx**

    - Test pipeline management interface

38. **LogsPanel.test.tsx**
    - Test logs display and filtering

### Priority 6: Providers and Advanced Components (Unit Tests)

39. **ClaudeRunnerPanel.test.ts**

    - Test main panel provider functionality

40. **CommandsWebviewProvider.test.ts**

    - Test commands webview provider

41. **UsageLogsWebviewProvider.test.ts**

    - Test usage logs webview provider

42. **MainView.test.tsx**

    - Test main view container

43. **CommandsView.test.tsx**

    - Test commands view functionality

44. **UsageView.test.tsx**
    - Test usage statistics view

## Test Coverage Goals

- **Target Coverage**: 80% of source files with unit tests
- **Current Coverage**: 34% (31/91 files)
- **Required New Tests**: 44 additional unit test files
- **Focus Areas**: Services layer (highest priority), Core components, Utilities
- **Integration Tests**: Maintain current 6 integration tests, add 2-3 more for complex workflows
- **E2E Tests**: Maintain current 2 E2E tests, add 1-2 more for critical user journeys
