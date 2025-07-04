# Claude Runner Workflow Specifications

This document provides comprehensive specifications for creating GitHub Actions workflows that use Claude Code pipeline actions. Based on analysis of existing workflows in the project, this guide covers all key patterns, session management, model selection, and conditional execution.

## Workflow Structure

### Basic Workflow Template

```yaml
name: <workflow-name>
on:
  workflow_dispatch:
    inputs:
      description:
        description: <Pipeline description>
        required: false
        type: string

jobs:
  <job-name>:
    name: <Job Display Name>
    runs-on: ubuntu-latest
    steps:
      - id: <step-id>
        name: <Step Name>
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            <Multi-line prompt>
          model: <model-name>
          allow_all_tools: true
          output_session: <true|false>
          resume_session: <session-reference>
```

### Required Components

1. **Workflow Name**: Descriptive name for the workflow
2. **Trigger**: `workflow_dispatch` with optional input description
3. **Job Configuration**: Single job with `ubuntu-latest` runner
4. **Steps**: One or more Claude pipeline action steps

## Step Configuration

### Step ID Format

Step IDs follow these patterns:

- **Descriptive**: `analyze_current_cli`, `implement_job_log_types`
- **Generated**: `task_<timestamp>_<random>` (e.g., `task_1751000902868_c0dsxdsgd`)

### Step Properties

```yaml
- id: <unique-step-id>
  name: <Human-readable step name>
  uses: anthropics/claude-pipeline-action@v1
  with:
    prompt: |
      <Detailed prompt with specific instructions>
    model: <model-selection>
    allow_all_tools: true
    output_session: <boolean>
    resume_session: <session-reference>
```

### Required Properties

- `id`: Unique identifier for the step
- `name`: Display name for the step
- `uses`: Always `anthropics/claude-pipeline-action@v1`
- `prompt`: The instruction for Claude

### Optional Properties

- `model`: Model selection (defaults to `auto`)
- `allow_all_tools`: Enable all tools (typically `true`)
- `output_session`: Whether to output session ID for chaining
- `resume_session`: Reference to previous session for continuity

## Session Management

### Session Chaining Patterns

**1. Simple Chain (Next Step)**

```yaml
- id: step1
  name: First Step
  uses: anthropics/claude-pipeline-action@v1
  with:
    prompt: Generate a random number
    model: auto
    allow_all_tools: true
    output_session: true

- id: step2
  name: Second Step
  uses: anthropics/claude-pipeline-action@v1
  with:
    prompt: Use the previous number in calculation
    model: auto
    allow_all_tools: true
    resume_session: ${{ steps.step1.outputs.session_id }}
```

**2. Long Chain (Multiple Steps)**

```yaml
- id: task_1
  output_session: true

- id: task_2
  resume_session: task_1

- id: task_3
  resume_session: task_2

- id: task_4
  resume_session: task_3
```

**3. Branch from Earlier Step**

```yaml
- id: analyze_step
  output_session: true

- id: implement_step1
  resume_session: analyze_step

- id: implement_step2
  resume_session: analyze_step
```

### Session Reference Format

The parser supports two formats:

**Simple format (recommended):**

```yaml
resume_session: <step-id>
```

**Complex format (GitHub Actions style):**

```yaml
resume_session: ${{ steps.<step-id>.outputs.session_id }}
```

## Model Selection

### Available Models

- `auto`: Automatic model selection (recommended - default)
- `claude-opus-4-20250514`: Claude Opus 4 (most capable, highest cost)
- `claude-sonnet-4-20250514`: Claude Sonnet 4 (balanced performance and cost)
- `claude-3-7-sonnet-20250219`: Claude Sonnet 3.7 (good performance, moderate cost)
- `claude-3-5-haiku-20241022`: Claude Haiku 3.5 (fastest, lowest cost)

### Model Selection Guidelines

```yaml
# For most tasks - let Claude choose appropriate model (default)
model: auto

# For high-capability tasks requiring maximum performance
model: claude-opus-4-20250514

# For balanced performance and cost
model: claude-sonnet-4-20250514

# For fast, lightweight tasks
model: claude-3-5-haiku-20241022
```

## Prompt Engineering

### Prompt Structure

```yaml
prompt: |
  <Context and background>

  <Specific task requirements>

  <Expected output format>

  <References to files or documentation>
```

### Effective Prompt Patterns

**1. Reference-Based Prompts**

