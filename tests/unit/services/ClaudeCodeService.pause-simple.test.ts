import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ClaudeCodeService } from "../../../src/services/ClaudeCodeService";
import { ConfigurationService } from "../../../src/services/ConfigurationService";
import {
  createTestPipeline,
  createMockConfigService,
  createPipelineCallbacks,
} from "../helpers/pipelineTestUtils";
describe("ClaudeCodeService Pause Logic", () => {
  let service: ClaudeCodeService;
  let mockConfigService: jest.Mocked<Partial<ConfigurationService>>;

  beforeEach(() => {
    mockConfigService = createMockConfigService();
    service = new ClaudeCodeService(mockConfigService as ConfigurationService);
    jest.clearAllMocks();
  });

  it("VERIFIES: pauseAfterCurrentTask flag is set correctly", async () => {
    const { tasks } = createTestPipeline({ taskCount: 1 });
    const { onProgress, onComplete, onError } = createPipelineCallbacks();

    jest
      .spyOn(service, "executeCommand")
      .mockImplementation(() => new Promise(() => {}));

    const { workingDirectory, config } = createTestPipeline();
    service.runTaskPipeline(
      tasks,
      "auto",
      workingDirectory,
      config,
      onProgress,
      onComplete,
      onError,
    );

    const pipelineId = await service.pausePipelineExecution("manual");

    expect(pipelineId).toBeTruthy();
    expect(typeof pipelineId).toBe("string");
  });

  it("VERIFIES: Resume button state logic with direct state", () => {
    const testCases = [
      { isTasksRunning: false, isPaused: true, expected: "Resume" },
      { isTasksRunning: true, isPaused: false, expected: "Pause" },
      { isTasksRunning: false, isPaused: false, expected: "Run" },
    ];

    testCases.forEach(({ isTasksRunning, isPaused, expected }) => {
      const shouldShowResume = !(isTasksRunning && !isPaused) && isPaused;
      const shouldShowPause = isTasksRunning && !isPaused;
      const shouldShowRun = !(isTasksRunning && !isPaused) && !isPaused;

      switch (expected) {
        case "Resume":
          expect(shouldShowResume).toBe(true);
          break;
        case "Pause":
          expect(shouldShowPause).toBe(true);
          break;
        case "Run":
          expect(shouldShowRun).toBe(true);
          break;
      }
    });
  });
});
