# Usage & Logs Panel Migration Specification

## Overview

This specification outlines the migration of Usage and Logs functionality from the main panel tabs to a separate collapsible panel following the existing Commands panel architecture pattern.

## Current Architecture Analysis

### Commands Panel Pattern (Target Architecture)

- **Provider**: `CommandsWebviewProvider.ts` implements `vscode.WebviewViewProvider`
- **Registration**: Separate view registered in `package.json` under `"views"."claude-runner"`
- **UI**: Vanilla HTML/CSS/JS (not React) using VSCode CSS variables
- **Communication**: Direct message passing between webview and provider
- **Toolbar**: View-specific buttons in `view/title` menu group

### Current Usage & Logs Implementation

- **Location**: React components in main panel tabs (`UsageReportPanel.tsx`, `LogsPanel.tsx`)
- **State**: Managed by main `App.tsx` component with `activeTab` switching
- **Communication**: Uses `useVSCodeAPI` hook through main panel message router
- **Services**: `UsageReportService.ts` and `LogsService.ts` handle business logic

## Migration Specification

### 1. New Panel Architecture

#### 1.1 Create UsageLogsWebviewProvider

```typescript
// src/providers/UsageLogsWebviewProvider.ts
export class UsageLogsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-runner.usageLogsView";

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _usageReportService: UsageReportService,
    private readonly _logsService: LogsService,
  ) {}
}
```

#### 1.2 Package.json Registration

```json
{
  "views": {
    "claude-runner": [
      {
        "type": "webview",
        "id": "claude-runner.mainView",
        "name": "Claude Runner",
        "icon": "$(terminal)",
        "contextualTitle": "Claude Runner Control Panel"
      },
      {
        "type": "webview",
        "id": "claude-runner.commandsView",
        "name": "Commands",
        "icon": "$(symbol-keyword)",
        "contextualTitle": "Claude Commands Manager"
      },
      {
        "type": "webview",
        "id": "claude-runner.usageLogsView",
        "name": "Usage & Logs",
        "icon": "$(graph)",
        "contextualTitle": "Usage Reports & Conversation Logs"
      }
    ]
  }
}
```

#### 1.3 Toolbar Commands

```json
{
  "view/title": [
    {
      "command": "claude-runner.refreshUsageReport",
      "when": "view == claude-runner.usageLogsView",
      "group": "navigation@1"
    },
    {
      "command": "claude-runner.refreshLogs",
      "when": "view == claude-runner.usageLogsView",
      "group": "navigation@2"
    }
  ]
}
```

### 2. UI Implementation Guidelines

#### 2.1 Follow Commands Panel CSS Pattern

- **CSS Variables**: Use `--vscode-*` variables exclusively
- **No Custom Styling**: Minimal CSS following VSCode design language
- **Layout**: Collapsible sections using VSCode patterns

#### 2.2 Section Structure

```html
<!-- Usage Section -->
<div class="section">
  <div class="section-header">
    <h3 class="section-title">Usage Reports</h3>
    <button class="add-button" id="refreshUsageBtn">Refresh</button>
  </div>
  <div class="section-content" id="usageContent">
    <!-- Usage controls and data -->
  </div>
</div>

<!-- Logs Section -->
<div class="section">
  <div class="section-header">
    <h3 class="section-title">Conversation Logs</h3>
    <button class="add-button" id="refreshLogsBtn">Refresh</button>
  </div>
  <div class="section-content" id="logsContent">
    <!-- Logs navigation and data -->
  </div>
</div>
```

#### 2.3 Vanilla JS Implementation

- **No React**: Convert React components to vanilla HTML/CSS/JS
- **Message Passing**: Direct `vscode.postMessage()` and `window.addEventListener('message')`
- **State Management**: Simple JavaScript variables, no complex state

### 3. Service Integration

#### 3.1 Usage Report Service

```typescript
// Existing UsageReportService.ts - no changes needed
// Provider directly calls service methods:
const reportData = await this._usageReportService.getUsageReport(
  period,
  hours,
  start,
);
```

