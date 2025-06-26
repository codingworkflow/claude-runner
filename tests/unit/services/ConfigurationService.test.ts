import { jest, describe, it, beforeEach, expect } from "@jest/globals";
import { ConfigurationService } from "../../../src/services/ConfigurationService";

// Mock vscode module with default config values
jest.mock(
  "vscode",
  () => ({
    workspace: {
      getConfiguration: jest.fn(() => ({
        get: jest.fn((key: string) => {
          const defaults: Record<string, any> = {
            defaultModel: "claude-sonnet-4-20250514",
            allowAllTools: false,
            outputFormat: "text",
            maxTurns: 10,
            defaultRootPath: "",
            showVerboseOutput: false,
            terminalName: "Claude Interactive",
            autoOpenTerminal: true,
          };
          return defaults[key];
        }),
      })),
      onDidChangeConfiguration: jest.fn(),
    },
    ConfigurationTarget: {
      Workspace: 1,
    },
  }),
  { virtual: true },
);

describe("Configuration Service", () => {
  let configService: ConfigurationService;

  beforeEach(() => {
    configService = new ConfigurationService();
  });

  it("should return default configuration", () => {
    const config = configService.getConfiguration();

    expect(config.defaultModel).toBe("claude-sonnet-4-20250514");
    expect(config.allowAllTools).toBe(false);
    expect(config.outputFormat).toBe("text");
    expect(config.maxTurns).toBe(10);
  });

  it("should validate known models", () => {
    const validModels = [
      "claude-opus-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-3-7-sonnet-20250219",
      "claude-3-5-haiku-20241022",
    ];

    validModels.forEach((model) => {
      expect(configService.validateModel(model)).toBe(true);
    });
  });

  it("should reject invalid models", () => {
    const invalidModels = ["invalid-model", "", "claude-nonexistent-model"];

    invalidModels.forEach((model) => {
      expect(configService.validateModel(model)).toBe(false);
    });
  });

  it("should return correct model display names", () => {
    const displayNames = {
      "claude-opus-4-20250514": "Claude Opus 4",
      "claude-sonnet-4-20250514": "Claude Sonnet 4",
      "claude-3-7-sonnet-20250219": "Claude Sonnet 3.7",
      "claude-3-5-haiku-20241022": "Claude Haiku 3.5",
    };

    Object.entries(displayNames).forEach(([modelId, expectedName]) => {
      expect(configService.getModelDisplayName(modelId)).toBe(expectedName);
    });
  });

  it("should validate paths correctly", () => {
    // Valid paths
    expect(configService.validatePath("/valid/path")).toBe(true);
    expect(configService.validatePath("./relative/path")).toBe(true);
    expect(configService.validatePath("C:\\Windows\\Path")).toBe(true);

    // Invalid paths
    expect(configService.validatePath("")).toBe(false);
    expect(configService.validatePath("   ")).toBe(false);
    expect(configService.validatePath("path\0with\0null")).toBe(false);
  });

  it("should return available models with correct structure", () => {
    const models = configService.getAvailableModels();

    expect(models).toHaveLength(5); // Updated to include "Auto" option

    models.forEach((model) => {
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
      expect(model.description).toBeDefined();
    });
  });
});
