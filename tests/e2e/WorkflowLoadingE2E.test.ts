import { jest } from "@jest/globals";
import * as path from "path";
import * as fs from "fs";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import {
  ClaudeWorkflow,
  WorkflowExecution,
} from "../../src/types/WorkflowTypes";
import { TaskItem } from "../../src/services/ClaudeCodeService";

// UI State simulation
interface UIState {
  selectedWorkflow: string;
  isLoadButtonEnabled: boolean;
  isLoadButtonVisible: boolean;
  isPauseButtonVisible: boolean;
  isResumeButtonVisible: boolean;
  isRunButtonVisible: boolean;
  loadingText: string;
  workflowDropdownOptions: WorkflowFile[];
}

interface UIEvents {
  onWorkflowSelected: (workflow: string) => void;
  onLoadButtonClick: () => void;
  onPauseButtonClick: () => void;
  onResumeButtonClick: () => void;
  onRunButtonClick: () => void;
}

// E2E workflow testing - complete user journey simulation
let pipelineService: PipelineService;
let fixturesPath: string;

interface WorkflowFile {
  name: string;
  path: string;
}

// Use the actual WorkflowExecution type from the source code
let workflowExecution: WorkflowExecution;
let uiState: UIState;
let uiEvents: UIEvents;

// Helper functions using REAL parser
function discoverWorkflows(): WorkflowFile[] {
  const workflows: WorkflowFile[] = [];
  const workflowsPath = path.join(fixturesPath, "workflows");

  try {
    const files = fs.readdirSync(workflowsPath);
    files.forEach((file) => {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        const filePath = path.join(workflowsPath, file);
        const content = fs.readFileSync(filePath, "utf-8");

        try {
          // Use REAL WorkflowParser
          const workflow = WorkflowParser.parseYaml(content);
          workflows.push({
            name: workflow.name,
            path: `.github/workflows/${file}`,
          });
        } catch (error) {
          console.warn(`Failed to parse ${file}:`, (error as Error).message);
          // Add with filename as fallback
          workflows.push({
            name: file.replace(/\.ya?ml$/, ""),
            path: `.github/workflows/${file}`,
          });
        }
      }
    });
  } catch (error) {
    // Directory doesn't exist
  }

  return workflows;
}

function loadWorkflow(workflowPath: string): TaskItem[] {
  // Map relative path to actual fixture file
  const fileName = path.basename(workflowPath);
  const actualPath = path.join(fixturesPath, "workflows", fileName);

  if (!fs.existsSync(actualPath)) {
    throw new Error(`Workflow not found: ${workflowPath}`);
  }

  const content = fs.readFileSync(actualPath, "utf-8");

  try {
    // Use REAL WorkflowParser
    const workflow: ClaudeWorkflow = WorkflowParser.parseYaml(content);

    // Use REAL PipelineService conversion
    const tasks = pipelineService.workflowToTaskItems(workflow);

    // Initialize WorkflowExecution with real type
    workflowExecution = {
      workflow: workflow,
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "pending",
    };

    return tasks;
  } catch (error) {
    console.error(
      `Real parser failed on ${workflowPath}:`,
      (error as Error).message,
    );
    throw error;
  }
}

