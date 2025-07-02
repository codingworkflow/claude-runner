import { ClaudeExecutor } from "../../../../src/core/services/ClaudeExecutor";
import { ILogger, IConfigManager } from "../../../../src/core/interfaces";
import {
  TaskOptions,
  TaskItem,
  CommandResult,
} from "../../../../src/core/models/Task";
import { ChildProcess } from "child_process";
import { Writable, Readable } from "stream";

class MockLogger implements ILogger {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  debug = jest.fn();
}

class MockConfigManager implements IConfigManager {
  addSource = jest.fn();
  get = jest.fn();
  set = jest.fn();
  validateModel = jest.fn();
  validatePath = jest.fn();
}

class TestableClaudeExecutor extends ClaudeExecutor {
  public async testExecuteCommand(
    args: string[],
    cwd: string,
    outputFormat?: string,
  ): Promise<CommandResult> {
    return this.executeCommand(args, cwd, outputFormat);
  }
}

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

describe("ClaudeExecutor", () => {
  let executor: TestableClaudeExecutor;
  let mockLogger: MockLogger;
  let mockConfig: MockConfigManager;
  let mockSpawn: jest.MockedFunction<typeof import("child_process").spawn>;

  beforeEach(() => {
    mockLogger = new MockLogger();
    mockConfig = new MockConfigManager();
    executor = new TestableClaudeExecutor(mockLogger, mockConfig);
    mockSpawn = jest.requireMock("child_process").spawn as jest.MockedFunction<
      typeof import("child_process").spawn
    >;

    mockConfig.validateModel.mockReturnValue(true);
    mockConfig.validatePath.mockReturnValue(true);

    jest.clearAllMocks();
  });

  describe("Core Claude execution engine functionality", () => {
    describe("executeTaskWithRetry", () => {
      it("should succeed on first attempt", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTaskWithRetry(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBe("Success");
      });

      it("should retry on rate limit and eventually succeed", async () => {
        let attempt = 0;
        const rateLimitOutput = "Claude AI usage limit reached|1234567890";
        const successOutput = "Success after retry";

        mockSpawn.mockImplementation(() => {
          const mockChild = createMockChildProcess();

          setTimeout(() => {
            if (attempt === 0) {
              mockChild.stdout?.emit("data", Buffer.from(rateLimitOutput));
              mockChild.emit("close", 1);
            } else {
              mockChild.stdout?.emit("data", Buffer.from(successOutput));
              mockChild.emit("close", 0);
            }
          }, 0);

          return mockChild;
        });

        jest.spyOn(Date, "now").mockImplementation(() => 1234567800000);

        const waitForRateLimitSpy = jest
          .spyOn(
            executor as unknown as { waitForRateLimit: () => Promise<void> },
            "waitForRateLimit",
          )
          .mockImplementation(async () => {
            attempt++;
            return Promise.resolve();
          });

        const result = await executor.executeTaskWithRetry(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          3,
        );

        expect(result.success).toBe(true);
        expect(result.output).toBe(successOutput);
        expect(waitForRateLimitSpy).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining("Rate limit detected"),
        );

        waitForRateLimitSpy.mockRestore();
      });

      it("should fail after maximum retries exceeded", async () => {
        const errorOutput = "Persistent error";

        mockSpawn.mockImplementation(() => {
          const mockChild = createMockChildProcess();

          setTimeout(() => {
            mockChild.stderr?.emit("data", Buffer.from(errorOutput));
            mockChild.emit("close", 1);
          }, 0);

          return mockChild;
        });

        await expect(
          executor.executeTaskWithRetry(
            "test task",
            "claude-3-5-sonnet-latest",
            "/test",
            {},
            2,
          ),
        ).rejects.toThrow("Persistent error");
      });

      it("should handle cumulative wait time limit", async () => {
        const rateLimitOutput = "Claude AI usage limit reached|9999999999";

        mockSpawn.mockImplementation(() => {
          const mockChild = createMockChildProcess();

          setTimeout(() => {
            mockChild.stdout?.emit("data", Buffer.from(rateLimitOutput));
            mockChild.emit("close", 1);
          }, 0);

          return mockChild;
        });

        jest.spyOn(Date, "now").mockImplementation(() => 1000000000000);

        await expect(
          executor.executeTaskWithRetry(
            "test task",
            "claude-3-5-sonnet-latest",
            "/test",
          ),
        ).rejects.toThrow("Cumulative wait time would exceed timeout limit");
      });

      it("should handle rate limit in exception", async () => {
        let attempt = 0;
        const rateLimitError = "Claude AI usage limit reached|1234567890";

        mockSpawn.mockImplementation(() => {
          if (attempt === 0) {
            throw new Error(rateLimitError);
          }

          const mockChild = createMockChildProcess();
          setTimeout(() => {
            mockChild.stdout?.emit(
              "data",
              Buffer.from("Success after exception"),
            );
            mockChild.emit("close", 0);
          }, 0);
          return mockChild;
        });

        jest.spyOn(Date, "now").mockImplementation(() => 1234567800000);

        const waitForRateLimitSpy = jest
          .spyOn(
            executor as unknown as { waitForRateLimit: () => Promise<void> },
            "waitForRateLimit",
          )
          .mockImplementation(async () => {
            attempt++;
            return Promise.resolve();
          });

        const result = await executor.executeTaskWithRetry(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          3,
        );

        expect(result.success).toBe(true);
        expect(result.output).toBe("Success after exception");
        expect(waitForRateLimitSpy).toHaveBeenCalled();

        waitForRateLimitSpy.mockRestore();
      });
    });

    describe("executeTask", () => {
      it("should execute task successfully with text output", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "text" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from("Task completed successfully"),
          );
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBe("Task completed successfully");
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.taskId).toMatch(/^task-\d+$/);
      });

      it("should execute task successfully with JSON output", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const jsonOutput = JSON.stringify({
          result: "Task completed",
          session_id: "session-123",
        });

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(jsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBe("Task completed");
        expect(result.sessionId).toBe("session-123");
      });

      it("should execute task with stream-json output format", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "stream-json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Streaming output"));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBe("Streaming output");
      });

      it("should handle non-string error objects", async () => {
        mockConfig.validateModel.mockImplementation(() => {
          throw new Error("VALIDATION_ERROR: Custom error");
        });

        const result = await executor.executeTask(
          "test task",
          "invalid-model",
          "/test",
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("VALIDATION_ERROR: Custom error");
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it("should auto validate model for 'auto' value", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "auto",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        await resultPromise;

        expect(mockConfig.validateModel).not.toHaveBeenCalledWith("auto");
      });

      it("should handle complex task prompts with special characters", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const complexTask =
          "Task with 'quotes' and \"double quotes\" and $variables and \n newlines";

        const resultPromise = executor.executeTask(
          complexTask,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        await resultPromise;

        expect(mockSpawn).toHaveBeenCalledWith(
          "claude",
          expect.arrayContaining([
            "-p",
            `'${complexTask.replace(/'/g, "'\"'\"'")}'`,
          ]),
          expect.any(Object),
        );
      });

      it("should validate and execute with all task options", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const fullOptions: TaskOptions = {
          outputFormat: "json",
          maxTurns: 20,
          verbose: true,
          systemPrompt: "Custom system prompt",
          appendSystemPrompt: "Additional instructions",
          allowAllTools: false,
          allowedTools: ["tool1", "tool2"],
          disallowedTools: ["tool3", "tool4"],
          mcpConfig: "/config/mcp.json",
          permissionPromptTool: "permission-tool",
        };

        const resultPromise = executor.executeTask(
          "complex task",
          "claude-3-5-sonnet-latest",
          "/test",
          fullOptions,
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from(JSON.stringify({ result: "Success" })),
          );
          mockChild.emit("close", 0);
        }, 0);

        await resultPromise;

        expect(mockSpawn).toHaveBeenCalledWith(
          "claude",
          expect.arrayContaining([
            "--output-format",
            "json",
            "--max-turns",
            "20",
            "--verbose",
            "--system-prompt",
            "Custom system prompt",
            "--append-system-prompt",
            "Additional instructions",
            "--allowedTools",
            "tool1,tool2",
            "--disallowedTools",
            "tool3,tool4",
            "--mcp-config",
            "/config/mcp.json",
            "--permission-prompt-tool",
            "permission-tool",
          ]),
          expect.any(Object),
        );
      });
    });

    describe("validateClaudeCommand", () => {
      it("should validate successful command", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const validationPromise = executor.validateClaudeCommand(
          "claude-3-5-sonnet-latest",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        const result = await validationPromise;

        expect(result).toBe(true);
        expect(mockSpawn).toHaveBeenCalledWith(
          "claude",
          ["--model", "claude-3-5-sonnet-latest", "-p", "test"],
          expect.any(Object),
        );
      });

      it("should validate auto model without model flag", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const validationPromise = executor.validateClaudeCommand("auto");

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        const result = await validationPromise;

        expect(result).toBe(true);
        expect(mockSpawn).toHaveBeenCalledWith(
          "claude",
          ["-p", "test"],
          expect.any(Object),
        );
      });

      it("should return false for failed command", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const validationPromise =
          executor.validateClaudeCommand("invalid-model");

        setTimeout(() => {
          mockChild.emit("close", 1);
        }, 0);

        const result = await validationPromise;

        expect(result).toBe(false);
      });

      it("should handle validation error gracefully", async () => {
        mockSpawn.mockImplementation(() => {
          throw new Error("Spawn failed");
        });

        const result = await executor.validateClaudeCommand(
          "claude-3-5-sonnet-latest",
        );

        expect(result).toBe(false);
      });
    });

    describe("formatCommandPreview", () => {
      it("should format basic command preview", () => {
        const preview = executor.formatCommandPreview(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test/dir",
          {},
        );

        expect(preview).toBe(
          `cd "/test/dir" && claude -p 'test task' --model claude-3-5-sonnet-latest`,
        );
      });

      it("should format command with comprehensive options", () => {
        const preview = executor.formatCommandPreview(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test/dir",
          {
            outputFormat: "json",
            verbose: true,
            maxTurns: 5,
            systemPrompt: "system",
            appendSystemPrompt: "append",
            allowedTools: ["tool1", "tool2"],
            disallowedTools: ["tool3"],
            mcpConfig: "/config.json",
            permissionPromptTool: "permission",
          },
        );

        expect(preview).toContain("--output-format json");
        expect(preview).toContain("--verbose");
        expect(preview).toContain("--max-turns 5");
        expect(preview).toContain("--system-prompt system");
        expect(preview).toContain("--append-system-prompt append");
        expect(preview).toContain("--allowedTools tool1,tool2");
        expect(preview).toContain("--disallowedTools tool3");
        expect(preview).toContain("--mcp-config /config.json");
        expect(preview).toContain("--permission-prompt-tool permission");
      });

      it("should handle auto model", () => {
        const preview = executor.formatCommandPreview(
          "test task",
          "auto",
          "/test/dir",
          {},
        );

        expect(preview).not.toContain("--model");
        expect(preview).toBe(`cd "/test/dir" && claude -p 'test task'`);
      });

      it("should handle continue conversation option", () => {
        const preview = executor.formatCommandPreview(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test/dir",
          { continueConversation: true },
        );

        expect(preview).toContain("--continue");
        expect(preview).not.toContain("--system-prompt");
      });

      it("should handle resume session option", () => {
        const preview = executor.formatCommandPreview(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test/dir",
          { resumeSessionId: "session-123" },
        );

        expect(preview).toContain("-r session-123");
        expect(preview).not.toContain("--system-prompt");
      });

      it("should handle dangerous skip permissions", () => {
        const preview = executor.formatCommandPreview(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test/dir",
          {
            allowAllTools: true,
            allowedTools: ["tool1"],
            disallowedTools: ["tool2"],
          },
        );

        expect(preview).toContain("--dangerously-skip-permissions");
        expect(preview).not.toContain("--allowedTools");
        expect(preview).not.toContain("--disallowedTools");
      });
    });
  });

  describe("Execution context management", () => {
    describe("task state management", () => {
      it("should track running task state correctly", () => {
        expect(executor.isTaskRunning()).toBe(false);

        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        executor.testExecuteCommand(["claude", "-p", "test"], "/test");

        expect(executor.isTaskRunning()).toBe(true);
      });

      it("should cancel current task properly", () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        executor.testExecuteCommand(["claude", "-p", "test"], "/test");

        expect(executor.isTaskRunning()).toBe(true);

        executor.cancelCurrentTask();

        expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
        expect(mockLogger.info).toHaveBeenCalledWith(
          "Cancelling current Claude task",
        );
      });

      it("should handle cancel when no task is running", () => {
        executor.cancelCurrentTask();

        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it("should reset task state after completion", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        expect(executor.isTaskRunning()).toBe(true);

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        await commandPromise;

        expect(executor.isTaskRunning()).toBe(false);
      });

      it("should reset task state after error", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        expect(executor.isTaskRunning()).toBe(true);

        setTimeout(() => {
          mockChild.emit("error", new Error("Process error"));
        }, 0);

        await commandPromise;

        expect(executor.isTaskRunning()).toBe(false);
      });
    });

    describe("session management", () => {
      it("should extract session ID from JSON output", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const jsonOutput = JSON.stringify({
          result: "Success",
          session_id: "session-456",
        });

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
          "json",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(jsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await commandPromise;

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe("session-456");
      });

      it("should handle session resumption in pipeline", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
            resumeFromTaskId: "task1",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild1.stdout?.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                result: "Task 1 completed",
                session_id: "session-123",
              }),
            ),
          );
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                result: "Task 2 completed",
              }),
            ),
          );
          mockChild2.emit("close", 0);
        }, 50);

        await pipelinePromise;

        expect(mockSpawn).toHaveBeenNthCalledWith(
          2,
          "claude",
          expect.arrayContaining(["-r", "session-123"]),
          expect.any(Object),
        );
        expect(tasks[0].sessionId).toBe("session-123");
      });

      it("should handle missing source task for session resumption", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
            resumeFromTaskId: "nonexistent-task",
          },
        ];

        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Task completed"));
          mockChild.emit("close", 0);
        }, 0);

        await pipelinePromise;

        expect(mockSpawn).toHaveBeenCalledWith(
          "claude",
          expect.not.arrayContaining(["-r"]),
          expect.any(Object),
        );
      });
    });

    describe("working directory context", () => {
      it("should validate working directory before execution", async () => {
        mockConfig.validatePath.mockReturnValue(false);

        const result = await executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/invalid/path",
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid working directory: /invalid/path");
        expect(mockConfig.validatePath).toHaveBeenCalledWith("/invalid/path");
      });

      it("should pass correct working directory to spawn", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const workingDir = "/custom/working/directory";
        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          workingDir,
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        await commandPromise;

        expect(mockSpawn).toHaveBeenCalledWith(
          "claude",
          ["-p", "test"],
          expect.objectContaining({
            cwd: workingDir,
          }),
        );
      });
    });
  });

  describe("Execution result processing", () => {
    describe("JSON output processing", () => {
      it("should parse JSON output correctly", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const jsonOutput = JSON.stringify({
          result: "Parsed result",
          session_id: "session-999",
          other_data: { key: "value" },
        });

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(jsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toBe("Parsed result");
        expect(result.sessionId).toBe("session-999");
      });

      it("should handle invalid JSON gracefully", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const invalidJson = "{ invalid json }";

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(invalidJson));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toBe(invalidJson);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          "Failed to parse JSON output",
          expect.any(Error),
        );
      });

      it("should return formatted JSON when no result field", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const jsonOutput = JSON.stringify({
          session_id: "session-abc",
          data: { key: "value" },
        });

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(jsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toContain('"session_id": "session-abc"');
        expect(result.output).toContain('"data": {\n    "key": "value"\n  }');
      });

      it("should handle JSON with null result field", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const jsonOutput = JSON.stringify({
          result: null,
          session_id: "session-null",
        });

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(jsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toContain('"result": null');
        expect(result.sessionId).toBe("session-null");
      });

      it("should handle JSON with empty result field", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const jsonOutput = JSON.stringify({
          result: "",
          session_id: "session-empty",
        });

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(jsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toBe("");
        expect(result.sessionId).toBe("session-empty");
      });
    });

    describe("text output processing", () => {
      it("should handle plain text output", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const textOutput =
          "This is plain text output\nwith multiple lines\nand special chars: !@#$%";

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "text" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(textOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toBe(textOutput);
        expect(result.sessionId).toBeUndefined();
      });

      it("should handle empty output", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toBe("");
        expect(result.success).toBe(true);
      });

      it("should handle large output streams", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const largeOutput = "x".repeat(10000);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(largeOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.output).toBe(largeOutput);
        expect(result.output.length).toBe(10000);
      });

      it("should handle chunked output streams", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const chunks = ["First chunk", " Second chunk", " Third chunk"];

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          chunks.forEach((chunk, index) => {
            setTimeout(() => {
              mockChild.stdout?.emit("data", Buffer.from(chunk));
              if (index === chunks.length - 1) {
                mockChild.emit("close", 0);
              }
            }, index * 10);
          });
        }, 0);

        const result = await resultPromise;

        expect(result.output).toBe("First chunk Second chunk Third chunk");
      });
    });

    describe("pipeline result processing", () => {
      it("should process pipeline results correctly", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const progressCallback = jest.fn();
        const completeCallback = jest.fn();

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
          progressCallback,
          completeCallback,
        );

        setTimeout(() => {
          mockChild1.stdout?.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                result: "Task 1 completed",
                session_id: "session-1",
              }),
            ),
          );
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                result: "Task 2 completed",
                session_id: "session-2",
              }),
            ),
          );
          mockChild2.emit("close", 0);
        }, 50);

        await pipelinePromise;

        expect(tasks[0].status).toBe("completed");
        expect(tasks[0].results).toBe("Task 1 completed");
        expect(tasks[0].sessionId).toBe("session-1");
        expect(tasks[1].status).toBe("completed");
        expect(tasks[1].results).toBe("Task 2 completed");
        expect(tasks[1].sessionId).toBe("session-2");
        expect(completeCallback).toHaveBeenCalledWith(tasks);
      });

      it("should handle mixed result formats in pipeline", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "text" },
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Plain text result"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit(
            "data",
            Buffer.from("Another plain text result"),
          );
          mockChild2.emit("close", 0);
        }, 50);

        await pipelinePromise;

        expect(tasks[0].results).toBe("Plain text result");
        expect(tasks[1].results).toBe("Another plain text result");
      });
    });
  });

  describe("Execution error handling and recovery", () => {
    describe("validation errors", () => {
      it("should handle invalid model validation", async () => {
        mockConfig.validateModel.mockReturnValue(false);

        const result = await executor.executeTask(
          "test task",
          "invalid-model",
          "/test",
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid model: invalid-model");
        expect(mockLogger.error).toHaveBeenCalledWith(
          "Task execution failed",
          expect.any(Error),
        );
      });

      it("should handle invalid working directory", async () => {
        mockConfig.validatePath.mockReturnValue(false);

        const result = await executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/invalid",
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid working directory: /invalid");
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe("command execution errors", () => {
      it("should handle command execution failure", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stderr?.emit("data", Buffer.from("Command failed"));
          mockChild.emit("close", 1);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(false);
        expect(result.error).toBe("Command failed");
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it("should handle spawn error", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        setTimeout(() => {
          mockChild.emit("error", new Error("Spawn failed"));
        }, 0);

        const result = await commandPromise;

        expect(result.success).toBe(false);
        expect(result.error).toBe("Spawn error: Spawn failed");
        expect(result.exitCode).toBe(-1);
      });

      it("should handle command not found (exit code 127)", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        setTimeout(() => {
          mockChild.emit("close", 127);
        }, 0);

        const result = await commandPromise;

        expect(result.success).toBe(false);
        expect(result.error).toBe(
          "Claude CLI not found in PATH. Please install Claude Code CLI.",
        );
        expect(result.exitCode).toBe(127);
      });

      it("should fallback to stdout when stderr is empty", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from("Error message in stdout"),
          );
          mockChild.emit("close", 1);
        }, 0);

        const result = await commandPromise;

        expect(result.success).toBe(false);
        expect(result.error).toBe("Error message in stdout");
      });

      it("should handle null exit code", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        setTimeout(() => {
          mockChild.emit("close", null);
        }, 0);

        const result = await commandPromise;

        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      });
    });

    describe("pipeline error handling", () => {
      it("should handle task execution error in pipeline", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const errorCallback = jest.fn();
        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          undefined,
          errorCallback,
        );

        setTimeout(() => {
          mockChild.stderr?.emit("data", Buffer.from("Task failed"));
          mockChild.emit("close", 1);
        }, 0);

        await pipelinePromise;

        expect(errorCallback).toHaveBeenCalledWith("Task failed", tasks);
        expect(tasks[0].status).toBe("error");
        expect(tasks[0].results).toBe("Task failed");
        expect(tasks[1].status).toBe("pending");
      });

      it("should handle exception in pipeline task", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
        ];

        mockSpawn.mockImplementation(() => {
          throw new Error("Spawn error");
        });

        const errorCallback = jest.fn();
        await executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          undefined,
          errorCallback,
        );

        expect(errorCallback).toHaveBeenCalledWith("Spawn error", tasks);
        expect(tasks[0].status).toBe("error");
        expect(tasks[0].results).toBe("Spawn error");
      });

      it("should handle mixed success and error in pipeline", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const errorCallback = jest.fn();
        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          undefined,
          errorCallback,
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Task 1 success"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stderr?.emit("data", Buffer.from("Task 2 failed"));
          mockChild2.emit("close", 1);
        }, 50);

        await pipelinePromise;

        expect(tasks[0].status).toBe("completed");
        expect(tasks[0].results).toBe("Task 1 success");
        expect(tasks[1].status).toBe("error");
        expect(tasks[1].results).toBe("Task 2 failed");
        expect(errorCallback).toHaveBeenCalledWith("Task 2 failed", tasks);
      });
    });

    describe("rate limit detection and recovery", () => {
      it("should detect rate limit pattern correctly", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit;
        const timestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const output = `Claude AI usage limit reached|${timestamp}`;

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(true);
        expect(result.resetTime).toBeInstanceOf(Date);
        expect(result.waitTime).toBeGreaterThan(0);
      });

      it("should not detect rate limit in normal output", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit;
        const output = "Normal task output";

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(false);
        expect(result.resetTime).toBeUndefined();
        expect(result.waitTime).toBeUndefined();
      });

      it("should detect rate limit in stderr", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit;
        const timestamp = Math.floor(Date.now() / 1000) + 3600;
        const stderr = `Claude AI usage limit reached|${timestamp}`;

        const result = detectRateLimit("", stderr);

        expect(result.isLimited).toBe(true);
      });

      it("should handle invalid timestamp in rate limit", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit.bind(executor);
        const output = "Claude AI usage limit reached|NaN";

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(false);
      });

      it("should not detect rate limit for completely invalid format", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit.bind(executor);
        const output = "Claude AI usage limit reached|invalid_string";

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(false);
      });

      it("should call logger methods during rate limit wait", async () => {
        const waitForRateLimit = (
          executor as unknown as {
            waitForRateLimit: (resetTime: Date) => Promise<void>;
          }
        ).waitForRateLimit.bind(executor);
        const resetTime = new Date(Date.now() - 1000); // Already passed, so no actual wait
        const rateLimitInfo = {
          isLimited: true,
          resetTime,
          waitTime: 0, // No wait time since reset time has passed
        };

        await waitForRateLimit(rateLimitInfo);

        // Since waitTime is 0, it should return immediately without logging
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it("should calculate wait time correctly", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit.bind(executor);
        const futureTimestamp = Math.floor((Date.now() + 60000) / 1000); // 1 minute from now
        const output = `Claude AI usage limit reached|${futureTimestamp}`;

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(true);
        expect(result.waitTime).toBeGreaterThan(50000); // Should be close to 60 seconds
        expect(result.waitTime).toBeLessThan(70000);
      });

      it("should return immediately if not rate limited", async () => {
        const waitForRateLimit = (
          executor as unknown as {
            waitForRateLimit: (resetTime: Date) => Promise<void>;
          }
        ).waitForRateLimit;
        const rateLimitInfo = {
          isLimited: false,
        };

        const startTime = Date.now();
        await waitForRateLimit(rateLimitInfo);
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(100);
      });

      it("should return immediately if no wait time", async () => {
        const waitForRateLimit = (
          executor as unknown as {
            waitForRateLimit: (resetTime: Date) => Promise<void>;
          }
        ).waitForRateLimit;
        const rateLimitInfo = {
          isLimited: true,
          waitTime: 0,
        };

        const startTime = Date.now();
        await waitForRateLimit(rateLimitInfo);
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(100);
      });

      it("should detect rate limit in stdout", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Test task",
            status: "pending",
          },
        ];

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from("Claude AI usage limit reached|1609459200"),
          );
          mockChild.emit("close", 1);
        }, 0);

        await pipelinePromise;

        expect(tasks[0].status).toBe("paused");
        expect(tasks[0].pausedUntil).toBe(1609459200000);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            "Rate limit detected, pausing pipeline execution",
          ),
        );
      });

      it("should detect rate limit in stderr", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Test task",
            status: "pending",
          },
        ];

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stderr?.emit(
            "data",
            Buffer.from("Claude AI usage limit reached|1609459200"),
          );
          mockChild.emit("close", 1);
        }, 0);

        await pipelinePromise;

        expect(tasks[0].status).toBe("paused");
        expect(tasks[0].pausedUntil).toBe(1609459200000);
      });

      it("should not detect rate limit for other error messages", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Test task",
            status: "pending",
          },
        ];

        const errorCallback = jest.fn();
        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          undefined,
          errorCallback,
        );

        setTimeout(() => {
          mockChild.stderr?.emit("data", Buffer.from("Some other error"));
          mockChild.emit("close", 1);
        }, 0);

        await pipelinePromise;

        expect(tasks[0].status).toBe("error");
        expect(tasks[0].pausedUntil).toBeUndefined();
        expect(errorCallback).toHaveBeenCalledWith("Some other error", tasks);
      });

      it("should handle malformed rate limit message", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Test task",
            status: "pending",
          },
        ];

        const errorCallback = jest.fn();
        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          undefined,
          errorCallback,
        );

        setTimeout(() => {
          mockChild.stderr?.emit(
            "data",
            Buffer.from("Some other error message"),
          );
          mockChild.emit("close", 1);
        }, 0);

        await pipelinePromise;

        expect(tasks[0].status).toBe("error");
        expect(tasks[0].results).toBe("Some other error message");
        expect(errorCallback).toHaveBeenCalledWith(
          "Some other error message",
          tasks,
        );
      });
    });

    describe("resume pipeline recovery", () => {
      it("should resume from paused task", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "completed",
            results: "Task 1 completed",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "paused",
            results: "MANUALLY PAUSED",
            pausedUntil: Date.now() - 1000,
          },
          {
            id: "task3",
            prompt: "Third task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const progressCallback = jest.fn();
        const completeCallback = jest.fn();

        const resumePromise = executor.resumePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          progressCallback,
          completeCallback,
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Task 2 resumed"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit("data", Buffer.from("Task 3 completed"));
          mockChild2.emit("close", 0);
        }, 50);

        await resumePromise;

        expect(tasks[1].status).toBe("completed");
        expect(tasks[1].results).toBe("Task 2 resumed");
        expect(tasks[1].pausedUntil).toBeUndefined();
        expect(tasks[2].status).toBe("completed");
        expect(completeCallback).toHaveBeenCalledWith(tasks);
      });

      it("should complete when no tasks to resume", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "completed",
            results: "Task 1 completed",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "completed",
            results: "Task 2 completed",
          },
        ];

        const completeCallback = jest.fn();

        await executor.resumePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          completeCallback,
        );

        expect(completeCallback).toHaveBeenCalledWith(tasks);
        expect(mockLogger.info).toHaveBeenCalledWith(
          "No tasks to resume - all tasks completed",
        );
      });

      it("should resume from first pending task if no paused tasks", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "completed",
            results: "Task 1 completed",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
          {
            id: "task3",
            prompt: "Third task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const resumePromise = executor.resumePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Task 2 completed"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit("data", Buffer.from("Task 3 completed"));
          mockChild2.emit("close", 0);
        }, 50);

        await resumePromise;

        expect(tasks[1].status).toBe("completed");
        expect(tasks[2].status).toBe("completed");
      });

      it("should handle rate limit during resume", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "paused",
            results: "MANUALLY PAUSED",
          },
        ];

        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resumePromise = executor.resumePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from("Claude AI usage limit reached|1609459200"),
          );
          mockChild.emit("close", 1);
        }, 0);

        await resumePromise;

        expect(tasks[0].status).toBe("paused");
        expect(tasks[0].pausedUntil).toBe(1609459200000);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            "Rate limit detected during resume, pausing pipeline execution",
          ),
        );
      });
    });

    describe("pipeline pause handling", () => {
      it("should handle pause request during pipeline execution", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const pauseRequested = true;
        const pauseChecker = jest.fn(() => pauseRequested);
        const pauseCallback = jest.fn();

        await executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          undefined,
          undefined,
          pauseChecker,
          pauseCallback,
        );

        expect(pauseCallback).toHaveBeenCalledWith(tasks, 0);
        expect(tasks[0].status).toBe("paused");
        expect(tasks[0].results).toBe("MANUALLY PAUSED");
      });

      it("should complete when pause is requested on last task", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Only task",
            status: "pending",
          },
        ];

        const pauseRequested = true;
        const pauseChecker = jest.fn(() => pauseRequested);
        const pauseCallback = jest.fn();
        const completeCallback = jest.fn();

        await executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          completeCallback,
          undefined,
          pauseChecker,
          pauseCallback,
        );

        expect(pauseCallback).toHaveBeenCalledWith(tasks, 0);
        expect(completeCallback).toHaveBeenCalledWith(tasks);
        expect(tasks[0].status).toBe("paused");
      });

      it("should handle pause request during resume", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "paused",
            results: "MANUALLY PAUSED",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const pauseRequested = true;
        const pauseChecker = jest.fn(() => pauseRequested);
        const pauseCallback = jest.fn();

        await executor.resumePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          undefined,
          undefined,
          pauseChecker,
          pauseCallback,
        );

        expect(pauseCallback).toHaveBeenCalledWith(tasks, 0);
        expect(tasks[0].status).toBe("paused");
        expect(tasks[0].results).toBe("MANUALLY PAUSED");
      });
    });
  });

  describe("Advanced execution scenarios", () => {
    describe("process lifecycle management", () => {
      it("should handle rapid start/stop cycles", async () => {
        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();
        const mockChild3 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2)
          .mockReturnValueOnce(mockChild3);

        executor.testExecuteCommand(["claude", "-p", "test1"], "/test");
        executor.cancelCurrentTask();

        executor.testExecuteCommand(["claude", "-p", "test2"], "/test");
        executor.cancelCurrentTask();

        const promise3 = executor.testExecuteCommand(
          ["claude", "-p", "test3"],
          "/test",
        );

        setTimeout(() => {
          mockChild3.stdout?.emit("data", Buffer.from("Success"));
          mockChild3.emit("close", 0);
        }, 0);

        const result = await promise3;
        expect(result.success).toBe(true);
        expect(mockChild1.kill).toHaveBeenCalledWith("SIGTERM");
        expect(mockChild2.kill).toHaveBeenCalledWith("SIGTERM");
      });

      it("should handle process cleanup edge cases", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        expect(executor.isTaskRunning()).toBe(true);

        setTimeout(() => {
          mockChild.emit("close", 0);
        }, 0);

        await commandPromise;

        expect(executor.isTaskRunning()).toBe(false);

        executor.cancelCurrentTask();

        expect(mockLogger.info).not.toHaveBeenCalledWith(
          "Cancelling current Claude task",
        );
      });

      it("should handle process with no stdin", async () => {
        const mockChild = createMockChildProcess();
        mockChild.stdin = null;
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        const result = await commandPromise;
        expect(result.success).toBe(true);
      });

      it("should handle process with no stdout", async () => {
        const mockChild = createMockChildProcess();
        mockChild.stdout = null;
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        setTimeout(() => {
          mockChild.emit("close", 0);
        }, 0);

        const result = await commandPromise;
        expect(result.success).toBe(true);
        expect(result.output).toBe("");
      });

      it("should handle process with no stderr", async () => {
        const mockChild = createMockChildProcess();
        mockChild.stderr = null;
        mockSpawn.mockReturnValue(mockChild);

        const commandPromise = executor.testExecuteCommand(
          ["claude", "-p", "test"],
          "/test",
        );

        setTimeout(() => {
          mockChild.emit("close", 1);
        }, 0);

        const result = await commandPromise;
        expect(result.success).toBe(false);
        expect(result.error).toBe("Command failed with exit code 1");
      });
    });

    describe("complex pipeline scenarios", () => {
      it("should handle pipeline with mixed task models", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
            model: "claude-3-opus-latest",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
            model: "claude-3-5-sonnet-latest",
          },
          {
            id: "task3",
            prompt: "Third task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();
        const mockChild3 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2)
          .mockReturnValueOnce(mockChild3);

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-haiku-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Task 1 completed"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit("data", Buffer.from("Task 2 completed"));
          mockChild2.emit("close", 0);
        }, 50);

        setTimeout(() => {
          mockChild3.stdout?.emit("data", Buffer.from("Task 3 completed"));
          mockChild3.emit("close", 0);
        }, 100);

        await pipelinePromise;

        expect(mockSpawn).toHaveBeenNthCalledWith(
          1,
          "claude",
          expect.arrayContaining(["--model", "claude-3-opus-latest"]),
          expect.any(Object),
        );

        expect(mockSpawn).toHaveBeenNthCalledWith(
          2,
          "claude",
          expect.arrayContaining(["--model", "claude-3-5-sonnet-latest"]),
          expect.any(Object),
        );

        expect(mockSpawn).toHaveBeenNthCalledWith(
          3,
          "claude",
          expect.arrayContaining(["--model", "claude-3-haiku-latest"]),
          expect.any(Object),
        );
      });

      it("should handle empty pipeline", async () => {
        const tasks: TaskItem[] = [];

        const completeCallback = jest.fn();

        await executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          completeCallback,
        );

        expect(completeCallback).toHaveBeenCalledWith(tasks);
      });

      it("should handle pipeline with task dependencies and complex flows", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
            dependsOn: ["task1"],
          },
          {
            id: "task3",
            prompt: "Third task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();
        const mockChild3 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2)
          .mockReturnValueOnce(mockChild3);

        const completeCallback = jest.fn();
        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          completeCallback,
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Task 1 completed"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit("data", Buffer.from("Task 2 completed"));
          mockChild2.emit("close", 0);
        }, 50);

        setTimeout(() => {
          mockChild3.stdout?.emit("data", Buffer.from("Task 3 completed"));
          mockChild3.emit("close", 0);
        }, 100);

        await pipelinePromise;

        expect(tasks[0].status).toBe("completed");
        expect(tasks[1].status).toBe("completed");
        expect(tasks[2].status).toBe("completed");
        expect(mockSpawn).toHaveBeenCalledTimes(3);
        expect(completeCallback).toHaveBeenCalledWith(tasks);
      });
    });

    describe("memory and resource edge cases", () => {
      it("should handle concurrent pipeline executions", async () => {
        const tasks1: TaskItem[] = [
          {
            id: "task1",
            prompt: "Pipeline 1 task",
            status: "pending",
          },
        ];

        const tasks2: TaskItem[] = [
          {
            id: "task2",
            prompt: "Pipeline 2 task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const pipeline1 = executor.executePipeline(
          tasks1,
          "claude-3-5-sonnet-latest",
          "/test1",
        );
        const pipeline2 = executor.executePipeline(
          tasks2,
          "claude-3-5-sonnet-latest",
          "/test2",
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Pipeline 1 completed"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit("data", Buffer.from("Pipeline 2 completed"));
          mockChild2.emit("close", 0);
        }, 10);

        await Promise.all([pipeline1, pipeline2]);

        expect(tasks1[0].status).toBe("completed");
        expect(tasks2[0].status).toBe("completed");
      });

      it("should handle very large JSON responses", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const massiveData = Array(10000)
          .fill(0)
          .map((_, i) => ({
            id: i,
            data: "x".repeat(1000),
            nested: {
              deep: Array(100).fill(`item_${i}`),
            },
          }));

        const massiveJsonOutput = JSON.stringify({
          result: "Processing completed",
          session_id: "session-massive",
          data: massiveData,
        });

        const resultPromise = executor.executeTask(
          "massive data task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(massiveJsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBe("Processing completed");
        expect(result.sessionId).toBe("session-massive");
      });
    });
  });

  describe("Execution performance monitoring", () => {
    describe("execution time tracking", () => {
      it("should track execution time for successful tasks", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const startTime = Date.now();
        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 50);

        const result = await resultPromise;
        const endTime = Date.now();

        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.executionTimeMs).toBeLessThan(endTime - startTime + 100);
      });

      it("should track execution time for tasks with spawn errors", async () => {
        mockSpawn.mockImplementation(() => {
          throw new Error("Failed to spawn process");
        });

        const startTime = Date.now();
        const result = await executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );
        const endTime = Date.now();

        expect(result.success).toBe(false);
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.executionTimeMs).toBeLessThan(endTime - startTime + 50);
        expect(result.error).toContain("Failed to spawn process");
      });

      it("should track execution time for failed tasks", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const startTime = Date.now();
        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stderr?.emit("data", Buffer.from("Error"));
          mockChild.emit("close", 1);
        }, 30);

        const result = await resultPromise;
        const endTime = Date.now();

        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.executionTimeMs).toBeLessThan(endTime - startTime + 100);
        expect(result.success).toBe(false);
      });

      it("should track execution time for validation errors", async () => {
        mockConfig.validateModel.mockReturnValue(false);

        const startTime = Date.now();
        const result = await executor.executeTask(
          "test task",
          "invalid-model",
          "/test",
        );
        const endTime = Date.now();

        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.executionTimeMs).toBeLessThan(endTime - startTime + 50);
        expect(result.success).toBe(false);
      });

      it("should measure execution time accurately", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const startTime = Date.now();
        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 10); // Small delay to ensure measurable execution time

        const result = await resultPromise;
        const endTime = Date.now();

        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.executionTimeMs).toBeLessThan(endTime - startTime + 100);
      });

      it("should handle very fast execution times", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 1);

        const result = await resultPromise;

        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.executionTimeMs).toBeLessThan(1000);
      });
    });

    describe("task state monitoring", () => {
      it("should monitor task state changes in pipeline", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const progressCallback = jest.fn();
        const completeCallback = jest.fn();

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          progressCallback,
          completeCallback,
        );

        setTimeout(() => {
          expect(tasks[0].status).toBe("running");
          mockChild1.stdout?.emit("data", Buffer.from("Task 1 completed"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          expect(tasks[1].status).toBe("running");
          mockChild2.stdout?.emit("data", Buffer.from("Task 2 completed"));
          mockChild2.emit("close", 0);
        }, 50);

        await pipelinePromise;

        expect(progressCallback).toHaveBeenCalledWith(tasks, 0);
        expect(progressCallback).toHaveBeenCalledWith(tasks, 1);
        expect(completeCallback).toHaveBeenCalledWith(tasks);
        expect(tasks[0].status).toBe("completed");
        expect(tasks[1].status).toBe("completed");
      });

      it("should track task model usage", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "First task",
            status: "pending",
            model: "claude-3-opus-latest",
          },
          {
            id: "task2",
            prompt: "Second task",
            status: "pending",
          },
        ];

        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Task 1 completed"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit("data", Buffer.from("Task 2 completed"));
          mockChild2.emit("close", 0);
        }, 50);

        await pipelinePromise;

        expect(mockSpawn).toHaveBeenNthCalledWith(
          1,
          "claude",
          expect.arrayContaining(["--model", "claude-3-opus-latest"]),
          expect.any(Object),
        );

        expect(mockSpawn).toHaveBeenNthCalledWith(
          2,
          "claude",
          expect.arrayContaining(["--model", "claude-3-5-sonnet-latest"]),
          expect.any(Object),
        );
      });
    });

    describe("resource utilization monitoring", () => {
      it("should handle concurrent task execution context", () => {
        const mockChild1 = createMockChildProcess();
        const mockChild2 = createMockChildProcess();

        mockSpawn
          .mockReturnValueOnce(mockChild1)
          .mockReturnValueOnce(mockChild2);

        const command1Promise = executor.testExecuteCommand(
          ["claude", "-p", "test1"],
          "/test",
        );
        const command2Promise = executor.testExecuteCommand(
          ["claude", "-p", "test2"],
          "/test",
        );

        setTimeout(() => {
          mockChild1.stdout?.emit("data", Buffer.from("Success 1"));
          mockChild1.emit("close", 0);
        }, 0);

        setTimeout(() => {
          mockChild2.stdout?.emit("data", Buffer.from("Success 2"));
          mockChild2.emit("close", 0);
        }, 10);

        return Promise.all([command1Promise, command2Promise]).then(
          (results) => {
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
            expect(results[0].output).toBe("Success 1");
            expect(results[1].output).toBe("Success 2");
          },
        );
      });

      it("should handle process cleanup on cancellation", () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        executor.testExecuteCommand(["claude", "-p", "test"], "/test");

        expect(executor.isTaskRunning()).toBe(true);

        executor.cancelCurrentTask();

        expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
        expect(executor.isTaskRunning()).toBe(false);
      });

      it("should handle memory-intensive output processing", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const largeJsonOutput = JSON.stringify({
          result: "x".repeat(50000),
          session_id: "session-large",
          data: Array(1000).fill({ key: "value", nested: { deep: "data" } }),
        });

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(largeJsonOutput));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output.length).toBe(50000);
        expect(result.sessionId).toBe("session-large");
      });
    });
  });

  describe("Shell argument escaping", () => {
    it("should escape single quotes correctly", () => {
      const escapeShellArg = (
        executor as unknown as { escapeShellArg: (arg: string) => string }
      ).escapeShellArg;
      const input = "test with 'single quotes'";
      const escaped = escapeShellArg(input);

      expect(escaped).toBe("'test with '\"'\"'single quotes'\"'\"''");
    });

    it("should handle string without quotes", () => {
      const escapeShellArg = (
        executor as unknown as { escapeShellArg: (arg: string) => string }
      ).escapeShellArg;
      const input = "simple string";
      const escaped = escapeShellArg(input);

      expect(escaped).toBe("'simple string'");
    });

    it("should handle multiple single quotes", () => {
      const escapeShellArg = (
        executor as unknown as { escapeShellArg: (arg: string) => string }
      ).escapeShellArg;
      const input = "'start' 'middle' 'end'";
      const escaped = escapeShellArg(input);

      expect(escaped).toBe(
        "''\"'\"'start'\"'\"' '\"'\"'middle'\"'\"' '\"'\"'end'\"'\"''",
      );
    });

    it("should handle empty string", () => {
      const escapeShellArg = (
        executor as unknown as { escapeShellArg: (arg: string) => string }
      ).escapeShellArg;
      const input = "";
      const escaped = escapeShellArg(input);

      expect(escaped).toBe("''");
    });

    it("should handle string with only single quote", () => {
      const escapeShellArg = (
        executor as unknown as { escapeShellArg: (arg: string) => string }
      ).escapeShellArg;
      const input = "'";
      const escaped = escapeShellArg(input);

      expect(escaped).toBe("''\"'\"''");
    });
  });

  describe("JSON parsing edge cases", () => {
    it("should parse valid JSON output with result field", () => {
      const parseTaskResult = (
        executor as unknown as {
          parseTaskResult: (output: string) => {
            success: boolean;
            result?: string;
            error?: string;
          };
        }
      ).parseTaskResult.bind(executor);
      const jsonOutput = JSON.stringify({
        session_id: "test-session",
        result: "Test result",
      });

      const result = parseTaskResult(jsonOutput, "json");

      expect(result.sessionId).toBe("test-session");
      expect(result.resultText).toBe("Test result");
    });

    it("should handle invalid JSON gracefully", () => {
      const parseTaskResult = (
        executor as unknown as {
          parseTaskResult: (output: string) => {
            success: boolean;
            result?: string;
            error?: string;
          };
        }
      ).parseTaskResult.bind(executor);
      const invalidJson = "{ invalid json }";

      const result = parseTaskResult(invalidJson, "json");

      expect(result.sessionId).toBeUndefined();
      expect(result.resultText).toBe(invalidJson);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to parse JSON output",
        expect.any(Error),
      );
    });

    it("should return text output as-is for non-JSON format", () => {
      const parseTaskResult = (
        executor as unknown as {
          parseTaskResult: (output: string) => {
            success: boolean;
            result?: string;
            error?: string;
          };
        }
      ).parseTaskResult.bind(executor);
      const textOutput = "Plain text output";

      const result = parseTaskResult(textOutput, "text");

      expect(result.sessionId).toBeUndefined();
      expect(result.resultText).toBe(textOutput);
    });

    it("should handle JSON with null values", () => {
      const parseTaskResult = (
        executor as unknown as {
          parseTaskResult: (output: string) => {
            success: boolean;
            result?: string;
            error?: string;
          };
        }
      ).parseTaskResult.bind(executor);
      const jsonOutput = JSON.stringify({
        session_id: null,
        result: null,
      });

      const result = parseTaskResult(jsonOutput, "json");

      expect(result.sessionId).toBeNull();
      expect(result.resultText).toContain('"result": null');
    });

    it("should extract result from JSON correctly", () => {
      const extractResultFromJson = (
        executor as unknown as {
          extractResultFromJson: (jsonStr: string) => string | null;
        }
      ).extractResultFromJson.bind(executor);
      const jsonOutput = JSON.stringify({
        result: "Extracted result",
        other_data: "ignored",
      });

      const result = extractResultFromJson(jsonOutput);

      expect(result).toBe("Extracted result");
    });

    it("should handle JSON without result field", () => {
      const extractResultFromJson = (
        executor as unknown as {
          extractResultFromJson: (jsonStr: string) => string | null;
        }
      ).extractResultFromJson.bind(executor);
      const jsonOutput = JSON.stringify({
        session_id: "session-123",
        data: { key: "value" },
      });

      const result = extractResultFromJson(jsonOutput);

      expect(result).toContain('"session_id": "session-123"');
      expect(result).toContain('"data": {\n    "key": "value"\n  }');
    });

    it("should handle malformed JSON in extraction", () => {
      const extractResultFromJson = (
        executor as unknown as {
          extractResultFromJson: (jsonStr: string) => string | null;
        }
      ).extractResultFromJson.bind(executor);
      const invalidJson = "{ malformed json";

      const result = extractResultFromJson(invalidJson);

      expect(result).toBe(invalidJson);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to parse JSON output",
        expect.any(Error),
      );
    });

    it("should handle non-string result field", () => {
      const extractResultFromJson = (
        executor as unknown as {
          extractResultFromJson: (jsonStr: string) => string | null;
        }
      ).extractResultFromJson.bind(executor);
      const jsonOutput = JSON.stringify({
        result: { complex: "object" },
        session_id: "session-123",
      });

      const result = extractResultFromJson(jsonOutput);

      expect(result).toContain('"result": {\n    "complex": "object"\n  }');
    });
  });

  describe("command building edge cases", () => {
    it("should build command with all task options", () => {
      const options: TaskOptions = {
        continueConversation: false,
        resumeSessionId: undefined,
        outputFormat: "json",
        maxTurns: 15,
        verbose: true,
        systemPrompt: "System prompt",
        appendSystemPrompt: "Append prompt",
        allowAllTools: false,
        allowedTools: ["tool1", "tool2"],
        disallowedTools: ["tool3"],
        mcpConfig: "/path/to/config.json",
        permissionPromptTool: "permission-tool",
      };

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      expect(preview).toContain("--output-format json");
      expect(preview).toContain("--max-turns 15");
      expect(preview).toContain("--verbose");
      expect(preview).toContain("--system-prompt System prompt");
      expect(preview).toContain("--append-system-prompt Append prompt");
      expect(preview).toContain("--allowedTools tool1,tool2");
      expect(preview).toContain("--disallowedTools tool3");
      expect(preview).toContain("--mcp-config /path/to/config.json");
      expect(preview).toContain("--permission-prompt-tool permission-tool");
    });

    it("should handle extremely long task prompts", () => {
      const longTask = "x".repeat(100000);

      const preview = executor.formatCommandPreview(
        longTask,
        "claude-3-5-sonnet-latest",
        "/test",
        {},
      );

      expect(preview).toContain(`'${longTask}'`);
      expect(preview.length).toBeGreaterThan(100000);
    });

    it("should handle unicode and emoji in task prompts", () => {
      const unicodeTask = "Task with 🚀 emoji and 中文 characters";

      const preview = executor.formatCommandPreview(
        unicodeTask,
        "claude-3-5-sonnet-latest",
        "/test",
        {},
      );

      expect(preview).toContain(unicodeTask);
    });

    it("should handle special shell characters correctly", () => {
      const specialTask = "Task with $(command) && other_command; rm -rf /";

      const preview = executor.formatCommandPreview(
        specialTask,
        "claude-3-5-sonnet-latest",
        "/test",
        {},
      );

      expect(preview).toContain(`'${specialTask}'`);
      expect(preview).toContain("--model claude-3-5-sonnet-latest");
      expect(preview).toContain('cd "/test"');
    });

    it("should build command with continue conversation", () => {
      const options: TaskOptions = {
        continueConversation: true,
      };

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      expect(preview).toContain("--continue");
      expect(preview).not.toContain("--system-prompt");
    });

    it("should build command with resume session", () => {
      const options: TaskOptions = {
        resumeSessionId: "session-789",
      };

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      expect(preview).toContain("-r session-789");
      expect(preview).not.toContain("--system-prompt");
    });

    it("should handle default values correctly", () => {
      const options: TaskOptions = {
        outputFormat: "text",
        maxTurns: 10,
        verbose: false,
      };

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      expect(preview).not.toContain("--output-format");
      expect(preview).not.toContain("--max-turns");
      expect(preview).not.toContain("--verbose");
    });

    it("should handle empty tool arrays", () => {
      const options: TaskOptions = {
        allowedTools: [],
        disallowedTools: [],
      };

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      expect(preview).not.toContain("--allowedTools");
      expect(preview).not.toContain("--disallowedTools");
    });

    it("should skip permission tool for continue and resume", () => {
      const options: TaskOptions = {
        continueConversation: true,
        permissionPromptTool: "should-be-skipped",
      };

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      expect(preview).not.toContain("--permission-prompt-tool");
    });

    it("should handle task options with undefined values", () => {
      const options: TaskOptions = {
        outputFormat: undefined,
        maxTurns: undefined,
        verbose: undefined,
        systemPrompt: undefined,
        appendSystemPrompt: undefined,
        allowAllTools: undefined,
        allowedTools: undefined,
        disallowedTools: undefined,
        mcpConfig: undefined,
        permissionPromptTool: undefined,
      };

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        "/test",
        options,
      );

      expect(preview).toBe(
        `cd "/test" && claude -p 'test task' --model claude-3-5-sonnet-latest`,
      );
    });

    it("should handle working directory with spaces", () => {
      const workingDir = "/path/with spaces/project";

      const preview = executor.formatCommandPreview(
        "test task",
        "claude-3-5-sonnet-latest",
        workingDir,
        {},
      );

      expect(preview).toContain(`cd "${workingDir}"`);
    });

    it("should handle complex combinations of options", () => {
      const options: TaskOptions = {
        outputFormat: "stream-json",
        maxTurns: 25,
        verbose: true,
        allowAllTools: true,
        mcpConfig: "/complex/config.json",
      };

      const preview = executor.formatCommandPreview(
        "complex task",
        "auto",
        "/test",
        options,
      );

      expect(preview).toContain("--output-format stream-json");
      expect(preview).toContain("--max-turns 25");
      expect(preview).toContain("--verbose");
      expect(preview).toContain("--dangerously-skip-permissions");
      expect(preview).toContain("--mcp-config /complex/config.json");
      expect(preview).not.toContain("--model");
    });
  });

  describe("Additional edge case coverage", () => {
    describe("pipeline edge cases", () => {
      it("should handle pipeline with single completed task", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Already completed task",
            status: "completed",
            results: "Already done",
          },
        ];

        const completeCallback = jest.fn();

        await executor.resumePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          completeCallback,
        );

        expect(completeCallback).toHaveBeenCalledWith(tasks);
      });

      it("should handle pipeline with all error tasks", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Error task",
            status: "error",
            results: "Failed",
          },
          {
            id: "task2",
            prompt: "Another error task",
            status: "error",
            results: "Also failed",
          },
        ];

        const completeCallback = jest.fn();

        await executor.resumePipeline(
          tasks,
          "claude-3-5-sonnet-latest",
          "/test",
          {},
          undefined,
          completeCallback,
        );

        expect(completeCallback).toHaveBeenCalledWith(tasks);
      });

      it("should handle task with undefined model falling back to pipeline model", async () => {
        const tasks: TaskItem[] = [
          {
            id: "task1",
            prompt: "Task without model",
            status: "pending",
            model: undefined,
          },
        ];

        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const pipelinePromise = executor.executePipeline(
          tasks,
          "claude-3-haiku-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("Success"));
          mockChild.emit("close", 0);
        }, 0);

        await pipelinePromise;

        expect(mockSpawn).toHaveBeenCalledWith(
          "claude",
          expect.arrayContaining(["--model", "claude-3-haiku-latest"]),
          expect.any(Object),
        );
      });
    });

    describe("rate limit edge cases", () => {
      it("should handle rate limit with very long wait time", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit;
        const futureTimestamp = Math.floor(
          (Date.now() + 24 * 60 * 60 * 1000) / 1000,
        ); // 24 hours from now
        const output = `Claude AI usage limit reached|${futureTimestamp}`;

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(true);
        expect(result.waitTime).toBeGreaterThan(23 * 60 * 60 * 1000); // More than 23 hours
      });

      it("should handle rate limit with past timestamp", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit;
        const pastTimestamp = Math.floor((Date.now() - 60000) / 1000); // 1 minute ago
        const output = `Claude AI usage limit reached|${pastTimestamp}`;

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(true);
        expect(result.waitTime).toBe(0);
      });

      it("should handle rate limit detection with negative wait time", () => {
        const detectRateLimit = (
          executor as unknown as {
            detectRateLimit: (output: string) => {
              isLimited: boolean;
              resetTime: Date;
              waitTime: number;
            };
          }
        ).detectRateLimit;
        const pastTimestamp = Math.floor((Date.now() - 5 * 60 * 1000) / 1000); // 5 minutes ago
        const output = `Claude AI usage limit reached|${pastTimestamp}`;

        const result = detectRateLimit(output);

        expect(result.isLimited).toBe(true);
        expect(result.waitTime).toBe(0); // Should be 0 for past timestamps
        expect(result.resetTime?.getTime()).toBeLessThan(Date.now());
      });

      it("should handle rate limit with zero wait time", async () => {
        const waitForRateLimit = (
          executor as unknown as {
            waitForRateLimit: (resetTime: Date) => Promise<void>;
          }
        ).waitForRateLimit.bind(executor);
        const rateLimitInfo = {
          isLimited: true,
          resetTime: new Date(Date.now() - 1000), // Already passed
          waitTime: 0,
        };

        // Should return immediately without waiting
        const startTime = Date.now();
        await waitForRateLimit(rateLimitInfo);
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(50); // Should be very fast
      });
    });

    describe("output processing edge cases", () => {
      it("should handle output with only whitespace", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from("   \n\t  \r\n  "));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBe("   \n\t  \r\n  ");
      });

      it("should handle JSON with deeply nested structures", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const deepJson = {
          result: "Deep result",
          session_id: "session-deep",
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: "deep value",
                },
              },
            },
          },
        };

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit("data", Buffer.from(JSON.stringify(deepJson)));
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBe("Deep result");
        expect(result.sessionId).toBe("session-deep");
      });

      it("should handle binary-like data in output", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        setTimeout(() => {
          const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
          mockChild.stdout?.emit("data", binaryData);
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.output).toBeTruthy();
      });
    });

    describe("process management edge cases", () => {
      it("should handle multiple rapid cancellations", () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        executor.testExecuteCommand(["claude", "-p", "test"], "/test");

        executor.cancelCurrentTask();
        executor.cancelCurrentTask();
        executor.cancelCurrentTask();

        expect(mockChild.kill).toHaveBeenCalledTimes(1);
        expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      });

      it("should handle cancellation during process startup", () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        executor.testExecuteCommand(["claude", "-p", "test"], "/test");

        // Cancel immediately before process has time to start
        executor.cancelCurrentTask();

        expect(executor.isTaskRunning()).toBe(false);
      });
    });

    describe("validation and configuration edge cases", () => {
      it("should handle config manager throwing errors", async () => {
        mockConfig.validateModel.mockImplementation(() => {
          throw new Error("Config validation failed");
        });

        const result = await executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("Config validation failed");
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it("should handle path validation throwing errors", async () => {
        mockConfig.validatePath.mockImplementation(() => {
          throw new Error("Path validation failed");
        });

        const result = await executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe("Path validation failed");
      });
    });

    describe("session handling edge cases", () => {
      it("should handle corrupted JSON with session_id", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from('{"session_id": "valid-session", "result": incomplete'),
          );
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.sessionId).toBeUndefined();
        expect(result.output).toContain('{"session_id": "valid-session"');
      });

      it("should handle session ID extraction with complex JSON", async () => {
        const mockChild = createMockChildProcess();
        mockSpawn.mockReturnValue(mockChild);

        const complexJson = {
          metadata: { timestamp: Date.now() },
          session_id: "complex-session-123",
          result: "Complex result",
          nested: {
            session_id: "fake-nested-session",
          },
        };

        const resultPromise = executor.executeTask(
          "test task",
          "claude-3-5-sonnet-latest",
          "/test",
          { outputFormat: "json" },
        );

        setTimeout(() => {
          mockChild.stdout?.emit(
            "data",
            Buffer.from(JSON.stringify(complexJson)),
          );
          mockChild.emit("close", 0);
        }, 0);

        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe("complex-session-123");
        expect(result.output).toBe("Complex result");
      });
    });
  });

  function createMockChildProcess(): ChildProcess {
    const mockStdin = new Writable({
      write: jest.fn(),
    }) as Writable;
    mockStdin.end = jest.fn();

    const mockStdout = new Readable({
      read: jest.fn(),
    }) as Readable;

    const mockStderr = new Readable({
      read: jest.fn(),
    }) as Readable;

    const events: { [key: string]: Array<(...args: unknown[]) => void> } = {};

    const mockChild = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      stdio: [mockStdin, mockStdout, mockStderr, null, null],
      killed: false,
      connected: false,
      exitCode: null,
      signalCode: null,
      spawnargs: [],
      spawnfile: "",
      pid: 12345,
      channel: undefined,
      disconnect: jest.fn(),
      kill: jest.fn(),
      ref: jest.fn(),
      unref: jest.fn(),
      send: jest.fn(),
      on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
        if (!events[event]) {
          events[event] = [];
        }
        events[event].push(callback);
        return mockChild;
      }),
      addListener: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn(),
      listeners: jest.fn(),
      rawListeners: jest.fn(),
      emit: jest.fn((event: string, ...args: unknown[]) => {
        if (events[event]) {
          events[event].forEach((callback) => callback(...args));
        }
        return false;
      }),
      listenerCount: jest.fn(),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
      eventNames: jest.fn(),
    };

    mockStdout.on = jest.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        if (!events[`stdout_${event}`]) {
          events[`stdout_${event}`] = [];
        }
        events[`stdout_${event}`].push(callback);
        return mockStdout;
      },
    );

    mockStderr.on = jest.fn(
      (event: string, callback: (...args: unknown[]) => void) => {
        if (!events[`stderr_${event}`]) {
          events[`stderr_${event}`] = [];
        }
        events[`stderr_${event}`].push(callback);
        return mockStderr;
      },
    );

    (
      mockStdout as unknown as {
        emit: (event: string, ...args: unknown[]) => void;
      }
    ).emit = (event: string, ...args: unknown[]) => {
      if (events[`stdout_${event}`]) {
        events[`stdout_${event}`].forEach((callback) => callback(...args));
      }
    };

    (
      mockStderr as unknown as {
        emit: (event: string, ...args: unknown[]) => void;
      }
    ).emit = (event: string, ...args: unknown[]) => {
      if (events[`stderr_${event}`]) {
        events[`stderr_${event}`].forEach((callback) => callback(...args));
      }
    };

    return mockChild as unknown as ChildProcess;
  }
});