#### 3.2 Logs Service

```typescript
// Existing LogsService.ts - no changes needed
// Provider directly calls service methods:
const projects = await this._logsService.getProjects();
const conversations = await this._logsService.getConversations(projectName);
```

### 4. Main Panel Cleanup

#### 4.1 Remove from App.tsx

- Remove `"usage"` and `"logs"` from `activeTab` union type
- Remove `UsageReportPanel` and `LogsPanel` tab rendering
- Remove tab buttons for Usage and Logs
- Simplify to only Chat and Pipeline tabs

#### 4.2 Remove Toggle Advanced Tabs

- Remove `toggleAdvancedTabs` command and functionality
- Remove `showAdvancedTabs` state management
- Clean up related UI elements

#### 4.3 Update Interfaces

```typescript
// Remove from AppProps
activeTab: "chat" | "pipeline"; // Remove "usage" | "logs"
showAdvancedTabs: boolean; // Remove entirely
```

### 5. Extension Registration

#### 5.1 Provider Registration

```typescript
// src/extension.ts
const usageLogsWebviewProvider = new UsageLogsWebviewProvider(
  context,
  usageReportService,
  logsService,
);

context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(
    UsageLogsWebviewProvider.viewType,
    usageLogsWebviewProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  ),
);
```

#### 5.2 Command Registration

```typescript
vscode.commands.registerCommand("claude-runner.refreshUsageReport", () => {
  usageLogsWebviewProvider.refreshUsageReport();
}),
  vscode.commands.registerCommand("claude-runner.refreshLogs", () => {
    usageLogsWebviewProvider.refreshLogs();
  });
```

### 6. File Changes Required

#### 6.1 New Files

- `src/providers/UsageLogsWebviewProvider.ts` - Main webview provider
- Remove: `src/components/panels/UsageReportPanel.tsx`
- Remove: `src/components/panels/LogsPanel.tsx`

#### 6.2 Modified Files

- `package.json` - Add view, commands, menu items
- `src/extension.ts` - Register provider and commands
- `src/components/App.tsx` - Remove usage/logs tabs and state
- `src/components/hooks/useVSCodeAPI.ts` - Remove usage/logs methods

#### 6.3 Preserved Files

- `src/services/UsageReportService.ts` - No changes
- `src/services/LogsService.ts` - No changes

### 7. Implementation Order

1. **Create Provider**: Implement `UsageLogsWebviewProvider.ts` with minimal HTML
2. **Register View**: Add package.json configuration and extension registration
3. **Implement Usage**: Convert `UsageReportPanel` logic to vanilla JS
4. **Implement Logs**: Convert `LogsPanel` logic to vanilla JS
5. **Clean Main Panel**: Remove usage/logs from App.tsx
6. **Test Integration**: Verify all functionality works in new panel
7. **Remove Old Files**: Delete React panel components

### 8. Design Constraints

#### 8.1 VSCode Guidelines Compliance

- **No Custom CSS**: Use only VSCode CSS variables
- **Native Controls**: HTML select, input, button elements
- **Accessibility**: Follow VSCode accessibility patterns
- **Theming**: Automatic light/dark theme support

#### 8.2 Architecture Consistency

- **Pattern Matching**: Follow exact Commands panel implementation style
- **Service Reuse**: No changes to existing service layer
- **Message Protocol**: Consistent message passing patterns
- **Error Handling**: VSCode-standard error display

### 9. Benefits

- **Consistent UX**: All panels follow same collapsible pattern
- **Simplified Main Panel**: Focus on core Chat/Pipeline functionality
- **Better Organization**: Related functionality grouped together
- **Native VSCode Feel**: Better integration with VSCode panel system
- **Performance**: Separate panel lifecycle management

### 10. Validation Criteria

- Usage reports display correctly in new panel
- Conversation logs navigation works identically
- All existing functionality preserved
- Main panel simplified to Chat/Pipeline only
- Panel collapses/expands following VSCode patterns
- Toolbar buttons function correctly
- Message passing works without errors
- CSS follows VSCode theme system exclusively
