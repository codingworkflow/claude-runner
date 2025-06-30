import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { TaskItem } from "../../../src/core/models/Task";
import { ConfigurationService } from "../../../src/services/ConfigurationService";

// Mock dependencies
const mockConfigService = {
  validateModel: jest.fn().mockReturnValue(true),
} as jest.Mocked<Partial<ConfigurationService>>;

describe("ClaudeCodeService Pause First Task Bug", () => {
  let service: ClaudeCodeService;

  beforeEach(() => {
    service = new ClaudeCodeService(mockConfigService as ConfigurationService);
    jest.clearAllMocks();
  });

  it("FIXED: Pause during first task (i=0) now works after removing i > 0 condition", async () => {
    // Setup: Create a single task pipeline
    const tasks: TaskItem[] = [
      {
        id: "task1",
        name: "First Task",
        prompt: "test prompt",
        status: "pending",
      },
    ];

    let capturedTasks: TaskItem[] = [];

    // Mock the progress callback to capture state changes
    const onProgress = jest.fn(
      (updatedTasks: TaskItem[], _currentIndex: number) => {
        capturedTasks = [...updatedTasks];
      },
    );

    const onComplete = jest.fn();
    const onError = jest.fn();

    // Mock executeCommand from the beginning to simulate slow execution
    const executeCommandSpy = jest
      .spyOn(service, "executeCommand")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            // Simulate slow task execution
            setTimeout(() => {
              resolve({
                success: true,
                output: "Task completed",
                exitCode: 0,
              });
            }, 100);
          }),
      );

    // Start the pipeline first
    const pipelinePromise = service.runTaskPipeline(
      tasks,
      "auto",
      "/test",
      { allowAllTools: true, outputFormat: "json" },
      onProgress,
      onComplete,
      onError,
    );

    // Immediately pause (before any task execution completes)
    await service.pausePipelineExecution("manual");

    // Wait for pipeline to complete/pause
    await pipelinePromise;

    // FIXED: The task should now be paused (bug fixed)
    expect(capturedTasks[0].status).toBe("paused");

    // FIXED: Paused pipeline should now be created
    expect(service.getPausedPipelines()).toHaveLength(1);

    // FIXED: onComplete should NOT be called when paused
    expect(onComplete).not.toHaveBeenCalled();

    executeCommandSpy.mockRestore();
  });

  it("PROVES: Pause during second task (i=1) works correctly", async () => {
    // Setup: Create a two-task pipeline
    const tasks: TaskItem[] = [
      {
        id: "task1",
        name: "First Task",
        prompt: "test prompt 1",
        status: "pending",
      },
      {
        id: "task2",
        name: "Second Task",
        prompt: "test prompt 2",
        status: "pending",
      },
    ];

    let capturedTasks: TaskItem[] = [];

    const onProgress = jest.fn(
      (updatedTasks: TaskItem[], _currentIndex: number) => {
        capturedTasks = [...updatedTasks];
      },
    );

    const onComplete = jest.fn();
    const onError = jest.fn();

    // Mock executeCommand to complete first task and then pause
    let callCount = 0;
    const executeCommandSpy = jest
      .spyOn(service, "executeCommand")
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First task completes successfully
          return {
            success: true,
            output: JSON.stringify({
              result: "First task completed",
              session_id: "session-1",
            }),
            exitCode: 0,
          };
        } else {
          // Pause before second task execution
          await service.pausePipelineExecution("manual");
          return {
            success: true,
            output: "Task completed",
            exitCode: 0,
          };
        }
      });

    // Execute the pipeline
    await service.runTaskPipeline(
      tasks,
      "auto",
      "/test",
      { allowAllTools: true, outputFormat: "json" },
      onProgress,
      onComplete,
      onError,
    );

    // PROOF: Second task should be paused (this works)
    expect(capturedTasks[1].status).toBe("paused");

    // PROOF: Paused pipeline is created
    expect(service.getPausedPipelines()).toHaveLength(1);

    // PROOF: onComplete is NOT called
    expect(onComplete).not.toHaveBeenCalled();

    executeCommandSpy.mockRestore();
  });
});
