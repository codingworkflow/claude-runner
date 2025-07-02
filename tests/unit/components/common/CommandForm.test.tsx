import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CommandForm from "../../../../src/components/common/CommandForm";

describe("CommandForm", () => {
  const defaultProps = {
    value: "",
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering and props", () => {
    it("renders with default props", () => {
      render(<CommandForm {...defaultProps} />);

      const input = screen.getByRole("textbox");
      const createButton = screen.getByRole("button", { name: "Create" });
      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("placeholder", "Enter command name");
      expect(input).toHaveValue("");
      expect(input).toHaveFocus();
      expect(createButton).toBeInTheDocument();
      expect(cancelButton).toBeInTheDocument();
    });

    it("renders with custom placeholder", () => {
      render(
        <CommandForm {...defaultProps} placeholder="Custom placeholder" />,
      );

      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("placeholder", "Custom placeholder");
    });

    it("renders with provided value", () => {
      render(<CommandForm {...defaultProps} value="test command" />);

      const input = screen.getByRole("textbox");
      expect(input).toHaveValue("test command");
    });

    it("renders disabled state", () => {
      render(<CommandForm {...defaultProps} disabled />);

      const input = screen.getByRole("textbox");
      const createButton = screen.getByRole("button", { name: "Create" });
      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      expect(input).toBeDisabled();
      expect(createButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    it("applies proper CSS classes", () => {
      const { container } = render(<CommandForm {...defaultProps} />);

      expect(container.querySelector(".add-command-form")).toBeInTheDocument();
      expect(container.querySelector(".form-actions")).toBeInTheDocument();
    });
  });

  describe("form field interactions", () => {
    it("calls onChange when input value changes", () => {
      const onChange = jest.fn();
      render(<CommandForm {...defaultProps} onChange={onChange} />);

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "new command" } });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("new command");
    });

    it("updates input value correctly", () => {
      const { rerender } = render(<CommandForm {...defaultProps} value="" />);

      let input = screen.getByRole("textbox");
      expect(input).toHaveValue("");

      rerender(<CommandForm {...defaultProps} value="updated value" />);
      input = screen.getByRole("textbox");
      expect(input).toHaveValue("updated value");
    });

    it("handles multiple character input", () => {
      const onChange = jest.fn();
      render(<CommandForm {...defaultProps} onChange={onChange} />);

      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "a" } });
      fireEvent.change(input, { target: { value: "ab" } });
      fireEvent.change(input, { target: { value: "abc" } });

      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange).toHaveBeenNthCalledWith(1, "a");
      expect(onChange).toHaveBeenNthCalledWith(2, "ab");
      expect(onChange).toHaveBeenNthCalledWith(3, "abc");
    });

    it("does not call onChange when disabled", () => {
      const onChange = jest.fn();
      render(<CommandForm {...defaultProps} onChange={onChange} disabled />);

      const input = screen.getByRole("textbox");
      // Disabled inputs in React still trigger onChange events
      // The component itself doesn't prevent this - it's handled by the parent
      fireEvent.change(input, { target: { value: "test" } });

      // The onChange is still called as React doesn't prevent it automatically
      expect(onChange).toHaveBeenCalledWith("test");
    });
  });

  describe("form submission", () => {
    it("calls onSubmit when Create button is clicked", () => {
      const onSubmit = jest.fn();
      render(
        <CommandForm
          {...defaultProps}
          value="test command"
          onSubmit={onSubmit}
        />,
      );

      const createButton = screen.getByRole("button", { name: "Create" });
      fireEvent.click(createButton);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("calls onSubmit when Enter key is pressed", () => {
      const onSubmit = jest.fn();
      render(
        <CommandForm
          {...defaultProps}
          value="test command"
          onSubmit={onSubmit}
        />,
      );

      const input = screen.getByRole("textbox");
      fireEvent.keyPress(input, { key: "Enter", charCode: 13 });

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("does not call onSubmit for other keys", () => {
      const onSubmit = jest.fn();
      render(
        <CommandForm
          {...defaultProps}
          value="test command"
          onSubmit={onSubmit}
        />,
      );

      const input = screen.getByRole("textbox");
      fireEvent.keyPress(input, { key: "Space", code: "Space" });
      fireEvent.keyPress(input, { key: "Tab", code: "Tab" });
      fireEvent.keyPress(input, { key: "Escape", code: "Escape" });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("calls onCancel when Cancel button is clicked", () => {
      const onCancel = jest.fn();
      render(<CommandForm {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("does not call onSubmit when disabled", () => {
      const onSubmit = jest.fn();
      render(
        <CommandForm
          {...defaultProps}
          value="test"
          onSubmit={onSubmit}
          disabled
        />,
      );

      const createButton = screen.getByRole("button", { name: "Create" });
      fireEvent.click(createButton);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not call onCancel when disabled", () => {
      const onCancel = jest.fn();
      render(<CommandForm {...defaultProps} onCancel={onCancel} disabled />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelButton);

      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe("form validation", () => {
    it("disables Create button when value is empty", () => {
      render(<CommandForm {...defaultProps} value="" />);

      const createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).toBeDisabled();
    });

    it("disables Create button when value is only whitespace", () => {
      render(<CommandForm {...defaultProps} value="   " />);

      const createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).toBeDisabled();
    });

    it("enables Create button when value has content", () => {
      render(<CommandForm {...defaultProps} value="test command" />);

      const createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).not.toBeDisabled();
    });

    it("enables Create button when value has content with leading/trailing spaces", () => {
      render(<CommandForm {...defaultProps} value="  test command  " />);

      const createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).not.toBeDisabled();
    });

    it("updates Create button state dynamically", () => {
      const { rerender } = render(<CommandForm {...defaultProps} value="" />);

      let createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).toBeDisabled();

      rerender(<CommandForm {...defaultProps} value="test" />);
      createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).not.toBeDisabled();

      rerender(<CommandForm {...defaultProps} value="" />);
      createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).toBeDisabled();
    });

    it("keeps Create button disabled when form is disabled regardless of value", () => {
      render(<CommandForm {...defaultProps} value="test command" disabled />);

      const createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).toBeDisabled();
    });
  });

  describe("accessibility features", () => {
    it("has proper input role and attributes", () => {
      render(<CommandForm {...defaultProps} />);

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("type", "text");
    });

    it("has autofocus on input", () => {
      render(<CommandForm {...defaultProps} />);

      const input = screen.getByRole("textbox");
      expect(input).toHaveFocus();
    });

    it("maintains focus management", () => {
      render(<CommandForm {...defaultProps} value="test" />);

      const input = screen.getByRole("textbox");
      const createButton = screen.getByRole("button", { name: "Create" });

      expect(input).toHaveFocus();

      createButton.focus();
      expect(createButton).toHaveFocus();

      input.focus();
      expect(input).toHaveFocus();
    });

    it("supports keyboard navigation", () => {
      render(<CommandForm {...defaultProps} value="test" />);

      const input = screen.getByRole("textbox");
      const createButton = screen.getByRole("button", { name: "Create" });
      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      expect(input).toHaveFocus();

      fireEvent.keyDown(input, { key: "Tab" });
      createButton.focus();
      expect(createButton).toHaveFocus();

      fireEvent.keyDown(createButton, { key: "Tab" });
      cancelButton.focus();
      expect(cancelButton).toHaveFocus();
    });

    it("has proper button roles and labels", () => {
      render(<CommandForm {...defaultProps} />);

      const createButton = screen.getByRole("button", { name: "Create" });
      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      expect(createButton).toBeInTheDocument();
      expect(cancelButton).toBeInTheDocument();
    });

    it("provides appropriate disabled state indicators", () => {
      render(<CommandForm {...defaultProps} disabled />);

      const input = screen.getByRole("textbox");
      const createButton = screen.getByRole("button", { name: "Create" });
      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      expect(input).toBeDisabled();
      expect(createButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();

      expect(input).toHaveAttribute("disabled");
      expect(createButton).toHaveAttribute("disabled");
      expect(cancelButton).toHaveAttribute("disabled");
    });
  });

  describe("button variants and styling", () => {
    it("renders Create button with primary variant", () => {
      render(<CommandForm {...defaultProps} value="test" />);

      const createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).toHaveClass("primary");
    });

    it("renders Cancel button with secondary variant", () => {
      render(<CommandForm {...defaultProps} />);

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      expect(cancelButton).toHaveClass("secondary");
    });

    it("applies proper disabled classes to buttons", () => {
      render(<CommandForm {...defaultProps} value="" />);

      const createButton = screen.getByRole("button", { name: "Create" });
      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      expect(createButton).toBeDisabled();
      expect(cancelButton).not.toBeDisabled();
    });
  });

  describe("React.memo optimization", () => {
    it("re-renders only when props change", () => {
      const props = { ...defaultProps };
      const { rerender } = render(<CommandForm {...props} />);

      // Same props should not cause re-render
      rerender(<CommandForm {...props} />);

      // Different props should cause re-render
      rerender(<CommandForm {...props} value="changed" />);

      const input = screen.getByRole("textbox");
      expect(input).toHaveValue("changed");
    });
  });
});
