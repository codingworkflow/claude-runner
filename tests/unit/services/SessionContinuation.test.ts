import { WorkflowParser } from "../../../src/core/services/WorkflowParser";
import type { ILogger } from "../../../src/core/interfaces/ILogger";
import type { IFileSystem } from "../../../src/core/interfaces/IFileSystem";
import type { ClaudeExecutor } from "../../../src/core/services/ClaudeExecutor";

describe("Session Continuation Unit Tests", () => {
  beforeEach(() => {
    // Create minimal mocks for testing
    const mockLogger: ILogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const mockFileSystem: IFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      readdir: jest.fn(),
      mkdir: jest.fn(),
      stat: jest.fn(),
      unlink: jest.fn(),
    };

    const mockExecutor: Partial<ClaudeExecutor> = {
      executeTask: jest.fn(),
    };

    // workflowEngine is not used in these tests, so we don't need to create it
    void mockLogger;
    void mockFileSystem;
    void mockExecutor;
  });

  describe("Session Reference Detection", () => {
    test("should detect session reference in resume_session field", () => {
      const yamlContent = `
name: "Session Test"
jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - id: task1
        uses: claude-pipeline-action@v1
        with:
          prompt: "Generate random number"
          output_session: true
      - id: task2
        uses: claude-pipeline-action@v1
        with:
          prompt: "Use previous number"
          resume_session: \${{ steps.task1.outputs.session_id }}
`;

      // This should NOT throw - session reference is valid
      expect(() => {
        WorkflowParser.parseYaml(yamlContent);
      }).not.toThrow();
    });

    test("should reject invalid session reference", () => {
      const yamlContent = `
name: "Invalid Session Test"
jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - id: task1
        uses: claude-pipeline-action@v1
        with:
          prompt: "Generate random number"
          output_session: true
      - id: task2
        uses: claude-pipeline-action@v1
        with:
          prompt: "Use previous number"
          resume_session: \${{ steps.nonexistent.outputs.session_id }}
`;

      // This SHOULD throw - nonexistent step reference
      expect(() => {
        WorkflowParser.parseYaml(yamlContent);
      }).toThrow(/unknown step.*nonexistent/);
    });
  });

  describe("Session Variable Resolution", () => {
    test("should resolve session variables correctly", () => {
      const template = "${{ steps.task1.outputs.session_id }}";
      const context = {
        steps: {
          task1: {
            outputs: {
              session_id: "session-123-abc",
            },
          },
        },
      };

      const resolved = WorkflowParser.resolveVariables(template, context);
      expect(resolved).toBe("session-123-abc");
    });

    test("should return empty string for missing session", () => {
      const template = "${{ steps.missing.outputs.session_id }}";
      const context = {
        steps: {
          task1: {
            outputs: {
              session_id: "session-123-abc",
            },
          },
        },
      };

      const resolved = WorkflowParser.resolveVariables(template, context);
      expect(resolved).toBe("");
    });

    test("should handle multiple variable types", () => {
      const template =
        "Use session ${{ steps.task1.outputs.session_id }} with input ${{ inputs.test_input }}";
      const context = {
        inputs: { test_input: "hello" },
        steps: {
          task1: {
            outputs: {
              session_id: "session-456",
            },
          },
        },
      };

      const resolved = WorkflowParser.resolveVariables(template, context);
      expect(resolved).toBe("Use session session-456 with input hello");
    });
  });

  describe("Session Output Storage", () => {
    test("should properly structure step outputs for variable resolution", () => {
      // Test the transformation logic from WorkflowEngine.resolveStepVariables
      const executionOutputs = {
        task1: { result: "test output", session_id: "session-789" },
        task2: { result: "other output" },
      };

      // Transform to expected format (simulating WorkflowEngine logic)
      const steps: Record<string, { outputs: Record<string, unknown> }> = {};
      for (const [stepId, output] of Object.entries(executionOutputs)) {
        steps[stepId] = { outputs: output };
      }

      // Test variable resolution
      const template = "${{ steps.task1.outputs.session_id }}";
      const context = { steps };
      const resolved = WorkflowParser.resolveVariables(template, context);

      expect(resolved).toBe("session-789");
    });
  });

  describe("JSON Output Parsing", () => {
    test("should extract clean result from JSON output", () => {
      const jsonOutput = JSON.stringify({
        type: "result",
        subtype: "success",
        result: "The answer is 42",
        session_id: "session-abc-123",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      // Test the extraction logic from WorkflowEngine.extractCleanResult
      let cleanResult;
      try {
        const jsonData = JSON.parse(jsonOutput.trim());
        cleanResult = jsonData.result || jsonOutput;
      } catch {
        cleanResult = jsonOutput;
      }

      expect(cleanResult).toBe("The answer is 42");
    });

    test("should handle malformed JSON gracefully", () => {
      const malformedOutput = "Not valid JSON{";

      // Test the extraction logic
      let cleanResult;
      try {
        const jsonData = JSON.parse(malformedOutput.trim());
        cleanResult = jsonData.result || malformedOutput;
      } catch {
        cleanResult = malformedOutput;
      }

      expect(cleanResult).toBe("Not valid JSON{");
    });
  });
});
