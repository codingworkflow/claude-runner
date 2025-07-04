import { jest } from "@jest/globals";
import * as path from "path";
import * as fs from "fs";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import {
  ClaudeWorkflow,
  WorkflowExecution,
} from "../../src/types/WorkflowTypes";

// E2E workflow execution testing - complete workflow execution without pause/stop
let pipelineService: PipelineService;
let fixturesPath: string;
let workflowExecution: WorkflowExecution;

async function executeWorkflowSteps(
  workflow: ClaudeWorkflow,
): Promise<{ success: boolean; results: string[] }> {
  workflowExecution = {
    workflow: workflow,
    inputs: {},
    outputs: {},
    currentStep: 0,
    status: "running",
  };

  const results: string[] = [];
  const tasks = pipelineService.workflowToTaskItems(workflow);

  // Execute each step sequentially without pause
  for (let i = 0; i < tasks.length; i++) {
    workflowExecution.currentStep = i;
    const task = tasks[i];

    try {
      // Find the corresponding step in the workflow
      const job = Object.values(workflow.jobs)[0];
      const step = job.steps.find((s) => s.id === task.id);

      if (step?.with && (step.with as any).run) {
        // Execute the actual script
        const { spawn } = require("child_process"); // eslint-disable-line @typescript-eslint/no-var-requires
        const scriptPath = (step.with as any).run;

        const result = await new Promise<string>((resolve, reject) => {
          const child = spawn("bash", [scriptPath], {
            stdio: ["pipe", "pipe", "pipe"],
            cwd: process.cwd(),
          });

          let output = "";
          child.stdout.on("data", (data: Buffer) => {
            output += data.toString();
          });

          child.stderr.on("data", (data: Buffer) => {
            output += data.toString();
          });

          child.on("close", (code: number) => {
            if (code === 0) {
              resolve(output.trim());
            } else {
              reject(new Error(`Script exited with code ${code}: ${output}`));
            }
          });
        });

        results.push(`✓ ${task.name}: ${result}`);
        workflowExecution.outputs[task.id] = { result };
      } else {
        // Simulate Claude API call for non-script steps
        results.push(`✓ ${task.name}: [Simulated Claude execution]`);
        workflowExecution.outputs[task.id] = { result: "simulated" };
      }
    } catch (error) {
      results.push(`✗ ${task.name}: ${(error as Error).message}`);
      workflowExecution.status = "failed";
      workflowExecution.error = (error as Error).message;
      return { success: false, results };
    }
  }

  workflowExecution.status = "completed";
  return { success: true, results };
}

