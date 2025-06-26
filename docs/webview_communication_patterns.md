# Webview Communication Patterns

## vscode-runme vs claude-runner

### vscode-runme Approach

#### Message Handler Pattern

```typescript
// Central message dispatcher
export interface IApiMessage {
  messaging: NotebookRendererMessaging;
  message: ClientMessage<ClientMessages>;
  editor: NotebookEditor;
  kernel: Kernel;
}

export async function handlePlatformApiMessage({
  messaging,
  message,
  editor,
  kernel,
}: IApiMessage): Promise<void | boolean> {
  switch (message.output.method) {
    case APIMethod.CreateCellExecution:
      return saveCellExecution({ messaging, message, editor }, kernel);
    case APIMethod.UpdateCellExecution:
      return updateCellExecution({ messaging, message, editor }, kernel);
    // ... more cases
  }
}
```

#### Type-Safe Messaging

```typescript
// Strongly typed messages
export enum ClientMessages {
  platformApiRequest = "platformApiRequest",
  cellOutput = "cellOutput",
  githubMessage = "githubMessage",
}

export interface ClientMessage<T extends ClientMessages> {
  type: T;
  output: MessageOutput;
}
```

### claude-runner Current Approach

#### Message Router

```typescript
export class MessageRouter {
  private handlers = new Map<string, MessageHandler>();

  register(command: string, handler: MessageHandler): void {
    this.handlers.set(command, handler);
  }

  route(message: WebviewMessage): void {
    const handler = this.handlers.get(message.command);
    if (handler) {
      handler(message);
    }
  }
}
```

## Recommended Improvements for claude-runner

### 1. Type-Safe Message Protocol

```typescript
// src/core/messaging/MessageTypes.ts
export enum MessageType {
  // From Extension to Webview
  StateUpdate = "stateUpdate",
  CommandResult = "commandResult",
  Error = "error",

  // From Webview to Extension
  RunCommand = "runCommand",
  UpdateConfig = "updateConfig",
  RequestData = "requestData",
}

export interface Message<T extends MessageType, P = unknown> {
  type: T;
  id: string; // For request/response correlation
  timestamp: number;
  payload: P;
}

// Specific message types
export interface StateUpdateMessage
  extends Message<MessageType.StateUpdate, UIState> {}
export interface RunCommandMessage
  extends Message<
    MessageType.RunCommand,
    {
      command: string;
      args: unknown[];
    }
  > {}
```

### 2. Request/Response Pattern

```typescript
// src/core/messaging/MessageBus.ts
export class MessageBus {
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  async request<T>(webview: vscode.Webview, message: Message<any>): Promise<T> {
    const id = uuidv4();
    const messageWithId = { ...message, id };

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }, 30000);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send message
      webview.postMessage(messageWithId);
    });
  }

  handleResponse(message: Message<any>): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);

      if (message.type === MessageType.Error) {
        pending.reject(message.payload);
      } else {
        pending.resolve(message.payload);
      }
    }
  }
}
```

### 3. Event Emitter Pattern

```typescript
// src/core/messaging/WebviewEventEmitter.ts
export class WebviewEventEmitter extends EventEmitter {
  constructor(private webview: vscode.Webview) {
    super();

    // Handle incoming messages
    webview.onDidReceiveMessage((message) => {
      this.emit(message.type, message);
    });
  }

  // Type-safe event registration
  onStateUpdateRequest(handler: (message: StateUpdateMessage) => void): void {
    this.on(MessageType.StateUpdate, handler);
  }

  // Broadcast to webview
  broadcast<T extends MessageType>(type: T, payload: any): void {
    const message: Message<T> = {
      type,
      id: uuidv4(),
      timestamp: Date.now(),
      payload,
    };

    this.webview.postMessage(message);
  }
}
```

### 4. Webview Controller Pattern

```typescript
// src/providers/WebviewController.ts
export abstract class WebviewController<TState> {
  protected messageBus: MessageBus;
  protected eventEmitter: WebviewEventEmitter;
  protected state: TState;

  constructor(
    protected webview: vscode.Webview,
    initialState: TState,
  ) {
    this.state = initialState;
    this.messageBus = new MessageBus();
    this.eventEmitter = new WebviewEventEmitter(webview);

    this.registerHandlers();
  }

  protected abstract registerHandlers(): void;

  protected setState(updates: Partial<TState>): void {
    this.state = { ...this.state, ...updates };
    this.broadcastState();
  }

  protected broadcastState(): void {
    this.eventEmitter.broadcast(MessageType.StateUpdate, this.state);
  }

  // Handle async operations with loading states
  protected async handleAsync<T>(
    operation: () => Promise<T>,
    options: {
      loadingMessage?: string;
      errorMessage?: string;
    } = {},
  ): Promise<T> {
    try {
      this.setState({
        isLoading: true,
        loadingMessage: options.loadingMessage,
      });
      const result = await operation();
      this.setState({ isLoading: false, loadingMessage: undefined });
      return result;
    } catch (error) {
      this.setState({
        isLoading: false,
        error: options.errorMessage || error.message,
      });
      throw error;
    }
  }
}
```

