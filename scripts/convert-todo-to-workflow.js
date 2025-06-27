#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function generateRandomId() {
  return Math.random().toString(36).substr(2, 9);
}

function convertTodoToWorkflow(todoData, workflowName = "todo-pipeline") {
  const todos = todoData.todos || [];

  // Filter pending todos or include all if specified
  const tasks = todos.map((todo, index) => {
    const taskId = `task_${Date.now()}_${generateRandomId()}`;
    const stepNumber = index + 1;

    return {
      id: taskId,
      name: `Task ${stepNumber}`,
      uses: "anthropics/claude-pipeline-action@v1",
      with: {
        prompt: todo.content,
        model: "auto",
        allow_all_tools: true,
        // Chain tasks: first task outputs session, subsequent tasks resume from previous
        ...(index === 0 ? { output_session: true } : {}),
        ...(index > 0
          ? {
              resume_session: `\${{ steps.task_${Date.now()}_prev.outputs.session_id }}`,
            }
          : {}),
      },
    };
  });

  // Fix resume_session references to point to actual previous task IDs
  tasks.forEach((task, index) => {
    if (index > 0) {
      task.with.resume_session = `\${{ steps.${tasks[index - 1].id}.outputs.session_id }}`;
    }
  });

  const workflow = {
    name: workflowName,
    on: {
      workflow_dispatch: {
        inputs: {
          description: {
            description: "Pipeline execution",
            required: false,
            type: "string",
          },
        },
      },
    },
    jobs: {
      pipeline: {
        name: "Pipeline Execution",
        "runs-on": "ubuntu-latest",
        steps: tasks,
      },
    },
  };

  return workflow;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "Usage: node convert-todo-to-workflow.js <source.json> <target.yml> [workflow-name]",
    );
    console.error("");
    console.error("Examples:");
    console.error(
      "  node convert-todo-to-workflow.js todo/refactor.json workflows/refactor.yml",
    );
    console.error(
      '  node convert-todo-to-workflow.js todo/features.json workflows/features.yml "feature-pipeline"',
    );
    process.exit(1);
  }

  const sourceFile = args[0];
  const targetFile = args[1];
  const workflowName =
    args[2] || path.basename(targetFile, path.extname(targetFile));

  // Check if source file exists
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ Error: Source file not found: ${sourceFile}`);
    process.exit(1);
  }

  try {
    // Read and parse JSON todo file
    const todoJson = fs.readFileSync(sourceFile, "utf8");
    const todoData = JSON.parse(todoJson);

    console.log(`📖 Reading todo file: ${sourceFile}`);
    console.log(`📝 Found ${todoData.todos?.length || 0} todo items`);

    // Convert to workflow format
    const workflow = convertTodoToWorkflow(todoData, workflowName);

    console.log(`🔄 Converting to GitHub Actions workflow format...`);
    console.log(
      `📋 Creating ${workflow.jobs.pipeline.steps.length} chained tasks`,
    );

    // Ensure target directory exists
    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`📁 Created directory: ${targetDir}`);
    }

    // Write YAML workflow file
    const yamlContent = yaml.dump(workflow, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });

    fs.writeFileSync(targetFile, yamlContent);

    console.log(`✅ Workflow created successfully: ${targetFile}`);
    console.log(`🚀 Run with: make pipeline PIPELINE=${targetFile}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { convertTodoToWorkflow };
