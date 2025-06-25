import React from "react";
import { render, fireEvent } from "@testing-library/react";
import PipelineDialog from "../../../components/pipeline/PipelineDialog";

describe("PipelineDialog", () => {
  it("renders the pipeline dialog", () => {
    const { getByText } = render(
      <PipelineDialog
        showPipelineDialog={true}
        pipelineName=""
        setPipelineName={() => {}}
        pipelineDescription=""
        setPipelineDescription={() => {}}
        handleSavePipeline={() => {}}
        setShowPipelineDialog={() => {}}
      />,
    );

    expect(getByText("Save Pipeline")).toBeInTheDocument();
  });

  it('calls handleSavePipeline when the "Save Pipeline" button is clicked', () => {
    const handleSavePipeline = jest.fn();
    const { getByText } = render(
      <PipelineDialog
        showPipelineDialog={true}
        pipelineName="Test Pipeline"
        setPipelineName={() => {}}
        pipelineDescription="Test Description"
        setPipelineDescription={() => {}}
        handleSavePipeline={handleSavePipeline}
        setShowPipelineDialog={() => {}}
      />,
    );

    fireEvent.click(getByText("Save Pipeline"));
    expect(handleSavePipeline).toHaveBeenCalled();
  });

  it('calls setShowPipelineDialog when the "Cancel" button is clicked', () => {
    const setShowPipelineDialog = jest.fn();
    const { getByText } = render(
      <PipelineDialog
        showPipelineDialog={true}
        pipelineName=""
        setPipelineName={() => {}}
        pipelineDescription=""
        setPipelineDescription={() => {}}
        handleSavePipeline={() => {}}
        setShowPipelineDialog={setShowPipelineDialog}
      />,
    );

    fireEvent.click(getByText("Cancel"));
    expect(setShowPipelineDialog).toHaveBeenCalledWith(false);
  });
});
