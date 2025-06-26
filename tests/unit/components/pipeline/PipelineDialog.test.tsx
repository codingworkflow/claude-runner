import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import PipelineDialog from "../../../../src/components/pipeline/PipelineDialog";

describe("PipelineDialog", () => {
  it("renders the pipeline dialog", () => {
    const { getByRole } = render(
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

    expect(getByRole("button", { name: "Save Pipeline" })).toBeTruthy();
  });

  it('calls handleSavePipeline when the "Save Pipeline" button is clicked', () => {
    const handleSavePipeline = jest.fn();
    const { getByRole } = render(
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

    fireEvent.click(getByRole("button", { name: "Save Pipeline" }));
    expect(handleSavePipeline).toHaveBeenCalled();
  });

  it('calls setShowPipelineDialog when the "Cancel" button is clicked', () => {
    const setShowPipelineDialog = jest.fn();
    const { getByRole } = render(
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

    fireEvent.click(getByRole("button", { name: "Cancel" }));
    expect(setShowPipelineDialog).toHaveBeenCalledWith(false);
  });
});
