import * as fs from "fs";
import * as path from "path";
import { TaskItem } from "../../../src/services/ClaudeCodeService";
import { WorkflowParser } from "../../../src/services/WorkflowParser";
import { ClaudeWorkflow } from "../../../src/types/WorkflowTypes";
import { PipelineService } from "../../../src/services/PipelineService";

export interface WorkflowFile {
  name: string;
  path: string;
}

export interface WorkflowState {
  tasks: TaskItem[];
  availablePipelines: string[];
  discoveredWorkflows: WorkflowFile[];
  selectedWorkflow: string;
  isLoaded: boolean;
  isRunning: boolean;
}

export interface WorkflowExecutionResult {
  success: boolean;
  results: string[];
}

export class WorkflowSimulationWorkspace {
  private files = new Map<string, string>();
  private workflowState: WorkflowState = {
    tasks: [],
    availablePipelines: [],
    discoveredWorkflows: [],
    selectedWorkflow: "",
    isLoaded: false,
    isRunning: false,
  };
  private mockPipelineService: PipelineService;

  constructor(fixturesPath?: string) {
    // Create a mock PipelineService with minimal context that doesn't try to create directories
    this.mockPipelineService = {
      workflowToTaskItems: (workflow: ClaudeWorkflow): TaskItem[] => {
        const tasks: TaskItem[] = [];

        // Extract all Claude steps from all jobs (real implementation)
        for (const job of Object.values(workflow.jobs)) {
          for (const step of job.steps) {
            if (step.uses && step.uses.includes("claude-pipeline-action")) {
              const claudeStep = step as any;

              // Check if this step resumes from a previous one
              let resumeFromTaskId: string | undefined;
              if (claudeStep.with.resume_session) {
                const match = claudeStep.with.resume_session.match(
                  /\$\{\{\s*steps\.(\w+)\.outputs\.session_id\s*\}\}/,
                );
                if (match) {
                  resumeFromTaskId = match[1];
                }
              }

              tasks.push({
                id: step.id ?? `step-${tasks.length}`,
                name: step.name,
                prompt: claudeStep.with.prompt,
                resumeFromTaskId,
                status: "pending" as const,
                model: claudeStep.with.model,
                check: claudeStep.with.check,
                condition: claudeStep.with.condition,
              });
            }
          }
        }

        return tasks;
      },
    } as any;

    if (fixturesPath) {
      this.loadFixtures(fixturesPath);
    }
  }

  private loadFixtures(fixturesPath: string): void {
    try {
      const workflowsPath = path.join(fixturesPath, "workflows");
      if (fs.existsSync(workflowsPath)) {
        const files = fs.readdirSync(workflowsPath);
        files.forEach((file) => {
          if (file.endsWith(".yml") || file.endsWith(".yaml")) {
            const filePath = path.join(workflowsPath, file);
            const content = fs.readFileSync(filePath, "utf-8");
            this.files.set(`.github/workflows/${file}`, content);
          }
        });
      }
    } catch (error) {
      console.warn("Failed to load fixtures:", error);
    }
  }

  createFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  getFile(filePath: string): string | undefined {
    return this.files.get(filePath);
  }

  discoverWorkflows(): WorkflowFile[] {
    const workflows: WorkflowFile[] = [];

    for (const [filePath, content] of this.files.entries()) {
      if (
        filePath.startsWith(".github/workflows/") &&
        filePath.endsWith(".yml")
      ) {
        const nameMatch = content.match(/name:\s*([^\n]+)/);
        const name = nameMatch
          ? nameMatch[1].trim()
          : path.basename(filePath, ".yml");
        workflows.push({ name, path: filePath });
      }
    }

    this.workflowState.discoveredWorkflows = workflows;
    return workflows;
  }

  loadWorkflow(workflowPath: string): TaskItem[] {
    const content = this.getFile(workflowPath);
    if (!content) {
      throw new Error(`Workflow not found: ${workflowPath}`);
    }

    try {
      // Use the real WorkflowParser to parse the YAML
      const workflow: ClaudeWorkflow = WorkflowParser.parseYaml(content);

      // Use the real PipelineService to convert workflow to TaskItems
      const tasks = this.mockPipelineService.workflowToTaskItems(workflow);

      this.workflowState.tasks = tasks;
      this.workflowState.selectedWorkflow = workflowPath;
      this.workflowState.isLoaded = true;

      return tasks;
    } catch (error) {
      console.error(`Failed to parse workflow ${workflowPath}:`, error);
      throw error;
    }
  }

  async executeWorkflow(): Promise<WorkflowExecutionResult> {
    if (!this.workflowState.isLoaded) {
      throw new Error("No workflow loaded");
    }

    this.workflowState.isRunning = true;

    // Simulate execution delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    const results = this.workflowState.tasks.map(
      (task: TaskItem) => `✓ ${task.name} completed successfully`,
    );

    this.workflowState.isRunning = false;

    return { success: true, results };
  }

  getWorkflowState(): WorkflowState {
    return { ...this.workflowState };
  }

  setWorkflowState(state: Partial<WorkflowState>): void {
    this.workflowState = { ...this.workflowState, ...state };
  }

  reset(): void {
    this.workflowState = {
      tasks: [],
      availablePipelines: [],
      discoveredWorkflows: [],
      selectedWorkflow: "",
      isLoaded: false,
      isRunning: false,
    };
  }
}
