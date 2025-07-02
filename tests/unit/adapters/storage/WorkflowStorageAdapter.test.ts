import * as vscode from "vscode";
import { VSCodeWorkflowStorageAdapter } from "../../../../src/adapters/storage/WorkflowStorageAdapter";
import { WorkflowState } from "../../../../src/services/WorkflowStateService";
import {
  WorkflowExecution,
  ClaudeWorkflow,
} from "../../../../src/types/WorkflowTypes";

jest.mock("vscode");

const STORAGE_ERROR_MESSAGE = "Storage operation failed";
const DELETE_ERROR_MESSAGE = "Delete operation failed";
const CLEAR_ERROR_MESSAGE = "Clear operation failed";

describe("VSCodeWorkflowStorageAdapter", () => {
  let adapter: VSCodeWorkflowStorageAdapter;
  let mockContext: jest.Mocked<vscode.ExtensionContext>;
  let mockGlobalState: jest.Mocked<vscode.Memento>;

  const createMockWorkflowState = (
    executionId: string,
    overrides: Partial<WorkflowState> = {},
  ): WorkflowState => {
    const mockWorkflow: ClaudeWorkflow = {
      name: "test-workflow",
      jobs: {
        pipeline: {
          steps: [
            {
              id: "step1",
              uses: "claude-pipeline-action",
              with: { prompt: "test" },
            },
            {
              id: "step2",
              uses: "claude-pipeline-action",
              with: { prompt: "test2" },
            },
          ],
        },
      },
    };

    const mockExecution: WorkflowExecution = {
      workflow: mockWorkflow,
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "pending",
    };

    return {
      executionId,
      workflowPath: "/test/workflow.yml",
      workflowName: "test-workflow",
      startTime: "2023-01-01T00:00:00.000Z",
      currentStep: 0,
      totalSteps: 2,
      status: "pending",
      sessionMappings: {},
      completedSteps: [],
      execution: mockExecution,
      canResume: true,
      ...overrides,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGlobalState = {
      get: jest.fn(),
      update: jest.fn(),
      keys: jest.fn(),
      setKeysForSync: jest.fn(),
    } as any;

    mockContext = {
      globalState: mockGlobalState,
      subscriptions: [],
      extensionUri: vscode.Uri.file("/test"),
      globalStorageUri: vscode.Uri.file("/test/global"),
      logUri: vscode.Uri.file("/test/log"),
      storageUri: vscode.Uri.file("/test/storage"),
      workspaceState: mockGlobalState,
      secrets: {} as any,
      environmentVariableCollection: {} as any,
      extension: {} as any,
      extensionPath: "/test",
      globalStoragePath: "/test/global",
      logPath: "/test/log",
      storagePath: "/test/storage",
      asAbsolutePath: jest.fn(),
    } as any;

    adapter = new VSCodeWorkflowStorageAdapter(mockContext);
  });

  describe("Workflow Storage Operations and Management", () => {
    describe("saveWorkflowState", () => {
      test("should save a new workflow state", async () => {
        const state = createMockWorkflowState("exec_123");
        mockGlobalState.get.mockReturnValue([]);

        await adapter.saveWorkflowState(state);

        expect(mockGlobalState.update).toHaveBeenCalledWith(
          "claude-runner.workflow-states",
          [state],
        );
      });

      test("should update existing workflow state", async () => {
        const existingState = createMockWorkflowState("exec_123", {
          status: "running",
        });
        const updatedState = createMockWorkflowState("exec_123", {
          status: "completed",
        });

        mockGlobalState.get.mockReturnValue([existingState]);

        await adapter.saveWorkflowState(updatedState);

        expect(mockGlobalState.update).toHaveBeenCalledWith(
          "claude-runner.workflow-states",
          [updatedState],
        );
      });

      test("should limit stored states to maxStates (50)", async () => {
        const existingStates = Array.from({ length: 50 }, (_, i) =>
          createMockWorkflowState(`exec_${i}`, {
            startTime: new Date(2023, 0, i + 1).toISOString(),
          }),
        );
        const newState = createMockWorkflowState("exec_new", {
          startTime: new Date(2023, 0, 52).toISOString(),
        });

        mockGlobalState.get.mockReturnValue(existingStates);

        await adapter.saveWorkflowState(newState);

        const updateCall = mockGlobalState.update.mock.calls[0];
        const savedStates = updateCall[1] as WorkflowState[];

        expect(savedStates).toHaveLength(50);
        expect(savedStates[0]).toEqual(newState);
        expect(savedStates.some((s) => s.executionId === "exec_0")).toBe(false);
      });
    });

    describe("loadWorkflowState", () => {
      test("should load existing workflow state", async () => {
        const state = createMockWorkflowState("exec_123");
        mockGlobalState.get.mockReturnValue([state]);

        const result = await adapter.loadWorkflowState("exec_123");

        expect(result).toEqual(state);
      });

      test("should return null for non-existing state", async () => {
        mockGlobalState.get.mockReturnValue([]);

        const result = await adapter.loadWorkflowState("exec_nonexistent");

        expect(result).toBeNull();
      });
    });

    describe("listWorkflowStates", () => {
      test("should return all workflow states", async () => {
        const states = [
          createMockWorkflowState("exec_1"),
          createMockWorkflowState("exec_2"),
        ];
        mockGlobalState.get.mockReturnValue(states);

        const result = await adapter.listWorkflowStates();

        expect(result).toEqual(states);
      });
    });

    describe("deleteWorkflowState", () => {
      test("should delete specific workflow state", async () => {
        const states = [
          createMockWorkflowState("exec_1"),
          createMockWorkflowState("exec_2"),
          createMockWorkflowState("exec_3"),
        ];
        mockGlobalState.get.mockReturnValue(states);

        await adapter.deleteWorkflowState("exec_2");

        expect(mockGlobalState.update).toHaveBeenCalledWith(
          "claude-runner.workflow-states",
          [states[0], states[2]],
        );
      });

      test("should handle non-existing state deletion", async () => {
        const states = [createMockWorkflowState("exec_1")];
        mockGlobalState.get.mockReturnValue(states);

        await adapter.deleteWorkflowState("exec_nonexistent");

        expect(mockGlobalState.update).toHaveBeenCalledWith(
          "claude-runner.workflow-states",
          states,
        );
      });
    });

    describe("cleanupOldStates", () => {
      test("should remove states older than maxAge", async () => {
        const now = Date.now();
        const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
        const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

        const states = [
          createMockWorkflowState("exec_recent", { startTime: oneHourAgo }),
          createMockWorkflowState("exec_old", { startTime: twoHoursAgo }),
        ];

        mockGlobalState.get.mockReturnValue(states);

        await adapter.cleanupOldStates(90 * 60 * 1000);

        expect(mockGlobalState.update).toHaveBeenCalledWith(
          "claude-runner.workflow-states",
          [states[0]],
        );
      });

      test("should not update storage if no cleanup needed", async () => {
        const now = Date.now();
        const recentTime = new Date(now - 30 * 60 * 1000).toISOString();

        const states = [
          createMockWorkflowState("exec_recent", { startTime: recentTime }),
        ];
        mockGlobalState.get.mockReturnValue(states);

        await adapter.cleanupOldStates(60 * 60 * 1000);

        expect(mockGlobalState.update).not.toHaveBeenCalled();
      });
    });
  });

  describe("Workflow Data Serialization and Persistence", () => {
    describe("state validation", () => {
      test("should filter out invalid states when loading", async () => {
        const validState = createMockWorkflowState("exec_valid");
        const invalidStates = [
          null,
          undefined,
          {},
          { executionId: "incomplete" },
          { executionId: 123, workflowName: "invalid-type" },
        ];

        mockGlobalState.get.mockReturnValue([validState, ...invalidStates]);

        const result = await adapter.listWorkflowStates();

        expect(result).toEqual([validState]);
      });

      test("should validate all required WorkflowState properties", async () => {
        const completeState = createMockWorkflowState("exec_complete");
        const incompleteStates = [
          { ...completeState, executionId: undefined },
          { ...completeState, workflowName: null },
          { ...completeState, workflowPath: 123 },
          { ...completeState, startTime: false },
          { ...completeState, currentStep: "invalid" },
          { ...completeState, totalSteps: null },
          { ...completeState, status: undefined },
          { ...completeState, sessionMappings: "invalid" },
          { ...completeState, completedSteps: "not-array" },
          { ...completeState, execution: null },
          { ...completeState, canResume: "invalid" },
        ];

        mockGlobalState.get.mockReturnValue([
          completeState,
          ...incompleteStates,
        ]);

        const result = await adapter.listWorkflowStates();

        expect(result).toEqual([completeState]);
      });
    });

    describe("data integrity", () => {
      test("should preserve complex state data during save/load cycle", async () => {
        const complexState = createMockWorkflowState("exec_complex", {
          status: "paused",
          pausedAt: "2023-01-01T01:00:00.000Z",
          resumedAt: "2023-01-01T02:00:00.000Z",
          currentStep: 1,
          sessionMappings: { step1: "ses_123", step2: "ses_456" },
          completedSteps: [
            {
              stepIndex: 0,
              stepId: "step1",
              sessionId: "ses_123",
              outputSession: true,
              status: "completed",
              startTime: "2023-01-01T00:30:00.000Z",
              endTime: "2023-01-01T00:45:00.000Z",
              output: "Step 1 completed successfully",
            },
          ],
          pauseReason: "manual",
          canResume: true,
        });

        mockGlobalState.get.mockReturnValue([]);
        await adapter.saveWorkflowState(complexState);

        mockGlobalState.get.mockReturnValue([complexState]);
        const loaded = await adapter.loadWorkflowState("exec_complex");

        expect(loaded).toEqual(complexState);
      });
    });
  });

  describe("Workflow Storage Error Handling and Recovery", () => {
    test("should handle VSCode storage save failures", async () => {
      const state = createMockWorkflowState("exec_123");
      mockGlobalState.get.mockReturnValue([]);
      (mockGlobalState.update as jest.Mock).mockImplementation(() => {
        throw new Error(STORAGE_ERROR_MESSAGE);
      });

      await expect(adapter.saveWorkflowState(state)).rejects.toThrow(
        "Failed to save workflow state",
      );
    });

    test("should handle load errors gracefully", async () => {
      (mockGlobalState.get as jest.Mock).mockImplementation(() => {
        throw new Error("Load failed");
      });

      const result = await adapter.loadWorkflowState("exec_123");

      expect(result).toBeNull();
    });

    test("should return empty array on list error", async () => {
      (mockGlobalState.get as jest.Mock).mockImplementation(() => {
        throw new Error("List failed");
      });

      const result = await adapter.listWorkflowStates();

      expect(result).toEqual([]);
    });

    test("should handle delete errors", async () => {
      mockGlobalState.get.mockReturnValue([
        createMockWorkflowState("exec_123"),
      ]);
      (mockGlobalState.update as jest.Mock).mockImplementation(() => {
        throw new Error(DELETE_ERROR_MESSAGE);
      });

      await expect(adapter.deleteWorkflowState("exec_123")).rejects.toThrow(
        "Failed to delete workflow state",
      );
    });

    test("should handle cleanup errors gracefully", async () => {
      (mockGlobalState.get as jest.Mock).mockImplementation(() => {
        throw new Error("Cleanup failed");
      });

      await expect(
        adapter.cleanupOldStates(60 * 60 * 1000),
      ).resolves.toBeUndefined();
    });

    test("should recover from corrupted storage data", async () => {
      mockGlobalState.get.mockReturnValue("corrupted-data");

      const result = await adapter.listWorkflowStates();

      expect(result).toEqual([]);
    });

    test("should handle undefined/null storage responses", async () => {
      mockGlobalState.get.mockReturnValue(undefined);

      const result = await adapter.listWorkflowStates();

      expect(result).toEqual([]);
    });
  });

  describe("Workflow Storage Performance Optimization", () => {
    test("should efficiently handle large numbers of states", async () => {
      const states = Array.from({ length: 100 }, (_, i) =>
        createMockWorkflowState(`exec_${i}`),
      );

      mockGlobalState.get.mockReturnValue(states);

      const start = Date.now();
      const result = await adapter.listWorkflowStates();
      const duration = Date.now() - start;

      expect(result).toHaveLength(100);
      expect(duration).toBeLessThan(100);
    });

    test("should optimize state limiting algorithm", async () => {
      const oldestDate = new Date(2023, 0, 1);
      const states = Array.from({ length: 60 }, (_, i) =>
        createMockWorkflowState(`exec_${i}`, {
          startTime: new Date(
            oldestDate.getTime() + i * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      );

      mockGlobalState.get.mockReturnValue(states);

      const newState = createMockWorkflowState("exec_newest", {
        startTime: new Date(
          oldestDate.getTime() + 61 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });

      await adapter.saveWorkflowState(newState);

      const updateCall = mockGlobalState.update.mock.calls[0];
      const savedStates = updateCall[1] as WorkflowState[];

      expect(savedStates).toHaveLength(50);

      const sortedByTime = savedStates.sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
      );
      expect(sortedByTime[0].executionId).toBe("exec_newest");
    });

    test("should handle concurrent access scenarios", async () => {
      const state1 = createMockWorkflowState("exec_1");
      const state2 = createMockWorkflowState("exec_2");

      mockGlobalState.get.mockReturnValue([]);

      const promise1 = adapter.saveWorkflowState(state1);
      const promise2 = adapter.saveWorkflowState(state2);

      await Promise.all([promise1, promise2]);

      expect(mockGlobalState.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("Workflow Storage Security and Validation", () => {
    test("should handle malicious input without crashing", async () => {
      const maliciousState = {
        ...createMockWorkflowState("exec_malicious"),
        workflowName: "<script>alert('xss')</script>",
        workflowPath: "../../../etc/passwd",
      };

      mockGlobalState.get.mockReturnValue([]);

      await adapter.saveWorkflowState(maliciousState);

      expect(mockGlobalState.update).toHaveBeenCalledWith(
        "claude-runner.workflow-states",
        [maliciousState],
      );
    });

    test("should validate state structure before storage", async () => {
      const invalidState = {
        executionId: "exec_invalid",
        maliciousProperty: "() => { deleteAllFiles(); }",
      } as any;

      mockGlobalState.get.mockReturnValue([invalidState]);

      const result = await adapter.listWorkflowStates();

      expect(result).toEqual([]);
    });

    test("should handle extremely large state objects", async () => {
      const largeOutput = "x".repeat(1000000);
      const largeState = createMockWorkflowState("exec_large", {
        completedSteps: [
          {
            stepIndex: 0,
            stepId: "step1",
            outputSession: false,
            status: "completed",
            output: largeOutput,
          },
        ],
      });

      mockGlobalState.get.mockReturnValue([]);

      await expect(
        adapter.saveWorkflowState(largeState),
      ).resolves.toBeUndefined();
    });

    test("should handle mixed valid/invalid states", async () => {
      const validState = createMockWorkflowState("exec_valid");
      const mixedStates = [
        validState,
        null,
        { executionId: "partial" },
        validState,
        undefined,
      ];

      mockGlobalState.get.mockReturnValue(mixedStates);

      const result = await adapter.listWorkflowStates();

      expect(result).toEqual([validState, validState]);
    });
  });

  describe("Utility Methods", () => {
    describe("getStorageStats", () => {
      test("should return accurate storage statistics", async () => {
        const states = [
          createMockWorkflowState("exec_1", {
            startTime: "2023-01-01T00:00:00.000Z",
          }),
          createMockWorkflowState("exec_2", {
            startTime: "2023-01-02T00:00:00.000Z",
          }),
          createMockWorkflowState("exec_3", {
            startTime: "2023-01-03T00:00:00.000Z",
          }),
        ];

        mockGlobalState.get.mockReturnValue(states);

        const stats = await adapter.getStorageStats();

        expect(stats.totalStates).toBe(3);
        expect(stats.totalSize).toBeGreaterThan(0);
        expect(stats.oldestState).toBe("2023-01-01T00:00:00.000Z");
        expect(stats.newestState).toBe("2023-01-03T00:00:00.000Z");
      });

      test("should handle empty storage", async () => {
        mockGlobalState.get.mockReturnValue([]);

        const stats = await adapter.getStorageStats();

        expect(stats).toEqual({
          totalStates: 0,
          totalSize: 0,
        });
      });

      test("should handle stats calculation errors", async () => {
        (mockGlobalState.get as jest.Mock).mockImplementation(() => {
          throw new Error("Stats failed");
        });

        const stats = await adapter.getStorageStats();

        expect(stats).toEqual({
          totalStates: 0,
          totalSize: 0,
        });
      });
    });

    describe("clearAllStates", () => {
      test("should clear all workflow states", async () => {
        await adapter.clearAllStates();

        expect(mockGlobalState.update).toHaveBeenCalledWith(
          "claude-runner.workflow-states",
          [],
        );
      });

      test("should handle clear errors", async () => {
        (mockGlobalState.update as jest.Mock).mockImplementation(() => {
          throw new Error(CLEAR_ERROR_MESSAGE);
        });

        await expect(adapter.clearAllStates()).rejects.toThrow(
          "Failed to clear workflow states",
        );
      });
    });
  });
});
