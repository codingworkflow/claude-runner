import React from "react";
import Card from "../common/Card";
import Toggle from "../common/Toggle";
import PathSelector from "../common/PathSelector";
import ModelSelector from "../common/ModelSelector";
import { useExtension } from "../../contexts/ExtensionContext";

interface ConfigPanelProps {
  disabled: boolean;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ disabled }) => {
  const { state, actions } = useExtension();
  const { main } = state;

  return (
    <Card title="Configuration">
      <div className="space-y-4">
        {/* Model Selection */}
        <ModelSelector
          model={main.model}
          onUpdateModel={actions.updateModel}
          disabled={disabled}
        />

        {/* Root Path */}
        <PathSelector
          rootPath={main.rootPath}
          onUpdateRootPath={actions.updateRootPath}
          disabled={disabled}
        />

        {/* Tool Permissions */}
        <div className="mt-4">
          <Toggle
            checked={main.allowAllTools}
            onChange={actions.updateAllowAllTools}
            label="Allow All Tools (--dangerously-skip-permissions)"
            disabled={disabled}
          />
        </div>
      </div>
    </Card>
  );
};

export default React.memo(ConfigPanel);
