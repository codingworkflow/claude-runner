# REGRESSION FIX VERIFICATION

## ISSUE: "Invalid API key" Error in Pipeline Execution

### ROOT CAUSE IDENTIFIED:

Both `runTask()` and `executeTaskCommand()` (used by pipelines) were calling `apiService.sendMessage()` instead of using CLI execution.

### REGRESSION ANALYSIS:

- **BEFORE**: Both used HTTP API calls to Anthropic (broken with API key placeholder)
- **NOW**: Both use `workflowEngine.executor.executeTask()` (CLI execution with environment variables)

### FIXES APPLIED:

1. **Fixed `runTask()` method** (line 160):

```typescript
// OLD: await this.apiService.sendMessage(...)
// NEW: await this.workflowEngine.executor.executeTask(...)
```

2. **Fixed `executeTaskCommand()` method** (line 729):

```typescript
// OLD: await this.apiService.sendMessage(...)
// NEW: await this.workflowEngine.executor.executeTask(...)
```

### EXECUTION PATHS NOW UNIFIED:

**Single Task Execution:**

- `runTask()` → `workflowEngine.executor.executeTask()` → `ClaudeExecutor` → `spawn("claude")` ✅

**Pipeline Execution:**

- `executeTaskCommand()` → `workflowEngine.executor.executeTask()` → `ClaudeExecutor` → `spawn("claude")` ✅

**Workflow Execution:**

- `WorkflowEngine.executeStep()` → `executor.executeTask()` → `ClaudeExecutor` → `spawn("claude")` ✅

### VERIFICATION:

All three execution types now use the same CLI execution path that:

1. Uses `spawn("claude", args)`
2. Passes `env: process.env` (includes ANTHROPIC_API_KEY)
3. Works with existing environment setup

### RESULT:

The "Invalid API key" error should be resolved because all execution now uses CLI with proper environment variable passing, just like the working `claude -p "hi"` command.
