import * as vscode from "vscode";
import { VSCodeStorage } from "../../../../src/adapters/vscode/VSCodeStorage";

// Mock VS Code extension context
const mockGlobalState = {
  data: new Map<string, unknown>(),
  get: jest.fn(),
  update: jest.fn(),
  keys: jest.fn(),
};

const mockContext = {
  globalState: mockGlobalState,
} as unknown as vscode.ExtensionContext;

// Set up mock implementations
mockGlobalState.get.mockImplementation(<T>(key: string): T | undefined => {
  return mockGlobalState.data.get(key) as T | undefined;
});

mockGlobalState.update.mockImplementation(
  (key: string, value: unknown): Promise<void> => {
    if (value === undefined) {
      mockGlobalState.data.delete(key);
    } else {
      mockGlobalState.data.set(key, value);
    }
    return Promise.resolve();
  },
);

mockGlobalState.keys.mockImplementation((): string[] => {
  return Array.from(mockGlobalState.data.keys());
});

describe("VSCodeStorage", () => {
  let storage: VSCodeStorage;

  beforeEach(() => {
    storage = new VSCodeStorage(mockContext);
    mockGlobalState.data.clear();
    jest.clearAllMocks();
  });

  describe("get", () => {
    it("should get value from global state", async () => {
      mockGlobalState.data.set("test-key", "test-value");

      const result = await storage.get("test-key");

      expect(result).toBe("test-value");
      expect(mockGlobalState.get).toHaveBeenCalledWith("test-key");
    });

    it("should return undefined for non-existent keys", async () => {
      const result = await storage.get("non-existent");

      expect(result).toBeUndefined();
      expect(mockGlobalState.get).toHaveBeenCalledWith("non-existent");
    });
  });

  describe("set", () => {
    it("should set value in global state", async () => {
      await storage.set("test-key", "test-value");

      expect(mockGlobalState.update).toHaveBeenCalledWith(
        "test-key",
        "test-value",
      );
      expect(mockGlobalState.data.get("test-key")).toBe("test-value");
    });

    it("should handle complex objects", async () => {
      const complexObject = { nested: { value: 123 }, array: [1, 2, 3] };

      await storage.set("complex-key", complexObject);

      expect(mockGlobalState.update).toHaveBeenCalledWith(
        "complex-key",
        complexObject,
      );
      expect(mockGlobalState.data.get("complex-key")).toEqual(complexObject);
    });
  });

  describe("delete", () => {
    it("should delete value from global state", async () => {
      mockGlobalState.data.set("test-key", "test-value");

      await storage.delete("test-key");

      expect(mockGlobalState.update).toHaveBeenCalledWith(
        "test-key",
        undefined,
      );
      expect(mockGlobalState.data.has("test-key")).toBe(false);
    });
  });

  describe("keys", () => {
    it("should return all keys from global state", async () => {
      mockGlobalState.data.set("key1", "value1");
      mockGlobalState.data.set("key2", "value2");

      const keys = await storage.keys();

      expect(keys).toEqual(["key1", "key2"]);
      expect(mockGlobalState.keys).toHaveBeenCalled();
    });

    it("should return empty array for empty state", async () => {
      const keys = await storage.keys();

      expect(keys).toEqual([]);
      expect(mockGlobalState.keys).toHaveBeenCalled();
    });
  });
});
