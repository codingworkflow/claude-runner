import React from "react";
import "@testing-library/jest-dom";
import Toggle from "../../../../src/components/common/Toggle";
import { setupComponentTest } from "../../helpers/componentTestUtils";

describe("Toggle", () => {
  const { render, screen, fireEvent } = setupComponentTest();

  describe("rendering and props", () => {
    it("renders with default props", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveClass("toggle-switch");
      expect(toggle).not.toHaveClass("checked");
      expect(toggle).not.toBeDisabled();
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).toHaveAttribute("aria-label", "Toggle");
    });

    it("renders in checked state", () => {
      const onChange = jest.fn();
      render(<Toggle checked={true} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toHaveClass("toggle-switch", "checked");
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    it("renders with custom label", () => {
      const onChange = jest.fn();
      render(
        <Toggle
          checked={false}
          onChange={onChange}
          label="Enable notifications"
        />,
      );
      const toggle = screen.getByRole("button");
      const label = screen.getByText("Enable notifications");

      expect(toggle).toHaveAttribute("aria-label", "Enable notifications");
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass("toggle-label");
    });

    it("renders with custom className", () => {
      const onChange = jest.fn();
      render(
        <Toggle
          checked={false}
          onChange={onChange}
          className="custom-toggle"
        />,
      );
      const container = screen.getByRole("button").parentElement;

      expect(container).toHaveClass("toggle-container", "custom-toggle");
    });

    it("renders disabled state", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toBeDisabled();
      expect(toggle).toHaveClass("toggle-switch", "disabled");
    });

    it("renders disabled state with label", () => {
      const onChange = jest.fn();
      render(
        <Toggle
          checked={false}
          onChange={onChange}
          label="Disabled toggle"
          disabled={true}
        />,
      );
      const toggle = screen.getByRole("button");
      const label = screen.getByText("Disabled toggle");

      expect(toggle).toBeDisabled();
      expect(toggle).toHaveClass("disabled");
      expect(label).toHaveClass("toggle-label", "disabled");
    });
  });

  describe("toggle switch functionality and state changes", () => {
    it("calls onChange with opposite state when clicked", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      fireEvent.click(toggle);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("calls onChange with false when checked toggle is clicked", () => {
      const onChange = jest.fn();
      render(<Toggle checked={true} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      fireEvent.click(toggle);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it("toggles between checked and unchecked states", () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <Toggle checked={false} onChange={onChange} />,
      );
      let toggle = screen.getByRole("button");

      expect(toggle).not.toHaveClass("checked");
      expect(toggle).toHaveAttribute("aria-pressed", "false");

      rerender(<Toggle checked={true} onChange={onChange} />);
      toggle = screen.getByRole("button");

      expect(toggle).toHaveClass("checked");
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("toggle event handling and callbacks", () => {
    it("does not call onChange when disabled", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      fireEvent.click(toggle);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("handles multiple clicks correctly", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      fireEvent.click(toggle);
      fireEvent.click(toggle);
      fireEvent.click(toggle);

      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange).toHaveBeenNthCalledWith(1, true);
      expect(onChange).toHaveBeenNthCalledWith(2, true);
      expect(onChange).toHaveBeenNthCalledWith(3, true);
    });

    it("prevents event handling when disabled", () => {
      const onChange = jest.fn();
      render(<Toggle checked={true} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      fireEvent.click(toggle);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("toggle disabled state behavior", () => {
    it("is not disabled when disabled prop is false", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} disabled={false} />);
      const toggle = screen.getByRole("button");

      expect(toggle).not.toBeDisabled();
      expect(toggle).not.toHaveClass("disabled");
    });

    it("is disabled when disabled prop is true", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toBeDisabled();
      expect(toggle).toHaveClass("disabled");
    });

    it("maintains checked state when disabled", () => {
      const onChange = jest.fn();
      render(<Toggle checked={true} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toBeDisabled();
      expect(toggle).toHaveClass("checked", "disabled");
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    it("prevents state changes when disabled", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      fireEvent.click(toggle);

      expect(onChange).not.toHaveBeenCalled();
      expect(toggle).not.toHaveClass("checked");
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("toggle styling and visual feedback", () => {
    it("applies correct base classes", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const container = screen.getByRole("button").parentElement;
      const toggle = screen.getByRole("button");
      const slider = toggle.querySelector(".toggle-slider");

      expect(container).toHaveClass("toggle-container");
      expect(toggle).toHaveClass("toggle-switch");
      expect(slider).toBeInTheDocument();
    });

    it("applies checked class when checked", () => {
      const onChange = jest.fn();
      render(<Toggle checked={true} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toHaveClass("toggle-switch", "checked");
    });

    it("applies disabled class when disabled", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toHaveClass("toggle-switch", "disabled");
    });

    it("combines multiple state classes correctly", () => {
      const onChange = jest.fn();
      render(
        <Toggle
          checked={true}
          onChange={onChange}
          disabled={true}
          className="custom"
        />,
      );
      const container = screen.getByRole("button").parentElement;
      const toggle = screen.getByRole("button");

      expect(container).toHaveClass("toggle-container", "custom");
      expect(toggle).toHaveClass("toggle-switch", "checked", "disabled");
    });

    it("renders slider element", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");
      const slider = toggle.querySelector(".toggle-slider");

      expect(slider).toBeInTheDocument();
      expect(slider).toHaveClass("toggle-slider");
    });

    it("does not render label when not provided", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const container = screen.getByRole("button").parentElement;
      const label = container?.querySelector(".toggle-label");

      expect(label).not.toBeInTheDocument();
    });
  });

  describe("toggle accessibility and keyboard support", () => {
    it("has proper button role", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toBeInTheDocument();
    });

    it("has correct aria-pressed attribute", () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <Toggle checked={false} onChange={onChange} />,
      );
      let toggle = screen.getByRole("button");

      expect(toggle).toHaveAttribute("aria-pressed", "false");

      rerender(<Toggle checked={true} onChange={onChange} />);
      toggle = screen.getByRole("button");

      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    it("has correct aria-label", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toHaveAttribute("aria-label", "Toggle");
    });

    it("uses custom label as aria-label", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} label="Dark mode" />);
      const toggle = screen.getByRole("button");

      expect(toggle).toHaveAttribute("aria-label", "Dark mode");
    });

    it("is focusable when not disabled", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      toggle.focus();
      expect(toggle).toHaveFocus();
    });

    it("is not focusable when disabled", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} disabled={true} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute("disabled");
    });

    it("supports keyboard navigation", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      toggle.focus();
      expect(toggle).toHaveFocus();
      expect(document.activeElement).toBe(toggle);
    });

    it("maintains focus after interaction", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      toggle.focus();
      fireEvent.click(toggle);

      expect(toggle).toHaveFocus();
    });

    it("provides accessible name through label", () => {
      const onChange = jest.fn();
      render(
        <Toggle
          checked={false}
          onChange={onChange}
          label="Enable notifications"
        />,
      );
      const toggle = screen.getByRole("button", {
        name: "Enable notifications",
      });

      expect(toggle).toBeInTheDocument();
    });

    it("has proper button semantics for keyboard support", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);
      const toggle = screen.getByRole("button");

      expect(toggle).toHaveAttribute("type", "button");
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).not.toBeDisabled();
    });

    it("maintains keyboard accessibility attributes", () => {
      const onChange = jest.fn();
      render(<Toggle checked={true} onChange={onChange} label="Test toggle" />);
      const toggle = screen.getByRole("button");

      expect(toggle).toHaveAttribute("aria-pressed", "true");
      expect(toggle).toHaveAttribute("aria-label", "Test toggle");
      expect(toggle).toHaveAttribute("type", "button");
    });

    it("is properly labeled for screen readers", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} label="Dark mode" />);

      const toggle = screen.getByRole("button", { name: "Dark mode" });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });

    it("provides default accessible name when no label", () => {
      const onChange = jest.fn();
      render(<Toggle checked={false} onChange={onChange} />);

      const toggle = screen.getByRole("button", { name: "Toggle" });
      expect(toggle).toBeInTheDocument();
    });
  });
});
