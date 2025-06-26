import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { WorkflowService } from "../../../src/services/WorkflowService";
import {
  ClaudeWorkflow,
  WorkflowExecution,
} from "../../../src/types/WorkflowTypes";

// Mock file system at the top level to prevent any directory creation issues
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue("{}"),
  access: jest.fn().mockRejectedValue(new Error("File not found")), // Default to file not found
  readdir: jest.fn().mockResolvedValue([]),
  rm: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ isFile: () => true }),
}));

// Mock workspace folder
const mockWorkspaceFolder: vscode.WorkspaceFolder = {
  uri: vscode.Uri.file("/test/workspace"),
  name: "test-workspace",
  index: 0,
};

describe("WorkflowService", () => {
  let service: WorkflowService;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for tests
    // NOSONAR: /tmp is safe in test context for isolated test directories
    tempDir = path.join("/tmp", "workflow-test-" + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    // Create new mock workspace folder with temp dir
    const testWorkspaceFolder = {
      ...mockWorkspaceFolder,
      uri: vscode.Uri.file(tempDir),
    };
    service = new WorkflowService(testWorkspaceFolder);
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Failed to clean up temp directory:", error);
    }
  });

  describe("listWorkflows", () => {
    it("should return empty array when no workflows exist", async () => {
      // Mock access to reject (directory doesn't exist)
      (fs.access as jest.Mock).mockRejectedValueOnce(
        new Error("Directory not found"),
      );

      const workflows = await service.listWorkflows();
      expect(workflows.length).toBe(0);
    });

    it("should list Claude workflows", async () => {
      // Mock file system to return Claude workflow files
      (fs.access as jest.Mock).mockResolvedValueOnce(undefined);
      (fs.readdir as jest.Mock).mockResolvedValueOnce([
        "claude-test.yml",
        "regular-workflow.yml",
      ]);

      const workflowContent = `
name: Claude Test Workflow
jobs:
  test:
    steps:
      - uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: Test prompt
`;
      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce(workflowContent)
        .mockResolvedValueOnce("name: Regular Workflow\njobs: {}");

      const workflows = await service.listWorkflows();
      expect(workflows.length).toBe(1);
      expect(workflows[0].id).toBe("claude-test");
      expect(workflows[0].name).toBe("Claude Test Workflow");
    });
  });

  describe("saveWorkflow and loadWorkflow", () => {
    it("should save and load a workflow", async () => {
      const workflow: ClaudeWorkflow = {
        name: "Test Save Workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "step1",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Test prompt",
                  model: "claude-3-5-sonnet-latest",
                  output_session: true,
                },
              },
            ],
          },
        },
      };

      // Just test that the methods can be called without file system errors
      // Since we're mocking the file system, we can't test actual YAML serialization/deserialization
      await expect(
        service.saveWorkflow("claude-save-test", workflow),
      ).resolves.not.toThrow();

      // For load test, we need to provide a valid workflow structure
      const mockWorkflow: ClaudeWorkflow = {
        name: "Test Save Workflow",
        jobs: {
          main: {
            steps: [
              {
                id: "step1",
                uses: "anthropics/claude-pipeline-action@v1",
                with: {
                  prompt: "Test prompt",
                  model: "claude-3-5-sonnet-latest",
                  output_session: true,
                },
              },
            ],
          },
        },
      };

      // Mock the yaml parsing directly using module import
      const { WorkflowParser } = await import(
        "../../../src/services/WorkflowParser"
      );
      const originalParseYaml = WorkflowParser.parseYaml;
      WorkflowParser.parseYaml = jest.fn().mockReturnValue(mockWorkflow);

      try {
        const loaded = await service.loadWorkflow("claude-save-test");
        expect(loaded.name).toBe(workflow.name);
      } finally {
        // Restore original method
        WorkflowParser.parseYaml = originalParseYaml;
      }
    });
  });

  describe("deleteWorkflow", () => {
    it("should delete a workflow", async () => {
      // Mock fs operations for this test
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readdir as jest.Mock)
        .mockResolvedValueOnce(["claude-delete-test.yml"]) // Before delete
        .mockResolvedValueOnce([]); // After delete

      const workflowContent = `
name: Test Delete
jobs:
  main:
    steps:
      - uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: Delete me
`;
      (fs.readFile as jest.Mock).mockResolvedValue(workflowContent);
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      // Verify it exists
      const beforeDelete = await service.listWorkflows();
      expect(
        beforeDelete.some((w) => w.id === "claude-delete-test"),
      ).toBeTruthy();

      // Delete it
      await service.deleteWorkflow("claude-delete-test");

      // Verify it's gone
      const afterDelete = await service.listWorkflows();
      expect(
        afterDelete.some((w) => w.id === "claude-delete-test"),
      ).toBeFalsy();
    });
  });

  describe("createExecution", () => {
    it("should create workflow execution context", () => {
      const workflow: ClaudeWorkflow = {
        name: "Test Execution",
        jobs: {
          main: {
            steps: [
              {
                uses: "anthropics/claude-pipeline-action@v1",
                with: { prompt: "Execute" },
              },
            ],
          },
        },
      };

      const execution = service.createExecution(workflow, { task: "test" });

      expect(execution.workflow).toBe(workflow);
      expect(execution.inputs).toEqual({ task: "test" });
      expect(execution.outputs).toEqual({});
      expect(execution.currentStep).toBe(0);
      expect(execution.status).toBe("pending");
    });
  });

  describe("getExecutionSteps", () => {
    it("should extract Claude steps with metadata", () => {
      const workflow: ClaudeWorkflow = {
        name: "Test Steps",
        jobs: {
          prepare: {
            steps: [
              { run: 'echo "setup"' },
              {
                id: "analyze",
                uses: "anthropics/claude-pipeline-action@v1",
                with: { prompt: "Analyze" },
              },
            ],
          },
          execute: {
            steps: [
              {
                id: "implement",
                uses: "anthropics/claude-pipeline-action@v1",
                with: { prompt: "Implement" },
              },
              { run: "npm test" },
            ],
          },
        },
      };

      const steps = service.getExecutionSteps(workflow);

      expect(steps.length).toBe(2);
      expect(steps[0].jobName).toBe("prepare");
      expect(steps[0].step.id).toBe("analyze");
      expect(steps[0].index).toBe(1);
      expect(steps[1].jobName).toBe("execute");
      expect(steps[1].step.id).toBe("implement");
      expect(steps[1].index).toBe(0);
    });
  });

  describe("resolveStepVariables", () => {
    it("should resolve variables in step configuration", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const step: any = {
        id: "test",
        uses: "anthropics/claude-pipeline-action@v1",
        with: {
          prompt: "Task: ${{ inputs.task }}",
          working_directory: "${{ env.WORK_DIR }}",
          resume_session: "${{ steps.prev.outputs.session_id }}",
        },
      };

      const execution: WorkflowExecution = {
        workflow: {
          name: "Test",
          env: { WORK_DIR: "/project" },
          jobs: {},
        },
        inputs: { task: "Refactor code" },
        outputs: {
          prev: {
            outputs: {
              session_id: "sess_abc123",
            },
          },
        },
        currentStep: 0,
        status: "running",
      };

      const resolved = service.resolveStepVariables(step, execution);

      expect(resolved.with.prompt).toBe("Task: Refactor code");
      expect(resolved.with.working_directory).toBe("/project");
      expect(resolved.with.resume_session).toBe("sess_abc123");
    });
  });

  describe("updateExecutionOutput", () => {
    it("should update execution outputs", () => {
      const execution: WorkflowExecution = {
        workflow: { name: "Test", jobs: {} },
        inputs: {},
        outputs: {},
        currentStep: 0,
        status: "running",
      };

      service.updateExecutionOutput(execution, "step1", {
        session_id: "sess_123",
        result: "Step completed",
      });

      expect(execution.outputs.step1).toEqual({
        session_id: "sess_123",
        result: "Step completed",
      });
    });
  });

  describe("createSampleWorkflow", () => {
    it("should create a valid sample workflow", () => {
      const sample = WorkflowService.createSampleWorkflow();

      expect(sample.name).toBe("Claude Development Workflow");
      expect(
        sample.on?.workflow_dispatch?.inputs?.task_description,
      ).toBeTruthy();
      expect(sample.jobs.development).toBeTruthy();
      expect(sample.jobs.development.steps.length).toBe(3);

      // Verify step chaining
      const steps = sample.jobs.development.steps;
      expect(steps[0].id).toBe("analyze");
      expect(steps[0].with?.output_session).toBe(true);
      expect(steps[1].id).toBe("implement");
      expect(steps[1].with?.resume_session).toBe(
        "${{ steps.analyze.outputs.session_id }}",
      );
      expect(steps[2].id).toBe("test");
      expect(steps[2].with?.resume_session).toBe(
        "${{ steps.implement.outputs.session_id }}",
      );
    });
  });
});