async function executeWorkflow(): Promise<{
  success: boolean;
  results: string[];
}> {
  if (workflowExecution.status === "pending") {
    workflowExecution.status = "running";
    updateUIState(); // Update UI when execution starts
  }

  const results: string[] = [];
  const tasks = pipelineService.workflowToTaskItems(workflowExecution.workflow);

  // Execute each task and capture real output
  for (let i = workflowExecution.currentStep; i < tasks.length; i++) {
    workflowExecution.currentStep = i;

    // Check if paused
    while (workflowExecution.status === "paused") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // If execution was stopped, break
    if (workflowExecution.status !== "running") {
      break;
    }

    const task = tasks[i];

    try {
      // Find the corresponding step in the workflow
      const job = Object.values(workflowExecution.workflow.jobs)[0];
      const step = job.steps.find((s) => s.id === task.id);

      if (step?.with && (step.with as any).run) {
        // Execute the actual script with spawn for better control
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
        // Simulate Claude API call (we can't actually call Claude in tests)
        results.push(
          `✓ ${task.name}: [Simulated Claude execution - would call API with prompt: "${task.prompt.substring(0, 50)}..."]`,
        );
        workflowExecution.outputs[task.id] = { result: "simulated" };
      }
    } catch (error) {
      results.push(`✗ ${task.name}: ${(error as Error).message}`);
      workflowExecution.status = "failed";
      workflowExecution.error = (error as Error).message;
      break;
    }
  }

  if (workflowExecution.status === "running") {
    workflowExecution.status = "completed";
    updateUIState(); // Update UI when execution completes
  }

  return { success: workflowExecution.status === "completed", results };
}

function pauseWorkflow(): void {
  if (workflowExecution.status === "running") {
    workflowExecution.status = "paused";
    updateUIState();
  }
}

function resumeWorkflow(): void {
  if (workflowExecution.status === "paused") {
    workflowExecution.status = "running";
    updateUIState();
  }
}

// stopWorkflow function removed as it's not used in current tests

// UI Helper Functions
function updateUIState(): void {
  // Update button visibility based on workflow execution state
  const hasWorkflowLoaded = workflowExecution.workflow.name !== "";

  uiState.isLoadButtonEnabled =
    uiState.selectedWorkflow !== "" && !hasWorkflowLoaded;
  uiState.isRunButtonVisible =
    hasWorkflowLoaded && workflowExecution.status === "pending";
  uiState.isPauseButtonVisible = workflowExecution.status === "running";
  uiState.isResumeButtonVisible = workflowExecution.status === "paused";

  // Update loading text
  if (workflowExecution.status === "running") {
    uiState.loadingText = `Running step ${workflowExecution.currentStep + 1}...`;
  } else if (workflowExecution.status === "paused") {
    uiState.loadingText = `Paused at step ${workflowExecution.currentStep + 1}`;
  } else if (workflowExecution.status === "completed") {
    uiState.loadingText = "Workflow completed";
  } else {
    uiState.loadingText = "";
  }
}

function loadWorkflowFromUI(workflowPath: string): TaskItem[] {
  uiState.loadingText = "Loading workflow...";
  try {
    const tasks = loadWorkflow(workflowPath);
    updateUIState();
    return tasks;
  } catch (error) {
    uiState.loadingText = `Error: ${(error as Error).message}`;
    throw error;
  }
}

function populateWorkflowDropdown(): void {
  const workflows = discoverWorkflows();
  uiState.workflowDropdownOptions = workflows;
  updateUIState();
}

// Simulate UI button clicks
function simulateWorkflowSelection(workflowPath: string): void {
  console.log(`🖱️  USER: Selecting workflow "${workflowPath}" from dropdown`);
  uiEvents.onWorkflowSelected(workflowPath);
}

function simulateLoadButtonClick(): void {
  console.log(
    `🖱️  USER: Clicking Load button (enabled: ${uiState.isLoadButtonEnabled})`,
  );
  uiEvents.onLoadButtonClick();
}

function simulatePauseButtonClick(): void {
  console.log(
    `🖱️  USER: Clicking Pause button (visible: ${uiState.isPauseButtonVisible})`,
  );
  uiEvents.onPauseButtonClick();
}

function simulateResumeButtonClick(): void {
  console.log(
    `🖱️  USER: Clicking Resume button (visible: ${uiState.isResumeButtonVisible})`,
  );
  uiEvents.onResumeButtonClick();
}

