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
import {
  testErrorHandling,
  StandardErrorScenarios,
  expectGracefulFailure,
  mockServiceError,
} from "../helpers/errorTestUtils";

jest.mock("../../../src/core/services/ClaudeExecutor");
jest.mock("../../../src/adapters/vscode");
jest.mock("../../../src/core/services/ConfigManager");
jest.mock("../../../src/services/ClaudeDetectionService");
jest.mock("../../../src/services/WorkflowService");

import { ClaudeExecutor } from "../../../src/core/services/ClaudeExecutor";
import { VSCodeLogger, VSCodeConfigSource } from "../../../src/adapters/vscode";
import { ConfigManager } from "../../../src/core/services/ConfigManager";
import { ClaudeDetectionService } from "../../../src/services/ClaudeDetectionService";

interface MockExecutor {
  executeTask: jest.MockedFunction<(...args: any[]) => Promise<any>>;
  executePipeline: jest.MockedFunction<(...args: any[]) => Promise<void>>;
  cancelCurrentTask: jest.MockedFunction<() => void>;
  isTaskRunning: jest.MockedFunction<() => boolean>;
  validateClaudeCommand: jest.MockedFunction<
    (...args: any[]) => Promise<boolean>
  >;
  formatCommandPreview: jest.MockedFunction<(...args: any[]) => string>;
}

interface MockConfigManager {
  addSource: jest.MockedFunction<(source: any) => void>;
  validateModel: jest.MockedFunction<(model: string) => boolean>;
}

interface MockLogger {
  info: jest.MockedFunction<(...args: any[]) => void>;
  warn: jest.MockedFunction<(...args: any[]) => void>;
  error: jest.MockedFunction<(...args: any[]) => void>;
  debug: jest.MockedFunction<(...args: any[]) => void>;
}

interface MockConfigSource {
  get: jest.MockedFunction<(key: string) => any>;
  set: jest.MockedFunction<(key: string, value: any) => void>;
}

interface MockWorkflowService {
  getExecutionSteps: jest.MockedFunction<(...args: any[]) => any[]>;
  resolveStepVariables: jest.MockedFunction<(...args: any[]) => any>;
  updateExecutionOutput: jest.MockedFunction<(...args: any[]) => void>;
}

const mockExecutor: MockExecutor = {
  executeTask: jest.fn(),
  executePipeline: jest.fn(),
  cancelCurrentTask: jest.fn(),
  isTaskRunning: jest.fn(),
  validateClaudeCommand: jest.fn(),
  formatCommandPreview: jest.fn(),
};

const mockConfigManager: MockConfigManager = {
  addSource: jest.fn(),
  validateModel: jest.fn(),
};

const mockWorkflowService: MockWorkflowService = {
  getExecutionSteps: jest.fn(),
  resolveStepVariables: jest.fn(),
  updateExecutionOutput: jest.fn(),
};

const mockLogger: MockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockConfigSource: MockConfigSource = {
  get: jest.fn(),
  set: jest.fn(),
};

