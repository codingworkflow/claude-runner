import {
  createDataHandler,
  createErrorHandler,
  ResponseHandler,
} from "../../../src/utils/responseHandlers";

describe("responseHandlers", () => {
  let mockPostMessage: jest.MockedFunction<
    (message: Record<string, unknown>) => void
  >;

  beforeEach(() => {
    mockPostMessage = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("ResponseHandler interface", () => {
    it("should define postMessage method signature", () => {
      const handler: ResponseHandler = {
        postMessage: mockPostMessage,
      };

      expect(typeof handler.postMessage).toBe("function");
    });
  });

  describe("createDataHandler", () => {
    describe("response processing and formatting", () => {
      it("should create handler that formats data messages correctly", () => {
        const handler = createDataHandler("test", mockPostMessage);
        const testData = { key: "value" };

        handler(testData);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testData",
          data: testData,
        });
      });

      it("should append 'Data' suffix to command name", () => {
        const handler = createDataHandler("execute", mockPostMessage);

        handler("test");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "executeData",
          data: "test",
        });
      });

      it("should handle empty command string", () => {
        const handler = createDataHandler("", mockPostMessage);

        handler("data");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "Data",
          data: "data",
        });
      });
    });

    describe("response validation and sanitization", () => {
      it("should handle null data", () => {
        const handler = createDataHandler("test", mockPostMessage);

        handler(null);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testData",
          data: null,
        });
      });

      it("should handle undefined data", () => {
        const handler = createDataHandler("test", mockPostMessage);

        handler(undefined);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testData",
          data: undefined,
        });
      });

      it("should handle boolean data", () => {
        const handler = createDataHandler("test", mockPostMessage);

        handler(true);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testData",
          data: true,
        });
      });

      it("should handle number data", () => {
        const handler = createDataHandler("test", mockPostMessage);

        handler(42);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testData",
          data: 42,
        });
      });

      it("should handle string data", () => {
        const handler = createDataHandler("test", mockPostMessage);

        handler("hello world");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testData",
          data: "hello world",
        });
      });
    });

    describe("response transformation and mapping", () => {
      it("should handle complex object data", () => {
        const handler = createDataHandler("complex", mockPostMessage);
        const complexData = {
          nested: { value: 123 },
          array: [1, 2, 3],
          func: () => "test",
        };

        handler(complexData);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "complexData",
          data: complexData,
        });
      });

      it("should handle array data", () => {
        const handler = createDataHandler("list", mockPostMessage);
        const arrayData = ["item1", "item2", "item3"];

        handler(arrayData);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "listData",
          data: arrayData,
        });
      });

      it("should preserve data types without transformation", () => {
        const handler = createDataHandler("preserve", mockPostMessage);
        const testCases = [
          { input: 0, expected: 0 },
          { input: "", expected: "" },
          { input: false, expected: false },
          { input: [], expected: [] },
          { input: {}, expected: {} },
        ];

        testCases.forEach(({ input, expected }, index) => {
          handler(input);

          expect(mockPostMessage).toHaveBeenNthCalledWith(index + 1, {
            command: "preserveData",
            data: expected,
          });
        });
      });
    });

    describe("response caching and optimization", () => {
      it("should create new handler instance for each call", () => {
        const handler1 = createDataHandler("test", mockPostMessage);
        const handler2 = createDataHandler("test", mockPostMessage);

        expect(handler1).not.toBe(handler2);
      });

      it("should maintain command context across multiple invocations", () => {
        const handler = createDataHandler("persistent", mockPostMessage);

        handler("first");
        handler("second");
        handler("third");

        expect(mockPostMessage).toHaveBeenCalledTimes(3);
        expect(mockPostMessage).toHaveBeenNthCalledWith(1, {
          command: "persistentData",
          data: "first",
        });
        expect(mockPostMessage).toHaveBeenNthCalledWith(2, {
          command: "persistentData",
          data: "second",
        });
        expect(mockPostMessage).toHaveBeenNthCalledWith(3, {
          command: "persistentData",
          data: "third",
        });
      });

      it("should handle rapid successive calls efficiently", () => {
        const handler = createDataHandler("rapid", mockPostMessage);
        const dataItems = Array.from({ length: 100 }, (_, i) => `item${i}`);

        dataItems.forEach((item) => handler(item));

        expect(mockPostMessage).toHaveBeenCalledTimes(100);
        expect(mockPostMessage).toHaveBeenLastCalledWith({
          command: "rapidData",
          data: "item99",
        });
      });
    });

    describe("response error handling and fallbacks", () => {
      it("should handle postMessage failures gracefully", () => {
        const failingPostMessage = jest.fn().mockImplementation(() => {
          throw new Error("PostMessage failed");
        });
        const handler = createDataHandler("failing", failingPostMessage);

        expect(() => handler("test")).toThrow("PostMessage failed");
        expect(failingPostMessage).toHaveBeenCalledWith({
          command: "failingData",
          data: "test",
        });
      });

      it("should not modify original postMessage function", () => {
        const originalFn = jest.fn();
        createDataHandler("test", originalFn);

        expect(originalFn).not.toHaveBeenCalled();
      });

      it("should handle special characters in command names", () => {
        const handler = createDataHandler("test-command_123", mockPostMessage);

        handler("data");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "test-command_123Data",
          data: "data",
        });
      });
    });
  });

  describe("createErrorHandler", () => {
    describe("response processing and formatting", () => {
      it("should create handler that formats error messages correctly", () => {
        const handler = createErrorHandler("test", mockPostMessage);

        handler("Something went wrong");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testError",
          error: "Something went wrong",
        });
      });

      it("should append 'Error' suffix to command name", () => {
        const handler = createErrorHandler("execute", mockPostMessage);

        handler("Execution failed");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "executeError",
          error: "Execution failed",
        });
      });

      it("should handle empty command string", () => {
        const handler = createErrorHandler("", mockPostMessage);

        handler("error message");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "Error",
          error: "error message",
        });
      });
    });

    describe("response validation and sanitization", () => {
      it("should handle empty error messages", () => {
        const handler = createErrorHandler("test", mockPostMessage);

        handler("");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testError",
          error: "",
        });
      });

      it("should handle multiline error messages", () => {
        const handler = createErrorHandler("test", mockPostMessage);
        const multilineError = "Line 1\nLine 2\nLine 3";

        handler(multilineError);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testError",
          error: multilineError,
        });
      });

      it("should handle error messages with special characters", () => {
        const handler = createErrorHandler("test", mockPostMessage);
        const specialError =
          'Error: {"code": 500, "message": "Internal Server Error"}';

        handler(specialError);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testError",
          error: specialError,
        });
      });

      it("should handle very long error messages", () => {
        const handler = createErrorHandler("test", mockPostMessage);
        const longError = "x".repeat(1000);

        handler(longError);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "testError",
          error: longError,
        });
      });
    });

    describe("response transformation and mapping", () => {
      it("should preserve error message without transformation", () => {
        const handler = createErrorHandler("preserve", mockPostMessage);
        const originalError = "Original error message";

        handler(originalError);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "preserveError",
          error: originalError,
        });
      });

      it("should handle error messages with unicode characters", () => {
        const handler = createErrorHandler("unicode", mockPostMessage);
        const unicodeError = "Error: 操作失败 🚫";

        handler(unicodeError);

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "unicodeError",
          error: unicodeError,
        });
      });
    });

    describe("response caching and optimization", () => {
      it("should create new handler instance for each call", () => {
        const handler1 = createErrorHandler("test", mockPostMessage);
        const handler2 = createErrorHandler("test", mockPostMessage);

        expect(handler1).not.toBe(handler2);
      });

      it("should maintain command context across multiple error reports", () => {
        const handler = createErrorHandler("persistent", mockPostMessage);

        handler("Error 1");
        handler("Error 2");
        handler("Error 3");

        expect(mockPostMessage).toHaveBeenCalledTimes(3);
        expect(mockPostMessage).toHaveBeenNthCalledWith(1, {
          command: "persistentError",
          error: "Error 1",
        });
        expect(mockPostMessage).toHaveBeenNthCalledWith(2, {
          command: "persistentError",
          error: "Error 2",
        });
        expect(mockPostMessage).toHaveBeenNthCalledWith(3, {
          command: "persistentError",
          error: "Error 3",
        });
      });

      it("should handle rapid error reporting efficiently", () => {
        const handler = createErrorHandler("rapid", mockPostMessage);
        const errors = Array.from({ length: 50 }, (_, i) => `Error ${i}`);

        errors.forEach((error) => handler(error));

        expect(mockPostMessage).toHaveBeenCalledTimes(50);
        expect(mockPostMessage).toHaveBeenLastCalledWith({
          command: "rapidError",
          error: "Error 49",
        });
      });
    });

    describe("response error handling and fallbacks", () => {
      it("should handle postMessage failures during error reporting", () => {
        const failingPostMessage = jest.fn().mockImplementation(() => {
          throw new Error("PostMessage failed");
        });
        const handler = createErrorHandler("failing", failingPostMessage);

        expect(() => handler("Original error")).toThrow("PostMessage failed");
        expect(failingPostMessage).toHaveBeenCalledWith({
          command: "failingError",
          error: "Original error",
        });
      });

      it("should not modify original postMessage function", () => {
        const originalFn = jest.fn();
        createErrorHandler("test", originalFn);

        expect(originalFn).not.toHaveBeenCalled();
      });

      it("should handle special characters in command names", () => {
        const handler = createErrorHandler(
          "error-handler_456",
          mockPostMessage,
        );

        handler("test error");

        expect(mockPostMessage).toHaveBeenCalledWith({
          command: "error-handler_456Error",
          error: "test error",
        });
      });
    });
  });

  describe("handler integration scenarios", () => {
    it("should allow both data and error handlers for same command", () => {
      const dataHandler = createDataHandler("operation", mockPostMessage);
      const errorHandler = createErrorHandler("operation", mockPostMessage);

      dataHandler("success data");
      errorHandler("failure message");

      expect(mockPostMessage).toHaveBeenCalledTimes(2);
      expect(mockPostMessage).toHaveBeenNthCalledWith(1, {
        command: "operationData",
        data: "success data",
      });
      expect(mockPostMessage).toHaveBeenNthCalledWith(2, {
        command: "operationError",
        error: "failure message",
      });
    });

    it("should maintain isolation between different command handlers", () => {
      const handler1 = createDataHandler("cmd1", mockPostMessage);
      const handler2 = createDataHandler("cmd2", mockPostMessage);

      handler1("data1");
      handler2("data2");

      expect(mockPostMessage).toHaveBeenCalledTimes(2);
      expect(mockPostMessage).toHaveBeenNthCalledWith(1, {
        command: "cmd1Data",
        data: "data1",
      });
      expect(mockPostMessage).toHaveBeenNthCalledWith(2, {
        command: "cmd2Data",
        data: "data2",
      });
    });

    it("should work with different postMessage implementations", () => {
      const postMessage1 = jest.fn();
      const postMessage2 = jest.fn();

      const handler1 = createDataHandler("test", postMessage1);
      const handler2 = createErrorHandler("test", postMessage2);

      handler1("data");
      handler2("error");

      expect(postMessage1).toHaveBeenCalledWith({
        command: "testData",
        data: "data",
      });
      expect(postMessage2).toHaveBeenCalledWith({
        command: "testError",
        error: "error",
      });
      expect(postMessage1).not.toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.anything(),
        }),
      );
      expect(postMessage2).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.anything(),
        }),
      );
    });
  });
});
