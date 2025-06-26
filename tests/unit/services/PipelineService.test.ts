import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { PipelineService } from "../../../src/services/PipelineService";
import { TaskItem } from "../../../src/services/ClaudeCodeService";
import { WorkflowParser } from "../../../src/services/WorkflowParser";

describe("PipelineService YAML Format", () => {
  let service: PipelineService;
  let tempDir: string;
  let context: vscode.ExtensionContext;

  beforeAll(async () => {
    // Create a mock extension context
    // NOSONAR: /tmp is safe in test context for isolated test directories
    tempDir = path.join("/tmp", "pipeline-test-" + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    context = {
      globalStorageUri: vscode.Uri.file(tempDir),
      extensionPath: "/mock/extension/path",
      extension: {
        packageJSON: { version: "1.0.0" },
      },
    } as any;

    // Mock vscode.workspace
    (global as any).vscode = {
      ...vscode,
      workspace: {
        workspaceFolders: [
          {
            uri: vscode.Uri.file(tempDir),
            name: "test-workspace",
            index: 0,
          },
        ],
      },
    };

    service = new PipelineService(context);
    // Explicitly set the root path to our temp directory
    service.setRootPath(tempDir);
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Failed to clean up temp directory:", error);
    }
  });

  describe("savePipeline", () => {
    it("should save pipeline as valid GitHub Actions YAML", async () => {
      const tasks: TaskItem[] = [
        {
          id: "analyze",
          name: "Analyze Code",
          prompt: "Analyze the codebase structure",
          resumePrevious: false,
          status: "pending",
        },
        {
          id: "implement",
          name: "Implement Feature",
          prompt: "Implement the requested feature",
          resumePrevious: true,
          status: "pending",
          model: "claude-3-5-sonnet-latest",
        },
        {
          id: "test",
          name: "Write Tests",
          prompt: "Write comprehensive tests",
          resumePrevious: true,
          status: "pending",
        },
      ];

      // Ensure the .github/workflows directory exists before saving
      const workflowsDir = path.join(tempDir, ".github", "workflows");
      await fs.mkdir(workflowsDir, { recursive: true });

      await service.savePipeline(
        "test-pipeline",
        "Test pipeline for unit tests",
        tasks,
        "claude-3-5-sonnet-latest",
        true,
      );

      // Verify the file was created in the correct location
      const workflowPath = path.join(
        tempDir,
        ".github",
        "workflows",
        "claude-test-pipeline.yml",
      );
      const exists = await fs
        .access(workflowPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBeTruthy(); // Workflow file should exist

      // Read and parse the YAML
      const yamlContent = await fs.readFile(workflowPath, "utf-8");
      const workflow = WorkflowParser.parseYaml(yamlContent);

      // Verify workflow structure
      expect(workflow.name).toBe("test-pipeline");
      expect(workflow.on?.workflow_dispatch).toBeTruthy();
      expect(workflow.jobs.pipeline).toBeTruthy();
      expect(workflow.jobs.pipeline.steps.length).toBe(3);

      // Verify step details
      const steps = workflow.jobs.pipeline.steps;
      expect(steps[0].id).toBe("analyze");
      expect(steps[0].name).toBe("Analyze Code");
      expect(steps[0].with?.prompt).toBe("Analyze the codebase structure");
      expect(steps[0].with?.output_session).toBe(true); // Should output session for next step

      expect(steps[1].id).toBe("implement");
      expect(steps[1].with?.model).toBe("claude-3-5-sonnet-latest");
      expect(steps[1].with?.resume_session).toBe(
        "${{ steps.analyze.outputs.session_id }}",
      );
      expect(steps[1].with?.output_session).toBe(true);

      expect(steps[2].id).toBe("test");
      expect(steps[2].with?.resume_session).toBe(
        "${{ steps.implement.outputs.session_id }}",
      );
      expect(steps[2].with?.output_session).toBeFalsy(); // Last step shouldn't output session
    });
  });

  describe("loadPipeline", () => {
    it("should load saved YAML workflow", async () => {
      // First save a pipeline
      const tasks: TaskItem[] = [
        {
          id: "task1",
          name: "First Task",
          prompt: "Do something",
          resumePrevious: false,
          status: "pending",
        },
      ];

      await service.savePipeline(
        "load-test",
        "Load test pipeline",
        tasks,
        "claude-3-5-sonnet-latest",
        false,
      );

      // Now load it
      const workflow = await service.loadPipeline("load-test");
      expect(workflow).toBeTruthy(); // Should load workflow
      if (workflow) {
        expect(workflow.name).toBe("load-test");

        // Convert back to tasks
        const loadedTasks = service.workflowToTaskItems(workflow);
        expect(loadedTasks.length).toBe(1);
        expect(loadedTasks[0].id).toBe("task1");
        expect(loadedTasks[0].prompt).toBe("Do something");
      }
    });
  });

  describe("workflowToTaskItems", () => {
    it("should correctly convert workflow to task items", async () => {
      const tasks: TaskItem[] = [
        {
          id: "step1",
          name: "Step 1",
          prompt: "First step",
          resumePrevious: false,
          status: "pending",
        },
        {
          id: "step2",
          name: "Step 2",
          prompt: "Second step",
          resumePrevious: true,
          status: "pending",
        },
      ];

      await service.savePipeline(
        "convert-test",
        "Conversion test",
        tasks,
        "claude-3-5-sonnet-latest",
        true,
      );
      const workflow = await service.loadPipeline("convert-test");
      expect(workflow).toBeTruthy();
      if (workflow) {
        const convertedTasks = service.workflowToTaskItems(workflow);
        expect(convertedTasks.length).toBe(2);
        expect(convertedTasks[0].resumePrevious).toBe(false);
        expect(convertedTasks[1].resumePrevious).toBe(true);
      }
    });
  });

  describe("listPipelines", () => {
    it("should list YAML workflows", async () => {
      // Save some pipelines
      await service.savePipeline(
        "list-test-1",
        "First pipeline",
        [],
        "claude-3-5-sonnet-latest",
        false,
      );
      await service.savePipeline(
        "list-test-2",
        "Second pipeline",
        [],
        "claude-3-5-sonnet-latest",
        false,
      );

      const pipelines = await service.listPipelines();
      expect(pipelines.includes("list test 1")).toBeTruthy();
      expect(pipelines.includes("list test 2")).toBeTruthy();
    });
  });
});