### 5. Specific Implementation for claude-runner

```typescript
// src/providers/ClaudeRunnerWebviewController.ts
export class ClaudeRunnerWebviewController extends WebviewController<UIState> {
  constructor(
    webview: vscode.Webview,
    private claudeService: ClaudeCodeService,
    private configService: ConfigurationService,
  ) {
    super(webview, getInitialState());
  }

  protected registerHandlers(): void {
    // Handle run command
    this.eventEmitter.on(
      MessageType.RunCommand,
      async (message: RunCommandMessage) => {
        const { command, args } = message.payload;

        try {
          const result = await this.handleAsync(
            () => this.claudeService.runTask(command, args),
            { loadingMessage: "Running Claude command..." },
          );

          // Send response
          this.messageBus.handleResponse({
            type: MessageType.CommandResult,
            id: message.id,
            timestamp: Date.now(),
            payload: result,
          });
        } catch (error) {
          this.messageBus.handleResponse({
            type: MessageType.Error,
            id: message.id,
            timestamp: Date.now(),
            payload: { error: error.message },
          });
        }
      },
    );

    // Handle config updates
    this.eventEmitter.on(MessageType.UpdateConfig, async (message) => {
      const { key, value } = message.payload;
      await this.configService.updateConfiguration(key, value);

      // Update state
      this.setState({
        config: await this.configService.getConfiguration(),
      });
    });
  }
}
```

### 6. React Hook for Webview Side

```typescript
// src/components/hooks/useExtension.ts
export function useExtension() {
  const vscode = acquireVsCodeApi();
  const [state, setState] = useState<UIState>(getInitialState());
  const [isLoading, setIsLoading] = useState(false);
  const pendingRequests = useRef(new Map());

  // Handle incoming messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data as Message<any>;

      switch (message.type) {
        case MessageType.StateUpdate:
          setState(message.payload);
          break;

        case MessageType.CommandResult:
        case MessageType.Error:
          const pending = pendingRequests.current.get(message.id);
          if (pending) {
            if (message.type === MessageType.Error) {
              pending.reject(message.payload);
            } else {
              pending.resolve(message.payload);
            }
            pendingRequests.current.delete(message.id);
          }
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Request helper
  const request = useCallback(
    async <T>(type: MessageType, payload: any): Promise<T> => {
      const id = Date.now().toString();

      return new Promise((resolve, reject) => {
        pendingRequests.current.set(id, { resolve, reject });

        vscode.postMessage({
          type,
          id,
          timestamp: Date.now(),
          payload,
        });

        // Timeout after 30s
        setTimeout(() => {
          if (pendingRequests.current.has(id)) {
            pendingRequests.current.delete(id);
            reject(new Error("Request timeout"));
          }
        }, 30000);
      });
    },
    [vscode],
  );

  // Command execution
  const runCommand = useCallback(
    async (command: string, args: any[] = []) => {
      setIsLoading(true);
      try {
        const result = await request<any>(MessageType.RunCommand, {
          command,
          args,
        });
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [request],
  );

  return {
    state,
    isLoading,
    runCommand,
    updateConfig: (key: string, value: any) =>
      request(MessageType.UpdateConfig, { key, value }),
  };
}
```

### 7. Error Boundary for Webviews

```typescript
// src/components/common/WebviewErrorBoundary.tsx
export class WebviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to extension
    vscode.postMessage({
      type: MessageType.Error,
      payload: {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      }
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <details>
            <summary>Error details</summary>
            <pre>{this.state.error?.stack}</pre>
          </details>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Benefits of This Approach

### 1. Type Safety

- Compile-time checking of message types
- IntelliSense support in IDE
- Reduced runtime errors

### 2. Request/Response Correlation

- Async/await pattern for webview communication
- Proper error handling
- Timeout management

### 3. State Management

- Single source of truth
- Predictable state updates
- Easy debugging

### 4. Error Handling

- Graceful error recovery
- User-friendly error messages
- Error reporting to extension

### 5. Performance

- Efficient message batching
- Reduced re-renders
- Optimistic updates

## Migration Strategy

1. **Phase 1**: Implement MessageBus alongside existing system
2. **Phase 2**: Migrate one feature to new pattern
3. **Phase 3**: Update remaining features
4. **Phase 4**: Remove old messaging code

This pattern provides a robust foundation for webview communication that scales with complexity while maintaining type safety and reliability.
