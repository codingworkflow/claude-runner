import {
  ClaudeModel,
  AVAILABLE_MODELS,
  getModelIds,
  getModelDisplayName,
  validateModel,
  DEFAULT_MODEL,
} from "../../../src/models/ClaudeModels";

describe("ClaudeModels", () => {
  describe("AVAILABLE_MODELS", () => {
    it("should contain all expected models", () => {
      expect(AVAILABLE_MODELS).toHaveLength(5);

      const modelIds = AVAILABLE_MODELS.map((model) => model.id);
      expect(modelIds).toContain("auto");
      expect(modelIds).toContain("claude-opus-4-20250514");
      expect(modelIds).toContain("claude-sonnet-4-20250514");
      expect(modelIds).toContain("claude-3-7-sonnet-20250219");
      expect(modelIds).toContain("claude-3-5-haiku-20241022");
    });

    it("should have valid model structure", () => {
      AVAILABLE_MODELS.forEach((model) => {
        expect(model).toHaveProperty("id");
        expect(model).toHaveProperty("name");
        expect(model).toHaveProperty("description");

        expect(typeof model.id).toBe("string");
        expect(typeof model.name).toBe("string");
        expect(typeof model.description).toBe("string");

        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
        expect(model.description).toBeTruthy();
      });
    });

    it("should have unique model IDs", () => {
      const modelIds = AVAILABLE_MODELS.map((model) => model.id);
      const uniqueIds = new Set(modelIds);
      expect(uniqueIds.size).toBe(modelIds.length);
    });

    it("should contain expected model definitions", () => {
      const autoModel = AVAILABLE_MODELS.find((m) => m.id === "auto");
      expect(autoModel).toEqual({
        id: "auto",
        name: "Auto",
        description: "Use default model (no override)",
      });

      const opusModel = AVAILABLE_MODELS.find(
        (m) => m.id === "claude-opus-4-20250514",
      );
      expect(opusModel).toEqual({
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        description: "Most capable, highest cost",
      });

      const sonnetModel = AVAILABLE_MODELS.find(
        (m) => m.id === "claude-sonnet-4-20250514",
      );
      expect(sonnetModel).toEqual({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Balanced performance and cost",
      });
    });
  });

  describe("getModelIds", () => {
    it("should return array of all model IDs", () => {
      const modelIds = getModelIds();

      expect(Array.isArray(modelIds)).toBe(true);
      expect(modelIds).toHaveLength(5);
      expect(modelIds).toEqual([
        "auto",
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
        "claude-3-7-sonnet-20250219",
        "claude-3-5-haiku-20241022",
      ]);
    });

    it("should return fresh array on each call", () => {
      const ids1 = getModelIds();
      const ids2 = getModelIds();

      expect(ids1).not.toBe(ids2);
      expect(ids1).toEqual(ids2);
    });

    it("should not affect original AVAILABLE_MODELS when modified", () => {
      const modelIds = getModelIds();
      const originalLength = AVAILABLE_MODELS.length;

      modelIds.push("test-model");

      expect(AVAILABLE_MODELS).toHaveLength(originalLength);
      expect(getModelIds()).not.toContain("test-model");
    });
  });

  describe("getModelDisplayName", () => {
    it("should return correct display names for valid model IDs", () => {
      expect(getModelDisplayName("auto")).toBe("Auto");
      expect(getModelDisplayName("claude-opus-4-20250514")).toBe(
        "Claude Opus 4",
      );
      expect(getModelDisplayName("claude-sonnet-4-20250514")).toBe(
        "Claude Sonnet 4",
      );
      expect(getModelDisplayName("claude-3-7-sonnet-20250219")).toBe(
        "Claude Sonnet 3.7",
      );
      expect(getModelDisplayName("claude-3-5-haiku-20241022")).toBe(
        "Claude Haiku 3.5",
      );
    });

    it("should return original model ID for invalid model IDs", () => {
      expect(getModelDisplayName("invalid-model")).toBe("invalid-model");
      expect(getModelDisplayName("")).toBe("");
      expect(getModelDisplayName("claude-unknown")).toBe("claude-unknown");
    });

    it("should handle edge cases gracefully", () => {
      expect(getModelDisplayName("")).toBe("");
      expect(getModelDisplayName("   ")).toBe("   ");
      expect(getModelDisplayName("123")).toBe("123");
      expect(getModelDisplayName("special-chars-!@#")).toBe(
        "special-chars-!@#",
      );
    });

    it("should be case sensitive", () => {
      expect(getModelDisplayName("AUTO")).toBe("AUTO");
      expect(getModelDisplayName("Auto")).toBe("Auto");
      expect(getModelDisplayName("auto")).toBe("Auto");
    });
  });

  describe("validateModel", () => {
    it("should return true for valid model IDs", () => {
      expect(validateModel("auto")).toBe(true);
      expect(validateModel("claude-opus-4-20250514")).toBe(true);
      expect(validateModel("claude-sonnet-4-20250514")).toBe(true);
      expect(validateModel("claude-3-7-sonnet-20250219")).toBe(true);
      expect(validateModel("claude-3-5-haiku-20241022")).toBe(true);
    });

    it("should return false for invalid model IDs", () => {
      expect(validateModel("invalid-model")).toBe(false);
      expect(validateModel("")).toBe(false);
      expect(validateModel("claude-unknown")).toBe(false);
      expect(validateModel("gpt-4")).toBe(false);
    });

    it("should be case sensitive", () => {
      expect(validateModel("AUTO")).toBe(false);
      expect(validateModel("Auto")).toBe(false);
      expect(validateModel("CLAUDE-OPUS-4-20250514")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(validateModel("")).toBe(false);
      expect(validateModel("   ")).toBe(false);
      expect(validateModel("null")).toBe(false);
      expect(validateModel("undefined")).toBe(false);
    });

    it("should handle special characters", () => {
      expect(validateModel("claude-opus-4-20250514!")).toBe(false);
      expect(validateModel("@claude-opus-4-20250514")).toBe(false);
      expect(validateModel("claude opus 4 20250514")).toBe(false);
    });
  });

  describe("DEFAULT_MODEL", () => {
    it("should be set to 'auto'", () => {
      expect(DEFAULT_MODEL).toBe("auto");
    });

    it("should be a valid model", () => {
      expect(validateModel(DEFAULT_MODEL)).toBe(true);
    });

    it("should exist in AVAILABLE_MODELS", () => {
      const defaultModelExists = AVAILABLE_MODELS.some(
        (model) => model.id === DEFAULT_MODEL,
      );
      expect(defaultModelExists).toBe(true);
    });
  });

  describe("ClaudeModel interface compliance", () => {
    it("should match ClaudeModel interface structure", () => {
      const testModel: ClaudeModel = {
        id: "test-id",
        name: "Test Name",
        description: "Test description",
      };

      expect(testModel.id).toBe("test-id");
      expect(testModel.name).toBe("Test Name");
      expect(testModel.description).toBe("Test description");
    });

    it("should enforce required properties", () => {
      AVAILABLE_MODELS.forEach((model) => {
        expect(model).toHaveProperty("id");
        expect(model).toHaveProperty("name");
        expect(model).toHaveProperty("description");
      });
    });
  });

  describe("Model capability and feature checking", () => {
    it("should identify high-capability models", () => {
      const highCapabilityModels = AVAILABLE_MODELS.filter(
        (model) =>
          model.description.includes("capable") ||
          model.description.includes("performance"),
      );

      expect(highCapabilityModels.length).toBeGreaterThan(0);
      expect(
        highCapabilityModels.some((m) => m.id === "claude-opus-4-20250514"),
      ).toBe(true);
    });

    it("should identify cost-efficient models", () => {
      const costEfficientModels = AVAILABLE_MODELS.filter(
        (model) =>
          model.description.includes("lowest cost") ||
          model.description.includes("Fastest"),
      );

      expect(costEfficientModels.length).toBeGreaterThan(0);
      expect(
        costEfficientModels.some((m) => m.id === "claude-3-5-haiku-20241022"),
      ).toBe(true);
    });

    it("should have balanced models", () => {
      const balancedModels = AVAILABLE_MODELS.filter(
        (model) =>
          model.description.includes("Balanced") ||
          model.description.includes("moderate"),
      );

      expect(balancedModels.length).toBeGreaterThan(0);
    });
  });

  describe("Model selection and compatibility", () => {
    it("should provide auto model for default selection", () => {
      const autoModel = AVAILABLE_MODELS.find((m) => m.id === "auto");
      expect(autoModel).toBeDefined();
      expect(autoModel?.description).toContain("default");
    });

    it("should have models with version identifiers", () => {
      const versionedModels = AVAILABLE_MODELS.filter(
        (model) => model.id !== "auto" && model.id.includes("-"),
      );

      expect(versionedModels.length).toBe(4);
      versionedModels.forEach((model) => {
        expect(model.id).toMatch(/claude-.*-\d+/);
      });
    });

    it("should maintain model ordering by capability", () => {
      const modelOrder = AVAILABLE_MODELS.map((m) => m.id);
      expect(modelOrder[0]).toBe("auto");
      expect(modelOrder[1]).toBe("claude-opus-4-20250514");
      expect(modelOrder[2]).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("Model error handling and fallbacks", () => {
    it("should handle null/undefined inputs gracefully", () => {
      expect(() => getModelDisplayName(null as any)).not.toThrow();
      expect(() => getModelDisplayName(undefined as any)).not.toThrow();
      expect(() => validateModel(null as any)).not.toThrow();
      expect(() => validateModel(undefined as any)).not.toThrow();
    });

    it("should provide fallback behavior for unknown models", () => {
      const unknownModelId = "unknown-model-id";
      expect(getModelDisplayName(unknownModelId)).toBe(unknownModelId);
      expect(validateModel(unknownModelId)).toBe(false);
    });

    it("should consistently return the same set of models", () => {
      // Verify that the exported functions consistently work with the defined models
      const modelIds = getModelIds();
      const availableModelsLength = AVAILABLE_MODELS.length;

      // Multiple calls should return consistent results
      expect(getModelIds()).toHaveLength(availableModelsLength);
      expect(getModelIds()).toEqual(modelIds);

      // Each model in the array should be valid
      for (const model of AVAILABLE_MODELS) {
        expect(validateModel(model.id)).toBe(true);
        expect(getModelDisplayName(model.id)).toBe(model.name);
      }
    });
  });
});
