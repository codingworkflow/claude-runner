import { renderHook, act } from "@testing-library/react";
import { useVSCodeAPI } from "../../../../src/components/hooks/useVSCodeAPI";

interface MockVSCodeAPI {
  postMessage: jest.Mock;
}

describe("useVSCodeAPI", () => {
  let mockVSCodeAPI: MockVSCodeAPI;

  beforeEach(() => {
    mockVSCodeAPI = {
      postMessage: jest.fn(),
    };

    if (typeof window !== "undefined") {
      (window as unknown as { vscodeApi: MockVSCodeAPI }).vscodeApi =
        mockVSCodeAPI;
    }
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("VSCode API communication hook functionality", () => {
    it("should return all expected API methods", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      expect(typeof result.current.startInteractive).toBe("function");
      expect(typeof result.current.runTask).toBe("function");
      expect(typeof result.current.runTasks).toBe("function");
      expect(typeof result.current.cancelTask).toBe("function");
      expect(typeof result.current.updateModel).toBe("function");
      expect(typeof result.current.updateRootPath).toBe("function");
      expect(typeof result.current.updateAllowAllTools).toBe("function");
      expect(typeof result.current.updateActiveTab).toBe("function");
      expect(typeof result.current.updateChatPrompt).toBe("function");
      expect(typeof result.current.updateShowChatPrompt).toBe("function");
      expect(typeof result.current.updateOutputFormat).toBe("function");
      expect(typeof result.current.updateParallelTasksCount).toBe("function");
      expect(typeof result.current.savePipeline).toBe("function");
      expect(typeof result.current.loadPipeline).toBe("function");
      expect(typeof result.current.pipelineAddTask).toBe("function");
      expect(typeof result.current.pipelineRemoveTask).toBe("function");
      expect(typeof result.current.pipelineUpdateTaskField).toBe("function");
      expect(typeof result.current.requestUsageReport).toBe("function");
      expect(typeof result.current.requestLogProjects).toBe("function");
      expect(typeof result.current.requestLogConversations).toBe("function");
      expect(typeof result.current.requestLogConversation).toBe("function");
      expect(typeof result.current.recheckClaude).toBe("function");
      expect(typeof result.current.loadCommands).toBe("function");
      expect(typeof result.current.scanCommands).toBe("function");
      expect(typeof result.current.createCommand).toBe("function");
      expect(typeof result.current.openFile).toBe("function");
      expect(typeof result.current.editCommand).toBe("function");
      expect(typeof result.current.updateCommand).toBe("function");
      expect(typeof result.current.deleteCommand).toBe("function");
    });

    it("should handle missing vscodeApi gracefully", () => {
      if (typeof window !== "undefined") {
        (
          window as unknown as { vscodeApi: MockVSCodeAPI | undefined }
        ).vscodeApi = undefined;
      }

      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.startInteractive("test prompt");
      });

      expect(mockVSCodeAPI.postMessage).not.toHaveBeenCalled();
    });

    it("should send messages with correct command and data structure", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.updateModel("claude-3-sonnet");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateModel",
        model: "claude-3-sonnet",
      });
    });
  });

  describe("API message handling and routing", () => {
    it("should send startInteractive command with optional prompt", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.startInteractive("test prompt");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "startInteractive",
        prompt: "test prompt",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.startInteractive();
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "startInteractive",
        prompt: undefined,
      });
    });

    it("should send runTask command with task and output format", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.runTask("analyze code", "json");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "runTask",
        task: "analyze code",
        outputFormat: "json",
      });
    });

    it("should send runTasks command with tasks array and output format", () => {
      const { result } = renderHook(() => useVSCodeAPI());
      const tasks = [
        {
          id: "1",
          prompt: "task 1",
          resumePrevious: false,
          status: "pending" as const,
        },
        {
          id: "2",
          prompt: "task 2",
          resumePrevious: true,
          status: "running" as const,
        },
      ];

      act(() => {
        result.current.runTasks(tasks, "text");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "runTasks",
        tasks,
        outputFormat: "text",
      });
    });

    it("should send cancelTask command without data", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.cancelTask();
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "cancelTask",
      });
    });

    it("should send configuration update commands", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.updateRootPath("/workspace");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateRootPath",
        path: "/workspace",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.updateAllowAllTools(true);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateAllowAllTools",
        allow: true,
      });
    });

    it("should send UI state update commands", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.updateActiveTab("pipeline");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateActiveTab",
        tab: "pipeline",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.updateChatPrompt("test prompt");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateChatPrompt",
        prompt: "test prompt",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.updateShowChatPrompt(false);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateShowChatPrompt",
        show: false,
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.updateOutputFormat("json");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateOutputFormat",
        format: "json",
      });
    });

    it("should send pipeline operation commands", () => {
      const { result } = renderHook(() => useVSCodeAPI());
      const tasks = [
        {
          id: "1",
          prompt: "test task",
          resumePrevious: false,
          status: "pending" as const,
        },
      ];

      act(() => {
        result.current.savePipeline("test pipeline", "description", tasks);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "savePipeline",
        name: "test pipeline",
        description: "description",
        tasks,
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.loadPipeline("test pipeline");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "loadPipeline",
        name: "test pipeline",
      });
    });

    it("should send task modification commands", () => {
      const { result } = renderHook(() => useVSCodeAPI());
      const newTask = {
        id: "new-task",
        prompt: "new task prompt",
        resumePrevious: false,
        status: "pending" as const,
      };

      act(() => {
        result.current.pipelineAddTask(newTask);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "pipelineAddTask",
        newTask,
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.pipelineRemoveTask("task-id");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "pipelineRemoveTask",
        taskId: "task-id",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.pipelineUpdateTaskField(
          "task-id",
          "prompt",
          "updated prompt",
        );
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "pipelineUpdateTaskField",
        taskId: "task-id",
        field: "prompt",
        value: "updated prompt",
      });
    });

    it("should send usage report requests", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.requestUsageReport("today");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "requestUsageReport",
        period: "today",
        hours: undefined,
        startHour: undefined,
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.requestUsageReport("hourly", 24, 0);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "requestUsageReport",
        period: "hourly",
        hours: 24,
        startHour: 0,
      });
    });

    it("should send log operation commands", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.requestLogProjects();
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "requestLogProjects",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.requestLogConversations("project-name");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "requestLogConversations",
        projectName: "project-name",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.requestLogConversation("/path/to/log.json");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "requestLogConversation",
        filePath: "/path/to/log.json",
      });
    });

    it("should send command operation commands", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.loadCommands();
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "loadCommands",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.scanCommands("/workspace");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "scanCommands",
        rootPath: "/workspace",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.createCommand("test-command", true, "/workspace");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "createCommand",
        name: "test-command",
        isGlobal: true,
        rootPath: "/workspace",
      });
    });
  });

  describe("API error handling and recovery", () => {
    it("should handle postMessage errors gracefully", () => {
      mockVSCodeAPI.postMessage.mockImplementation(() => {
        throw new Error("postMessage failed");
      });

      const { result } = renderHook(() => useVSCodeAPI());

      expect(() => {
        act(() => {
          result.current.updateModel("claude-3-sonnet");
        });
      }).toThrow("postMessage failed");
    });

    it("should handle null vscodeApi", () => {
      if (typeof window !== "undefined") {
        (window as unknown as { vscodeApi: MockVSCodeAPI | null }).vscodeApi =
          null;
      }

      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.runTask("test", "text");
      });

      expect(mockVSCodeAPI.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("API state synchronization", () => {
    it("should maintain callback references across re-renders", () => {
      const { result, rerender } = renderHook(() => useVSCodeAPI());

      const firstRender = result.current;
      rerender();
      const secondRender = result.current;

      expect(firstRender.startInteractive).toBe(secondRender.startInteractive);
      expect(firstRender.runTask).toBe(secondRender.runTask);
      expect(firstRender.updateModel).toBe(secondRender.updateModel);
    });

    it("should update callback references when vscodeApi changes", () => {
      const { result, rerender } = renderHook(() => useVSCodeAPI());

      const firstCallbacks = result.current;

      if (typeof window !== "undefined") {
        (window as unknown as { vscodeApi: MockVSCodeAPI }).vscodeApi = {
          postMessage: jest.fn(),
        };
      }

      rerender();

      const secondCallbacks = result.current;

      expect(firstCallbacks.startInteractive).not.toBe(
        secondCallbacks.startInteractive,
      );
    });

    it("should handle rapid successive API calls", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.updateModel("claude-3-sonnet");
        result.current.updateRootPath("/workspace");
        result.current.updateAllowAllTools(true);
        result.current.updateActiveTab("pipeline");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledTimes(4);
      expect(mockVSCodeAPI.postMessage).toHaveBeenNthCalledWith(1, {
        command: "updateModel",
        model: "claude-3-sonnet",
      });
      expect(mockVSCodeAPI.postMessage).toHaveBeenNthCalledWith(2, {
        command: "updateRootPath",
        path: "/workspace",
      });
      expect(mockVSCodeAPI.postMessage).toHaveBeenNthCalledWith(3, {
        command: "updateAllowAllTools",
        allow: true,
      });
      expect(mockVSCodeAPI.postMessage).toHaveBeenNthCalledWith(4, {
        command: "updateActiveTab",
        tab: "pipeline",
      });
    });
  });

  describe("API performance and optimization", () => {
    it("should use useCallback for all returned functions", () => {
      const { result, rerender } = renderHook(() => useVSCodeAPI());

      const initialCallbacks = { ...result.current };

      rerender();

      Object.keys(initialCallbacks).forEach((key) => {
        expect(result.current[key as keyof typeof result.current]).toBe(
          initialCallbacks[key as keyof typeof initialCallbacks],
        );
      });
    });

    it("should handle concurrent API calls without interference", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      const promise1 = Promise.resolve().then(() => {
        act(() => {
          result.current.updateModel("claude-3-sonnet");
        });
      });

      const promise2 = Promise.resolve().then(() => {
        act(() => {
          result.current.updateActiveTab("chat");
        });
      });

      return Promise.all([promise1, promise2]).then(() => {
        expect(mockVSCodeAPI.postMessage).toHaveBeenCalledTimes(2);
      });
    });

    it("should handle complex task objects efficiently", () => {
      const { result } = renderHook(() => useVSCodeAPI());
      const complexTask = {
        id: "complex-task",
        name: "Complex Task",
        prompt: "This is a complex task with many properties",
        resumePrevious: true,
        status: "pending" as const,
        results: "Previous results",
        sessionId: "session-123",
        model: "claude-3-sonnet",
        dependsOn: ["task1", "task2"],
        continueFrom: "checkpoint-1",
        pausedUntil: Date.now() + 3600000,
        check: "status check",
        condition: "on_success" as const,
        skipReason: "dependency failed",
      };

      act(() => {
        result.current.pipelineAddTask(complexTask);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "pipelineAddTask",
        newTask: complexTask,
      });
    });

    it("should handle large task arrays efficiently", () => {
      const { result } = renderHook(() => useVSCodeAPI());
      const largeTasks = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        prompt: `Task ${i} prompt`,
        resumePrevious: false,
        status: "pending" as const,
      }));

      act(() => {
        result.current.runTasks(largeTasks, "json");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "runTasks",
        tasks: largeTasks,
        outputFormat: "json",
      });
    });

    it("should handle edge case values correctly", () => {
      const { result } = renderHook(() => useVSCodeAPI());

      act(() => {
        result.current.updateParallelTasksCount(0);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateParallelTasksCount",
        value: 0,
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.updateChatPrompt("");
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "updateChatPrompt",
        prompt: "",
      });

      mockVSCodeAPI.postMessage.mockClear();

      act(() => {
        result.current.recheckClaude();
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: "recheckClaude",
        shell: undefined,
      });
    });

    it("should handle command file objects correctly", () => {
      const { result } = renderHook(() => useVSCodeAPI());
      const commandFile = {
        name: "test-command",
        path: "/workspace/.claude/commands/test-command.md",
        content: "# Test Command\n\nThis is a test command.",
        description: "A test command for demonstration",
        allowedTools: ["bash", "read", "write"],
        isProject: true,
      };

      act(() => {
        result.current.updateCommand(commandFile);
      });

      expect(mockVSCodeAPI.postMessage).toHaveBeenCalledWith({
        command: commandFile,
      });
    });
  });
});
