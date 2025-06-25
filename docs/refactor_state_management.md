# State Management Refactor

## Current State Problem

Components receive massive prop objects with 30+ properties:

```tsx
export interface AppProps {
  model: string;
  rootPath: string;
  allowAllTools: boolean;
  parallelTasksCount: number;
  status: "stopped" | "running" | "starting" | "stopping";
  activeTab: "chat" | "pipeline";
  outputFormat: "text" | "json";
  tasks: TaskItem[];
  currentTaskIndex?: number;
  results?: string;
  // ... 20+ more props
}
```

**Issues:**

- Props drilling through multiple component levels
- Components receive data they don't use
- Hard to track state changes
- Difficult to test components in isolation

## Target Architecture

### Context-Based State Management

```tsx
interface ExtensionState {
  // View State
  currentView: "main" | "commands" | "usage";

  // Main View State
  main: {
    activeTab: "chat" | "pipeline";
    model: string;
    rootPath: string;
    allowAllTools: boolean;
    parallelTasksCount: number;
    status: "stopped" | "running" | "starting" | "stopping";
    tasks: TaskItem[];
    currentTaskIndex?: number;
    chatPrompt: string;
    showChatPrompt: boolean;
  };

  // Commands View State
  commands: {
    activeTab: "global" | "project";
    globalCommands: CommandFile[];
    projectCommands: CommandFile[];
    loading: boolean;
    rootPath: string;
  };

  // Usage View State
  usage: {
    activeTab: "usage" | "logs";
    usageData?: UsageReport;
    logsData?: LogData;
    loading: boolean;
  };

  // Claude System State
  claude: {
    version: string;
    isAvailable: boolean;
    isInstalled: boolean;
    error?: string;
    loading: boolean;
  };
}
```

### Context Provider Structure

```tsx
const ExtensionContext = React.createContext<{
  state: ExtensionState;
  actions: ExtensionActions;
} | null>(null);

interface ExtensionActions {
  // View Actions
  setCurrentView: (view: ViewType) => void;

  // Main Actions
  updateMainState: (updates: Partial<MainState>) => void;
  startInteractive: (prompt?: string) => void;
  runTasks: (tasks: TaskItem[], format: OutputFormat) => void;

  // Commands Actions
  updateCommandsState: (updates: Partial<CommandsState>) => void;
  scanCommands: (rootPath: string) => void;

  // Usage Actions
  updateUsageState: (updates: Partial<UsageState>) => void;
  requestUsageReport: (period: UsagePeriod) => void;
}
```

## Component Refactor Strategy

### Before (Props Drilling)

```tsx
// App receives 30+ props, passes most down
const App = ({ model, rootPath /* 28 more props */ }) => {
  return (
    <ChatPanel
      model={model}
      rootPath={rootPath}
      /* 15 more props */
    />
  );
};

// ChatPanel receives 15+ props, uses only 5
const ChatPanel = ({ model, rootPath /* 13 more props */ }) => {
  // Only uses model, rootPath, onStartInteractive
};
```

### After (Context)

```tsx
// App minimal, context-driven
const App = () => {
  const { state } = useExtension();
  return <ViewRouter currentView={state.currentView} />;
};

// ChatPanel only takes what it needs
const ChatPanel = () => {
  const { state, actions } = useExtension();
  const { model, rootPath } = state.main;
  const { startInteractive } = actions;

  // Component logic here
};
```

## Migration Steps

### Step 1: Create Context Infrastructure

- Create `ExtensionContext.tsx`
- Define `ExtensionState` and `ExtensionActions` interfaces
- Create `useExtension()` hook

### Step 2: Migrate State Gradually

- Start with view routing state
- Move main view state to context
- Migrate commands and usage state
- Remove prop drilling step by step

### Step 3: Update Components

- Convert components to use `useExtension()` hook
- Remove unused props from component interfaces
- Simplify component prop passing

### Step 4: Optimize State Updates

- Implement state selectors for performance
- Add memoization where needed
- Ensure proper re-render behavior

## Component Prop Limits

**Target:** No component should receive more than 5 props

### Allowed Props

- `className` (styling)
- `disabled` (interaction state)
- `children` (composition)
- Domain-specific data (max 2 props)

### Get From Context Instead

- Global state (model, rootPath, etc.)
- Actions/handlers
- Loading states
- Error states

## Success Criteria

- [ ] No component has more than 5 props
- [ ] Context provides all global state
- [ ] Components are easily testable with mock context
- [ ] State updates are predictable and traceable
- [ ] Performance is maintained or improved
- [ ] All existing functionality preserved
