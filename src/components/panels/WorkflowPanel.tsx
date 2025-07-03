import React, { useState, useEffect } from "react";
import Button from "../common/Button";
import PathSelector from "../common/PathSelector";
import ModelSelector from "../common/ModelSelector";
import Card from "../common/Card";
import { useExtension } from "../../contexts/ExtensionContext";
import { isClaudeStep, Step } from "../../types/WorkflowTypes";
import { WorkflowParser } from "../../services/WorkflowParser";

interface WorkflowPanelProps {
  disabled: boolean;
}

const WorkflowPanel: React.FC<WorkflowPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { main } = state;
  const {
    workflows,
    currentWorkflow,
    workflowInputs,
    executionStatus,
    stepStatuses,
    rootPath,
    model: defaultModel,
  } = main;

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [workflowYaml, setWorkflowYaml] = useState<string>("");
  const [editMode, setEditMode] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>("");

  useEffect(() => {
    actions.loadWorkflows();
  }, []);

  useEffect(() => {
    if (currentWorkflow) {
      setWorkflowYaml(WorkflowParser.toYaml(currentWorkflow));
      setParseError("");
    } else {
      setWorkflowYaml("");
    }
  }, [currentWorkflow]);

  const handleWorkflowSelect = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    if (workflowId) {
      actions.loadWorkflow(workflowId);
    }
  };

  const handleYamlEdit = (yaml: string) => {
    setWorkflowYaml(yaml);
    try {
      WorkflowParser.parseYaml(yaml);
      setParseError("");
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Invalid YAML");
    }
  };

  const handleSaveWorkflow = () => {
    try {
      const workflow = WorkflowParser.parseYaml(workflowYaml);
      const workflowId = selectedWorkflowId || `claude-workflow-${Date.now()}`;
      actions.saveWorkflow(workflowId, workflow);
      setEditMode(false);
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Failed to save workflow",
      );
    }
  };

  const handleInputChange = (inputName: string, value: string) => {
    actions.updateWorkflowInputs({
      ...workflowInputs,
      [inputName]: value,
    });
  };

  const getStepStatus = (stepId: string) => {
    return stepStatuses[stepId] || { status: "pending" };
  };

  const renderStepStatus = (step: Step, stepId: string) => {
    const status = getStepStatus(stepId);
    const statusColors = {
      pending: "text-gray-500",
      running: "text-blue-500",
      completed: "text-green-500",
      failed: "text-red-500",
    };

    return (
      <div className={`mt-2 ${statusColors[status.status]}`}>
        <span>Status: {status.status}</span>
        {status.output?.result && (
          <div className="mt-1 text-sm">
            <span className="font-semibold">Output:</span>
            <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-32">
              {status.output.result}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      {/* Workflow Selection */}
      <Card title="Workflow Selection">
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              value={selectedWorkflowId}
              onChange={(e) => handleWorkflowSelect(e.target.value)}
              disabled={disabled || executionStatus === "running"}
            >
              <option value="">Select a workflow...</option>
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name} ({workflow.id})
                </option>
              ))}
            </select>
            <Button
              onClick={actions.createSampleWorkflow}
              disabled={disabled || executionStatus === "running"}
            >
              Create Sample
            </Button>
          </div>

          {currentWorkflow && (
            <div className="flex gap-2">
              <Button
                onClick={() => setEditMode(!editMode)}
                disabled={disabled || executionStatus === "running"}
              >
                {editMode ? "Cancel Edit" : "Edit YAML"}
              </Button>
              {editMode && (
                <Button
                  onClick={handleSaveWorkflow}
                  disabled={disabled || !!parseError}
                >
                  Save Workflow
                </Button>
              )}
              <Button
                onClick={() => {
                  if (
                    confirm("Are you sure you want to delete this workflow?")
                  ) {
                    actions.deleteWorkflow(selectedWorkflowId);
                    setSelectedWorkflowId("");
                  }
                }}
                disabled={disabled || executionStatus === "running"}
                className="text-red-600"
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Workflow Configuration */}
      {currentWorkflow && (
        <>
          <Card title="Configuration">
            <div className="space-y-3">
              <PathSelector
                rootPath={rootPath}
                onUpdateRootPath={actions.updateRootPath}
                disabled={disabled || executionStatus === "running"}
              />
              <ModelSelector
                model={defaultModel}
                onUpdateModel={actions.updateModel}
                disabled={disabled || executionStatus === "running"}
              />
            </div>
          </Card>

          {/* Workflow Inputs */}
          {currentWorkflow.on?.workflow_dispatch?.inputs && (
            <Card title="Workflow Inputs">
              <div className="space-y-3">
                {Object.entries(
                  currentWorkflow.on.workflow_dispatch.inputs,
                ).map(([name, input]) => (
                  <div key={name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {name}
                      {input.required && (
                        <span className="text-red-500">*</span>
                      )}
                      {input.description && (
                        <span className="text-xs text-gray-500 ml-2">
                          ({input.description})
                        </span>
                      )}
                    </label>
                    <input
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={workflowInputs[name] ?? input.default ?? ""}
                      onChange={(e) => handleInputChange(name, e.target.value)}
                      placeholder={input.description}
                      disabled={disabled || executionStatus === "running"}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Workflow Editor */}
          {editMode && (
            <Card title="Workflow YAML">
              <div className="space-y-2">
                <textarea
                  className="w-full h-96 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                  value={workflowYaml}
                  onChange={(e) => handleYamlEdit(e.target.value)}
                  disabled={disabled}
                />
                {parseError && (
                  <div className="text-red-500 text-sm">{parseError}</div>
                )}
              </div>
            </Card>
          )}

          {/* Workflow Steps */}
          {!editMode && (
            <Card title="Workflow Steps">
              <div className="space-y-3">
                {Object.entries(currentWorkflow.jobs).map(([jobName, job]) => (
                  <div
                    key={jobName}
                    className="border-l-2 border-gray-200 pl-4"
                  >
                    <h4 className="font-semibold text-gray-700 mb-2">
                      {job.name ?? jobName}
                    </h4>
                    {job.steps.map((step, index) => {
                      const stepId = step.id ?? `${jobName}-step-${index}`;
                      if (!isClaudeStep(step)) {
                        return (
                          <div
                            key={stepId}
                            className="mb-3 p-3 bg-gray-50 rounded"
                          >
                            <div className="text-sm text-gray-600">
                              {step.name ?? step.run ?? "Non-Claude step"}
                            </div>
                            {executionStatus !== "idle" &&
                              renderStepStatus(step, stepId)}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={stepId}
                          className="mb-3 p-3 bg-white border rounded"
                        >
                          <div className="font-medium">
                            {step.name ?? stepId}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            <div>
                              <strong>Prompt:</strong> {step.with.prompt}
                            </div>
                            {step.with.model && (
                              <div>
                                <strong>Model:</strong> {step.with.model}
                              </div>
                            )}
                            {step.with.resume_session && (
                              <div>
                                <strong>Resume Session:</strong>{" "}
                                {step.with.resume_session}
                              </div>
                            )}
                            {step.with.output_session && (
                              <div>
                                <strong>Output Session:</strong> Yes
                              </div>
                            )}
                          </div>
                          {executionStatus !== "idle" &&
                            renderStepStatus(step, stepId)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Execution Controls */}
          <Card title="Execution">
            <div className="flex gap-2">
              <Button
                onClick={actions.runWorkflow}
                disabled={disabled || executionStatus === "running" || editMode}
              >
                Run Workflow
              </Button>
              {executionStatus === "running" && (
                <Button onClick={actions.cancelWorkflow}>Cancel</Button>
              )}
              <div className="flex-1 text-right">
                {executionStatus === "running" && (
                  <span className="text-blue-500">Running...</span>
                )}
                {executionStatus === "completed" && (
                  <span className="text-green-500">Completed</span>
                )}
                {executionStatus === "failed" && (
                  <span className="text-red-500">Failed</span>
                )}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default React.memo(WorkflowPanel);
