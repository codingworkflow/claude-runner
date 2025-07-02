import { WorkflowEngine } from "../../../../src/core/services/WorkflowEngine";
import { WorkflowParser } from "../../../../src/core/services/WorkflowParser";
import { ClaudeExecutor } from "../../../../src/core/services/ClaudeExecutor";
import { ILogger, IFileSystem } from "../../../../src/core/interfaces";
import { ClaudeWorkflow } from "../../../../src/core/models/Workflow";

jest.mock("../../../../src/core/services/WorkflowParser");
jest.mock("../../../../src/core/services/ClaudeExecutor");

describe("WorkflowEngine - Parsing", () => {
  let workflowEngine: WorkflowEngine;
  let mockLogger: jest.Mocked<ILogger>;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockExecutor: jest.Mocked<ClaudeExecutor>;

  const mockWorkflow: ClaudeWorkflow = {
    name: "test-workflow",
    jobs: {
      "test-job": {
        name: "Test Job",
        steps: [
          {
            id: "step1",
            uses: "claude-pipeline-action",
            with: {
              prompt: "Test prompt",
              model: "auto",
            },
          },
        ],
      },
    },
    inputs: {
      param1: {
        description: "Test parameter",
        required: true,
        type: "string",
        default: "default-value",
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockFileSystem = {
      exists: jest.fn(),
      readdir: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      stat: jest.fn(),
      mkdir: jest.fn(),
      unlink: jest.fn(),
    };

    mockExecutor = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<ClaudeExecutor>;

    workflowEngine = new WorkflowEngine(
      mockLogger,
      mockFileSystem,
      mockExecutor,
    );
  });

  describe("listWorkflows", () => {
    it("should return empty array when directory does not exist", async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      const result = await workflowEngine.listWorkflows("/non-existent");

      expect(result).toEqual([]);
      expect(mockFileSystem.exists).toHaveBeenCalledWith("/non-existent");
    });

    it("should list and parse claude workflow files", async () => {
      const mockFiles = [
        "claude-test.yml",
        "claude-prod.yaml",
        "other-file.txt",
      ];
      const mockStats = {
        birthtime: new Date("2023-01-01"),
        mtime: new Date("2023-01-02"),
        isDirectory: false,
        size: 1024,
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readdir.mockResolvedValue(mockFiles);
      mockFileSystem.stat.mockResolvedValue(mockStats);
      mockFileSystem.readFile.mockResolvedValue("workflow-content");
      (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

      const result = await workflowEngine.listWorkflows("/workflows");

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "claude-test",
        name: "test-workflow",
        created: mockStats.birthtime,
        modified: mockStats.mtime,
        path: "/workflows/claude-test.yml",
      });
      expect(WorkflowParser.parseYaml).toHaveBeenCalledTimes(2);
    });

    it("should handle parse errors gracefully", async () => {
      const mockFiles = ["claude-test.yml", "claude-invalid.yml"];
      const mockStats = {
        birthtime: new Date(),
        mtime: new Date(),
        isDirectory: false,
        size: 1024,
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readdir.mockResolvedValue(mockFiles);
      mockFileSystem.stat.mockResolvedValue(mockStats);
      mockFileSystem.readFile.mockResolvedValue("content");
      (WorkflowParser.parseYaml as jest.Mock)
        .mockReturnValueOnce(mockWorkflow)
        .mockImplementationOnce(() => {
          throw new Error("Parse error");
        });

      const result = await workflowEngine.listWorkflows("/workflows");

      expect(result).toHaveLength(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to parse workflow claude-invalid.yml",
        expect.any(Error),
      );
    });

    it("should sort workflows by modification time descending", async () => {
      const mockFiles = ["claude-old.yml", "claude-new.yml"];
      const oldStats = {
        birthtime: new Date("2023-01-01"),
        mtime: new Date("2023-01-01"),
        isDirectory: false,
        size: 1024,
      };
      const newStats = {
        birthtime: new Date("2023-01-02"),
        mtime: new Date("2023-01-03"),
        isDirectory: false,
        size: 1024,
      };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readdir.mockResolvedValue(mockFiles);
      mockFileSystem.stat
        .mockResolvedValueOnce(oldStats)
        .mockResolvedValueOnce(newStats);
      mockFileSystem.readFile.mockResolvedValue("content");
      (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

      const result = await workflowEngine.listWorkflows("/workflows");

      expect(result[0].id).toBe("claude-new");
      expect(result[1].id).toBe("claude-old");
    });

    it("should handle file system errors gracefully", async () => {
      mockFileSystem.exists.mockRejectedValue(new Error("File system error"));

      const result = await workflowEngine.listWorkflows("/error-path");

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to list workflows",
        expect.any(Error),
      );
    });
  });

  describe("loadWorkflow", () => {
    it("should load and parse workflow from file", async () => {
      mockFileSystem.readFile.mockResolvedValue("workflow-content");
      (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

      const result = await workflowEngine.loadWorkflow("/test/workflow.yml");

      expect(result).toBe(mockWorkflow);
      expect(mockFileSystem.readFile).toHaveBeenCalledWith(
        "/test/workflow.yml",
      );
      expect(WorkflowParser.parseYaml).toHaveBeenCalledWith("workflow-content");
    });

    it("should propagate file read errors", async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error("File not found"));

      await expect(
        workflowEngine.loadWorkflow("/non-existent.yml"),
      ).rejects.toThrow("File not found");
    });

    it("should propagate parse errors", async () => {
      mockFileSystem.readFile.mockResolvedValue("invalid-yaml");
      (WorkflowParser.parseYaml as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid YAML syntax");
      });

      await expect(workflowEngine.loadWorkflow("/invalid.yml")).rejects.toThrow(
        "Invalid YAML syntax",
      );
    });
  });

  describe("saveWorkflow", () => {
    it("should serialize and save workflow to file", async () => {
      (WorkflowParser.toYaml as jest.Mock).mockReturnValue(
        "serialized-content",
      );

      await workflowEngine.saveWorkflow("/test/workflow.yml", mockWorkflow);

      expect(WorkflowParser.toYaml).toHaveBeenCalledWith(mockWorkflow);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        "/test/workflow.yml",
        "serialized-content",
      );
    });

    it("should propagate serialization errors", async () => {
      (WorkflowParser.toYaml as jest.Mock).mockImplementation(() => {
        throw new Error("Serialization failed");
      });

      await expect(
        workflowEngine.saveWorkflow("/test/workflow.yml", mockWorkflow),
      ).rejects.toThrow("Serialization failed");
    });

    it("should propagate file write errors", async () => {
      (WorkflowParser.toYaml as jest.Mock).mockReturnValue("content");
      mockFileSystem.writeFile.mockRejectedValue(new Error("Write failed"));

      await expect(
        workflowEngine.saveWorkflow("/readonly/workflow.yml", mockWorkflow),
      ).rejects.toThrow("Write failed");
    });
  });

  describe("validateWorkflow", () => {
    it("should return valid for correct workflow", async () => {
      mockFileSystem.readFile.mockResolvedValue("valid-content");
      (WorkflowParser.parseYaml as jest.Mock).mockReturnValue(mockWorkflow);

      const result =
        await workflowEngine.validateWorkflow("/test/workflow.yml");

      expect(result).toEqual({ valid: true, errors: [] });
    });

    it("should return invalid with errors for malformed workflow", async () => {
      mockFileSystem.readFile.mockResolvedValue("invalid-content");
      (WorkflowParser.parseYaml as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid YAML");
      });

      const result =
        await workflowEngine.validateWorkflow("/test/workflow.yml");

      expect(result).toEqual({ valid: false, errors: ["Invalid YAML"] });
    });

    it("should handle file read errors in validation", async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error("Cannot read file"));

      const result = await workflowEngine.validateWorkflow(
        "/missing/workflow.yml",
      );

      expect(result).toEqual({ valid: false, errors: ["Cannot read file"] });
    });

    it("should handle multiple validation errors", async () => {
      mockFileSystem.readFile.mockResolvedValue("content");
      (WorkflowParser.parseYaml as jest.Mock).mockImplementation(() => {
        const error = new Error("Multiple errors");
        error.message = "Field 'name' is required\nField 'jobs' is invalid";
        throw error;
      });

      const result =
        await workflowEngine.validateWorkflow("/test/workflow.yml");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Field 'name' is required\nField 'jobs' is invalid",
      );
    });
  });

  describe("createExecution", () => {
    it("should create workflow execution context", () => {
      const inputs = { param1: "test-value" };

      const result = workflowEngine.createExecution(mockWorkflow, inputs);

      expect(result).toMatchObject({
        workflow: mockWorkflow,
        inputs,
        outputs: {},
        currentStep: 0,
        status: "pending",
      });
    });

    it("should create execution with empty inputs", () => {
      const result = workflowEngine.createExecution(mockWorkflow, {});

      expect(result.inputs).toEqual({});
      expect(result.outputs).toEqual({});
      expect(result.status).toBe("pending");
    });

    it("should preserve workflow structure in execution", () => {
      const complexWorkflow: ClaudeWorkflow = {
        name: "complex-workflow",
        jobs: {
          job1: { steps: [{ run: "echo test" }] },
          job2: { steps: [{ run: "echo test2" }] },
        },
        inputs: {
          input1: { type: "string", required: true },
          input2: { type: "string", default: "42" },
        },
        env: { ENV_VAR: "value" },
      };

      const result = workflowEngine.createExecution(complexWorkflow, {
        input1: "test",
      });

      expect(result.workflow).toBe(complexWorkflow);
      expect(result.workflow.jobs).toHaveProperty("job1");
      expect(result.workflow.jobs).toHaveProperty("job2");
      expect(result.workflow.env).toEqual({ ENV_VAR: "value" });
    });
  });
});
