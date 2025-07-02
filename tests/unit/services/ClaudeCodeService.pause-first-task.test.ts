import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import {
  createTestPipeline,
  createMockConfigService,
  createMockExecuteCommand,
  createPipelineCallbacks,
  expectPipelineState,
} from "../helpers/pipelineTestUtils";

describe("ClaudeCodeService Pause First Task Bug", () => {
  let service: ClaudeCodeService;
  let mockConfigService: jest.Mocked<Partial<ConfigurationService>>;

  beforeEach(() => {
    mockConfigService = createMockConfigService();
    service = new ClaudeCodeService(mockConfigService as ConfigurationService);
    jest.clearAllMocks();
  });

  it("FIXED: Pause during first task (i=0) now works after removing i > 0 condition", async () => {
    const { tasks } = createTestPipeline({ taskCount: 1 });
    let capturedTasks = tasks;

    const { onProgress, onComplete, onError } = createPipelineCallbacks();
    onProgress.mockImplementation((...args: any[]) => {
      capturedTasks = [...args[0]];
    });

    const executeCommandSpy = jest
      .spyOn(service, "executeCommand")
      .mockImplementation(
        createMockExecuteCommand({ executeCommandDelay: 100 }),
      );

    const { workingDirectory, config } = createTestPipeline();
    const pipelinePromise = service.runTaskPipeline(
      tasks,
      "auto",
      workingDirectory,
      config,
      onProgress,
      onComplete,
      onError,
    );

    // Immediately pause (before any task execution completes)
    await service.pausePipelineExecution("manual");

    // Wait for pipeline to complete/pause
    await pipelinePromise;

    expectPipelineState.toBeCompleted(capturedTasks, 1);
    expect(service.getPausedPipelines()).toHaveLength(0);
    expect(onComplete).toHaveBeenCalled();

    executeCommandSpy.mockRestore();
  });

  it("PROVES: Pause during second task (i=1) works correctly", async () => {
    const { tasks } = createTestPipeline({ taskCount: 2 });
    let capturedTasks = tasks;

    const { onProgress, onComplete, onError } = createPipelineCallbacks();
    onProgress.mockImplementation((...args: any[]) => {
      capturedTasks = [...args[0]];
    });

    let callCount = 0;
    const executeCommandSpy = jest
      .spyOn(service, "executeCommand")
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            success: true,
            output: JSON.stringify({
              result: "First task completed",
              session_id: "session-1",
            }),
            exitCode: 0,
          };
        } else {
          await service.pausePipelineExecution("manual");
          return {
            success: true,
            output: "Task completed",
            exitCode: 0,
          };
        }
      });

    const { workingDirectory, config } = createTestPipeline();
    await service.runTaskPipeline(
      tasks,
      "auto",
      workingDirectory,
      config,
      onProgress,
      onComplete,
      onError,
    );

    expectPipelineState.toBeCompleted(capturedTasks, 2);
    expect(service.getPausedPipelines()).toHaveLength(0);
    expect(onComplete).toHaveBeenCalled();

    executeCommandSpy.mockRestore();
  });
});
