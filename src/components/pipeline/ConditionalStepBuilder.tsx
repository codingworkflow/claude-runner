import React from "react";
import { ConditionType } from "../../services/ClaudeCodeService";

export interface ConditionalStepConfig {
  condition: ConditionType;
  check?: string;
  dependsOn?: string[];
}

interface ConditionalStepBuilderProps {
  config: ConditionalStepConfig;
  availableSteps: Array<{ id: string; name: string }>;
  disabled?: boolean;
  onChange: (config: ConditionalStepConfig) => void;
}

const ConditionalStepBuilder: React.FC<ConditionalStepBuilderProps> = ({
  config,
  availableSteps,
  disabled = false,
  onChange,
}) => {
  const handleConditionChange = (condition: ConditionType) => {
    onChange({ ...config, condition });
  };

  const handleCheckChange = (check: string) => {
    onChange({ ...config, check: check.trim() || undefined });
  };

  const handleDependencyToggle = (stepId: string) => {
    const currentDependencies = config.dependsOn ?? [];
    const newDependencies = currentDependencies.includes(stepId)
      ? currentDependencies.filter((id) => id !== stepId)
      : [...currentDependencies, stepId];

    onChange({
      ...config,
      dependsOn: newDependencies.length > 0 ? newDependencies : undefined,
    });
  };

  return (
    <div className="conditional-step-builder">
      <div className="condition-builder-section">
        <h4>Execution Condition</h4>
        <div className="condition-options">
          {(["always", "on_success", "on_failure"] as const).map(
            (conditionType) => (
              <label key={conditionType} className="condition-option">
                <input
                  type="radio"
                  name="condition"
                  value={conditionType}
                  checked={config.condition === conditionType}
                  onChange={() => handleConditionChange(conditionType)}
                  disabled={disabled}
                />
                <span className="condition-label">
                  {conditionType === "always" && "Always run"}
                  {conditionType === "on_success" && "Run on success"}
                  {conditionType === "on_failure" && "Run on failure"}
                </span>
              </label>
            ),
          )}
        </div>
      </div>

      <div className="condition-builder-section">
        <h4>Pre-execution Check</h4>
        <div className="check-command-config">
          <input
            type="text"
            value={config.check ?? ""}
            onChange={(e) => handleCheckChange(e.target.value)}
            placeholder="Command to run before execution (optional)"
            className="check-command-input"
            disabled={disabled}
          />
          <p className="check-command-help">
            Optional command to verify conditions before running this step. Step
            will be skipped if command fails.
          </p>
        </div>
      </div>

      {availableSteps.length > 0 && (
        <div className="condition-builder-section">
          <h4>Dependencies</h4>
          <div className="dependencies-config">
            <p className="dependencies-help">
              Select steps that must complete successfully before this step
              runs:
            </p>
            <div className="dependency-checkboxes">
              {availableSteps.map((step) => (
                <label key={step.id} className="dependency-option">
                  <input
                    type="checkbox"
                    checked={(config.dependsOn ?? []).includes(step.id)}
                    onChange={() => handleDependencyToggle(step.id)}
                    disabled={disabled}
                  />
                  <span className="dependency-label">
                    {step.name ?? `Step ${step.id}`}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="condition-summary">
        <h4>Summary</h4>
        <div className="summary-content">
          <p>
            <strong>Condition:</strong>{" "}
            {config.condition === "always" && "Always execute this step"}
            {config.condition === "on_success" &&
              "Execute only if previous steps succeeded"}
            {config.condition === "on_failure" &&
              "Execute only if previous steps failed"}
          </p>
          {config.check && (
            <p>
              <strong>Pre-check:</strong> <code>{config.check}</code>
            </p>
          )}
          {config.dependsOn && config.dependsOn.length > 0 && (
            <p>
              <strong>Dependencies:</strong>{" "}
              {config.dependsOn
                .map((id) => {
                  const step = availableSteps.find((s) => s.id === id);
                  return step?.name ?? `Step ${id}`;
                })
                .join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ConditionalStepBuilder);
