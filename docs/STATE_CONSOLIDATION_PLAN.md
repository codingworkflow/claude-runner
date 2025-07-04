# RunnerController State Consolidation Plan

## Executive Summary

This document outlines a phased approach to consolidate the RunnerController's complex state management, specifically addressing the overlapping state fields and inconsistent pause/resume workflows identified through detailed analysis.

## Current State Analysis

### Identified Issues

#### 1. **Overlapping State Fields**

```typescript
// Current overlapping fields in UIState
status: "idle" | "running" | "completed" | "error" | "paused";
taskCompleted: boolean;
taskError: boolean;
isPaused: boolean;
```

**Problem**: Multiple fields represent the same logical states:

- `status: "paused"` vs `isPaused: boolean`
- `status: "completed"` vs `taskCompleted: boolean`
- `status: "error"` vs `taskError: boolean`

#### 2. **Inconsistent Pause/Resume Workflows**

**Pipeline Pause** (lines 1026-1054):

- Sets only `isPaused: true`
- No status change
- No execution ID tracking

**Workflow Pause** (lines 969-998):

- Sets `isPaused: true` + `currentExecutionId`
- Still no status change

**Resume Logic Inconsistency**:

- Pipeline resume: Sets `status: "running"` + `isPaused: false`
- Workflow resume: Sets only `isPaused: false` + `currentExecutionId`

#### 3. **Manual State Clearing**

State cleanup scattered across 3+ methods:

- `cancelTask()` (lines 478-488)
- `runTasks.onComplete()` (lines 421-431)
- `runTasks.onError()` (lines 445-456)

## Consolidation Strategy

### Phase 1: State Model Redesign (Breaking Changes)

#### 1.1 Unified Execution State

Replace overlapping fields with a single execution state model:

```typescript
// NEW: Single source of truth for execution state
interface ExecutionState {
  phase: "idle" | "running" | "paused" | "completed" | "error";
  type?: "task" | "pipeline" | "workflow";
  executionId?: string;
  currentIndex?: number;
  result?: string;
  error?: string;
  pauseReason?: "manual" | "condition" | "error";
}

// REMOVE: Overlapping fields
// ❌ status: "idle" | "running" | "completed" | "error" | "paused";
// ❌ taskCompleted: boolean;
// ❌ taskError: boolean;
// ❌ isPaused: boolean;
// ❌ lastTaskResults?: string;
// ❌ currentTaskIndex?: number;
// ❌ currentExecutionId?: string;
```

#### 1.2 Pause/Resume State Consolidation

```typescript
// NEW: Unified pause/resume tracking
interface PauseResumeState {
  activePauses: Array<{
    id: string;
    type: "pipeline" | "workflow";
    pausedAt: number;
    reason: "manual" | "condition" | "error";
    context: PipelineContext | WorkflowContext;
  }>;
  resumableItems: Array<{
    id: string;
    name: string;
    type: "pipeline" | "workflow";
    canResume: boolean;
    lastStep: number;
    totalSteps: number;
  }>;
}

// REMOVE: Separate arrays
// ❌ pausedPipelines: Array<{...}>;
// ❌ resumableWorkflows: Array<{...}>;
```

#### 1.3 New UIState Structure

```typescript
export interface UIState {
  // Configuration (unchanged)
  model: string;
  rootPath: string;
  allowAllTools: boolean;
  parallelTasksCount: number;

  // Navigation (unchanged)
  activeTab: "chat" | "pipeline" | "workflows" | "runner" | "usage" | "logs";
  showAdvancedTabs: boolean;

  // Pipeline data (unchanged)
  outputFormat: "text" | "json";
  tasks: TaskItem[];
  availablePipelines: string[];
  discoveredWorkflows?: { name: string; path: string }[];
  workflowPath?: string;

  // NEW: Consolidated execution state
  execution: ExecutionState;

  // NEW: Consolidated pause/resume state
  pauseResume: PauseResumeState;

  // Chat state (unchanged)
  chatPrompt: string;
  showChatPrompt: boolean;

  // Claude state (unchanged)
  claudeVersion: string;
  claudeVersionAvailable: boolean;
  claudeVersionError?: string;
  claudeVersionLoading: boolean;
  claudeInstalled: boolean;
}
```

### Phase 2: State Management Refactor

#### 2.1 Execution State Machine

Create a centralized state machine for execution phases:

```typescript
class ExecutionStateMachine {
  private state: ExecutionState;

  transition(event: ExecutionEvent): ExecutionState {
    switch (this.state.phase) {
      case "idle":
        if (event.type === "START") {
          return {
            phase: "running",
            type: event.executionType,
            executionId: event.id,
          };
        }
        break;

      case "running":
        if (event.type === "PAUSE") {
          return { ...this.state, phase: "paused", pauseReason: event.reason };
        }
        if (event.type === "COMPLETE") {
          return { ...this.state, phase: "completed", result: event.result };
        }
        if (event.type === "ERROR") {
          return { ...this.state, phase: "error", error: event.error };
        }
        break;

      case "paused":
        if (event.type === "RESUME") {
          return { ...this.state, phase: "running" };
        }
        if (event.type === "CANCEL") {
          return { phase: "idle" };
        }
        break;
    }

    throw new Error(`Invalid transition: ${this.state.phase} -> ${event.type}`);
  }
}
```

