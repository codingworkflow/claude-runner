import * as vscode from "vscode";
import { VSCodeConfigSource } from "../../../../src/adapters/vscode/VSCodeConfigSource";

describe("VSCodeConfigSource", () => {
  let configSource: VSCodeConfigSource;
  let mockConfiguration: {
    get: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    mockConfiguration = {
      get: jest.fn(),
      update: jest.fn(),
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      mockConfiguration,
    );

    configSource = new VSCodeConfigSource();
    jest.clearAllMocks();
  });

  describe("configuration reading", () => {
    it("should get configuration value from VSCode workspace", async () => {
      const testValue = "test-value";
      mockConfiguration.get.mockReturnValue(testValue);

      const result = await configSource.get<string>("test-key");

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
        "claude-runner",
      );
      expect(mockConfiguration.get).toHaveBeenCalledWith("test-key");
      expect(result).toBe(testValue);
    });

    it("should return undefined for non-existent configuration keys", async () => {
      mockConfiguration.get.mockReturnValue(undefined);

      const result = await configSource.get<string>("non-existent");

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
        "claude-runner",
      );
      expect(mockConfiguration.get).toHaveBeenCalledWith("non-existent");
      expect(result).toBeUndefined();
    });

    it("should handle complex object values", async () => {
      const complexObject = {
        nested: { value: 123 },
        array: [1, 2, 3],
        boolean: true,
      };
      mockConfiguration.get.mockReturnValue(complexObject);

      const result =
        await configSource.get<typeof complexObject>("complex-config");

      expect(mockConfiguration.get).toHaveBeenCalledWith("complex-config");
      expect(result).toEqual(complexObject);
    });

    it("should handle different value types", async () => {
      const testCases = [
        { key: "string-key", value: "string-value", type: "string" },
        { key: "number-key", value: 42, type: "number" },
        { key: "boolean-key", value: true, type: "boolean" },
        { key: "array-key", value: [1, 2, 3], type: "array" },
        { key: "object-key", value: { prop: "value" }, type: "object" },
      ];

      for (const testCase of testCases) {
        mockConfiguration.get.mockReturnValue(testCase.value);

        const result = await configSource.get(testCase.key);

        expect(mockConfiguration.get).toHaveBeenCalledWith(testCase.key);
        expect(result).toEqual(testCase.value);
      }
    });
  });

  describe("configuration writing", () => {
    beforeEach(() => {
      mockConfiguration.update.mockResolvedValue(undefined);
    });

    it("should set configuration value in VSCode workspace", async () => {
      const testValue = "test-value";

      await configSource.set("test-key", testValue);

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
        "claude-runner",
      );
      expect(mockConfiguration.update).toHaveBeenCalledWith(
        "test-key",
        testValue,
        vscode.ConfigurationTarget.Global,
      );
    });

    it("should handle complex object values when setting", async () => {
      const complexObject = {
        nested: { value: 123 },
        array: [1, 2, 3],
        boolean: true,
      };

      await configSource.set("complex-config", complexObject);

      expect(mockConfiguration.update).toHaveBeenCalledWith(
        "complex-config",
        complexObject,
        vscode.ConfigurationTarget.Global,
      );
    });

    it("should handle different value types when setting", async () => {
      const testCases = [
        { key: "string-key", value: "string-value" },
        { key: "number-key", value: 42 },
        { key: "boolean-key", value: true },
        { key: "array-key", value: [1, 2, 3] },
        { key: "object-key", value: { prop: "value" } },
        { key: "null-key", value: null },
      ];

      for (const testCase of testCases) {
        await configSource.set(testCase.key, testCase.value);

        expect(mockConfiguration.update).toHaveBeenCalledWith(
          testCase.key,
          testCase.value,
          vscode.ConfigurationTarget.Global,
        );
      }
    });

    it("should use Global configuration target by default", async () => {
      await configSource.set("test-key", "test-value");

      expect(mockConfiguration.update).toHaveBeenCalledWith(
        "test-key",
        "test-value",
        vscode.ConfigurationTarget.Global,
      );
    });
  });

  describe("configuration validation and defaults", () => {
    it("should handle empty string values", async () => {
      mockConfiguration.get.mockReturnValue("");

      const result = await configSource.get<string>("empty-string");

      expect(result).toBe("");
    });

    it("should handle zero values", async () => {
      mockConfiguration.get.mockReturnValue(0);

      const result = await configSource.get<number>("zero-value");

      expect(result).toBe(0);
    });

    it("should handle false boolean values", async () => {
      mockConfiguration.get.mockReturnValue(false);

      const result = await configSource.get<boolean>("false-value");

      expect(result).toBe(false);
    });

    it("should handle null values", async () => {
      mockConfiguration.get.mockReturnValue(null);

      const result = await configSource.get<null>("null-value");

      expect(result).toBe(null);
    });
  });

  describe("error handling", () => {
    it("should handle VSCode configuration read errors", async () => {
      const error = new Error("Configuration read failed");
      mockConfiguration.get.mockImplementation(() => {
        throw error;
      });

      await expect(configSource.get("error-key")).rejects.toThrow(
        "Configuration read failed",
      );
    });

    it("should handle VSCode configuration write errors", async () => {
      const error = new Error("Configuration write failed");
      mockConfiguration.update.mockRejectedValue(error);

      await expect(
        configSource.set("error-key", "error-value"),
      ).rejects.toThrow("Configuration write failed");
    });

    it("should handle VSCode workspace configuration errors", async () => {
      const error = new Error("Workspace configuration failed");
      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(
        () => {
          throw error;
        },
      );

      await expect(configSource.get("test-key")).rejects.toThrow(
        "Workspace configuration failed",
      );
    });

    it("should propagate async update errors", async () => {
      const error = new Error("Async update failed");
      mockConfiguration.update.mockImplementation(async () => {
        throw error;
      });

      await expect(
        configSource.set("async-error-key", "value"),
      ).rejects.toThrow("Async update failed");
    });
  });

  describe("configuration section", () => {
    it("should always use claude-runner configuration section", async () => {
      await configSource.get("any-key");

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith(
        "claude-runner",
      );
    });

    it("should use same configuration section for both get and set operations", async () => {
      await configSource.get("get-key");
      await configSource.set("set-key", "value");

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledTimes(2);
      expect(vscode.workspace.getConfiguration).toHaveBeenNthCalledWith(
        1,
        "claude-runner",
      );
      expect(vscode.workspace.getConfiguration).toHaveBeenNthCalledWith(
        2,
        "claude-runner",
      );
    });
  });

  describe("interface compliance", () => {
    it("should implement IConfigSource interface correctly", () => {
      expect(typeof configSource.get).toBe("function");
      expect(typeof configSource.set).toBe("function");
    });

    it("should return promises from both get and set methods", () => {
      mockConfiguration.get.mockReturnValue("test");
      mockConfiguration.update.mockResolvedValue(undefined);

      const getResult = configSource.get("test");
      const setResult = configSource.set("test", "value");

      expect(getResult).toBeInstanceOf(Promise);
      expect(setResult).toBeInstanceOf(Promise);
    });
  });
});
