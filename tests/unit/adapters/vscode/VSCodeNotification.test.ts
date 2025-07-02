import * as vscode from "vscode";
import { VSCodeNotification } from "../../../../src/adapters/vscode/VSCodeNotification";
import { IProgress } from "../../../../src/core/interfaces/INotification";

jest.mock("vscode");

describe("VSCodeNotification", () => {
  let notification: VSCodeNotification;
  let mockVSCode: {
    showInformationMessage: jest.Mock;
    showWarningMessage: jest.Mock;
    showErrorMessage: jest.Mock;
    withProgress: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    notification = new VSCodeNotification();
    mockVSCode = {
      showInformationMessage: vscode.window.showInformationMessage as jest.Mock,
      showWarningMessage: vscode.window.showWarningMessage as jest.Mock,
      showErrorMessage: vscode.window.showErrorMessage as jest.Mock,
      withProgress: vscode.window.withProgress as jest.Mock,
    };
  });

  describe("showInfo", () => {
    it("should display information message", async () => {
      const message = "Test info message";

      await notification.showInfo(message);

      expect(mockVSCode.showInformationMessage).toHaveBeenCalledWith(message);
      expect(mockVSCode.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it("should handle empty string message", async () => {
      await notification.showInfo("");

      expect(mockVSCode.showInformationMessage).toHaveBeenCalledWith("");
    });

    it("should handle special characters in message", async () => {
      const specialMessage = "Message with\nnewlines\tand\ttabs";

      await notification.showInfo(specialMessage);

      expect(mockVSCode.showInformationMessage).toHaveBeenCalledWith(
        specialMessage,
      );
    });

    it("should handle long messages", async () => {
      const longMessage = "A".repeat(1000);

      await notification.showInfo(longMessage);

      expect(mockVSCode.showInformationMessage).toHaveBeenCalledWith(
        longMessage,
      );
    });

    it("should not await VSCode API call", async () => {
      mockVSCode.showInformationMessage.mockResolvedValue("OK");

      await expect(notification.showInfo("test")).resolves.toBeUndefined();
    });
  });

  describe("showWarning", () => {
    it("should display warning message", async () => {
      const message = "Test warning message";

      await notification.showWarning(message);

      expect(mockVSCode.showWarningMessage).toHaveBeenCalledWith(message);
      expect(mockVSCode.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it("should handle empty string message", async () => {
      await notification.showWarning("");

      expect(mockVSCode.showWarningMessage).toHaveBeenCalledWith("");
    });

    it("should handle unicode characters", async () => {
      const unicodeMessage = "Warning with emoji 🚨 and unicode ñáéíóú";

      await notification.showWarning(unicodeMessage);

      expect(mockVSCode.showWarningMessage).toHaveBeenCalledWith(
        unicodeMessage,
      );
    });
  });

  describe("showError", () => {
    it("should display error message", async () => {
      const message = "Test error message";

      await notification.showError(message);

      expect(mockVSCode.showErrorMessage).toHaveBeenCalledWith(message);
      expect(mockVSCode.showErrorMessage).toHaveBeenCalledTimes(1);
    });

    it("should handle empty string message", async () => {
      await notification.showError("");

      expect(mockVSCode.showErrorMessage).toHaveBeenCalledWith("");
    });

    it("should handle error messages with technical details", async () => {
      const errorMessage =
        "Operation failed: TypeError: Cannot read property 'value' of undefined";

      await notification.showError(errorMessage);

      expect(mockVSCode.showErrorMessage).toHaveBeenCalledWith(errorMessage);
    });
  });

  describe("showProgress", () => {
    let mockProgress: {
      report: jest.Mock;
    };

    beforeEach(() => {
      mockProgress = {
        report: jest.fn(),
      };
      mockVSCode.withProgress.mockImplementation((options, callback) => {
        return callback(mockProgress);
      });
    });

    it("should display progress notification with correct configuration", async () => {
      const title = "Processing task";
      const task = jest.fn().mockResolvedValue("result");

      await notification.showProgress(title, task);

      expect(mockVSCode.withProgress).toHaveBeenCalledWith(
        {
          location: vscode.ProgressLocation.Notification,
          title,
          cancellable: false,
        },
        expect.any(Function),
      );
    });

    it("should execute task with progress wrapper", async () => {
      const title = "Test progress";
      const task = jest.fn().mockResolvedValue("task result");

      const result = await notification.showProgress(title, task);

      expect(task).toHaveBeenCalledWith(
        expect.objectContaining({
          report: expect.any(Function),
        }),
      );
      expect(result).toBe("task result");
    });

    it("should return task result", async () => {
      const title = "Test task";
      const expectedResult = { data: "test" };
      const task = jest.fn().mockResolvedValue(expectedResult);

      const result = await notification.showProgress(title, task);

      expect(result).toEqual(expectedResult);
    });

    it("should handle task rejection", async () => {
      const title = "Failing task";
      const error = new Error("Task failed");
      const task = jest.fn().mockRejectedValue(error);

      await expect(notification.showProgress(title, task)).rejects.toThrow(
        "Task failed",
      );
    });

    it("should handle empty title", async () => {
      const task = jest.fn().mockResolvedValue("result");

      await notification.showProgress("", task);

      expect(mockVSCode.withProgress).toHaveBeenCalledWith(
        expect.objectContaining({ title: "" }),
        expect.any(Function),
      );
    });

    describe("VSCodeProgress wrapper", () => {
      it("should report progress with value and message", async () => {
        const task = async (progress: IProgress) => {
          progress.report(50, "Half complete");
          return "done";
        };

        await notification.showProgress("Test", task);

        expect(mockProgress.report).toHaveBeenCalledWith({
          increment: 50,
          message: "Half complete",
        });
      });

      it("should report progress with value only", async () => {
        const task = async (progress: IProgress) => {
          progress.report(25);
          return "done";
        };

        await notification.showProgress("Test", task);

        expect(mockProgress.report).toHaveBeenCalledWith({
          increment: 25,
          message: undefined,
        });
      });

      it("should handle multiple progress reports", async () => {
        const task = async (progress: IProgress) => {
          progress.report(10, "Starting");
          progress.report(50, "In progress");
          progress.report(100, "Complete");
          return "finished";
        };

        await notification.showProgress("Multi-step task", task);

        expect(mockProgress.report).toHaveBeenCalledTimes(3);
        expect(mockProgress.report).toHaveBeenNthCalledWith(1, {
          increment: 10,
          message: "Starting",
        });
        expect(mockProgress.report).toHaveBeenNthCalledWith(2, {
          increment: 50,
          message: "In progress",
        });
        expect(mockProgress.report).toHaveBeenNthCalledWith(3, {
          increment: 100,
          message: "Complete",
        });
      });

      it("should handle zero progress value", async () => {
        const task = async (progress: IProgress) => {
          progress.report(0, "Initializing");
          return "done";
        };

        await notification.showProgress("Test", task);

        expect(mockProgress.report).toHaveBeenCalledWith({
          increment: 0,
          message: "Initializing",
        });
      });

      it("should handle negative progress value", async () => {
        const task = async (progress: IProgress) => {
          progress.report(-10, "Rewinding");
          return "done";
        };

        await notification.showProgress("Test", task);

        expect(mockProgress.report).toHaveBeenCalledWith({
          increment: -10,
          message: "Rewinding",
        });
      });

      it("should handle progress with empty message", async () => {
        const task = async (progress: IProgress) => {
          progress.report(75, "");
          return "done";
        };

        await notification.showProgress("Test", task);

        expect(mockProgress.report).toHaveBeenCalledWith({
          increment: 75,
          message: "",
        });
      });
    });
  });

  describe("notification types and severity levels", () => {
    it("should use correct VSCode API methods for different severity levels", async () => {
      await notification.showInfo("info");
      await notification.showWarning("warning");
      await notification.showError("error");

      expect(mockVSCode.showInformationMessage).toHaveBeenCalledWith("info");
      expect(mockVSCode.showWarningMessage).toHaveBeenCalledWith("warning");
      expect(mockVSCode.showErrorMessage).toHaveBeenCalledWith("error");
    });

    it("should not interfere between different notification types", async () => {
      await notification.showInfo("info message");
      await notification.showError("error message");

      expect(mockVSCode.showInformationMessage).toHaveBeenCalledWith(
        "info message",
      );
      expect(mockVSCode.showErrorMessage).toHaveBeenCalledWith("error message");
      expect(mockVSCode.showWarningMessage).not.toHaveBeenCalled();
    });
  });

  describe("error handling and fallbacks", () => {
    it("should call VSCode API for info messages without awaiting", async () => {
      mockVSCode.showInformationMessage.mockImplementation(() => {
        throw new Error("VSCode API not available");
      });

      await expect(notification.showInfo("test")).rejects.toThrow(
        "VSCode API not available",
      );
    });

    it("should call VSCode API for warning messages without awaiting", async () => {
      mockVSCode.showWarningMessage.mockImplementation(() => {
        throw new Error("VSCode API not available");
      });

      await expect(notification.showWarning("test")).rejects.toThrow(
        "VSCode API not available",
      );
    });

    it("should call VSCode API for error messages without awaiting", async () => {
      mockVSCode.showErrorMessage.mockImplementation(() => {
        throw new Error("VSCode API not available");
      });

      await expect(notification.showError("test")).rejects.toThrow(
        "VSCode API not available",
      );
    });

    it("should handle VSCode progress API unavailability", async () => {
      mockVSCode.withProgress.mockImplementation(() => {
        throw new Error("Progress API not available");
      });

      const task = jest.fn().mockResolvedValue("result");

      await expect(notification.showProgress("title", task)).rejects.toThrow(
        "Progress API not available",
      );
    });

    it("should handle progress wrapper errors gracefully", async () => {
      const failingProgress = { report: jest.fn() };
      failingProgress.report.mockImplementation(() => {
        throw new Error("Progress report failed");
      });

      mockVSCode.withProgress.mockImplementation((options, callback) => {
        return callback(failingProgress);
      });

      const task = async (progress: IProgress) => {
        expect(() => progress.report(50, "test")).toThrow(
          "Progress report failed",
        );
        return "completed despite error";
      };

      const result = await notification.showProgress("Test", task);
      expect(result).toBe("completed despite error");
    });
  });

  describe("notification user interaction handling", () => {
    it("should handle returned values from notification methods", async () => {
      const mockReturn = "User clicked OK";
      mockVSCode.showInformationMessage.mockResolvedValue(mockReturn);

      await notification.showInfo("test");

      expect(mockVSCode.showInformationMessage).toHaveBeenCalled();
    });

    it("should not break when notification methods return undefined", async () => {
      mockVSCode.showWarningMessage.mockResolvedValue(undefined);

      await expect(notification.showWarning("test")).resolves.not.toThrow();
    });

    it("should handle notification dismissal", async () => {
      mockVSCode.showErrorMessage.mockResolvedValue(undefined);

      await notification.showError("User dismissed this");

      expect(mockVSCode.showErrorMessage).toHaveBeenCalledWith(
        "User dismissed this",
      );
    });
  });

  describe("interface compliance", () => {
    it("should implement INotification interface methods", () => {
      expect(typeof notification.showInfo).toBe("function");
      expect(typeof notification.showWarning).toBe("function");
      expect(typeof notification.showError).toBe("function");
      expect(typeof notification.showProgress).toBe("function");
    });

    it("should return promises for all notification methods", () => {
      const infoPromise = notification.showInfo("test");
      const warningPromise = notification.showWarning("test");
      const errorPromise = notification.showError("test");
      const progressPromise = notification.showProgress(
        "test",
        async () => "result",
      );

      expect(infoPromise).toBeInstanceOf(Promise);
      expect(warningPromise).toBeInstanceOf(Promise);
      expect(errorPromise).toBeInstanceOf(Promise);
      expect(progressPromise).toBeInstanceOf(Promise);
    });
  });

  describe("concurrency handling", () => {
    it("should handle multiple simultaneous notifications", async () => {
      const promises = [
        notification.showInfo("info 1"),
        notification.showWarning("warning 1"),
        notification.showError("error 1"),
        notification.showInfo("info 2"),
      ];

      await Promise.all(promises);

      expect(mockVSCode.showInformationMessage).toHaveBeenCalledTimes(2);
      expect(mockVSCode.showWarningMessage).toHaveBeenCalledTimes(1);
      expect(mockVSCode.showErrorMessage).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple simultaneous progress operations", async () => {
      const task1 = jest.fn().mockResolvedValue("result1");
      const task2 = jest.fn().mockResolvedValue("result2");

      const promises = [
        notification.showProgress("Task 1", task1),
        notification.showProgress("Task 2", task2),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(["result1", "result2"]);
      expect(mockVSCode.withProgress).toHaveBeenCalledTimes(2);
    });
  });
});