#### 2.2 Pause/Resume Manager

Centralize pause/resume logic:

```typescript
class PauseResumeManager {
  private pausedItems = new Map<string, PausedItem>();

  async pause(type: "pipeline" | "workflow", context: any): Promise<string> {
    const id = this.generateId();
    const pausedItem = {
      id,
      type,
      pausedAt: Date.now(),
      reason: "manual",
      context,
    };

    this.pausedItems.set(id, pausedItem);
    return id;
  }

  async resume(id: string): Promise<boolean> {
    const item = this.pausedItems.get(id);
    if (!item) return false;

    // Unified resume logic regardless of type
    const success = await this.performResume(item);
    if (success) {
      this.pausedItems.delete(id);
    }
    return success;
  }

  getResumableItems(): ResumableItem[] {
    return Array.from(this.pausedItems.values()).map((item) =>
      this.toResumableItem(item),
    );
  }
}
```

### Phase 3: Controller Refactor

#### 3.1 Split Controller Responsibilities

Break RunnerController into focused controllers:

```typescript
// Core execution controller
class ExecutionController {
  constructor(
    private stateMachine: ExecutionStateMachine,
    private claudeCodeService: ClaudeCodeService,
  ) {}

  async runTask(task: string): Promise<void> {
    this.stateMachine.transition({ type: "START", executionType: "task" });
    // ... execution logic
  }

  async runPipeline(tasks: TaskItem[]): Promise<void> {
    this.stateMachine.transition({ type: "START", executionType: "pipeline" });
    // ... pipeline logic
  }
}

// Pause/resume controller
class PauseResumeController {
  constructor(
    private pauseManager: PauseResumeManager,
    private executionController: ExecutionController,
  ) {}

  async pauseExecution(): Promise<void> {
    // Unified pause logic for both pipelines and workflows
  }

  async resumeExecution(id: string): Promise<void> {
    // Unified resume logic
  }
}

// Main controller orchestrator
class RunnerController {
  constructor(
    private executionController: ExecutionController,
    private pauseResumeController: PauseResumeController,
    private configController: ConfigurationController,
    // ... other focused controllers
  ) {}

  readonly send = (cmd: RunnerCommand): void => {
    // Route to appropriate controller
    switch (cmd.kind) {
      case "runTask":
      case "runTasks":
        return this.executionController.handle(cmd);

      case "pausePipeline":
      case "pauseWorkflow":
      case "resumePipeline":
      case "resumeWorkflow":
        return this.pauseResumeController.handle(cmd);

      // ... other routing
    }
  };
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. **Design new state interfaces** - Complete interface definitions
2. **Create state machine** - Implement ExecutionStateMachine
3. **Build pause/resume manager** - Implement PauseResumeManager
4. **Write comprehensive tests** - Unit tests for new components

### Phase 2: Migration (Week 2)

1. **Update UIState interface** - Implement new structure
2. **Migrate state usage** - Update all state readers/writers
3. **Update UI components** - Adapt React components to new state
4. **Integration testing** - End-to-end workflow testing

### Phase 3: Controller Split (Week 3)

1. **Create focused controllers** - Extract domain-specific controllers
2. **Refactor command routing** - Implement controller routing
3. **Remove redundant code** - Clean up old implementations
4. **Performance testing** - Ensure no regression

### Phase 4: Validation (Week 4)

1. **Comprehensive testing** - All workflows working correctly
2. **Documentation update** - Update architecture docs
3. **Code review** - Team review of changes
4. **Deployment preparation** - Migration guide for users

## Risk Mitigation

### Breaking Changes

- **Gradual migration**: Keep old fields temporarily with deprecation warnings
- **Backward compatibility**: Provide adapter layer during transition
- **Feature flags**: Allow rollback if issues discovered

### Data Migration

- **State persistence**: Ensure workspace state migrates correctly
- **User settings**: Preserve all user configurations
- **Active executions**: Handle in-progress tasks gracefully

### Testing Strategy

- **Unit tests**: Each component tested in isolation
- **Integration tests**: End-to-end workflow validation
- **Regression tests**: Ensure existing functionality preserved
- **Performance tests**: Verify no performance degradation

## Success Metrics

### Code Quality

- **Reduced complexity**: RunnerController from 1153 to <400 lines
- **Single responsibility**: Each controller handles one domain
- **Testability**: >90% test coverage on new components

### Maintainability

- **State consistency**: Zero overlapping state fields
- **Clear workflows**: Unified pause/resume logic
- **Documentation**: Complete architecture documentation

### User Experience

- **No functionality loss**: All existing features preserved
- **Improved reliability**: Consistent state behavior
- **Better performance**: Optimized state updates

## Conclusion

This consolidation plan addresses the core issues in RunnerController through a systematic, phased approach. The new architecture eliminates state overlaps, unifies pause/resume workflows, and creates a more maintainable codebase while preserving all existing functionality.

The key innovation is the unified execution state machine and centralized pause/resume management, which replaces the current scattered and inconsistent state handling with a clean, predictable system.