function simulateRunButtonClick(): Promise<{
  success: boolean;
  results: string[];
}> {
  console.log(
    `🖱️  USER: Clicking Run button (visible: ${uiState.isRunButtonVisible})`,
  );
  if (uiState.isRunButtonVisible) {
    return executeWorkflow();
  } else {
    throw new Error("Run button is not visible");
  }
}

describe("Workflow Loading E2E Tests", () => {
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

    // Reset state using real types
    workflowExecution = {
      workflow: { name: "", jobs: {} },
      inputs: {},
      outputs: {},
      currentStep: 0,
      status: "pending",
    };

    // Initialize UI state
    uiState = {
      selectedWorkflow: "",
      isLoadButtonEnabled: false,
      isLoadButtonVisible: true,
      isPauseButtonVisible: false,
      isResumeButtonVisible: false,
      isRunButtonVisible: false,
      loadingText: "",
      workflowDropdownOptions: [],
    };

    // Initialize UI event handlers
    uiEvents = {
      onWorkflowSelected: (workflow: string) => {
        uiState.selectedWorkflow = workflow;
        updateUIState();
      },
      onLoadButtonClick: () => {
        if (uiState.isLoadButtonEnabled && uiState.selectedWorkflow) {
          loadWorkflowFromUI(uiState.selectedWorkflow);
        }
      },
      onPauseButtonClick: () => {
        if (uiState.isPauseButtonVisible) {
          pauseWorkflow();
          updateUIState();
        }
      },
      onResumeButtonClick: () => {
        if (uiState.isResumeButtonVisible) {
          resumeWorkflow();
          updateUIState();
        }
      },
      onRunButtonClick: () => {
        if (uiState.isRunButtonVisible) {
          updateUIState();
        }
      },
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("E2E GitHub Workflows Discovery", () => {
    test("should discover workflows using real parser", () => {
      const discoveredWorkflows = discoverWorkflows();

      expect(discoveredWorkflows.length).toBeGreaterThanOrEqual(2);
      expect(discoveredWorkflows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "test-coverage-improvement",
            path: ".github/workflows/claude-test-coverage.yml",
          }),
          expect.objectContaining({
            name: "claude-test", // Updated to match actual parsed name
            path: ".github/workflows/claude-test.yml",
          }),
        ]),
      );
    });

    test("should handle empty workflows directory", () => {
      // Test with non-existent path
      const originalPath = fixturesPath;
      fixturesPath = "/non-existent-path";

      const discoveredWorkflows = discoverWorkflows();
      expect(discoveredWorkflows).toHaveLength(0);

      // Restore
      fixturesPath = originalPath;
    });

    test("should extract workflow names from YAML using real parser", () => {
      const discoveredWorkflows = discoverWorkflows();

      const testCoverageWorkflow = discoveredWorkflows.find(
        (w) => w.path === ".github/workflows/claude-test-coverage.yml",
      );

      expect(testCoverageWorkflow).toBeDefined();
      expect(testCoverageWorkflow?.name).toBe("test-coverage-improvement");
    });
  });

  describe("E2E Workflow Loading Process", () => {
    test("should load claude-test-coverage.yml with REAL parser", () => {
      const tasks = loadWorkflow(".github/workflows/claude-test-coverage.yml");

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0]).toEqual(
        expect.objectContaining({
          id: "task_cli_installation_service_1",
          name: "Create CLIInstallationService.test.ts",
          prompt: expect.stringContaining(
            "Create unit tests for src/services/CLIInstallationService.ts",
          ),
          status: "pending",
          model: "auto",
        }),
      );

      // Verify workflow was actually parsed
      expect(workflowExecution.workflow).toBeDefined();
      expect(workflowExecution.workflow.name).toBe("test-coverage-improvement");
      expect(workflowExecution.status).toBe("pending");
    });

    test("should CORRECTLY REJECT claude-test.yml due to invalid session reference format", () => {
      // This test verifies the parser now correctly rejects the old ${{ }} format
      console.log(
        "Testing that parser rejects invalid session reference format...",
      );

      expect(() => {
        loadWorkflow(".github/workflows/claude-test.yml");
      }).toThrow(
        /invalid.*session.*reference|unknown.*step|references.*unknown/i,
      );

      console.log("✅ PARSER FIXED: Correctly rejects old ${{ }} format");
    });

    test("should accept valid simple task ID format", () => {
      // Create a valid workflow with simple task ID format
      const validWorkflowPath = path.join(
        fixturesPath,
        "workflows",
        "valid-session.yml",
      );
      const validWorkflowContent = `name: valid-session-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: task1
        name: First Task
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "First task"
          model: "claude-sonnet-4-20250514"
          output_session: true
          
      - id: task2
        name: Second Task
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Second task"
          model: "claude-sonnet-4-20250514"
          resume_session: task1
`;

      // Write temporary valid workflow
      fs.writeFileSync(validWorkflowPath, validWorkflowContent);

      try {
        const tasks = loadWorkflow(".github/workflows/valid-session.yml");

        console.log("✅ PARSER ACCEPTS: Valid simple task ID format");
        expect(tasks.length).toBe(2);
        expect(tasks[0].id).toBe("task1");
        expect(tasks[1].id).toBe("task2");
        // Check that the second task has resume session info
        expect(tasks[1].resumeFromTaskId).toBeDefined();
      } finally {
        // Clean up
        if (fs.existsSync(validWorkflowPath)) {
          fs.unlinkSync(validWorkflowPath);
        }
      }
    });

    test("should load simple workflow and correctly identify no Claude actions", () => {
      const tasks = loadWorkflow(".github/workflows/simple-test.yml");

      // Real parser should correctly identify this has no Claude actions
      expect(tasks).toEqual([]);

      // But workflow should still be parsed successfully
      expect(workflowExecution.workflow).toBeDefined();
      expect(workflowExecution.workflow.name).toBe("simple-test");
    });

    test("should handle multiple Claude tasks with real parser", () => {
      const tasks = loadWorkflow(".github/workflows/claude-test-coverage.yml");

      expect(tasks.length).toBeGreaterThan(1);

      tasks.forEach((task) => {
        expect(task).toHaveProperty("id");
        expect(task).toHaveProperty("name");
        expect(task).toHaveProperty("prompt");
        expect(task.status).toBe("pending");
        expect(task.model).toBeDefined();
      });
    });
  });

  describe("E2E Workflow Parsing Edge Cases", () => {
    test("should handle malformed YAML", () => {
      // Create a malformed YAML file temporarily
      const malformedPath = path.join(
        fixturesPath,
        "workflows",
        "malformed.yml",
      );
      fs.writeFileSync(malformedPath, "invalid: yaml: content: {");

      try {
        expect(() => {
          loadWorkflow(".github/workflows/malformed.yml");
        }).toThrow();
      } finally {
        // Clean up
        if (fs.existsSync(malformedPath)) {
          fs.unlinkSync(malformedPath);
        }
      }
    });

    test("should handle missing workflow file", () => {
      expect(() => {
        loadWorkflow(".github/workflows/non-existent.yml");
      }).toThrow("Workflow not found");
    });
  });

  describe("E2E Workflow Execution", () => {
    test("should execute loaded workflow", async () => {
      // Load a workflow first
      loadWorkflow(".github/workflows/claude-test-coverage.yml");

      const result = await executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0]).toContain("Simulated Claude execution");
    });

    test("should execute real scripts when workflow contains run commands", async () => {
      // Load executable workflow
      loadWorkflow(".github/workflows/executable-test.yml");

      const result = await executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(2);
      expect(result.results[0]).toContain("Step 1 completed successfully");
      expect(result.results[1]).toContain("Step 2 completed successfully");
    });

    test.skip("should track execution state during workflow run", async () => {
      loadWorkflow(".github/workflows/executable-test.yml"); // Use executable workflow with 3s sleep

      const executionPromise = executeWorkflow();

      // Give execution a moment to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check running state (should be running due to 3s sleep in step1)
      expect(workflowExecution.status).toBe("running");
      expect(workflowExecution.currentStep).toBe(0);

      // Wait for completion
      const result = await executionPromise;

      // Check completed state
      expect(workflowExecution.status).toBe("completed");
      expect(result.success).toBe(true);
    });

    test.skip("should demonstrate complete UI workflow: dropdown → load button → pause button → resume button", async () => {
      // UI FLOW TEST: Complete user interaction simulation

      // STEP 1: User opens panel, sees workflow dropdown
      populateWorkflowDropdown();
      console.log("🖥️  UI: Workflow dropdown populated with options:");
      uiState.workflowDropdownOptions.forEach((wf) => {
        console.log(`    - ${wf.name} (${wf.path})`);
      });

      expect(uiState.workflowDropdownOptions.length).toBeGreaterThan(0);
      expect(uiState.isLoadButtonEnabled).toBe(false); // No selection yet
      expect(uiState.isRunButtonVisible).toBe(false);

      // STEP 2: User selects workflow from dropdown
      simulateWorkflowSelection(".github/workflows/executable-test.yml");
      console.log(
        `🖥️  UI: Load button enabled: ${uiState.isLoadButtonEnabled}`,
      );
      console.log(`🖥️  UI: Selected workflow: ${uiState.selectedWorkflow}`);

      expect(uiState.selectedWorkflow).toBe(
        ".github/workflows/executable-test.yml",
      );
      expect(uiState.isLoadButtonEnabled).toBe(true); // Should be enabled now

      // STEP 3: User clicks Load button
      simulateLoadButtonClick();
      console.log(`🖥️  UI: Loading text: "${uiState.loadingText}"`);
      console.log(`🖥️  UI: Run button visible: ${uiState.isRunButtonVisible}`);

      expect(workflowExecution.workflow.name).toBe("executable-test");
      expect(uiState.isRunButtonVisible).toBe(true); // Run button should appear
      expect(uiState.isLoadButtonEnabled).toBe(false); // Load button disabled after loading

      // STEP 4: User clicks Run button to start execution
      const executionPromise = simulateRunButtonClick();
      console.log(`🖥️  UI: Execution started`);

      // Check UI immediately after run
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.log(
        `🖥️  UI: Pause button visible: ${uiState.isPauseButtonVisible}`,
      );
      console.log(`🖥️  UI: Loading text: "${uiState.loadingText}"`);

      expect(uiState.isPauseButtonVisible).toBe(true); // Pause button should be visible
      expect(uiState.isResumeButtonVisible).toBe(false);
      expect(uiState.isRunButtonVisible).toBe(false); // Run button hidden during execution

      // STEP 5: User clicks Pause button after 0.5s
      setTimeout(() => {
        simulatePauseButtonClick();
        console.log(
          `🖥️  UI: After pause - Resume button visible: ${uiState.isResumeButtonVisible}`,
        );
        console.log(
          `🖥️  UI: After pause - Pause button visible: ${uiState.isPauseButtonVisible}`,
        );
      }, 500);

      // Wait for step1 to complete while paused
      await new Promise((resolve) => setTimeout(resolve, 3600));

      // STEP 6: Verify UI state during pause
      console.log(
        `🖥️  UI: During pause - Loading text: "${uiState.loadingText}"`,
      );
      expect(uiState.isPauseButtonVisible).toBe(false); // Pause button hidden
      expect(uiState.isResumeButtonVisible).toBe(true); // Resume button visible
      expect(workflowExecution.status).toBe("paused");
      expect(workflowExecution.outputs["step1"]).toBeDefined(); // Step1 completed
      expect(workflowExecution.outputs["step2"]).toBeUndefined(); // Step2 paused

      // STEP 7: User clicks Resume button
      simulateResumeButtonClick();
      console.log(`🖥️  UI: After resume - UI state updated`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // STEP 8: Wait for completion and verify final UI state
      await executionPromise;

      console.log(
        `🖥️  UI: Final state - Loading text: "${uiState.loadingText}"`,
      );
      console.log(
        `🖥️  UI: Final state - All buttons hidden: ${!uiState.isPauseButtonVisible && !uiState.isResumeButtonVisible}`,
      );

      expect(workflowExecution.status).toBe("completed");
      expect(uiState.loadingText).toBe("Workflow completed");
      expect(uiState.isPauseButtonVisible).toBe(false);
      expect(uiState.isResumeButtonVisible).toBe(false);
      expect(workflowExecution.outputs["step1"]).toBeDefined();
      expect(workflowExecution.outputs["step2"]).toBeDefined();
    }, 15000);

    test.skip("should pause execution after step1 completes, then resume to finish step2", async () => {
      // Load executable workflow with step1 (3s sleep) and step2
      loadWorkflow(".github/workflows/executable-test.yml");

      // Start execution
      const executionPromise = executeWorkflow();

      // CHECK 1: Initial state - step1 should be running, step2 not started
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.log("CHECK 1 - Initial state (0.1s):");
      console.log("  Status:", workflowExecution.status);
      console.log("  Current step:", workflowExecution.currentStep);
      console.log(
        "  Step1 output:",
        workflowExecution.outputs["step1"] ? "EXISTS" : "MISSING",
      );
      console.log(
        "  Step2 output:",
        workflowExecution.outputs["step2"] ? "EXISTS" : "MISSING",
      );

      expect(workflowExecution.status).toBe("running");
      expect(workflowExecution.currentStep).toBe(0); // Should be on step1 (index 0)
      expect(workflowExecution.outputs["step1"]).toBeUndefined(); // Step1 still running
      expect(workflowExecution.outputs["step2"]).toBeUndefined(); // Step2 not started

      // Pause after 0.5s (step1 should still be running due to 3s sleep)
      setTimeout(() => {
        pauseWorkflow();
        console.log("PAUSED at 0.5s - step1 should still be running");
      }, 500);

      // CHECK 2: After pause triggered but step1 still running
      await new Promise((resolve) => setTimeout(resolve, 800));
      console.log("CHECK 2 - After pause triggered (0.8s):");
      console.log("  Status:", workflowExecution.status);
      console.log("  Current step:", workflowExecution.currentStep);
      console.log(
        "  Step1 output:",
        workflowExecution.outputs["step1"] ? "EXISTS" : "MISSING",
      );
      console.log(
        "  Step2 output:",
        workflowExecution.outputs["step2"] ? "EXISTS" : "MISSING",
      );

      expect(workflowExecution.status).toBe("paused");
      expect(workflowExecution.currentStep).toBe(0); // Still on step1
      expect(workflowExecution.outputs["step1"]).toBeUndefined(); // Step1 still running (3s sleep)
      expect(workflowExecution.outputs["step2"]).toBeUndefined(); // Step2 not started

      // CHECK 3: After step1 completes but before resume (step2 should be paused)
      await new Promise((resolve) => setTimeout(resolve, 2800)); // Total 3.6s - step1 should be done
      console.log("CHECK 3 - After step1 completes, before resume (3.6s):");
      console.log("  Status:", workflowExecution.status);
      console.log("  Current step:", workflowExecution.currentStep);
      console.log(
        "  Step1 output:",
        workflowExecution.outputs["step1"] ? "EXISTS" : "MISSING",
      );
      console.log(
        "  Step2 output:",
        workflowExecution.outputs["step2"] ? "EXISTS" : "MISSING",
      );

      expect(workflowExecution.status).toBe("paused");
      expect(workflowExecution.currentStep).toBe(1); // Should be on step2 (index 1)
      expect(workflowExecution.outputs["step1"]).toBeDefined(); // Step1 completed
      expect(workflowExecution.outputs["step2"]).toBeUndefined(); // Step2 paused, not executed

      // Resume execution
      console.log("RESUMING execution...");
      resumeWorkflow();

      // CHECK 4: Verify step2 starts after resume (timing may vary)
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.log("CHECK 4 - After resume (0.1s later):");
      console.log("  Status:", workflowExecution.status);
      console.log("  Current step:", workflowExecution.currentStep);
      console.log(
        "  Step1 output:",
        workflowExecution.outputs["step1"] ? "EXISTS" : "MISSING",
      );
      console.log(
        "  Step2 output:",
        workflowExecution.outputs["step2"] ? "EXISTS" : "MISSING",
      );

      // Step2 should be running or completed (timing varies)
      expect(["running", "completed"]).toContain(workflowExecution.status);
      expect(workflowExecution.currentStep).toBe(1); // Should be on step2
      expect(workflowExecution.outputs["step1"]).toBeDefined(); // Step1 still completed
      // Step2 may or may not be completed yet depending on timing

      // Wait for completion
      const result = await executionPromise;

      // CHECK 5: Final state - both steps completed
      console.log("CHECK 5 - Final state after completion:");
      console.log("  Status:", workflowExecution.status);
      console.log(
        "  Step1 output:",
        workflowExecution.outputs["step1"] ? "EXISTS" : "MISSING",
      );
      console.log(
        "  Step2 output:",
        workflowExecution.outputs["step2"] ? "EXISTS" : "MISSING",
      );
      console.log("  Results:", result.results);

      // Verify: both steps completed
      expect(result.success).toBe(true);
      expect(workflowExecution.status).toBe("completed");
      expect(workflowExecution.outputs["step1"]).toBeDefined();
      expect(workflowExecution.outputs["step2"]).toBeDefined(); // Step2 executed after resume
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toContain("Step 1 completed successfully");
      expect(result.results[1]).toContain("Step 2 completed successfully");
    }, 15000); // 15s timeout for this comprehensive test

    test("should handle execution without loaded workflow", async () => {
      workflowExecution.status = "pending";
      workflowExecution.workflow = { name: "", jobs: {} };

      const result = await executeWorkflow();
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("E2E Parser Component Integration", () => {
    test("should use WorkflowParser.parseYaml directly", () => {
      const filePath = path.join(
        fixturesPath,
        "workflows",
        "claude-test-coverage.yml",
      );
      const content = fs.readFileSync(filePath, "utf-8");

      // Direct test of real parser
      const workflow = WorkflowParser.parseYaml(content);

      expect(workflow.name).toBe("test-coverage-improvement");
      expect(workflow.jobs).toBeDefined();
      expect(Object.keys(workflow.jobs)).toContain("test-coverage");
    });

    test("should use PipelineService.workflowToTaskItems directly", () => {
      const filePath = path.join(
        fixturesPath,
        "workflows",
        "claude-test-coverage.yml",
      );
      const content = fs.readFileSync(filePath, "utf-8");

      // Parse with real parser
      const workflow = WorkflowParser.parseYaml(content);

      // Convert with real service
      const tasks = pipelineService.workflowToTaskItems(workflow);

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].id).toBe("task_cli_installation_service_1");
      expect(tasks[0].name).toBe("Create CLIInstallationService.test.ts");
    });

    test("should extract Claude steps using real WorkflowParser", () => {
      const filePath = path.join(
        fixturesPath,
        "workflows",
        "claude-test-coverage.yml",
      );
      const content = fs.readFileSync(filePath, "utf-8");

      const workflow = WorkflowParser.parseYaml(content);
      const claudeSteps = WorkflowParser.extractClaudeSteps(workflow);

      expect(claudeSteps.length).toBeGreaterThan(0);
      expect(claudeSteps[0].uses).toContain("claude-pipeline-action");
      expect(claudeSteps[0].with.prompt).toBeDefined();
    });
  });
});
