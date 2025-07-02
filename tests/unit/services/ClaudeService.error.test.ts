import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

import { ClaudeService } from "../../../src/services/ClaudeService";
import { WorkflowExecution } from "../../../src/types/WorkflowTypes";
import { WorkflowService } from "../../../src/services/WorkflowService";

jest.mock("../../../src/core/services/ClaudeExecutor");
jest.mock("../../../src/adapters/vscode");
jest.mock("../../../src/core/services/ConfigManager");
jest.mock("../../../src/services/ClaudeDetectionService");
jest.mock("../../../src/services/WorkflowService");

import { ClaudeExecutor } from "../../../src/core/services/ClaudeExecutor";
import { VSCodeLogger, VSCodeConfigSource } from "../../../src/adapters/vscode";
import { ConfigManager } from "../../../src/core/services/ConfigManager";
import { ClaudeDetectionService } from "../../../src/services/ClaudeDetectionService";

const mockExecutor = {
  executeTask: jest.fn() as jest.MockedFunction<
    (...args: any[]) => Promise<any>
  >,
  executePipeline: jest.fn() as jest.MockedFunction<
    (...args: any[]) => Promise<void>
  >,
  cancelCurrentTask: jest.fn(),
  isTaskRunning: jest.fn(),
  validateClaudeCommand: jest.fn() as jest.MockedFunction<
    (...args: any[]) => Promise<boolean>
  >,
  formatCommandPreview: jest.fn() as jest.MockedFunction<
    (...args: any[]) => string
  >,
};

const mockConfigManager = {
  addSource: jest.fn(),
  validateModel: jest.fn(),
};

const mockWorkflowService = {
  getExecutionSteps: jest.fn(),
  resolveStepVariables: jest.fn(),
  updateExecutionOutput: jest.fn(),
};

(ClaudeExecutor as jest.MockedClass<typeof ClaudeExecutor>).mockImplementation(
  () => mockExecutor as any,
);
(VSCodeLogger as jest.MockedClass<typeof VSCodeLogger>).mockImplementation(
  () =>
    ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }) as any,
);
(
  VSCodeConfigSource as jest.MockedClass<typeof VSCodeConfigSource>
).mockImplementation(() => ({ get: jest.fn(), set: jest.fn() }) as any);
(ConfigManager as jest.MockedClass<typeof ConfigManager>).mockImplementation(
  () => mockConfigManager as any,
);

