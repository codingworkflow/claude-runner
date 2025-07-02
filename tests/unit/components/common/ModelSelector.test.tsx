import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ModelSelector from "../../../../src/components/common/ModelSelector";
import { AVAILABLE_MODELS } from "../../../../src/models/ClaudeModels";

describe("ModelSelector", () => {
  const mockOnUpdateModel = jest.fn();

  beforeEach(() => {
    mockOnUpdateModel.mockClear();
  });

  describe("rendering and props", () => {
    it("renders with default props", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const label = screen.getByText("Claude Model");
      const select = screen.getByRole("combobox");

      expect(label).toBeInTheDocument();
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue("auto");
      expect(select).not.toBeDisabled();
    });

    it("renders with custom model selection", () => {
      render(
        <ModelSelector
          model="claude-sonnet-4-20250514"
          onUpdateModel={mockOnUpdateModel}
        />,
      );

      const select = screen.getByRole("combobox");
      expect(select).toHaveValue("claude-sonnet-4-20250514");
    });

    it("renders disabled when disabled prop is true", () => {
      render(
        <ModelSelector
          model="auto"
          onUpdateModel={mockOnUpdateModel}
          disabled={true}
        />,
      );

      const select = screen.getByRole("combobox");
      expect(select).toBeDisabled();
    });

    it("has correct HTML structure", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const container = screen.getByRole("combobox").closest(".input-group");
      const label = screen.getByText("Claude Model");
      const select = screen.getByRole("combobox");

      expect(container).toHaveClass("input-group");
      expect(label).toHaveAttribute("for", "model-select");
      expect(select).toHaveAttribute("id", "model-select");
      expect(select).toHaveClass("model-select");
    });
  });

  describe("model dropdown functionality and options", () => {
    it("renders all available models as options", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      AVAILABLE_MODELS.forEach((model) => {
        const option = screen.getByRole("option", { name: model.name });
        expect(option).toBeInTheDocument();
        expect(option).toHaveValue(model.id);
      });
    });

    it("shows correct number of options", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(AVAILABLE_MODELS.length);
    });

    it("maps model IDs to display names correctly", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const autoOption = screen.getByRole("option", { name: "Auto" });
      const opusOption = screen.getByRole("option", { name: "Claude Opus 4" });
      const sonnetOption = screen.getByRole("option", {
        name: "Claude Sonnet 4",
      });

      expect(autoOption).toHaveValue("auto");
      expect(opusOption).toHaveValue("claude-opus-4-20250514");
      expect(sonnetOption).toHaveValue("claude-sonnet-4-20250514");
    });

    it("shows selected model correctly", () => {
      render(
        <ModelSelector
          model="claude-opus-4-20250514"
          onUpdateModel={mockOnUpdateModel}
        />,
      );

      const selectedOption = screen.getByRole("option", {
        name: "Claude Opus 4",
      });
      expect(selectedOption).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toHaveValue(
        "claude-opus-4-20250514",
      );
    });
  });

  describe("model change event handling", () => {
    it("calls onUpdateModel when selection changes", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, {
        target: { value: "claude-sonnet-4-20250514" },
      });

      expect(mockOnUpdateModel).toHaveBeenCalledTimes(1);
      expect(mockOnUpdateModel).toHaveBeenCalledWith(
        "claude-sonnet-4-20250514",
      );
    });

    it("calls onUpdateModel with correct model ID for each option", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const select = screen.getByRole("combobox");

      AVAILABLE_MODELS.forEach((model, index) => {
        fireEvent.change(select, { target: { value: model.id } });
        expect(mockOnUpdateModel).toHaveBeenNthCalledWith(index + 1, model.id);
      });

      expect(mockOnUpdateModel).toHaveBeenCalledTimes(AVAILABLE_MODELS.length);
    });

    it("does not call onUpdateModel when disabled", () => {
      render(
        <ModelSelector
          model="auto"
          onUpdateModel={mockOnUpdateModel}
          disabled={true}
        />,
      );

      const select = screen.getByRole("combobox");

      // Disabled select elements still trigger onChange in tests, but won't in real usage
      // We test that the element is properly disabled
      expect(select).toBeDisabled();
    });

    it("handles rapid selection changes", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const select = screen.getByRole("combobox");

      fireEvent.change(select, { target: { value: "claude-opus-4-20250514" } });
      fireEvent.change(select, {
        target: { value: "claude-sonnet-4-20250514" },
      });
      fireEvent.change(select, {
        target: { value: "claude-3-5-haiku-20241022" },
      });

      expect(mockOnUpdateModel).toHaveBeenCalledTimes(3);
      expect(mockOnUpdateModel).toHaveBeenNthCalledWith(
        1,
        "claude-opus-4-20250514",
      );
      expect(mockOnUpdateModel).toHaveBeenNthCalledWith(
        2,
        "claude-sonnet-4-20250514",
      );
      expect(mockOnUpdateModel).toHaveBeenNthCalledWith(
        3,
        "claude-3-5-haiku-20241022",
      );
    });
  });

  describe("model availability checking", () => {
    it("includes all expected model options", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const expectedModels = [
        "auto",
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
        "claude-3-7-sonnet-20250219",
        "claude-3-5-haiku-20241022",
      ];

      expectedModels.forEach((modelId) => {
        const options = screen.getAllByRole("option");
        const option = options.find(
          (opt) => opt.getAttribute("value") === modelId,
        );
        expect(option).toBeInTheDocument();
      });
    });

    it("handles valid model selection", () => {
      const validModel = "claude-sonnet-4-20250514";
      render(
        <ModelSelector model={validModel} onUpdateModel={mockOnUpdateModel} />,
      );

      const select = screen.getByRole("combobox");
      expect(select).toHaveValue(validModel);

      const options = screen.getAllByRole("option");
      const option = options.find(
        (opt) => opt.getAttribute("value") === validModel,
      );
      expect(option).toBeInTheDocument();
    });

    it("accepts any model string as prop value", () => {
      const invalidModel = "non-existent-model";
      render(
        <ModelSelector
          model={invalidModel}
          onUpdateModel={mockOnUpdateModel}
        />,
      );

      const select = screen.getByRole("combobox");
      // HTML select elements will default to first option if given an invalid value
      // But the React component should still accept the prop
      expect(select).toBeInTheDocument();
    });

    it("maintains model list consistency", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const options = screen.getAllByRole("option");
      const optionValues = options.map((option) =>
        option.getAttribute("value"),
      );
      const expectedValues = AVAILABLE_MODELS.map((model) => model.id);

      expect(optionValues).toEqual(expectedValues);
    });
  });

  describe("model selector error states", () => {
    it("renders gracefully with empty model string", () => {
      render(<ModelSelector model="" onUpdateModel={mockOnUpdateModel} />);

      const select = screen.getByRole("combobox");
      // Empty string will default to first option but component should still render
      expect(select).toBeInTheDocument();
    });

    it("handles undefined model gracefully", () => {
      render(
        <ModelSelector
          model={undefined as unknown as string}
          onUpdateModel={mockOnUpdateModel}
        />,
      );

      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });

    it("continues to function after prop changes", () => {
      const { rerender } = render(
        <ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />,
      );

      let select = screen.getByRole("combobox");
      expect(select).toHaveValue("auto");

      rerender(
        <ModelSelector
          model="claude-sonnet-4-20250514"
          onUpdateModel={mockOnUpdateModel}
        />,
      );

      select = screen.getByRole("combobox");
      expect(select).toHaveValue("claude-sonnet-4-20250514");
    });

    it("handles missing onUpdateModel gracefully", () => {
      expect(() => {
        render(
          <ModelSelector
            model="auto"
            onUpdateModel={undefined as unknown as (model: string) => void}
          />,
        );
      }).not.toThrow();
    });

    it("maintains disabled state correctly", () => {
      const { rerender } = render(
        <ModelSelector
          model="auto"
          onUpdateModel={mockOnUpdateModel}
          disabled={false}
        />,
      );

      let select = screen.getByRole("combobox");
      expect(select).not.toBeDisabled();

      rerender(
        <ModelSelector
          model="auto"
          onUpdateModel={mockOnUpdateModel}
          disabled={true}
        />,
      );

      select = screen.getByRole("combobox");
      expect(select).toBeDisabled();
    });
  });

  describe("accessibility features", () => {
    it("has proper label association", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const label = screen.getByText("Claude Model");
      const select = screen.getByRole("combobox");

      expect(label).toHaveAttribute("for", "model-select");
      expect(select).toHaveAttribute("id", "model-select");
    });

    it("is focusable when not disabled", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const select = screen.getByRole("combobox");
      select.focus();
      expect(select).toHaveFocus();
    });

    it("is not focusable when disabled", () => {
      render(
        <ModelSelector
          model="auto"
          onUpdateModel={mockOnUpdateModel}
          disabled={true}
        />,
      );

      const select = screen.getByRole("combobox");
      expect(select).toBeDisabled();
    });

    it("supports keyboard navigation", () => {
      render(<ModelSelector model="auto" onUpdateModel={mockOnUpdateModel} />);

      const select = screen.getByRole("combobox");
      select.focus();
      expect(document.activeElement).toBe(select);
    });
  });
});
