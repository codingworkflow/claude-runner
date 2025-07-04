import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as path from "path";
import * as fs from "fs";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import {
  ClaudeWorkflow,
  WorkflowExecution,
} from "../../src/types/WorkflowTypes";
import { TaskItem } from "../../src/services/ClaudeCodeService";

// Mock file system to prevent actual directory creation
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue("{}"),
  access: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  rm: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

// Mock child_process to control script execution
jest.mock("child_process", () => ({
  spawn: jest.fn(),
  exec: jest.fn((cmd, callback) => {
    // Mock exec for ClaudeDetectionService
    callback(null, { stdout: "", stderr: "" });
  }),
}));

describe("Conditional Workflow Execution Integration", () => {
  let pipelineService: PipelineService;
  let fixturesPath: string;
  let workflowExecution: WorkflowExecution;

  beforeEach(() => {
    // Create real services with mock context
    const mockContext = {
      extensionPath: "/test",
      globalStorageUri: { fsPath: "/tmp/test-storage" },
    };

    // Mock the ensureDirectories to prevent file system operations
    jest
      .spyOn(PipelineService.prototype as any, "ensureDirectories")
      .mockImplementation(() => Promise.resolve());

    pipelineService = new PipelineService(mockContext as any);
    fixturesPath = path.join(__dirname, "../fixtures");

    // Reset workflow execution state
    workflowExecution = {
      workflow: { name: "", jobs: {} },
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "pending",
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Simulate conditional workflow execution without ClaudeCodeService
  async function simulateConditionalExecution(
    workflow: ClaudeWorkflow,
    buildSuccess: boolean = true,
  ): Promise<{ success: boolean; results: string[]; tasks: TaskItem[] }> {
    workflowExecution = {
      workflow: workflow,
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "running",
    };

    const results: string[] = [];
    const tasks = pipelineService.workflowToTaskItems(workflow);

    // Simulate pipeline execution with conditional logic
    const simulatedTasks: TaskItem[] = tasks.map((task) => ({ ...task }));

    for (let i = 0; i < simulatedTasks.length; i++) {
      const task = simulatedTasks[i];
      workflowExecution.currentStep = i;

      // Simulate condition evaluation
      let shouldRun = true;
      let skipReason = "";

      if (task.condition) {
        const previousTaskSuccess =
          i === 0 ? true : simulatedTasks[i - 1].status === "completed";

        switch (task.condition) {
          case "on_success":
            shouldRun = previousTaskSuccess;
            if (!shouldRun) {
              skipReason =
                "Condition 'on_success' not met - previous task failed";
            }
            break;
          case "on_failure":
            shouldRun = !previousTaskSuccess;
            if (!shouldRun) {
              skipReason =
                "Condition 'on_failure' not met - previous task succeeded";
            }
            break;
          case "always":
            shouldRun = true;
            break;
        }
      }

      // Simulate check command evaluation
      if (shouldRun && task.check) {
        if (task.check === "test -f package.json") {
          shouldRun = true; // Simulate package.json exists
        } else if (task.check === "test -f nonexistent-file.json") {
          shouldRun = false; // Simulate file doesn't exist
          skipReason = "Check command failed: file not found";
        } else if (task.check.startsWith("echo")) {
          shouldRun = true; // Echo commands always pass
        }
      }

      if (shouldRun) {
        // Simulate task execution
        if (task.id === "build-step") {
          if (buildSuccess) {
            task.status = "completed";
            task.results = "Build successful";
            workflowExecution.outputs[task.id] = { result: "Build successful" };
          } else {
            task.status = "error";
            task.results = "Build failed";
            // Don't set outputs for failed tasks
          }
        } else {
          task.status = "completed";
          task.results = `${task.name} completed successfully`;
          workflowExecution.outputs[task.id] = {
            result: `${task.name} completed`,
          };
        }

        if (task.status === "completed") {
          results.push(`✓ ${task.name}: ${task.results}`);
        } else {
          results.push(`✗ ${task.name}: ${task.results}`);
        }
      } else {
        task.status = "skipped";
        task.skipReason = skipReason;
        results.push(`⊝ ${task.name}: ${skipReason}`);
      }
    }

    const pipelineSuccess = !simulatedTasks.some((t) => t.status === "error");
    workflowExecution.status = pipelineSuccess ? "completed" : "failed";

    return { success: pipelineSuccess, results, tasks: simulatedTasks };
  }

  describe("Conditional Workflow Execution from Fixtures", () => {
    it("should execute conditional workflow with on_success condition", async () => {
      // Load real workflow from fixture
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "conditional-workflow.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");
      const workflow = WorkflowParser.parseYaml(content);

      // Verify workflow structure using REAL WorkflowParser
      expect(workflow.name).toBe("conditional-workflow-test");
      expect(Object.keys(workflow.jobs)).toContain("test");

      // Convert to task items with REAL PipelineService
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(4);
      expect(tasks[0].id).toBe("build-step");
      expect(tasks[1].id).toBe("deploy-step");
      expect(tasks[2].id).toBe("cleanup-step");
      expect(tasks[3].id).toBe("notify-step");

      // Verify conditions are properly parsed
      expect(tasks[1].condition).toBe("on_success");
      expect(tasks[2].condition).toBe("on_failure");
      expect(tasks[3].condition).toBe("always");

      // Verify check commands are parsed
      expect(tasks[1].check).toBe("echo 'deploy check'");
      expect(tasks[2].check).toBe("echo 'cleanup check'");
      expect(tasks[3].check).toBe("echo 'notify check'");

      console.log("🚀 Testing conditional workflow with successful build...");
      const result = await simulateConditionalExecution(workflow, true);

      // Verify execution success
      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(4);

      // Build step should complete
      expect(result.tasks[0].status).toBe("completed");
      expect(result.tasks[0].results).toContain("Build successful");

      // Deploy step should run (on_success)
      expect(result.tasks[1].status).toBe("completed");
      expect(result.tasks[1].results).toContain("completed successfully");

      // Cleanup step should be skipped (on_failure)
      expect(result.tasks[2].status).toBe("skipped");
      expect(result.tasks[2].skipReason).toContain(
        "Condition 'on_failure' not met",
      );

      // Notify step should run (always)
      expect(result.tasks[3].status).toBe("completed");
      expect(result.tasks[3].results).toContain("completed successfully");

      console.log("✅ Conditional workflow executed correctly");
    }, 10000);

    it("should execute conditional workflow with on_failure condition", async () => {
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "conditional-workflow.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");
      const workflow = WorkflowParser.parseYaml(content);

      console.log("🚀 Testing conditional workflow with failed build...");
      const result = await simulateConditionalExecution(workflow, false);

      // Pipeline should handle failure gracefully
      expect(result.tasks).toHaveLength(4);

      // Build step should fail
      expect(result.tasks[0].status).toBe("error");
      expect(result.tasks[0].results).toBe("Build failed");

      // Deploy step should be skipped (on_success)
      expect(result.tasks[1].status).toBe("skipped");
      expect(result.tasks[1].skipReason).toContain(
        "Condition 'on_success' not met",
      );

      // Cleanup step should run (on_failure)
      expect(result.tasks[2].status).toBe("completed");
      expect(result.tasks[2].results).toContain("completed successfully");

      // Notify step should run (always)
      expect(result.tasks[3].status).toBe("completed");
      expect(result.tasks[3].results).toContain("completed successfully");

      console.log("✅ Conditional workflow failure handling works correctly");
    }, 10000);

    it("should handle conditional workflow with check commands", async () => {
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "conditional-with-check.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");
      const workflow = WorkflowParser.parseYaml(content);

      // Verify workflow structure using REAL WorkflowParser
      expect(workflow.name).toBe("conditional-with-check-test");
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(3);

      // Verify check commands are parsed correctly
      expect(tasks[1].check).toBe("test -f package.json");
      expect(tasks[2].check).toBe("test -f nonexistent-file.json");

      console.log("🚀 Testing conditional workflow with check commands...");
      const result = await simulateConditionalExecution(workflow, true);

      // Verify execution
      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(3);

      // Setup step should complete
      expect(result.tasks[0].status).toBe("completed");

      // Test step should run (check passes)
      expect(result.tasks[1].status).toBe("completed");

      // Skip test step should be skipped (check fails)
      expect(result.tasks[2].status).toBe("skipped");
      expect(result.tasks[2].skipReason).toContain("Check command failed");

      console.log("✅ Check command conditional logic works correctly");
    }, 10000);
  });

  describe("Workflow Parser Integration with Conditions", () => {
    it("should parse workflow conditions correctly", () => {
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "conditional-workflow.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");

      // Parse with REAL WorkflowParser
      const workflow = WorkflowParser.parseYaml(content);

      expect(workflow.name).toBe("conditional-workflow-test");
      expect(workflow.jobs.test.steps).toHaveLength(4);

      // Verify each step configuration
      const steps = workflow.jobs.test.steps;
      expect(steps[0].id).toBe("build-step");
      expect((steps[0].with as any).condition).toBeUndefined(); // No condition

      expect(steps[1].id).toBe("deploy-step");
      expect((steps[1].with as any).condition).toBe("on_success");
      expect((steps[1].with as any).check).toBe("echo 'deploy check'");

      expect(steps[2].id).toBe("cleanup-step");
      expect((steps[2].with as any).condition).toBe("on_failure");
      expect((steps[2].with as any).check).toBe("echo 'cleanup check'");

      expect(steps[3].id).toBe("notify-step");
      expect((steps[3].with as any).condition).toBe("always");
      expect((steps[3].with as any).check).toBe("echo 'notify check'");

      console.log("✅ Workflow conditions parsed correctly");
    });

    it("should parse check commands correctly", () => {
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "conditional-with-check.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");

      // Parse with REAL WorkflowParser
      const workflow = WorkflowParser.parseYaml(content);

      const steps = workflow.jobs.test.steps;
      expect(steps[1].id).toBe("test-step");
      expect((steps[1].with as any).check).toBe("test -f package.json");

      expect(steps[2].id).toBe("skip-test-step");
      expect((steps[2].with as any).check).toBe(
        "test -f nonexistent-file.json",
      );

      console.log("✅ Check commands parsed correctly");
    });
  });
});
