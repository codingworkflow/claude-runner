import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { WorkflowParser } from "../../src/services/WorkflowParser";
import { getSessionReference } from "../../src/core/models/Workflow";

// Simple test to validate CLI session reference parsing (not actual CLI execution)
describe("Simple CLI Resume Test", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "simple-cli-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Session Reference Validation", () => {
    test("should validate simple session reference format", async () => {
      // Create workflow with simple session reference
      const workflowContent = `name: simple-session-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: first
        name: First Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "first step"
          run: "echo 'first step completed'"
          output_session: true
          
      - id: second
        name: Second Step
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "second step"
          run: "echo 'second step completed'"
          resume_session: first`;

      const workflowPath = path.join(tempDir, "simple-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("Testing simple session reference parsing...");

      // Parse workflow to verify session reference handling
      const workflow = WorkflowParser.parseYaml(workflowContent);

      expect(workflow).toBeDefined();
      expect(workflow.jobs.test).toBeDefined();
      expect(workflow.jobs.test.steps).toHaveLength(2);

      // Verify session reference parsing
      const step2 = workflow.jobs.test.steps[1];
      expect(step2.with?.resume_session).toBe("first");

      // Test session reference validation function directly
      const sessionRef = getSessionReference("first");
      expect(sessionRef).toBe("first");

      console.log("✅ Simple session reference validation passed");
      console.log(`   - resume_session: ${step2.with?.resume_session}`);
      console.log(`   - parsed reference: ${sessionRef}`);
    });

    test("should validate complex session reference format directly", async () => {
      // Test session reference validation function with complex format directly
      // (Don't test WorkflowParser since that validates against actual step IDs)
      console.log("Testing complex session reference parsing...");

      const testCases = [
        {
          input: "${{ steps.step1.outputs.session_id }}",
          expected: "step1",
          description: "Basic complex format",
        },
        {
          input: "${{steps.init.outputs.session_id}}",
          expected: "init",
          description: "No spaces complex format",
        },
        {
          input: "${{  steps.process_data.outputs.session_id  }}",
          expected: "process_data",
          description: "Extra spaces complex format",
        },
      ];

      for (const testCase of testCases) {
        const result = getSessionReference(testCase.input);
        expect(result).toBe(testCase.expected);
        console.log(
          `   - ${testCase.description}: "${testCase.input}" → "${result}"`,
        );
      }

      console.log("✅ Complex session reference validation passed");
    });

    test("should handle invalid session references", async () => {
      console.log("Testing invalid session reference handling...");

      // Test various invalid formats
      const invalidReferences = [
        "invalid-format-{{}}",
        "${ malformed }",
        "incomplete.reference",
        "",
        "special@chars#invalid",
      ];

      for (const invalidRef of invalidReferences) {
        const result = getSessionReference(invalidRef);
        expect(result).toBeNull();
        console.log(`   - "${invalidRef}" → null (correctly rejected)`);
      }

      console.log("✅ Invalid session reference handling passed");
    });

    test("should validate workflow parsing with simple session references", async () => {
      // Create workflow with only simple session references (complex ones require step validation)
      const workflowContent = `name: simple-workflow-test
'on':
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: init
        name: Initialize
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Initialize workflow"
          run: "./tests/fixtures/scripts/claude-step1.sh"
          output_session: true
          
      - id: process
        name: Process Data
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: "Process the data"
          run: "./tests/fixtures/scripts/claude-step2.sh"
          resume_session: init  # Simple format only`;

      const workflowPath = path.join(tempDir, "simple-workflow-test.yml");
      await fs.writeFile(workflowPath, workflowContent);

      console.log("Testing simple workflow parsing...");

      // Parse and validate workflow
      const workflow = WorkflowParser.parseYaml(workflowContent);

      expect(workflow).toBeDefined();
      expect(workflow.name).toBe("simple-workflow-test");
      expect(workflow.jobs.test.steps).toHaveLength(2);

      // Validate each step's session handling
      const steps = workflow.jobs.test.steps;

      // Step 1: Should have output_session but no resume_session
      expect(steps[0].with?.output_session).toBe(true);
      expect(steps[0].with?.resume_session).toBeUndefined();

      // Step 2: Should have simple resume_session reference
      expect(steps[1].with?.resume_session).toBe("init");
      const simpleRef = getSessionReference(
        steps[1].with?.resume_session as string,
      );
      expect(simpleRef).toBe("init");

      console.log("✅ Simple workflow validation passed");
      console.log(
        `   - Step 1: output_session = ${steps[0].with?.output_session}`,
      );
      console.log(
        `   - Step 2: resume_session = "${steps[1].with?.resume_session}" → "${simpleRef}"`,
      );
    });
  });
});