```yaml
prompt: |
  Read key plan /workspaces/vsix/claude-code-docs/docs/cli_plan.md

  Implement the JobLogManager class specified in Phase 1, Step 1.2:
  - Create file: cli/src/utils/JobLogManager.ts
  - Include all static methods as documented
  - Ensure Go CLI compatibility
```

**2. Multi-Step Instructions**

```yaml
prompt: |
  Using the implementation plan from the documentation:

  1. Analyze current CLI structure
  2. Identify missing components
  3. Provide focused implementation guidance
  4. Reference existing analysis for context
```

**3. Contextual Prompts**

```yaml
prompt: |
  Based on the detailed analysis from previous step:

  Implement rate limit detection exactly matching Go CLI:
  - Use regex pattern: /Claude AI usage limit reached\|(\d+)/
  - Parse Unix timestamp and calculate wait time
  - Return RateLimitInfo object with required fields
```

## Conditional Execution

### Conditional Step Structure

```yaml
- id: conditional_step
  name: Conditional Task
  uses: anthropics/claude-pipeline-action@v1
  with:
    prompt: |
      <Task description>
    model: auto
    allow_all_tools: true
    check: <command-to-check>
    condition: <condition-type>
```

### Condition Types

- `on_success`: Execute only if check command succeeds (exit code 0)
- `on_failure`: Execute only if check command fails (exit code != 0)
- `always`: Execute regardless of check command result

### Common Check Commands

```yaml
# Linting checks
check: "make lint"
condition: "on_failure"

# Test checks
check: "npm run test"
condition: "on_success"

# Type checking
check: "npm run type-check"
condition: "on_failure"

# Build validation
check: "make build"
condition: "on_success"
```

## Job Log Integration

### Job Log Structure

Workflows automatically generate `.job.json` files with this structure:

```json
{
  "workflow_name": "workflow-name",
  "workflow_file": ".github/workflows/workflow.yml",
  "execution_id": "20250701-162857",
  "start_time": "2025-07-01T16:28:57.367712962Z",
  "last_update_time": "2025-07-02T06:52:02.597354031Z",
  "status": "paused|running|completed|failed",
  "last_completed_step": 6,
  "total_steps": 11,
  "steps": [
    {
      "step_index": 0,
      "step_id": "step_name",
      "step_name": "Display Name",
      "status": "completed|failed|running",
      "start_time": "2025-07-01T17:46:39.708971207Z",
      "end_time": "2025-07-01T17:46:39.708971207Z",
      "duration_ms": 0,
      "output": "Step output text",
      "session_id": "uuid-session-id",
      "output_session": true,
      "resume_session": "${{ steps.previous.outputs.session_id }}"
    }
  ]
}
```

### Resume Functionality

Workflows support resume functionality with:

- `--resume` or `-r` flag
- Automatic step skipping for completed steps
- Session restoration from job log
- Progress tracking and reporting

## Complete Workflow Examples

### 1. Simple Sequential Workflow

```yaml
name: simple-sequential-test
on:
  workflow_dispatch:
    inputs:
      description:
        description: Simple sequential workflow test
        required: false
        type: string

jobs:
  test:
    name: Sequential Test
    runs-on: ubuntu-latest
    steps:
      - id: step1
        name: Generate Random Number
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Generate a random number between 1000 and 9999.
            Output only the number, nothing else.
          model: auto
          allow_all_tools: true
          output_session: true

      - id: step2
        name: Use Previous Number
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            What was the random number from our previous interaction?
            Add 100 to it and output the result.
          model: auto
          allow_all_tools: true
          resume_session: step1
```

### 2. Complex Implementation Pipeline

```yaml
name: feature-implementation
on:
  workflow_dispatch:
    inputs:
      description:
        description: Feature implementation pipeline
        required: false
        type: string

jobs:
  pipeline:
    name: Feature Implementation
    runs-on: ubuntu-latest
    steps:
      - id: analyze_requirements
        name: Analyze Requirements
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Read and analyze the requirements document:
            /workspaces/vsix/docs/feature_requirements.md

            Provide a detailed analysis of:
            1. Core functionality requirements
            2. Technical constraints
            3. Implementation approach
            4. Testing requirements
          model: auto
          allow_all_tools: true
          output_session: true

      - id: create_types
        name: Create Type Definitions
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Based on the requirements analysis, create TypeScript
            interface definitions for the new feature.

            Create file: src/types/NewFeature.ts
            Include comprehensive type definitions with JSDoc.
          model: auto
          allow_all_tools: true
          resume_session: analyze_requirements

      - id: implement_core
        name: Implement Core Logic
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Implement the core feature logic based on:
            1. Requirements analysis from first step
            2. Type definitions from previous step

            Create the main implementation file with proper
            error handling and validation.
          model: auto
          allow_all_tools: true
          resume_session: create_types

      - id: create_tests
        name: Create Unit Tests
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Create comprehensive unit tests for the implementation:

            1. Test all public methods
            2. Test error conditions
            3. Test edge cases
            4. Follow existing test patterns in the codebase
          model: auto
          allow_all_tools: true
          resume_session: implement_core

      - id: update_documentation
        name: Update Documentation
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Update project documentation for the new feature:

            1. Add feature description to README.md
            2. Create usage examples
            3. Document API endpoints if applicable
            4. Update changelog
          model: auto
          allow_all_tools: true
          resume_session: create_tests
```

