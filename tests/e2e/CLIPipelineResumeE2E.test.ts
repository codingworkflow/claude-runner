import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { PipelineService } from "../../src/services/PipelineService";
import { WorkflowJsonLogger } from "../../src/services/WorkflowJsonLogger";
import { VSCodeFileSystem } from "../../src/adapters/vscode/VSCodeFileSystem";
import { VSCodeLogger } from "../../src/adapters/vscode/VSCodeLogger";

// E2E Test: CLI Pipeline Resume using real service integration (following guidelines)
describe("CLI Pipeline Resume E2E Tests", () => {
  let tempDir: string;
  let pipelineService: PipelineService;
  let workflowJsonLogger: WorkflowJsonLogger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-resume-e2e-"));

    // Use real services, mock only external dependencies (following guidelines)
    const mockContext = {
      extensionPath: "/test",
      globalStorageUri: { fsPath: "/tmp/test-storage" },
    };

    jest
      .spyOn(PipelineService.prototype as any, "ensureDirectories")
      .mockImplementation(() => Promise.resolve());

    pipelineService = new PipelineService(mockContext as any);

    const fileSystem = new VSCodeFileSystem();
    const logger = new VSCodeLogger();
    workflowJsonLogger = new WorkflowJsonLogger(fileSystem, logger);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Pipeline Resume with Service Integration", () => {
    test("should test pipeline workflow parsing and task generation", async () => {
      // Test real workflow parsing and pipeline service integration
      const workflowContent = `name: pipeline-resume-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: step1
        name: First Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute first step"
          run: "./tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
      - id: step2
        name: Second Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Execute second step with resume"
          run: "./tests/fixtures/scripts/claude-step2.sh"
          resume_session: step1`;

      const workflowPath = path.join(tempDir, "pipeline-resume-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🚀 Testing pipeline workflow parsing...");

      // Test real workflow parsing
      const workflow = WorkflowParser.parseYaml(workflowContent);
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe("pipeline-resume-test");
      expect(workflow.jobs.test.steps).toHaveLength(2);

      // Test real pipeline service integration
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(2);

      // Verify task structure
      expect(tasks[0].id).toBe("step1");
      expect(tasks[0].name).toBe("First Step");
      expect(tasks[1].id).toBe("step2");
      expect(tasks[1].name).toBe("Second Step");

      console.log(`✅ Workflow parsed: ${workflow.name}`);
      console.log(`✅ Tasks generated: ${tasks.length} tasks`);
      console.log(`   - ${tasks[0].id}: ${tasks[0].name}`);
      console.log(`   - ${tasks[1].id}: ${tasks[1].name}`);
    });

    test("should test workflow logging service integration", async () => {
      // Test real workflow logging with mock workflow state
      const workflowContent = `name: logging-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: step1
        name: Logging Test Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Test logging"
          run: "./tests/fixtures/scripts/claude-step1.sh"
          output_session: true`;

      const workflowPath = path.join(tempDir, "logging-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      const workflow = WorkflowParser.parseYaml(workflowContent);

      // Test real workflow state creation and logging
      const mockWorkflowState = {
        executionId: `logging-test-${Date.now()}`,
        workflowPath: workflowPath,
        workflowName: workflow.name,
        startTime: new Date().toISOString(),
        currentStep: 0,
        totalSteps: 1,
        status: "running" as any,
        sessionMappings: {},
        completedSteps: [],
        execution: {
          workflow: workflow,
          inputs: {},
          outputs: {},
          currentStep: 0,
          status: "running" as any,
        },
        canResume: true,
      };

      console.log("🔧 Testing workflow logging service...");

      // Test real logger initialization
      await workflowJsonLogger.initializeLog(mockWorkflowState, workflowPath);

      const initialLog = workflowJsonLogger.getCurrentLog();
      expect(initialLog).toBeDefined();
      expect(initialLog?.workflow_name).toBe("logging-test");
      expect(initialLog?.total_steps).toBe(1);
      expect(initialLog?.steps).toHaveLength(0);
      expect(initialLog?.status).toBe("running");

      console.log(`✅ Logger initialized: ${initialLog?.workflow_name}`);
      console.log(
        `✅ Initial state: ${initialLog?.steps.length} steps, status: ${initialLog?.status}`,
      );

      // Test real step logging
      const stepResult = {
        stepIndex: 0,
        stepId: "step1",
        sessionId: "test-session-123",
        outputSession: true,
        status: "completed" as any,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        output: JSON.stringify({
          type: "success",
          session_id: "test-session-123",
          result: "Step completed successfully",
        }),
      };

      await workflowJsonLogger.updateStepProgress(
        stepResult,
        mockWorkflowState,
      );

      const updatedLog = workflowJsonLogger.getCurrentLog();
      expect(updatedLog?.steps).toHaveLength(1);
      expect(updatedLog?.steps[0].status).toBe("completed");
      expect(updatedLog?.steps[0].session_id).toBe("test-session-123");
      expect(updatedLog?.last_completed_step).toBe(0);

      console.log(
        `✅ Step logged: ${updatedLog?.steps[0].status}, session: ${updatedLog?.steps[0].session_id}`,
      );
    });

    test("should test session reference validation with real workflow parser", async () => {
      // Test real session reference validation through workflow parser
      const workflowContent = `name: session-validation-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: provider
        name: Session Provider
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Provide session"
          run: "./tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
      - id: consumer
        name: Session Consumer
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Consume session"
          run: "./tests/fixtures/scripts/claude-step2.sh"
          resume_session: provider`;

      const workflowPath = path.join(tempDir, "session-validation-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🔧 Testing session reference validation...");

      // Test real workflow parser validation
      const workflow = WorkflowParser.parseYaml(workflowContent);
      expect(workflow).toBeDefined();

      const steps = workflow.jobs.test.steps;
      expect(steps).toHaveLength(2);

      // Verify session configuration
      expect(steps[0].with?.output_session).toBe(true);
      expect(steps[0].with?.resume_session).toBeUndefined();
      expect(steps[1].with?.resume_session).toBe("provider");

      // Test real pipeline service task generation
      const tasks = pipelineService.workflowToTaskItems(workflow);
      expect(tasks).toHaveLength(2);

      console.log("✅ Session reference validation passed");
      console.log(
        `   - Provider step: output_session=${steps[0].with?.output_session}`,
      );
      console.log(
        `   - Consumer step: resume_session=${steps[1].with?.resume_session}`,
      );
    });

    test("should test pipeline service workflow-to-task conversion", async () => {
      // Test real pipeline service workflow conversion
      const workflowContent = `name: task-conversion-test
'on':
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - id: setup
        name: Setup Environment
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Setup the build environment"
          run: "./tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
      - id: build
        name: Build Project
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Build the project"
          run: "./tests/fixtures/scripts/claude-step2.sh"
          resume_session: setup
          
      - id: test
        name: Run Tests
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Run the test suite"
          run: "./tests/fixtures/scripts/claude-step3.sh"
          resume_session: build`;

      const workflowPath = path.join(tempDir, "task-conversion-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("🔧 Testing pipeline service task conversion...");

      const workflow = WorkflowParser.parseYaml(workflowContent);

      // Test real pipeline service
      const tasks = pipelineService.workflowToTaskItems(workflow);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe("setup");
      expect(tasks[1].id).toBe("build");
      expect(tasks[2].id).toBe("test");

      // Verify task properties
      expect(tasks[0].name).toBe("Setup Environment");
      expect(tasks[1].name).toBe("Build Project");
      expect(tasks[2].name).toBe("Run Tests");

      console.log("✅ Pipeline service task conversion passed");
      console.log(`   - Generated ${tasks.length} tasks from workflow`);
      tasks.forEach((task, index) => {
        console.log(`   - Task ${index + 1}: ${task.id} - ${task.name}`);
      });
    });
  });
});
