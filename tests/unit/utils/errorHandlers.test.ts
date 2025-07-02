// Mock vscode module
const mockShowErrorMessage = jest.fn();
jest.mock("vscode", () => ({
  window: {
    showErrorMessage: mockShowErrorMessage,
  },
}));

import {
  handleUnexpectedError,
  ErrorContext,
} from "../../../src/utils/errorHandlers";

describe("errorHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handleUnexpectedError", () => {
    it("should handle Error instances correctly", () => {
      const error = new Error("Test error message");
      const mockPostMessage = jest.fn();
      const context: ErrorContext = {
        source: "TestSource",
        postMessage: mockPostMessage,
      };

      handleUnexpectedError(error, context);

      expect(mockPostMessage).toHaveBeenCalledWith({
        command: "error",
        error: "Test error message",
      });
      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        "TestSource encountered an error: Test error message",
      );
    });

    it("should handle non-Error instances with fallback message", () => {
      const error = "String error";
      const mockPostMessage = jest.fn();
      const context: ErrorContext = {
        source: "TestSource",
        postMessage: mockPostMessage,
      };

      handleUnexpectedError(error, context);

      expect(mockPostMessage).toHaveBeenCalledWith({
        command: "error",
        error: "Unknown error occurred",
      });
      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        "TestSource encountered an error: Unknown error occurred",
      );
    });

    it("should show notification by default", () => {
      const error = new Error("Default notification");
      const context: ErrorContext = {
        source: "DefaultTest",
      };

      handleUnexpectedError(error, context);

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        "DefaultTest encountered an error: Default notification",
      );
    });

    it("should skip notification when showNotification is false", () => {
      const error = new Error("No notification");
      const context: ErrorContext = {
        source: "NoNotificationTest",
        showNotification: false,
      };

      handleUnexpectedError(error, context);

      expect(mockShowErrorMessage).not.toHaveBeenCalled();
    });

    it("should handle postMessage failures gracefully", () => {
      const error = new Error("PostMessage failure test");
      const mockPostMessage = jest.fn().mockImplementation(() => {
        throw new Error("PostMessage failed");
      });
      const context: ErrorContext = {
        source: "PostMessageFailureTest",
        postMessage: mockPostMessage,
      };

      // Should not throw when postMessage fails
      expect(() => handleUnexpectedError(error, context)).not.toThrow();

      // Other channels should still work
      expect(mockShowErrorMessage).toHaveBeenCalled();
    });

    it("should handle circular reference errors without crashing", () => {
      const circularObj: { message: string; self?: unknown } = {
        message: "Circular error",
      };
      circularObj.self = circularObj;

      const context: ErrorContext = {
        source: "CircularTest",
      };

      // Should not throw on circular references
      expect(() => handleUnexpectedError(circularObj, context)).not.toThrow();
    });

    it("should work with minimal context", () => {
      const error = new Error("Missing source test");
      const context: ErrorContext = {
        source: "",
      };

      expect(() => handleUnexpectedError(error, context)).not.toThrow();
      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        " encountered an error: Missing source test",
      );
    });
  });
});