### 3. Conditional Workflow with Quality Gates

```yaml
name: quality-gate-pipeline
on:
  workflow_dispatch:
    inputs:
      description:
        description: Quality gate pipeline with conditional execution
        required: false
        type: string

jobs:
  pipeline:
    name: Quality Gate Pipeline
    runs-on: ubuntu-latest
    steps:
      - id: implement_feature
        name: Implement Feature
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Implement the requested feature based on specifications
            in /workspaces/vsix/docs/feature_spec.md
          model: auto
          allow_all_tools: true
          output_session: true

      - id: fix_linting
        name: Fix Linting Issues
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Run linting and fix any issues found:
            1. Run make lint to check for issues
            2. Fix any linting errors
            3. Ensure code follows project standards
          model: auto
          allow_all_tools: true
          resume_session: implement_feature
          check: "make lint"
          condition: "on_failure"

      - id: run_tests
        name: Run Tests
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Run the test suite and ensure all tests pass:
            1. Run make test
            2. Fix any failing tests
            3. Add new tests if needed
          model: auto
          allow_all_tools: true
          resume_session: fix_linting
          check: "make test"
          condition: "on_success"

      - id: deploy_feature
        name: Deploy Feature
        uses: anthropics/claude-pipeline-action@v1
        with:
          prompt: |
            Feature is ready for deployment:
            1. Create deployment package
            2. Update version numbers
            3. Generate deployment documentation
          model: auto
          allow_all_tools: true
          resume_session: run_tests
          check: "make test && make lint"
          condition: "on_success"
```

## Best Practices

### 1. Session Management

- Use `output_session: true` for steps that need to pass context
- Chain sessions logically based on task dependencies
- Avoid unnecessary session chaining for independent tasks

### 2. Prompt Design

- Be specific about file paths and requirements
- Reference existing documentation and analysis
- Include expected output format
- Provide context from previous steps

### 3. Model Selection

- Use `auto` for most cases to leverage automatic selection
- Specify models only when needed for consistency
- Consider model capabilities for specific tasks

### 4. Error Handling

- Plan for resume functionality with meaningful step names
- Include validation steps in complex workflows
- Use conditional execution for quality gates

### 5. Workflow Organization

- Group related steps logically
- Use descriptive step names and IDs
- Document complex workflows with comments

## CLI Integration

### Running Workflows

```bash
# Basic execution
./claude-runner run .github/workflows/workflow.yml

# With resume functionality
./claude-runner run .github/workflows/workflow.yml --resume

# With bypass permissions
./claude-runner run .github/workflows/workflow.yml --yes

# Combined flags
./claude-runner run .github/workflows/workflow.yml --resume --yes --verbose
```

### Job Log Files

Job logs are automatically created as `.job.json` files alongside workflow files:

- `.github/workflows/workflow.yml` → `.github/workflows/workflow.job.json`
- Enable resume functionality and progress tracking
- Compatible with Go CLI format for cross-platform usage

## Troubleshooting

### Common Issues

1. **Session Chaining Errors**

   - Ensure `output_session: true` on referenced steps
   - Check step ID references match exactly
   - Verify session flow is logical

2. **Model Selection Issues**

   - Use `auto` unless specific model required
   - Check available models in documentation
   - Verify model capabilities for task requirements

3. **Prompt Execution Failures**

   - Check file paths are correct
   - Ensure required files exist
   - Verify tool permissions with `allow_all_tools: true`

4. **Resume Functionality Problems**
   - Check job log file exists and is valid
   - Verify workflow file hasn't changed significantly
   - Use `--verbose` flag for detailed resume information

This specification provides a complete reference for creating effective Claude Runner workflows with proper session management, model selection, and conditional execution patterns.