describe("Workflow Execution E2E Tests", () => {
  beforeEach(() => {
    // Create a real PipelineService with mock context
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

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("E2E Three-Step Workflow Execution", () => {
    test("should execute complete 3-step workflow from fixture without pause/stop", async () => {
      // Load real workflow from fixture
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "three-step-execution.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");

      // Parse with REAL WorkflowParser
      const workflow = WorkflowParser.parseYaml(content);

      // Verify workflow structure
      expect(workflow.name).toBe("three-step-execution");
      expect(Object.keys(workflow.jobs)).toContain("test");

      // Convert to task items with REAL PipelineService
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe("step1");
      expect(tasks[1].id).toBe("step2");
      expect(tasks[2].id).toBe("step3");

      // Verify session reference chain
      expect(tasks[1].resumeFromTaskId).toBe("step1");
      expect(tasks[2].resumeFromTaskId).toBe("step2");

      // Execute complete workflow without interruption
      console.log("🚀 Starting 3-step workflow execution...");
      const startTime = Date.now();

      const result = await executeWorkflowSteps(workflow);

      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`⏱️  Workflow completed in ${duration}ms`);

      // Verify execution success
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);

      // Verify each step executed correctly
      expect(result.results[0]).toContain("Step 1 completed successfully");
      expect(result.results[1]).toContain("Step 2 completed successfully");
      expect(result.results[2]).toContain("Step 3 completed successfully");

      // Verify workflow execution state
      expect(workflowExecution.status).toBe("completed");
      expect(workflowExecution.currentStep).toBe(2); // Last step index

      // Verify all outputs captured
      expect(workflowExecution.outputs["step1"]).toBeDefined();
      expect(workflowExecution.outputs["step2"]).toBeDefined();
      expect(workflowExecution.outputs["step3"]).toBeDefined();

      // Verify output content
      expect(workflowExecution.outputs["step1"].result).toContain(
        "Step 1 completed successfully",
      );
      expect(workflowExecution.outputs["step2"].result).toContain(
        "Step 2 completed successfully",
      );
      expect(workflowExecution.outputs["step3"].result).toContain(
        "Step 3 completed successfully",
      );

      console.log("✅ All 3 steps executed successfully");
      console.log("📋 Final results:", result.results);
    }, 10000); // 10s timeout

    test("should handle workflow execution failure in middle step", async () => {
      // Use pre-created fixture workflow with failing middle step
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "failing-middle-step.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");
      const workflow = WorkflowParser.parseYaml(content);

      console.log("🚀 Testing workflow failure handling...");

      const result = await executeWorkflowSteps(workflow);

      // Should fail on step2
      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2); // step1 + failed step2
      expect(result.results[0]).toContain("Step 1 completed successfully");
      expect(result.results[1]).toContain("timed out");

      // Verify execution state
      expect(workflowExecution.status).toBe("failed");
      expect(workflowExecution.error).toBeDefined();

      // Step1 should have output, step2 should not, step3 should not run
      expect(workflowExecution.outputs["step1"]).toBeDefined();
      expect(workflowExecution.outputs["step2"]).toBeUndefined();
      expect(workflowExecution.outputs["step3"]).toBeUndefined();

      console.log("✅ Failure handling working correctly");
    }, 10000);

    test("should verify session reference chain validation", async () => {
      // Load the 3-step workflow
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "three-step-execution.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");
      const workflow = WorkflowParser.parseYaml(content);

      // Extract Claude steps with real parser
      const claudeSteps = WorkflowParser.extractClaudeSteps(workflow);

      // Verify session reference chain
      expect(claudeSteps).toHaveLength(3);
      expect(claudeSteps[0].id).toBe("step1");
      expect(claudeSteps[0].with.output_session).toBe(true);
      expect(claudeSteps[0].with.resume_session).toBeUndefined();

      expect(claudeSteps[1].id).toBe("step2");
      expect(claudeSteps[1].with.resume_session).toBe("step1");

      expect(claudeSteps[2].id).toBe("step3");
      expect(claudeSteps[2].with.resume_session).toBe("step2");

      console.log("✅ Session reference chain validated correctly");
    });
  });

  describe("E2E Workflow Parser Integration", () => {
    test("should parse and validate 3-step workflow structure", () => {
      const workflowPath = path.join(
        fixturesPath,
        "workflows",
        "three-step-execution.yml",
      );
      const content = fs.readFileSync(workflowPath, "utf-8");

      // Parse with real parser
      const workflow = WorkflowParser.parseYaml(content);

      expect(workflow.name).toBe("three-step-execution");
      expect(workflow.jobs.test.steps).toHaveLength(3);

      // Verify each step configuration
      const steps = workflow.jobs.test.steps;
      expect(steps[0].id).toBe("step1");
      expect(steps[0].uses).toBe("anthropics/claude-pipeline-action@v1");
      expect((steps[0].with as any).run).toBe(
        "./tests/fixtures/scripts/claude-step1.sh",
      );

      expect(steps[1].id).toBe("step2");
      expect((steps[1].with as any).resume_session).toBe("step1");

      expect(steps[2].id).toBe("step3");
      expect((steps[2].with as any).resume_session).toBe("step2");
    });
  });
});
