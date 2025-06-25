# Unified App Architecture Refactor

## Current State

Three separate React applications rendered conditionally:

- `App.tsx` - Main chat/pipeline functionality
- `CommandsApp.tsx` - Commands management
- `UsageLogsApp.tsx` - Usage reports and logs

## Target Architecture

### Single App Component

```tsx
const App: React.FC = () => {
  const { viewType } = useExtensionContext();

  return (
    <div className="app">
      <ViewRouter currentView={viewType} />
    </div>
  );
};
```

### Context-Based State Management

```tsx
interface ExtensionState {
  viewType: "main" | "commands" | "usage";
  mainState: MainViewState;
  commandsState: CommandsViewState;
  usageState: UsageViewState;
}
```

## Migration Steps

1. **Create ExtensionContext** (`src/contexts/ExtensionContext.tsx`)

   - Centralize all state management
   - Replace prop drilling with context
   - Maintain backwards compatibility with existing webview messages

2. **Create ViewRouter** (`src/components/ViewRouter.tsx`)

   - Route between main/commands/usage views
   - Maintain current URL-based navigation if needed

3. **Refactor main.ts** (`src/components/webview/main.ts`)

   - Remove `window.renderXApp` functions
   - Single `ReactDOM.render(<App />, document.getElementById('root'))`

4. **Migrate Components**
   - Convert existing apps to view components
   - Extract shared navigation logic
   - Preserve all existing functionality

## Files to Modify

### Core Files

- `src/components/App.tsx` - Main app component
- `src/components/CommandsApp.tsx` - Convert to CommandsView
- `src/components/UsageLogsApp.tsx` - Convert to UsageView
- `src/components/webview/main.ts` - Simplify rendering logic

### New Files

- `src/contexts/ExtensionContext.tsx` - State management
- `src/components/ViewRouter.tsx` - View routing
- `src/components/views/MainView.tsx` - Main functionality
- `src/components/views/CommandsView.tsx` - Commands functionality
- `src/components/views/UsageView.tsx` - Usage/logs functionality

## Testing Requirements

1. **Functional Tests**

   - All three views render correctly
   - State persists across view switches
   - All existing webview messages work

2. **Integration Tests**
   - VSCode extension loads all views
   - No regression in existing functionality
   - Memory usage doesn't increase significantly

## Success Criteria

- [ ] Single entry point in main.ts
- [ ] No `window.renderXApp` functions
- [ ] All three views accessible
- [ ] Existing tests pass
- [ ] No functionality regression
- [ ] State management centralized in context
