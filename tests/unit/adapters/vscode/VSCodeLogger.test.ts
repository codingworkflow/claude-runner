import { VSCodeLogger } from "../../../../src/adapters/vscode/VSCodeLogger";

describe("VSCodeLogger", () => {
  let logger: VSCodeLogger;
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
    debug: jest.SpyInstance;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    logger = new VSCodeLogger();
    consoleSpy = {
      log: jest.spyOn(console, "log").mockImplementation(),
      warn: jest.spyOn(console, "warn").mockImplementation(),
      error: jest.spyOn(console, "error").mockImplementation(),
      debug: jest.spyOn(console, "debug").mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("info", () => {
    it("should log info messages using console.log", () => {
      const message = "Info message";
      logger.info(message);

      expect(consoleSpy.log).toHaveBeenCalledWith(message);
    });

    it("should log info messages with additional arguments", () => {
      const message = "Info with args";
      const arg1 = { data: "test" };
      const arg2 = 42;
      logger.info(message, arg1, arg2);

      expect(consoleSpy.log).toHaveBeenCalledWith(message, arg1, arg2);
    });

    it("should handle empty additional arguments", () => {
      const message = "Info no args";
      logger.info(message);

      expect(consoleSpy.log).toHaveBeenCalledWith(message);
    });
  });

  describe("warn", () => {
    it("should log warning messages using console.warn", () => {
      const message = "Warning message";
      logger.warn(message);

      expect(consoleSpy.warn).toHaveBeenCalledWith(message);
    });

    it("should log warning messages with additional arguments", () => {
      const message = "Warning with args";
      const arg1 = "test-arg";
      const arg2 = { warning: true };
      logger.warn(message, arg1, arg2);

      expect(consoleSpy.warn).toHaveBeenCalledWith(message, arg1, arg2);
    });

    it("should handle multiple arguments of different types", () => {
      const message = "Complex warning";
      const args = [null, undefined, 0, false, [], {}];
      logger.warn(message, ...args);

      expect(consoleSpy.warn).toHaveBeenCalledWith(message, ...args);
    });
  });

  describe("error", () => {
    it("should log error messages using console.error", () => {
      const message = "Error message";
      logger.error(message);

      expect(consoleSpy.error).toHaveBeenCalledWith(message);
    });

    it("should log error messages with Error object", () => {
      const message = "Error with exception";
      const error = new Error("Test error");
      logger.error(message, error);

      expect(consoleSpy.error).toHaveBeenCalledWith(message, error);
    });

    it("should handle Error object with stack trace", () => {
      const message = "Stack trace error";
      const error = new Error("Error with stack");
      error.stack = "Error: Error with stack\n    at test";
      logger.error(message, error);

      expect(consoleSpy.error).toHaveBeenCalledWith(message, error);
    });

    it("should handle custom error types", () => {
      const message = "Custom error";
      const customError = new TypeError("Type error");
      logger.error(message, customError);

      expect(consoleSpy.error).toHaveBeenCalledWith(message, customError);
    });

    it("should handle undefined error parameter", () => {
      const message = "No error object";
      logger.error(message, undefined);

      expect(consoleSpy.error).toHaveBeenCalledWith(message);
    });
  });

  describe("debug", () => {
    it("should suppress debug messages in test environment", () => {
      const message = "Debug message";
      logger.debug(message);

      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it("should suppress debug messages with additional arguments in test environment", () => {
      const message = "Debug with data";
      const debugData = { userId: 123, action: "test" };
      const timestamp = Date.now();
      logger.debug(message, debugData, timestamp);

      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it("should suppress complex debug data structures in test environment", () => {
      const message = "Complex debug";
      const complexData = {
        nested: { deep: { value: "test" } },
        array: [1, 2, { item: "value" }],
        fn: () => "function",
      };
      logger.debug(message, complexData);

      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });
  });

  describe("log level functionality", () => {
    it("should call appropriate console methods for each log level", () => {
      // Clear previous mock calls
      jest.clearAllMocks();

      logger.info("info");
      logger.warn("warn");
      logger.error("error");
      logger.debug("debug");

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      // Debug is suppressed in test environment
      expect(consoleSpy.debug).toHaveBeenCalledTimes(0);
    });

    it("should not interfere between different log levels", () => {
      // Clear previous mock calls
      jest.clearAllMocks();

      logger.info("info message");
      logger.error("error message");

      expect(consoleSpy.log).toHaveBeenCalledWith("info message");
      expect(consoleSpy.error).toHaveBeenCalledWith("error message");
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });
  });

  describe("error handling and edge cases", () => {
    it("should handle empty string messages", () => {
      logger.info("");
      logger.warn("");
      logger.error("");
      logger.debug("");

      expect(consoleSpy.log).toHaveBeenCalledWith("");
      expect(consoleSpy.warn).toHaveBeenCalledWith("");
      expect(consoleSpy.error).toHaveBeenCalledWith("");
      // Debug is suppressed in test environment
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it("should handle special characters in messages", () => {
      const specialMessage = "Message with\nnewline\tand\ttabs";
      logger.info(specialMessage);

      expect(consoleSpy.log).toHaveBeenCalledWith(specialMessage);
    });

    it("should handle unicode characters", () => {
      const unicodeMessage = "Message with emoji 🚀 and unicode ñáéíóú";
      logger.warn(unicodeMessage);

      expect(consoleSpy.warn).toHaveBeenCalledWith(unicodeMessage);
    });

    it("should handle very long messages", () => {
      const longMessage = "A".repeat(10000);
      logger.debug(longMessage);

      // Debug is suppressed in test environment
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it("should handle circular reference objects gracefully", () => {
      const circular: { name: string; self?: unknown } = { name: "test" };
      circular.self = circular;

      logger.info("Circular reference", circular);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Circular reference",
        circular,
      );
    });
  });

  describe("console method fallback behavior", () => {
    it("should still work if console methods are redefined", () => {
      const mockLog = jest.fn();
      const originalLog = console.log;
      console.log = mockLog;

      logger.info("test message");

      expect(mockLog).toHaveBeenCalledWith("test message");

      // Restore original console.log
      console.log = originalLog;
    });

    it("should handle console method throwing errors", () => {
      consoleSpy.error.mockImplementation(() => {
        throw new Error("Console error");
      });

      expect(() => logger.error("test")).toThrow("Console error");
    });
  });

  describe("type safety", () => {
    it("should accept string messages", () => {
      expect(() => logger.info("string message")).not.toThrow();
    });

    it("should accept various argument types", () => {
      expect(() => {
        logger.debug("test", 1, true, null, undefined, [], {});
      }).not.toThrow();
    });

    it("should handle Error objects properly", () => {
      const error = new Error("test error");
      expect(() => logger.error("message", error)).not.toThrow();
    });
  });

  describe("environment detection", () => {
    it("should detect test environment correctly", () => {
      // In test environment, debug should be suppressed
      jest.clearAllMocks();
      logger.debug("test message");
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it("should handle production environment debug logging", () => {
      // Temporarily mock environment to simulate production
      const originalEnv = process.env.NODE_ENV;
      const originalJestWorker = process.env.JEST_WORKER_ID;
      const originalGlobal = (global as any).jest;

      try {
        process.env.NODE_ENV = "production";
        delete process.env.JEST_WORKER_ID;
        delete (global as any).jest;

        // Create a new logger instance to pick up the environment change
        const prodLogger = new VSCodeLogger();
        jest.clearAllMocks();

        const message = "Production debug message";
        prodLogger.debug(message);

        // In production, debug should be called
        expect(consoleSpy.debug).toHaveBeenCalledWith(message);
      } finally {
        // Restore environment
        process.env.NODE_ENV = originalEnv;
        if (originalJestWorker) {
          process.env.JEST_WORKER_ID = originalJestWorker;
        }
        if (originalGlobal) {
          (global as any).jest = originalGlobal;
        }
      }
    });
  });
});