(ClaudeExecutor as jest.MockedClass<typeof ClaudeExecutor>).mockImplementation(
  () => mockExecutor as any,
);
(VSCodeLogger as jest.MockedClass<typeof VSCodeLogger>).mockImplementation(
  () => mockLogger as any,
);
(
  VSCodeConfigSource as jest.MockedClass<typeof VSCodeConfigSource>
).mockImplementation(() => mockConfigSource as any);
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
    it("should handle logger initialization failure", async () => {
      (
        VSCodeLogger as jest.MockedClass<typeof VSCodeLogger>
      ).mockImplementationOnce(() => {
        throw new Error("Logger initialization failed");
      });

      await testErrorHandling(
        async () => new ClaudeService(),
        "Logger initialization failed",
      );
    });

    it("should handle config source initialization failure", async () => {
      (
        VSCodeConfigSource as jest.MockedClass<typeof VSCodeConfigSource>
      ).mockImplementationOnce(() => {
        throw new Error("Config source initialization failed");
      });

      await testErrorHandling(
        async () => new ClaudeService(),
        "Config source initialization failed",
      );
    });

    it("should handle config manager initialization failure", async () => {
      (
        ConfigManager as jest.MockedClass<typeof ConfigManager>
      ).mockImplementationOnce(() => {
        throw new Error(
          "Invalid configuration: config manager initialization failed",
        );
      });

      await testErrorHandling(
        async () => new ClaudeService(),
        StandardErrorScenarios.CONFIGURATION_INVALID.error,
      );
    });

    it("should handle executor initialization failure", async () => {
      (
        ClaudeExecutor as jest.MockedClass<typeof ClaudeExecutor>
      ).mockImplementationOnce(() => {
        throw new Error("Executor initialization failed");
      });

      await testErrorHandling(
        async () => new ClaudeService(),
        "Executor initialization failed",
      );
    });

    it("should handle config source addition failure", async () => {
      mockConfigManager.addSource.mockImplementationOnce(() => {
        throw new Error("Configuration invalid: failed to add config source");
      });

      await testErrorHandling(
        async () => new ClaudeService(),
        StandardErrorScenarios.CONFIGURATION_INVALID.error,
      );
    });
  });

  describe("detection errors", () => {
    it("should handle detection service errors", async () => {
      (
        ClaudeDetectionService.detectClaude as jest.MockedFunction<
          typeof ClaudeDetectionService.detectClaude
        >
      ).mockRejectedValue(new Error("Detection failed"));

      await testErrorHandling(
        () => service.checkInstallation(),
        "Detection failed",
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Detection failed"),
        expect.any(Error),
      );
    });
  });

  describe("execution errors", () => {
    it("should handle task execution timeout", async () => {
      mockServiceError(
        mockExecutor,
        "executeTask",
        new Error("Request timeout"),
      );

      await testErrorHandling(
        () =>
          service.executeTask(
            "test",
            "claude-3-5-sonnet-20241022",
            "/workspace",
          ),
        StandardErrorScenarios.NETWORK_TIMEOUT.error,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("timeout"),
        expect.any(Error),
      );
    });

    it("should handle network connectivity issues", async () => {
      mockServiceError(
        mockExecutor,
        "executeTask",
        new Error("Network unreachable"),
      );

      await expectGracefulFailure(
        () =>
          service.executeTask(
            "test",
            "claude-3-5-sonnet-20241022",
            "/workspace",
          ),
        "Network unreachable",
        () => !mockExecutor.isTaskRunning(),
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Network"),
        expect.any(Error),
      );
    });

    it("should handle API rate limiting", async () => {
      mockServiceError(
        mockExecutor,
        "executeTask",
        new Error("Rate limit exceeded"),
      );

      await expectGracefulFailure(
        () =>
          service.executeTask(
            "test",
            "claude-3-5-sonnet-20241022",
            "/workspace",
          ),
        "Rate limit exceeded",
        () => !mockExecutor.isTaskRunning(),
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Rate limit"),
        expect.any(Error),
      );
    });

    it("should handle pipeline execution errors", async () => {
      mockServiceError(
        mockExecutor,
        "executePipeline",
        new Error("Pipeline failed"),
      );

      await testErrorHandling(
        () =>
          service.executePipeline(
            [{ id: "task1", prompt: "test", status: "pending" }],
            "claude-3-5-sonnet-20241022",
            "/workspace",
          ),
        "Pipeline failed",
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Pipeline"),
        expect.any(Error),
      );
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

      mockExecutor.executeTask.mockRejectedValue("String error");

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

      mockExecutor.executeTask.mockResolvedValue({
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
      mockServiceError(
        mockExecutor,
        "validateClaudeCommand",
        new Error("Validation service unavailable"),
      );

      await testErrorHandling(
        () => service.validateClaudeCommand("claude-3-5-sonnet-20241022"),
        StandardErrorScenarios.SERVICE_UNAVAILABLE.error,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Validation"),
        expect.any(Error),
      );
    });

    it("should handle command preview errors", async () => {
      mockExecutor.formatCommandPreview.mockImplementation(() => {
        throw new Error("Preview generation failed");
      });

      await testErrorHandling(
        async () =>
          service.formatCommandPreview(
            "test",
            "claude-3-5-sonnet-20241022",
            "/workspace",
            {},
          ),
        "Preview generation failed",
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Preview"),
        expect.any(Error),
      );
    });
  });

  describe("model validation errors", () => {
    it("should handle config manager validation errors", async () => {
      mockConfigManager.validateModel.mockImplementation(() => {
        throw new Error("Config validation error");
      });

      await testErrorHandling(
        async () => service.isValidModelId("test-model"),
        StandardErrorScenarios.CONFIGURATION_INVALID.error,
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("validation"),
        expect.any(Error),
      );
    });
  });

  describe("retry scenarios", () => {
    it("should handle retry mechanism through executor", async () => {
      mockExecutor.executeTask
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
      mockExecutor.executeTask.mockResolvedValue({
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
