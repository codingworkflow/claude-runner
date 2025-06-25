import React from "react";
import Button from "../common/Button";

interface PipelineDialogProps {
  showPipelineDialog: boolean;
  pipelineName: string;
  setPipelineName: (name: string) => void;
  pipelineDescription: string;
  setPipelineDescription: (description: string) => void;
  handleSavePipeline: () => void;
  setShowPipelineDialog: (show: boolean) => void;
}

const PipelineDialog: React.FC<PipelineDialogProps> = ({
  showPipelineDialog,
  pipelineName,
  setPipelineName,
  pipelineDescription,
  setPipelineDescription,
  handleSavePipeline,
  setShowPipelineDialog,
}) => {
  if (!showPipelineDialog) {
    return null;
  }

  return (
    <div className="pipeline-dialog-overlay">
      <div className="pipeline-dialog">
        <h3>Save Pipeline</h3>
        <div className="dialog-content">
          <div className="input-group">
            <label>Pipeline Name:</label>
            <input
              type="text"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              placeholder="e.g., tests, build-and-deploy"
              className="pipeline-name-input"
            />
          </div>
          <div className="input-group">
            <label>Description:</label>
            <textarea
              value={pipelineDescription}
              onChange={(e) => setPipelineDescription(e.target.value)}
              placeholder="Describe what this pipeline does..."
              rows={3}
              className="pipeline-description-input"
            />
          </div>
        </div>
        <div className="dialog-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setShowPipelineDialog(false);
              setPipelineName("");
              setPipelineDescription("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSavePipeline}
            disabled={!pipelineName.trim()}
          >
            Save Pipeline
          </Button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PipelineDialog);