describe("ClaudeService - Error Handling", () => {
  let service: ClaudeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClaudeService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("initialization errors", () => {
    it("should handle logger initialization failure", () => {
      (
        VSCodeLogger as jest.MockedClass<typeof VSCodeLogger>
      ).mockImplementationOnce(() => {
        throw new Error("Logger initialization failed");
      });

      expect(() => new ClaudeService()).toThrow("Logger initialization failed");
    });

    it("should handle config source initialization failure", () => {
      (
        VSCodeConfigSource as jest.MockedClass<typeof VSCodeConfigSource>
      ).mockImplementationOnce(() => {
        throw new Error("Config source initialization failed");
      });

      expect(() => new ClaudeService()).toThrow(
        "Config source initialization failed",
      );
    });

    it("should handle config manager initialization failure", () => {
      (
        ConfigManager as jest.MockedClass<typeof ConfigManager>
      ).mockImplementationOnce(() => {
        throw new Error("Config manager initialization failed");
      });

      expect(() => new ClaudeService()).toThrow(
        "Config manager initialization failed",
      );
    });

    it("should handle executor initialization failure", () => {
      (
        ClaudeExecutor as jest.MockedClass<typeof ClaudeExecutor>
      ).mockImplementationOnce(() => {
        throw new Error("Executor initialization failed");
      });

      expect(() => new ClaudeService()).toThrow(
        "Executor initialization failed",
      );
    });

    it("should handle config source addition failure", () => {
      mockConfigManager.addSource.mockImplementationOnce(() => {
        throw new Error("Failed to add config source");
      });

      expect(() => new ClaudeService()).toThrow("Failed to add config source");
    });
  });

  describe("detection errors", () => {
    it("should handle detection service errors", async () => {
      (
        ClaudeDetectionService.detectClaude as jest.MockedFunction<
          typeof ClaudeDetectionService.detectClaude
        >
      ).mockRejectedValue(new Error("Detection failed"));

      await expect(service.checkInstallation()).rejects.toThrow(
        "Detection failed",
      );
    });
  });

  describe("execution errors", () => {
    it("should handle task execution timeout", async () => {
      (mockExecutor.executeTask as any).mockRejectedValue(
        new Error("Request timeout"),
      );

      await expect(
        service.executeTask("test", "claude-3-5-sonnet-20241022", "/workspace"),
      ).rejects.toThrow("Request timeout");
    });

    it("should handle network connectivity issues", async () => {
      (mockExecutor.executeTask as any).mockRejectedValue(
        new Error("Network unreachable"),
      );

      await expect(
        service.executeTask("test", "claude-3-5-sonnet-20241022", "/workspace"),
      ).rejects.toThrow("Network unreachable");
    });

    it("should handle API rate limiting", async () => {
      (mockExecutor.executeTask as any).mockRejectedValue(
        new Error("Rate limit exceeded"),
      );

      await expect(
        service.executeTask("test", "claude-3-5-sonnet-20241022", "/workspace"),
      ).rejects.toThrow("Rate limit exceeded");
    });

    it("should handle pipeline execution errors", async () => {
      (mockExecutor.executePipeline as any).mockRejectedValue(
        new Error("Pipeline failed"),
      );

      await expect(
        service.executePipeline(
          [{ id: "task1", prompt: "test", status: "pending" }],
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).rejects.toThrow("Pipeline failed");
    });
  });

  describe("workflow execution errors", () => {
    const mockExecution: WorkflowExecution = {
      workflow: {
        name: "test",
        jobs: {
          "test-job": {
            steps: [
              {
                id: "step1",
                uses: "claude-pipeline-action",
                with: { prompt: "test" },
              },
            ],
          },
        },
      },
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "pending",
    };

    it("should handle string errors in workflow execution", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockExecution.workflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: { prompt: "test" },
      });

      (mockExecutor.executeTask as any).mockRejectedValue("String error");

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as unknown as WorkflowService,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onError).toHaveBeenCalledWith("String error");
      expect(mockExecution.error).toBe("String error");
    });

    it("should handle workflow service method errors", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockImplementation(() => {
        throw new Error("Workflow service error");
      });

      await expect(
        service.executeWorkflow(
          mockExecution,
          mockWorkflowService as unknown as WorkflowService,
          "claude-3-5-sonnet-20241022",
          "/workspace",
          onStepProgress,
          onComplete,
          onError,
        ),
      ).rejects.toThrow("Workflow service error");
    });

    it("should handle task result without error message", async () => {
      const onStepProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      mockWorkflowService.getExecutionSteps.mockReturnValue([
        { step: mockExecution.workflow.jobs["test-job"].steps[0], index: 0 },
      ]);

      mockWorkflowService.resolveStepVariables.mockReturnValue({
        id: "step1",
        uses: "claude-pipeline-action",
        with: { prompt: "test" },
      });

      (mockExecutor.executeTask as any).mockResolvedValue({
        taskId: "step1",
        success: false,
        output: "",
        executionTimeMs: 1000,
      });

      await service.executeWorkflow(
        mockExecution,
        mockWorkflowService as unknown as WorkflowService,
        "claude-3-5-sonnet-20241022",
        "/workspace",
        onStepProgress,
        onComplete,
        onError,
      );

      expect(onError).toHaveBeenCalledWith("Task execution failed");
      expect(mockExecution.error).toBe("Task execution failed");
    });
  });

  describe("command validation errors", () => {
    it("should handle executor validation errors", async () => {
      (mockExecutor.validateClaudeCommand as any).mockRejectedValue(
        new Error("Validation service unavailable"),
      );

      await expect(
        service.validateClaudeCommand("claude-3-5-sonnet-20241022"),
      ).rejects.toThrow("Validation service unavailable");
    });

    it("should handle command preview errors", () => {
      mockExecutor.formatCommandPreview.mockImplementation(() => {
        throw new Error("Preview generation failed");
      });

      expect(() =>
        service.formatCommandPreview(
          "test",
          "claude-3-5-sonnet-20241022",
          "/workspace",
          {},
        ),
      ).toThrow("Preview generation failed");
    });
  });

  describe("model validation errors", () => {
    it("should handle config manager validation errors", () => {
      mockConfigManager.validateModel.mockImplementation(() => {
        throw new Error("Config validation error");
      });

      expect(() => service.isValidModelId("test-model")).toThrow(
        "Config validation error",
      );
    });
  });

  describe("retry scenarios", () => {
    it("should handle retry mechanism through executor", async () => {
      (mockExecutor.executeTask as any)
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValueOnce({
          taskId: "retry-test",
          success: true,
          output: "Task succeeded after retry",
          executionTimeMs: 2000,
        });

      await expect(
        service.executeTask(
          "retry test",
          "claude-3-5-sonnet-20241022",
          "/workspace",
        ),
      ).rejects.toThrow("Temporary failure");

      const result = await service.executeTask(
        "retry test",
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );
      expect(result.success).toBe(true);
      expect(result.output).toBe("Task succeeded after retry");
    });

    it("should handle malformed API responses", async () => {
      (mockExecutor.executeTask as any).mockResolvedValue({
        taskId: "malformed-123",
        success: true,
        output: null as unknown as string,
        executionTimeMs: 1000,
      });

      const result = await service.executeTask(
        "malformed test",
        "claude-3-5-sonnet-20241022",
        "/workspace",
      );

      expect(result.taskId).toBe("malformed-123");
      expect(result.success).toBe(true);
    });
  });
});
