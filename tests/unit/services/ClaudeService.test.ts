import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

import { ClaudeService } from "../../../src/services/ClaudeService";
import { TaskResult } from "../../../src/core/models/Task";

jest.mock("../../../src/core/services/ClaudeExecutor");
jest.mock("../../../src/adapters/vscode");
jest.mock("../../../src/core/services/ConfigManager");
jest.mock("../../../src/services/ClaudeDetectionService");

import { ClaudeExecutor } from "../../../src/core/services/ClaudeExecutor";
import { VSCodeLogger, VSCodeConfigSource } from "../../../src/adapters/vscode";
import { ConfigManager } from "../../../src/core/services/ConfigManager";
import { ClaudeDetectionService } from "../../../src/services/ClaudeDetectionService";

const mockExecutor = {
  executeTask: jest.fn() as jest.MockedFunction<
    (
      task: string,
      model: string,
      workingDirectory: string,
      options?: unknown,
    ) => Promise<TaskResult>
  >,
  executePipeline: jest.fn(),
  cancelCurrentTask: jest.fn(),
  isTaskRunning: jest.fn() as jest.MockedFunction<() => boolean>,
  validateClaudeCommand: jest.fn() as jest.MockedFunction<
    (model: string) => Promise<boolean>
  >,
  formatCommandPreview: jest.fn() as jest.MockedFunction<
    (
      task: string,
      model: string,
      workingDirectory: string,
      options?: unknown,
    ) => string
  >,
};

const mockConfigManager = {
  addSource: jest.fn(),
  validateModel: jest.fn() as jest.MockedFunction<(model: string) => boolean>,
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

describe("ClaudeService - Core Functionality", () => {
  let service: ClaudeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClaudeService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with required dependencies", () => {
      expect(VSCodeLogger).toHaveBeenCalled();
      expect(VSCodeConfigSource).toHaveBeenCalled();
      expect(ConfigManager).toHaveBeenCalled();
      expect(ClaudeExecutor).toHaveBeenCalled();
      expect(mockConfigManager.addSource).toHaveBeenCalled();
    });
  });

  describe("Claude CLI detection", () => {
    it("should succeed when Claude is detected", async () => {
      (
        ClaudeDetectionService.detectClaude as jest.MockedFunction<
          typeof ClaudeDetectionService.detectClaude
        >
      ).mockResolvedValue({
        isInstalled: true,
        version: "1.0.0",
        shell: "bash",
      });

      await expect(service.checkInstallation()).resolves.toBeUndefined();
    });

    it("should throw when Claude is not found", async () => {
      (
        ClaudeDetectionService.detectClaude as jest.MockedFunction<
          typeof ClaudeDetectionService.detectClaude
        >
      ).mockResolvedValue({
        isInstalled: false,
        error: "Command not found",
      });

      await expect(service.checkInstallation()).rejects.toThrow(
        "Claude Code CLI not found in PATH",
      );
    });
  });

  describe("task execution", () => {
    const mockResult: TaskResult = {
      taskId: "test-task",
      success: true,
      output: "Task completed",
      executionTimeMs: 1000,
    };

    it("should execute task with parameters", async () => {
      mockExecutor.executeTask.mockResolvedValue(mockResult);

      const result = await service.executeTask(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );

      expect(mockExecutor.executeTask).toHaveBeenCalledWith(
        "test prompt",
        "claude-3-5-sonnet-20241022",
        "/workspace",
        { allowAllTools: true },
      );
      expect(result).toEqual(mockResult);
    });

    it("should handle execution errors", async () => {
      mockExecutor.executeTask.mockRejectedValue(new Error("Execution failed"));

      await expect(
        service.executeTask("test", "model", "/workspace"),
      ).rejects.toThrow("Execution failed");
    });
  });

  describe("model validation", () => {
    it("should validate auto model", () => {
      expect(service.isValidModelId("auto")).toBe(true);
    });

    it("should delegate to config manager", () => {
      mockConfigManager.validateModel.mockReturnValue(true);
      expect(service.isValidModelId("claude-3-5-sonnet-20241022")).toBe(true);

      mockConfigManager.validateModel.mockReturnValue(false);
      expect(service.isValidModelId("invalid-model")).toBe(false);
    });
  });

  describe("task state management", () => {
    it("should check task running status", () => {
      mockExecutor.isTaskRunning.mockReturnValue(true);
      expect(service.isTaskRunning()).toBe(true);

      mockExecutor.isTaskRunning.mockReturnValue(false);
      expect(service.isTaskRunning()).toBe(false);
    });

    it("should cancel current task", () => {
      service.cancelCurrentTask();
      expect(mockExecutor.cancelCurrentTask).toHaveBeenCalled();
    });
  });

  describe("command operations", () => {
    it("should validate Claude command", async () => {
      mockExecutor.validateClaudeCommand.mockResolvedValue(true);

      const result = await service.validateClaudeCommand(
        "claude-3-5-sonnet-20241022",
      );
      expect(result).toBe(true);
      expect(mockExecutor.validateClaudeCommand).toHaveBeenCalledWith(
        "claude-3-5-sonnet-20241022",
      );
    });

    it("should format command preview", () => {
      const mockPreview = "claude --model test";
      mockExecutor.formatCommandPreview.mockReturnValue(mockPreview);

      const result = service.formatCommandPreview(
        "test",
        "model",
        "/workspace",
        {},
      );

      expect(result).toBe(mockPreview);
      expect(mockExecutor.formatCommandPreview).toHaveBeenCalledWith(
        "test",
        "model",
        "/workspace",
        {},
      );
    });
  });

  describe("pipeline pause/resume", () => {
    it("should generate pipeline ID on pause request", async () => {
      const pipelineId = await service.pausePipelineExecution();
      expect(pipelineId).toMatch(/^pipeline-\d+-[a-z0-9]{9}$/);
    });

    it("should return false for non-existent pipeline resume", async () => {
      const result = await service.resumePipelineExecution("non-existent");
      expect(result).toBe(false);
    });

    it("should list paused pipelines", () => {
      const pipelines = service.getPausedPipelines();
      expect(Array.isArray(pipelines)).toBe(true);
    });
  });
});
