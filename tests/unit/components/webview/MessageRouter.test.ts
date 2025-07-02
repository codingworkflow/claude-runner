import { MessageRouter } from "../../../../src/components/webview/MessageRouter";
import {
  RunnerCommand,
  RunnerCommandRegistry,
} from "../../../../src/types/runner";

describe("MessageRouter", () => {
  let router: MessageRouter;
  let mockHandler: jest.Mock;
  let consoleSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    router = new MessageRouter();
    mockHandler = jest.fn();
    consoleSpy = jest.spyOn(console, "error").mockImplementation();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("register", () => {
    it("should register a handler for a command type", () => {
      router.register("getInitialState", mockHandler);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should register multiple handlers for different command types", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      router.register("getInitialState", handler1);
      router.register("runTask", handler2);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it("should overwrite existing handler when registering same command type", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      router.register("getInitialState", handler1);
      router.register("getInitialState", handler2);

      const message = { command: "getInitialState" };
      router.route(message);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe("route", () => {
    describe("message routing functionality", () => {
      it("should route valid message to registered handler", async () => {
        router.register("getInitialState", mockHandler);

        const message = { command: "getInitialState" };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({ kind: "getInitialState" });
      });

      it("should route messages with parameters to handler", async () => {
        router.register("runTask", mockHandler);

        const message = {
          command: "runTask",
          task: "test task",
          outputFormat: "json",
        };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({
          kind: "runTask",
          task: "test task",
          outputFormat: "json",
        });
      });

      it("should handle async handlers correctly", async () => {
        const asyncHandler = jest.fn().mockResolvedValue(undefined);
        router.register("cancelTask", asyncHandler);

        const message = { command: "cancelTask" };
        await router.route(message);

        expect(asyncHandler).toHaveBeenCalledWith({ kind: "cancelTask" });
      });

      it("should handle multiple sequential messages", async () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        router.register("getInitialState", handler1);
        router.register("cancelTask", handler2);

        await router.route({ command: "getInitialState" });
        await router.route({ command: "cancelTask" });

        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
      });
    });

    describe("message validation and sanitization", () => {
      it("should validate message with required parameters", async () => {
        router.register("runTask", mockHandler);

        const message = { command: "runTask", task: "test task" };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({
          kind: "runTask",
          task: "test task",
          outputFormat: undefined,
        });
      });

      it("should sanitize invalid parameters to defaults", async () => {
        router.register("runTask", mockHandler);

        const message = {
          command: "runTask",
          task: 123,
          outputFormat: "invalid",
        };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({
          kind: "runTask",
          task: "",
          outputFormat: undefined,
        });
      });

      it("should handle missing required parameters", async () => {
        router.register("updateModel", mockHandler);

        const message = { command: "updateModel" };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({
          kind: "updateModel",
          model: "",
        });
      });

      it("should validate boolean parameters", async () => {
        router.register("updateAllowAllTools", mockHandler);

        const message = { command: "updateAllowAllTools", allow: "true" };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({
          kind: "updateAllowAllTools",
          allow: false,
        });
      });

      it("should validate array parameters", async () => {
        router.register("runTasks", mockHandler);

        const message = {
          command: "runTasks",
          tasks: [{ id: "1", prompt: "test" }],
        };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({
          kind: "runTasks",
          tasks: [{ id: "1", prompt: "test" }],
          outputFormat: undefined,
        });
      });

      it("should handle invalid array parameters", async () => {
        router.register("runTasks", mockHandler);

        const message = { command: "runTasks", tasks: "not an array" };
        await router.route(message);

        expect(mockHandler).toHaveBeenCalledWith({
          kind: "runTasks",
          tasks: [],
          outputFormat: undefined,
        });
      });
    });

    describe("message handling and processing", () => {
      it("should warn when no handler is registered for command", async () => {
        const message = { command: "getInitialState" };
        await router.route(message);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          "Unknown command:",
          "getInitialState",
        );
      });

      it("should not call handler when command is unregistered", async () => {
        const message = { command: "getInitialState" };
        await router.route(message);

        expect(mockHandler).not.toHaveBeenCalled();
      });

      it("should handle handler throwing sync error", async () => {
        const errorHandler = jest.fn().mockImplementation(() => {
          throw new Error("Handler error");
        });
        router.register("getInitialState", errorHandler);

        const message = { command: "getInitialState" };
        await router.route(message);

        expect(consoleSpy).toHaveBeenCalledWith(
          "Error routing message:",
          expect.any(Error),
        );
      });

      it("should handle handler throwing async error", async () => {
        const errorHandler = jest
          .fn()
          .mockRejectedValue(new Error("Async handler error"));
        router.register("getInitialState", errorHandler);

        const message = { command: "getInitialState" };
        await router.route(message);

        expect(consoleSpy).toHaveBeenCalledWith(
          "Error routing message:",
          expect.any(Error),
        );
      });
    });

    describe("router error handling and fallbacks", () => {
      it("should handle invalid message format gracefully", async () => {
        const invalidMessage = null as unknown as Record<string, unknown>;
        await router.route(invalidMessage);

        expect(consoleSpy).toHaveBeenCalledWith(
          "Error routing message:",
          expect.any(Error),
        );
      });

      it("should handle empty message object", async () => {
        const message = {};
        await router.route(message);

        expect(consoleSpy).toHaveBeenCalledWith(
          "Error routing message:",
          expect.any(Error),
        );
      });

      it("should handle unknown command gracefully", async () => {
        const message = { command: "unknownCommand" };
        await router.route(message);

        expect(consoleSpy).toHaveBeenCalledWith(
          "Error routing message:",
          expect.any(Error),
        );
      });

      it("should continue processing after error", async () => {
        router.register("getInitialState", mockHandler);

        // First message causes error
        await router.route({ command: "unknownCommand" });
        expect(consoleSpy).toHaveBeenCalled();

        // Second message should still work
        await router.route({ command: "getInitialState" });
        expect(mockHandler).toHaveBeenCalledWith({ kind: "getInitialState" });
      });
    });
  });

  describe("fromLegacyMessage", () => {
    it("should convert valid legacy message to RunnerCommand", () => {
      const message = { command: "getInitialState" };
      const result = router.fromLegacyMessage(message);

      expect(result).toEqual({ kind: "getInitialState" });
    });

    it("should throw error for unknown command", () => {
      const message = { command: "unknownCommand" };

      expect(() => router.fromLegacyMessage(message)).toThrow(
        "Unknown or invalid command: unknownCommand",
      );
    });

    it("should throw error for missing command", () => {
      const message = {};

      expect(() => router.fromLegacyMessage(message)).toThrow(
        "Unknown or invalid command: undefined",
      );
    });

    it("should throw error for null command", () => {
      const message = { command: null };

      expect(() => router.fromLegacyMessage(message)).toThrow(
        "Unknown or invalid command: null",
      );
    });

    it("should validate and transform message parameters", () => {
      const message = {
        command: "runTask",
        task: "test task",
        outputFormat: "json",
      };
      const result = router.fromLegacyMessage(message);

      expect(result).toEqual({
        kind: "runTask",
        task: "test task",
        outputFormat: "json",
      });
    });

    it("should handle complex message with nested data", () => {
      const message = {
        command: "savePipeline",
        name: "Test Pipeline",
        description: "Test Description",
        tasks: [{ id: "1", prompt: "test task" }],
      };
      const result = router.fromLegacyMessage(message);

      expect(result).toEqual({
        kind: "savePipeline",
        name: "Test Pipeline",
        description: "Test Description",
        tasks: [{ id: "1", prompt: "test task" }],
      });
    });
  });

  describe("route registration and management", () => {
    it("should allow registering handlers for all command types", () => {
      const handlers = new Map<RunnerCommand["kind"], jest.Mock>();

      // Register handlers for all command types
      Object.keys(RunnerCommandRegistry).forEach((kind) => {
        const handler = jest.fn();
        handlers.set(kind as RunnerCommand["kind"], handler);
        router.register(kind as RunnerCommand["kind"], handler);
      });

      expect(handlers.size).toBeGreaterThan(0);
    });

    it("should handle type-safe command registration", async () => {
      // This test ensures the TypeScript types are working correctly
      const runTaskHandler = jest.fn((command) => {
        // command should be typed as RunTask command
        expect(command.kind).toBe("runTask");
        if (command.kind === "runTask") {
          expect(typeof command.task).toBe("string");
        }
      });

      const updateModelHandler = jest.fn((command) => {
        // command should be typed as UpdateModel command
        expect(command.kind).toBe("updateModel");
        if (command.kind === "updateModel") {
          expect(typeof command.model).toBe("string");
        }
      });

      router.register("runTask", runTaskHandler);
      router.register("updateModel", updateModelHandler);

      await router.route({ command: "runTask", task: "test" });
      await router.route({ command: "updateModel", model: "gpt-4" });

      expect(runTaskHandler).toHaveBeenCalled();
      expect(updateModelHandler).toHaveBeenCalled();
    });

    it("should support handler replacement", async () => {
      const originalHandler = jest.fn();
      const replacementHandler = jest.fn();

      router.register("getInitialState", originalHandler);
      router.register("getInitialState", replacementHandler);

      const message = { command: "getInitialState" };
      await router.route(message);

      expect(originalHandler).not.toHaveBeenCalled();
      expect(replacementHandler).toHaveBeenCalledWith({
        kind: "getInitialState",
      });
    });
  });
});
