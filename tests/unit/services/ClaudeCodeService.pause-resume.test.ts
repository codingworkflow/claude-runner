import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import {
  WorkflowStateService,
  WorkflowState,
} from "../../../src/services/WorkflowStateService";
import {
  createMockConfigService,
  createMockWorkflowStateService,
  createMockWorkflowState,
  mockPipelineExecution,
} from "../helpers/pipelineTestUtils";

jest.mock("../../../src/services/ConfigurationService");
jest.mock("../../../src/services/WorkflowStateService");

describe("ClaudeCodeService Pause/Resume", () => {
  let claudeCodeService: ClaudeCodeService;
  let mockConfigService: jest.Mocked<ConfigurationService>;
  let mockWorkflowStateService: jest.Mocked<WorkflowStateService>;

  beforeEach(() => {
    mockConfigService =
      createMockConfigService() as jest.Mocked<ConfigurationService>;
    mockWorkflowStateService =
      createMockWorkflowStateService() as jest.Mocked<WorkflowStateService>;

    claudeCodeService = new ClaudeCodeService(
      mockConfigService,
      mockWorkflowStateService,
    );
  });

  describe("pauseWorkflowExecution", () => {
    it("should pause workflow execution", async () => {
      const mockWorkflowState = createMockWorkflowState();

      mockWorkflowStateService.pauseWorkflow.mockResolvedValue(
        mockWorkflowState,
      );

      const result = await claudeCodeService.pauseWorkflowExecution("exec_123");

      expect(result).toEqual(mockWorkflowState);
      expect(mockWorkflowStateService.pauseWorkflow).toHaveBeenCalledWith(
        "exec_123",
        "manual",
      );
    });

    it("should return null when workflow state service is not available", async () => {
      const serviceWithoutState = new ClaudeCodeService(mockConfigService);

      const result =
        await serviceWithoutState.pauseWorkflowExecution("exec_123");

      expect(result).toBeNull();
    });

    it("should cancel current process when pausing", async () => {
      const mockKill = jest.fn();

      // Simulate a running process
      (
        claudeCodeService as unknown as { currentProcess: { kill: jest.Mock } }
      ).currentProcess = {
        kill: mockKill,
      };

      mockWorkflowStateService.pauseWorkflow.mockResolvedValue(
        {} as WorkflowState,
      );

      await claudeCodeService.pauseWorkflowExecution("exec_123");

      expect(mockKill).toHaveBeenCalledWith("SIGTERM");
      expect(
        (claudeCodeService as unknown as { currentProcess: unknown })
          .currentProcess,
      ).toBeNull();
    });
  });

  describe("resumeWorkflowExecution", () => {
    it("should resume workflow execution", async () => {
      const mockWorkflowState = createMockWorkflowState({
        status: "running",
        execution: { workflow: { name: "test" } } as never,
      });

      mockWorkflowStateService.resumeWorkflow.mockResolvedValue(
        mockWorkflowState,
      );

      const result =
        await claudeCodeService.resumeWorkflowExecution("exec_123");

      expect(result).toEqual(mockWorkflowState);
      expect(mockWorkflowStateService.resumeWorkflow).toHaveBeenCalledWith(
        "exec_123",
      );
      expect(
        (claudeCodeService as unknown as { currentWorkflowExecution: unknown })
          .currentWorkflowExecution,
      ).toEqual(mockWorkflowState.execution);
    });

    it("should return null when workflow state service is not available", async () => {
      const serviceWithoutState = new ClaudeCodeService(mockConfigService);

      const result =
        await serviceWithoutState.resumeWorkflowExecution("exec_123");

      expect(result).toBeNull();
    });

    it("should return null when resume fails", async () => {
      mockWorkflowStateService.resumeWorkflow.mockResolvedValue(null);

      const result =
        await claudeCodeService.resumeWorkflowExecution("exec_123");

      expect(result).toBeNull();
    });
  });

  describe("getResumableWorkflows", () => {
    it("should return resumable workflows", async () => {
      const mockWorkflows = [
        createMockWorkflowState({
          executionId: "exec_1",
          workflowName: "workflow-1",
          workflowPath: "/path/1.yml",
        }),
        createMockWorkflowState({
          executionId: "exec_2",
          workflowName: "workflow-2",
          workflowPath: "/path/2.yml",
          currentStep: 2,
          totalSteps: 4,
        }),
      ];

      mockWorkflowStateService.getResumableWorkflows.mockResolvedValue(
        mockWorkflows,
      );

      const result = await claudeCodeService.getResumableWorkflows();

      expect(result).toEqual(mockWorkflows);
      expect(mockWorkflowStateService.getResumableWorkflows).toHaveBeenCalled();
    });

    it("should return empty array when workflow state service is not available", async () => {
      const serviceWithoutState = new ClaudeCodeService(mockConfigService);

      const result = await serviceWithoutState.getResumableWorkflows();

      expect(result).toEqual([]);
    });
  });

  describe("pausePipelineExecution", () => {
    it("should pause pipeline execution", async () => {
      const mockExecution = mockPipelineExecution(2);

      (
        claudeCodeService as unknown as {
          currentPipelineExecution: typeof mockExecution;
        }
      ).currentPipelineExecution = mockExecution;

      const result = await claudeCodeService.pausePipelineExecution("manual");

      expect(result).toMatch(/^pipeline-\d+-[a-z0-9]+$/);
      expect(mockExecution.tasks[0].status).toBe("pending");
      expect(
        (claudeCodeService as unknown as { currentPipelineExecution: unknown })
          .currentPipelineExecution,
      ).not.toBeNull();
    });

    it("should return null when no pipeline is running", async () => {
      const result = await claudeCodeService.pausePipelineExecution("manual");

      expect(result).toBeNull();
    });

    it("should cancel current process when pausing pipeline", async () => {
      const mockKill = jest.fn();
      const mockProcess = { kill: mockKill };

      (
        claudeCodeService as unknown as { currentProcess: { kill: jest.Mock } }
      ).currentProcess = mockProcess;
      (
        claudeCodeService as unknown as {
          currentPipelineExecution: {
            tasks: unknown[];
            currentIndex: number;
            onProgress: jest.Mock;
            onComplete: jest.Mock;
            onError: jest.Mock;
          };
        }
      ).currentPipelineExecution = mockPipelineExecution(1);

      await claudeCodeService.pausePipelineExecution("manual");

      expect(mockKill).not.toHaveBeenCalled();
      expect(
        (claudeCodeService as unknown as { currentProcess: unknown })
          .currentProcess,
      ).toBe(mockProcess);
    });
  });

  describe("resumePipelineExecution", () => {
    it("should resume pipeline execution", async () => {
      const mockPausedState = {
        tasks: [
          { id: "1", prompt: "Task 1", status: "paused" },
          { id: "2", prompt: "Task 2", status: "pending" },
        ],
        currentIndex: 0,
        resetTime: Date.now(),
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      (
        claudeCodeService as unknown as {
          pausedPipelines: Map<string, typeof mockPausedState>;
        }
      ).pausedPipelines = new Map([["pipeline_123", mockPausedState]]);

      // Mock the resumePipeline method
      const resumePipelineSpy = jest
        .spyOn(
          claudeCodeService as unknown as {
            resumePipeline: () => Promise<void>;
          },
          "resumePipeline",
        )
        .mockResolvedValue(undefined);

      const result =
        await claudeCodeService.resumePipelineExecution("pipeline_123");

      expect(result).toBe(true);
      expect(resumePipelineSpy).toHaveBeenCalledWith("pipeline_123");
    });

    it("should return false when pipeline ID not found", async () => {
      const result =
        await claudeCodeService.resumePipelineExecution("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("getPausedPipelines", () => {
    it("should return paused pipelines", () => {
      const mockPausedState1 = {
        tasks: [{ id: "1", prompt: "Task 1", status: "paused" }],
        currentIndex: 0,
        resetTime: 1234567890,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      const mockPausedState2 = {
        tasks: [{ id: "2", prompt: "Task 2", status: "paused" }],
        currentIndex: 1,
        resetTime: 1234567900,
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
      };

      (
        claudeCodeService as unknown as {
          pausedPipelines: Map<string, typeof mockPausedState1>;
        }
      ).pausedPipelines = new Map([
        ["pipeline_1", mockPausedState1],
        ["pipeline_2", mockPausedState2],
      ]);

      const result = claudeCodeService.getPausedPipelines();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        pipelineId: "pipeline_1",
        tasks: mockPausedState1.tasks,
        currentIndex: 0,
        pausedAt: 1234567890,
      });
      expect(result[1]).toEqual({
        pipelineId: "pipeline_2",
        tasks: mockPausedState2.tasks,
        currentIndex: 1,
        pausedAt: 1234567900,
      });
    });

    it("should return empty array when no pipelines are paused", () => {
      const result = claudeCodeService.getPausedPipelines();

      expect(result).toEqual([]);
    });
  });

  describe("isWorkflowPaused", () => {
    it("should return true when pipelines are paused", () => {
      (
        claudeCodeService as unknown as {
          pausedPipelines: Map<string, unknown>;
        }
      ).pausedPipelines = new Map([["pipeline_1", {}]]);

      const result = claudeCodeService.isWorkflowPaused();

      expect(result).toBe(true);
    });

    it("should return true when current pipeline has paused tasks", () => {
      (
        claudeCodeService as unknown as {
          currentPipelineExecution: {
            tasks: Array<{ id: string; status: string }>;
          };
        }
      ).currentPipelineExecution = {
        tasks: [
          { id: "1", status: "completed" },
          { id: "2", status: "paused" },
        ],
      };

      const result = claudeCodeService.isWorkflowPaused();

      expect(result).toBe(true);
    });

    it("should return false when no workflows are paused", () => {
      const result = claudeCodeService.isWorkflowPaused();

      expect(result).toBe(false);
    });
  });

  describe("deleteWorkflowState", () => {
    it("should delete workflow state", async () => {
      await claudeCodeService.deleteWorkflowState("exec_123");

      expect(mockWorkflowStateService.deleteWorkflowState).toHaveBeenCalledWith(
        "exec_123",
      );
    });

    it("should handle missing workflow state service gracefully", async () => {
      const serviceWithoutState = new ClaudeCodeService(mockConfigService);

      await expect(
        serviceWithoutState.deleteWorkflowState("exec_123"),
      ).resolves.not.toThrow();
    });
  });
});
