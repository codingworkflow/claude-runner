import { jest } from "@jest/globals";
import { TaskItem } from "../../../src/core/models/Task";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import {
  WorkflowStateService,
  WorkflowState,
} from "../../../src/services/WorkflowStateService";

export interface TestTaskOptions {
  id?: string;
  name?: string;
  prompt?: string;
  status?: "pending" | "running" | "completed" | "error" | "paused" | "skipped";
}

export interface TestPipelineOptions {
  taskCount?: number;
  tasks?: TaskItem[];
  workingDirectory?: string;
  config?: {
    allowAllTools: boolean;
    outputFormat: "json" | "text" | "stream-json";
  };
}

export interface MockExecutionConfig {
  executeCommandDelay?: number;
  shouldComplete?: boolean;
  shouldFail?: boolean;
  callCountBeforePause?: number;
}

export const createTestTask = (options: TestTaskOptions = {}): TaskItem => ({
  id:
    options.id ??
    `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: options.name ?? "Test Task",
  prompt: options.prompt ?? "test prompt",
  status: options.status ?? "pending",
});

export const createTestTasks = (
  count: number = 2,
  baseOptions: TestTaskOptions = {},
): TaskItem[] => {
  return Array.from({ length: count }, (_, index) =>
    createTestTask({
      ...baseOptions,
      id: baseOptions.id
        ? `${baseOptions.id}-${index + 1}`
        : `task${index + 1}`,
      name: baseOptions.name
        ? `${baseOptions.name} ${index + 1}`
        : `Task ${index + 1}`,
      prompt: baseOptions.prompt
        ? `${baseOptions.prompt} ${index + 1}`
        : `test prompt ${index + 1}`,
    }),
  );
};

export const createTestPipeline = (options: TestPipelineOptions = {}) => ({
  tasks: options.tasks ?? createTestTasks(options.taskCount ?? 2),
  workingDirectory: options.workingDirectory ?? "/test",
  config: options.config ?? {
    allowAllTools: true,
    outputFormat: "json" as const,
  },
});

export const createMockConfigService = () =>
  ({
    validateModel: jest.fn().mockReturnValue(true),
    validatePath: jest.fn().mockReturnValue(true),
  }) as jest.Mocked<Partial<ConfigurationService>>;

export const createMockWorkflowStateService = () => {
  const mock = {
    pauseWorkflow: jest.fn(),
    resumeWorkflow: jest.fn(),
    getResumableWorkflows: jest.fn(),
    deleteWorkflowState: jest.fn(),
  } as jest.Mocked<Partial<WorkflowStateService>>;

  return mock;
};

export const createMockWorkflowState = (
  overrides: Partial<WorkflowState> = {},
): WorkflowState => ({
  executionId: "exec_123",
  workflowName: "test-workflow",
  workflowPath: "/path/to/workflow.yml",
  startTime: new Date().toISOString(),
  currentStep: 1,
  totalSteps: 3,
  status: "paused",
  sessionMappings: {},
  completedSteps: [],
  execution: {} as never,
  pauseReason: "manual",
  canResume: true,
  ...overrides,
});

export const mockPipelineExecution = (taskCount: number = 2) => ({
  execute: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  tasks: createTestTasks(taskCount),
  currentIndex: 0,
  onProgress: jest.fn(),
  onComplete: jest.fn(),
  onError: jest.fn(),
});

export const createMockExecuteCommand = (config: MockExecutionConfig = {}) => {
  const {
    executeCommandDelay = 100,
    shouldComplete = true,
    shouldFail = false,
    callCountBeforePause = 0,
  } = config;

  let callCount = 0;

  return async (): Promise<any> => {
    callCount++;

    if (callCountBeforePause > 0 && callCount > callCountBeforePause) {
      return new Promise(() => {}); // Never resolve to simulate pause
    }

    if (executeCommandDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, executeCommandDelay));
    }

    if (shouldFail) {
      return {
        success: false,
        output: "Command failed",
        exitCode: 1,
      };
    }

    if (shouldComplete) {
      return {
        success: true,
        output:
          callCount === 1
            ? JSON.stringify({
                result: "First task completed",
                session_id: "session-1",
              })
            : "Task completed",
        exitCode: 0,
      };
    }

    return new Promise(() => {}); // Never resolve
  };
};

export const createPipelineCallbacks = () => ({
  onProgress: jest.fn(),
  onComplete: jest.fn(),
  onError: jest.fn(),
});

export const expectPipelineState = {
  toBePaused: (tasks: TaskItem[], expectedPausedIndex?: number) => {
    if (expectedPausedIndex !== undefined) {
      expect(tasks[expectedPausedIndex].status).toBe("paused");
    } else {
      expect(tasks.some((task) => task.status === "paused")).toBe(true);
    }
  },

  toBeCompleted: (tasks: TaskItem[], expectedCompletedCount?: number) => {
    const completedTasks = tasks.filter((task) => task.status === "completed");
    if (expectedCompletedCount !== undefined) {
      expect(completedTasks).toHaveLength(expectedCompletedCount);
    } else {
      expect(completedTasks.length).toBeGreaterThan(0);
    }
  },

  toBeRunning: (tasks: TaskItem[], expectedRunningIndex?: number) => {
    if (expectedRunningIndex !== undefined) {
      expect(tasks[expectedRunningIndex].status).toBe("running");
    } else {
      expect(tasks.some((task) => task.status === "running")).toBe(true);
    }
  },
};
