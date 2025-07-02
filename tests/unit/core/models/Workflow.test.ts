import {
  ClaudeWorkflow,
  WorkflowInput,
  Step,
  ClaudeStep,
  WorkflowExecution,
  WorkflowMetadata,
  isClaudeStep,
  hasSessionOutput,
  getSessionReference,
} from "../../../../src/core/models/Workflow";

describe("Workflow Model", () => {
  describe("ClaudeWorkflow validation and structure", () => {
    it("should create a valid ClaudeWorkflow with required fields", () => {
      const workflow: ClaudeWorkflow = {
        name: "Test Workflow",
        jobs: {
          test: {
            steps: [
              {
                name: "Test Step",
                run: "echo 'Hello World'",
              },
            ],
          },
        },
      };

      expect(workflow.name).toBe("Test Workflow");
      expect(workflow.jobs.test).toBeDefined();
      expect(workflow.jobs.test.steps).toHaveLength(1);
    });

    it("should create a ClaudeWorkflow with all optional fields", () => {
      const workflow: ClaudeWorkflow = {
        name: "Complete Workflow",
        on: {
          workflow_dispatch: {
            inputs: {
              version: {
                description: "Version to deploy",
                required: true,
                default: "latest",
                type: "string",
              },
            },
          },
        },
        inputs: {
          environment: {
            description: "Target environment",
            required: false,
            default: "staging",
            type: "choice",
            options: ["staging", "production"],
          },
        },
        env: {
          NODE_ENV: "production",
          DEBUG: "false",
        },
        jobs: {
          build: {
            name: "Build Job",
            "runs-on": "ubuntu-latest",
            env: {
              BUILD_ENV: "ci",
            },
            steps: [
              {
                id: "checkout",
                name: "Checkout code",
                uses: "actions/checkout@v3",
              },
            ],
          },
        },
      };

      expect(workflow.on?.workflow_dispatch?.inputs?.version).toBeDefined();
      expect(workflow.inputs?.environment?.options).toEqual([
        "staging",
        "production",
      ]);
      expect(workflow.env?.NODE_ENV).toBe("production");
      expect(workflow.jobs.build.name).toBe("Build Job");
      expect(workflow.jobs.build["runs-on"]).toBe("ubuntu-latest");
    });

    it("should handle multiple jobs", () => {
      const workflow: ClaudeWorkflow = {
        name: "Multi-Job Workflow",
        jobs: {
          build: {
            steps: [{ run: "npm run build" }],
          },
          test: {
            steps: [{ run: "npm test" }],
          },
          deploy: {
            steps: [{ run: "npm run deploy" }],
          },
        },
      };

      expect(Object.keys(workflow.jobs)).toHaveLength(3);
      expect(workflow.jobs.build).toBeDefined();
      expect(workflow.jobs.test).toBeDefined();
      expect(workflow.jobs.deploy).toBeDefined();
    });
  });

  describe("WorkflowInput validation", () => {
    it("should create WorkflowInput with all field types", () => {
      const stringInput: WorkflowInput = {
        description: "String input",
        required: true,
        default: "default-value",
        type: "string",
      };

      const booleanInput: WorkflowInput = {
        description: "Boolean input",
        required: false,
        default: "true",
        type: "boolean",
      };

      const choiceInput: WorkflowInput = {
        description: "Choice input",
        required: true,
        type: "choice",
        options: ["option1", "option2", "option3"],
      };

      expect(stringInput.type).toBe("string");
      expect(booleanInput.type).toBe("boolean");
      expect(choiceInput.type).toBe("choice");
      expect(choiceInput.options).toEqual(["option1", "option2", "option3"]);
    });

    it("should handle minimal WorkflowInput", () => {
      const minimalInput: WorkflowInput = {};

      expect(minimalInput.description).toBeUndefined();
      expect(minimalInput.required).toBeUndefined();
      expect(minimalInput.default).toBeUndefined();
      expect(minimalInput.type).toBeUndefined();
      expect(minimalInput.options).toBeUndefined();
    });
  });

  describe("Step and ClaudeStep validation", () => {
    it("should create a basic Step", () => {
      const step: Step = {
        id: "step1",
        name: "Basic Step",
        run: "echo 'test'",
        if: "success()",
        "continue-on-error": true,
      };

      expect(step.id).toBe("step1");
      expect(step.name).toBe("Basic Step");
      expect(step.run).toBe("echo 'test'");
      expect(step.if).toBe("success()");
      expect(step["continue-on-error"]).toBe(true);
    });

    it("should create a ClaudeStep with required fields", () => {
      const claudeStep: ClaudeStep = {
        uses: "claude-pipeline-action@v1",
        with: {
          prompt: "Analyze the code and provide feedback",
        },
      };

      expect(claudeStep.uses).toBe("claude-pipeline-action@v1");
      expect(claudeStep.with.prompt).toBe(
        "Analyze the code and provide feedback",
      );
    });

    it("should create a ClaudeStep with all optional fields", () => {
      const claudeStep: ClaudeStep = {
        id: "claude-analysis",
        name: "Code Analysis",
        uses: "claude-pipeline-action@v2",
        with: {
          prompt: "Review the code changes",
          model: "claude-3-sonnet",
          allow_all_tools: true,
          bypass_permissions: false,
          working_directory: "/workspace",
          resume_session: "${{ steps.previous.outputs.session_id }}",
          output_session: true,
          custom_param: "custom_value",
        },
        env: {
          CLAUDE_API_KEY: "${{ secrets.CLAUDE_API_KEY }}",
        },
        if: "${{ github.event_name == 'pull_request' }}",
      };

      expect(claudeStep.id).toBe("claude-analysis");
      expect(claudeStep.with.model).toBe("claude-3-sonnet");
      expect(claudeStep.with.allow_all_tools).toBe(true);
      expect(claudeStep.with.bypass_permissions).toBe(false);
      expect(claudeStep.with.working_directory).toBe("/workspace");
      expect(claudeStep.with.output_session).toBe(true);
      expect(claudeStep.with.custom_param).toBe("custom_value");
    });
  });

  describe("WorkflowExecution state management", () => {
    it("should create WorkflowExecution with all states", () => {
      const workflow: ClaudeWorkflow = {
        name: "Test Workflow",
        jobs: { test: { steps: [{ run: "echo test" }] } },
      };

      const states: WorkflowExecution["status"][] = [
        "pending",
        "running",
        "completed",
        "failed",
      ];

      states.forEach((status) => {
        const execution: WorkflowExecution = {
          workflow,
          inputs: { param1: "value1" },
          outputs: {},
          currentStep: 0,
          status,
        };

        expect(execution.status).toBe(status);
      });
    });

    it("should handle workflow execution state transitions", () => {
      const workflow: ClaudeWorkflow = {
        name: "Test Workflow",
        jobs: { test: { steps: [{ run: "echo test" }] } },
      };

      let execution: WorkflowExecution = {
        workflow,
        inputs: { version: "1.0.0" },
        outputs: {},
        currentStep: 0,
        status: "pending",
      };

      execution = { ...execution, status: "running", currentStep: 1 };
      expect(execution.status).toBe("running");
      expect(execution.currentStep).toBe(1);

      execution = {
        ...execution,
        status: "completed",
        outputs: {
          step1: { result: "Success", session_id: "session-123" },
        },
      };
      expect(execution.status).toBe("completed");
      expect(execution.outputs.step1.result).toBe("Success");
    });

    it("should handle workflow execution errors", () => {
      const workflow: ClaudeWorkflow = {
        name: "Failed Workflow",
        jobs: { test: { steps: [{ run: "false" }] } },
      };

      const execution: WorkflowExecution = {
        workflow,
        inputs: {},
        outputs: {
          step1: { result: "Command failed with exit code 1" },
        },
        currentStep: 1,
        status: "failed",
        error: "Step 1 failed: Command failed with exit code 1",
      };

      expect(execution.status).toBe("failed");
      expect(execution.error).toContain("Step 1 failed");
      expect(execution.outputs.step1.result).toContain("Command failed");
    });
  });

  describe("WorkflowMetadata structure", () => {
    it("should create WorkflowMetadata with all fields", () => {
      const created = new Date("2023-01-01T00:00:00Z");
      const modified = new Date("2023-01-02T00:00:00Z");

      const metadata: WorkflowMetadata = {
        id: "workflow-123",
        name: "Test Workflow",
        description: "A test workflow for validation",
        created,
        modified,
        path: "/workflows/test-workflow.yml",
      };

      expect(metadata.id).toBe("workflow-123");
      expect(metadata.name).toBe("Test Workflow");
      expect(metadata.description).toBe("A test workflow for validation");
      expect(metadata.created).toBe(created);
      expect(metadata.modified).toBe(modified);
      expect(metadata.path).toBe("/workflows/test-workflow.yml");
    });

    it("should handle minimal WorkflowMetadata", () => {
      const created = new Date();
      const modified = new Date();

      const metadata: WorkflowMetadata = {
        id: "minimal-workflow",
        name: "Minimal",
        created,
        modified,
        path: "/minimal.yml",
      };

      expect(metadata.description).toBeUndefined();
      expect(metadata.created).toBe(created);
      expect(metadata.modified).toBe(modified);
    });
  });

  describe("Type guards and utility functions", () => {
    describe("isClaudeStep", () => {
      it("should identify ClaudeStep correctly", () => {
        const claudeStep: Step = {
          uses: "claude-pipeline-action@v1",
          with: { prompt: "test" },
        };

        const regularStep: Step = {
          run: "echo test",
        };

        const actionStep: Step = {
          uses: "actions/checkout@v3",
        };

        expect(isClaudeStep(claudeStep)).toBe(true);
        expect(isClaudeStep(regularStep)).toBe(false);
        expect(isClaudeStep(actionStep)).toBe(false);
      });

      it("should handle various claude-pipeline-action formats", () => {
        const variations = [
          { uses: "claude-pipeline-action@v1", with: { prompt: "test" } },
          { uses: "org/claude-pipeline-action@main", with: { prompt: "test" } },
          { uses: "./claude-pipeline-action", with: { prompt: "test" } },
        ];

        variations.forEach((step) => {
          expect(isClaudeStep(step)).toBe(true);
        });
      });
    });

    describe("hasSessionOutput", () => {
      it("should detect session output correctly", () => {
        const stepWithOutput: ClaudeStep = {
          uses: "claude-pipeline-action@v1",
          with: {
            prompt: "test",
            output_session: true,
          },
        };

        const stepWithoutOutput: ClaudeStep = {
          uses: "claude-pipeline-action@v1",
          with: {
            prompt: "test",
            output_session: false,
          },
        };

        const stepNoOutput: ClaudeStep = {
          uses: "claude-pipeline-action@v1",
          with: {
            prompt: "test",
          },
        };

        expect(hasSessionOutput(stepWithOutput)).toBe(true);
        expect(hasSessionOutput(stepWithoutOutput)).toBe(false);
        expect(hasSessionOutput(stepNoOutput)).toBe(false);
      });
    });

    describe("getSessionReference", () => {
      it("should extract session references correctly", () => {
        const validReferences = [
          "${{ steps.previous.outputs.session_id }}",
          "${{steps.step1.outputs.session_id}}",
          "${{ steps.build_step.outputs.session_id }}",
        ];

        const expectedStepIds = ["previous", "step1", "build_step"];

        validReferences.forEach((ref, index) => {
          expect(getSessionReference(ref)).toBe(expectedStepIds[index]);
        });
      });

      it("should return null for invalid references", () => {
        const invalidReferences = [
          "not a reference",
          "${{ inputs.session_id }}",
          "${{ steps.previous.outputs.result }}",
          "${{ github.sha }}",
          "",
        ];

        invalidReferences.forEach((ref) => {
          expect(getSessionReference(ref)).toBeNull();
        });
      });

      it("should handle whitespace variations", () => {
        const references = [
          "${{steps.test.outputs.session_id}}",
          "${{ steps.test.outputs.session_id }}",
          "${{  steps.test.outputs.session_id  }}",
        ];

        references.forEach((ref) => {
          expect(getSessionReference(ref)).toBe("test");
        });
      });
    });
  });

  describe("Workflow serialization and persistence", () => {
    it("should serialize ClaudeWorkflow to JSON", () => {
      const workflow: ClaudeWorkflow = {
        name: "Serialization Test",
        on: {
          workflow_dispatch: {
            inputs: {
              version: { required: true, type: "string" },
            },
          },
        },
        env: { NODE_ENV: "test" },
        jobs: {
          test: {
            name: "Test Job",
            steps: [
              {
                uses: "claude-pipeline-action@v1",
                with: { prompt: "test prompt" },
              },
            ],
          },
        },
      };

      const serialized = JSON.stringify(workflow);
      const parsed = JSON.parse(serialized);

      expect(parsed.name).toBe(workflow.name);
      expect(parsed.on.workflow_dispatch.inputs.version.required).toBe(true);
      expect(parsed.env.NODE_ENV).toBe("test");
      expect(parsed.jobs.test.steps[0].with.prompt).toBe("test prompt");
    });

    it("should serialize WorkflowExecution with Date objects", () => {
      const workflow: ClaudeWorkflow = {
        name: "Test",
        jobs: { test: { steps: [{ run: "echo test" }] } },
      };

      const execution: WorkflowExecution = {
        workflow,
        inputs: { param: "value" },
        outputs: {
          step1: { result: "success", session_id: "session-123" },
        },
        currentStep: 1,
        status: "completed",
      };

      const serialized = JSON.stringify(execution);
      const parsed = JSON.parse(serialized);

      expect(parsed.workflow.name).toBe("Test");
      expect(parsed.inputs.param).toBe("value");
      expect(parsed.outputs.step1.session_id).toBe("session-123");
      expect(parsed.currentStep).toBe(1);
      expect(parsed.status).toBe("completed");
    });

    it("should serialize WorkflowMetadata with Date objects", () => {
      const created = new Date("2023-01-01T00:00:00Z");
      const modified = new Date("2023-01-02T00:00:00Z");

      const metadata: WorkflowMetadata = {
        id: "test-id",
        name: "Test Workflow",
        created,
        modified,
        path: "/test.yml",
      };

      const serialized = JSON.stringify(metadata);
      const parsed = JSON.parse(serialized);

      expect(parsed.id).toBe("test-id");
      expect(parsed.created).toBe(created.toISOString());
      expect(parsed.modified).toBe(modified.toISOString());
    });
  });

  describe("Workflow error handling and recovery", () => {
    it("should handle workflow validation errors", () => {
      const invalidWorkflow = {
        // Missing required name field
        jobs: {},
      };

      expect(() => {
        const workflow: ClaudeWorkflow = invalidWorkflow as any;
        expect(workflow.name).toBeUndefined();
        expect(workflow.jobs).toBeDefined();
      }).not.toThrow();
    });

    it("should handle step validation errors", () => {
      const invalidStep = {
        // Step with neither 'run' nor 'uses'
        name: "Invalid Step",
      };

      expect(() => {
        const step: Step = invalidStep as any;
        expect(step.run).toBeUndefined();
        expect(step.uses).toBeUndefined();
      }).not.toThrow();
    });

    it("should handle ClaudeStep validation errors", () => {
      const invalidClaudeStep = {
        uses: "claude-pipeline-action@v1",
        // Missing required 'with.prompt' field
        with: {},
      };

      expect(() => {
        const step: ClaudeStep = invalidClaudeStep as any;
        expect(step.with.prompt).toBeUndefined();
      }).not.toThrow();
    });

    it("should handle execution error recovery", () => {
      const workflow: ClaudeWorkflow = {
        name: "Recovery Test",
        jobs: {
          test: {
            steps: [
              { run: "echo step1" },
              { run: "false", "continue-on-error": true },
              { run: "echo step3" },
            ],
          },
        },
      };

      const failedExecution: WorkflowExecution = {
        workflow,
        inputs: {},
        outputs: {
          step1: { result: "success" },
          step2: { result: "failed", error: "Command failed" },
        },
        currentStep: 2,
        status: "failed",
        error: "Step 2 failed but marked as continue-on-error",
      };

      const recoveredExecution: WorkflowExecution = {
        ...failedExecution,
        outputs: {
          ...failedExecution.outputs,
          step3: { result: "success" },
        },
        currentStep: 3,
        status: "completed",
        error: undefined,
      };

      expect(failedExecution.status).toBe("failed");
      expect(recoveredExecution.status).toBe("completed");
      expect(recoveredExecution.error).toBeUndefined();
    });
  });

  describe("Complex workflow scenarios", () => {
    it("should handle workflow with session chaining", () => {
      const workflow: ClaudeWorkflow = {
        name: "Session Chain Workflow",
        jobs: {
          analyze: {
            steps: [
              {
                id: "initial_analysis",
                uses: "claude-pipeline-action@v1",
                with: {
                  prompt: "Analyze the codebase",
                  output_session: true,
                },
              },
              {
                id: "detailed_review",
                uses: "claude-pipeline-action@v1",
                with: {
                  prompt: "Provide detailed recommendations",
                  resume_session:
                    "${{ steps.initial_analysis.outputs.session_id }}",
                  output_session: true,
                },
              },
              {
                id: "final_report",
                uses: "claude-pipeline-action@v1",
                with: {
                  prompt: "Generate final report",
                  resume_session:
                    "${{ steps.detailed_review.outputs.session_id }}",
                },
              },
            ],
          },
        },
      };

      const step1 = workflow.jobs.analyze.steps[0] as ClaudeStep;
      const step2 = workflow.jobs.analyze.steps[1] as ClaudeStep;
      const step3 = workflow.jobs.analyze.steps[2] as ClaudeStep;

      expect(isClaudeStep(step1)).toBe(true);
      expect(hasSessionOutput(step1)).toBe(true);
      expect(getSessionReference(step2.with.resume_session as string)).toBe(
        "initial_analysis",
      );
      expect(getSessionReference(step3.with.resume_session as string)).toBe(
        "detailed_review",
      );
    });

    it("should handle workflow with conditional execution", () => {
      const workflow: ClaudeWorkflow = {
        name: "Conditional Workflow",
        jobs: {
          build: {
            steps: [
              {
                id: "build",
                run: "npm run build",
              },
              {
                id: "test",
                run: "npm test",
                if: "success()",
              },
              {
                id: "deploy-staging",
                run: "npm run deploy:staging",
                if: "success() && github.ref == 'refs/heads/develop'",
              },
              {
                id: "deploy-prod",
                run: "npm run deploy:prod",
                if: "success() && github.ref == 'refs/heads/main'",
              },
              {
                id: "notify-failure",
                run: "echo 'Build failed'",
                if: "failure()",
              },
            ],
          },
        },
      };

      const steps = workflow.jobs.build.steps;
      expect(steps[1].if).toBe("success()");
      expect(steps[2].if).toBe(
        "success() && github.ref == 'refs/heads/develop'",
      );
      expect(steps[3].if).toBe("success() && github.ref == 'refs/heads/main'");
      expect(steps[4].if).toBe("failure()");
    });
  });
});
