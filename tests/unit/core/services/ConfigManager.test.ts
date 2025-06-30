import { ConfigManager } from "../../../../src/core/services/ConfigManager";
import { IConfigSource, ILogger } from "../../../../src/core/interfaces";

class MockConfigSource implements IConfigSource {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  setData(key: string, value: unknown): void {
    this.data.set(key, value);
  }
}

class MockLogger implements ILogger {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  debug = jest.fn();
}

describe("ConfigManager", () => {
  let configManager: ConfigManager;
  let mockLogger: MockLogger;
  let source1: MockConfigSource;
  let source2: MockConfigSource;

  beforeEach(() => {
    mockLogger = new MockLogger();
    configManager = new ConfigManager(mockLogger);
    source1 = new MockConfigSource();
    source2 = new MockConfigSource();
  });

  describe("source management", () => {
    it("should add sources", () => {
      configManager.addSource(source1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Added config source: MockConfigSource",
      );
    });

    it("should handle multiple sources with priority (last added wins)", async () => {
      source1.setData("key1", "value1");
      source2.setData("key1", "value2");

      configManager.addSource(source1);
      configManager.addSource(source2);

      const result = await configManager.get("key1");
      expect(result).toBe("value2"); // source2 has higher priority
    });

    it("should fall back to earlier sources if later sources do not have the key", async () => {
      source1.setData("key1", "value1");
      source2.setData("key2", "value2");

      configManager.addSource(source1);
      configManager.addSource(source2);

      const result = await configManager.get("key1");
      expect(result).toBe("value1"); // falls back to source1
    });
  });

  describe("get/set operations", () => {
    beforeEach(() => {
      configManager.addSource(source1);
    });

    it("should return undefined for non-existent keys", async () => {
      const result = await configManager.get("nonexistent");
      expect(result).toBeUndefined();
    });

    it("should set values in the first source", async () => {
      await configManager.set("key1", "value1");
      const result = await source1.get("key1");
      expect(result).toBe("value1");
    });

    it("should throw error when setting with no sources", async () => {
      const emptyConfigManager = new ConfigManager(mockLogger);
      await expect(emptyConfigManager.set("key1", "value1")).rejects.toThrow(
        "No config sources available",
      );
    });
  });

  describe("validation", () => {
    it("should validate valid Claude models", () => {
      expect(configManager.validateModel("auto")).toBe(true);
      expect(configManager.validateModel("claude-3-5-sonnet-latest")).toBe(
        true,
      );
      expect(configManager.validateModel("claude-3-opus-latest")).toBe(true);
    });

    it("should reject invalid models", () => {
      expect(configManager.validateModel("invalid-model")).toBe(false);
      expect(configManager.validateModel("")).toBe(false);
    });

    it("should validate paths", () => {
      expect(configManager.validatePath("/valid/path")).toBe(true);
      expect(configManager.validatePath("./relative/path")).toBe(true);
      expect(configManager.validatePath("simple-path")).toBe(true);
    });

    it("should reject invalid paths", () => {
      expect(configManager.validatePath("")).toBe(false);
      expect(configManager.validatePath("   ")).toBe(false);
      expect(configManager.validatePath("path\0with\0nullbytes")).toBe(false);
    });
  });
});
