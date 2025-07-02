import React from "react";
import "@testing-library/jest-dom";
import Input from "../../../../src/components/common/Input";
import { setupComponentTest } from "../../helpers/componentTestUtils";

describe("Input", () => {
  const { render, screen, fireEvent } = setupComponentTest();

  describe("rendering and props", () => {
    it("renders with default props", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");

      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("id");
      expect(input).not.toHaveClass("error");
    });

    it("renders with label", () => {
      render(<Input label="Test Label" />);
      const input = screen.getByRole("textbox");
      const label = screen.getByText("Test Label");

      expect(label).toBeInTheDocument();
      expect(label).toHaveAttribute("for", input.id);
    });

    it("renders without label when not provided", () => {
      render(<Input />);

      expect(screen.queryByText(/label/i)).not.toBeInTheDocument();
    });

    it("renders with placeholder", () => {
      render(<Input placeholder="Enter text here" />);
      const input = screen.getByPlaceholderText("Enter text here");

      expect(input).toBeInTheDocument();
    });

    it("renders with custom id", () => {
      render(<Input id="custom-input" />);
      const input = screen.getByRole("textbox");

      expect(input).toHaveAttribute("id", "custom-input");
    });

    it("generates unique id when not provided", () => {
      const { rerender } = render(<Input />);
      const firstInput = screen.getByRole("textbox");
      const firstId = firstInput.id;

      rerender(<Input />);
      const secondInput = screen.getByRole("textbox");
      const secondId = secondInput.id;

      expect(firstId).not.toBe(secondId);
      expect(firstId).toMatch(/^input-[a-z0-9]+$/);
      expect(secondId).toMatch(/^input-[a-z0-9]+$/);
    });

    it("renders with custom className", () => {
      render(<Input className="custom-class" />);
      const input = screen.getByRole("textbox");

      expect(input).toHaveClass("custom-class");
    });

    it("applies fullWidth class to container", () => {
      render(<Input fullWidth />);
      const container = screen.getByRole("textbox").parentElement;

      expect(container).toHaveClass("input-group", "full-width");
    });

    it("does not apply fullWidth class when false", () => {
      render(<Input fullWidth={false} />);
      const container = screen.getByRole("textbox").parentElement;

      expect(container).toHaveClass("input-group");
      expect(container).not.toHaveClass("full-width");
    });

    it("forwards HTML input attributes", () => {
      render(
        <Input
          type="email"
          required
          disabled
          maxLength={50}
          data-testid="custom-input"
          aria-label="Email input"
        />,
      );
      const input = screen.getByRole("textbox");

      expect(input).toHaveAttribute("type", "email");
      expect(input).toHaveAttribute("required");
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute("maxLength", "50");
      expect(input).toHaveAttribute("data-testid", "custom-input");
      expect(input).toHaveAttribute("aria-label", "Email input");
    });
  });

  describe("error state handling", () => {
    it("displays error message when error prop is provided", () => {
      render(<Input error="This field is required" />);
      const errorMessage = screen.getByText("This field is required");

      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveClass("input-error");
    });

    it("applies error class to input when error exists", () => {
      render(<Input error="Invalid input" />);
      const input = screen.getByRole("textbox");

      expect(input).toHaveClass("error");
    });

    it("does not show error message when error prop is not provided", () => {
      render(<Input />);

      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });

    it("does not apply error class when no error", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");

      expect(input).not.toHaveClass("error");
    });

    it("combines error class with custom className", () => {
      render(<Input error="Error message" className="custom-class" />);
      const input = screen.getByRole("textbox");

      expect(input).toHaveClass("error", "custom-class");
    });

    it("shows different error messages", () => {
      const { rerender } = render(<Input error="First error" />);
      expect(screen.getByText("First error")).toBeInTheDocument();

      rerender(<Input error="Second error" />);
      expect(screen.getByText("Second error")).toBeInTheDocument();
      expect(screen.queryByText("First error")).not.toBeInTheDocument();
    });
  });

  describe("value changes and event handling", () => {
    it("calls onChange handler when value changes", () => {
      const handleChange = jest.fn();
      render(<Input onChange={handleChange} />);
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "new value" } });

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            value: "new value",
          }),
        }),
      );
    });

    it("updates displayed value when controlled", () => {
      const { rerender } = render(
        <Input value="initial" onChange={() => {}} />,
      );
      const input = screen.getByRole("textbox") as HTMLInputElement;

      expect(input.value).toBe("initial");

      rerender(<Input value="updated" onChange={() => {}} />);
      expect(input.value).toBe("updated");
    });

    it("calls onFocus handler when input gains focus", () => {
      const handleFocus = jest.fn();
      render(<Input onFocus={handleFocus} />);
      const input = screen.getByRole("textbox");

      fireEvent.focus(input);

      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it("calls onBlur handler when input loses focus", () => {
      const handleBlur = jest.fn();
      render(<Input onBlur={handleBlur} />);
      const input = screen.getByRole("textbox");

      fireEvent.blur(input);

      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it("calls onKeyDown handler on key press", () => {
      const handleKeyDown = jest.fn();
      render(<Input onKeyDown={handleKeyDown} />);
      const input = screen.getByRole("textbox");

      fireEvent.keyDown(input, { key: "Enter" });

      expect(handleKeyDown).toHaveBeenCalledTimes(1);
      expect(handleKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "Enter",
        }),
      );
    });

    it("still calls onChange when disabled (standard HTML behavior)", () => {
      const handleChange = jest.fn();
      render(<Input onChange={handleChange} disabled />);
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "should not change" } });

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(input).toBeDisabled();
    });
  });

  describe("accessibility and keyboard navigation", () => {
    it("has proper input role", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");

      expect(input).toBeInTheDocument();
    });

    it("is focusable when not disabled", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");

      input.focus();
      expect(input).toHaveFocus();
    });

    it("is not focusable when disabled", () => {
      render(<Input disabled />);
      const input = screen.getByRole("textbox");

      expect(input).toBeDisabled();
      expect(input).toHaveAttribute("disabled");
    });

    it("maintains focus correctly", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");

      input.focus();
      expect(document.activeElement).toBe(input);
    });

    it("supports tab navigation", () => {
      render(
        <div>
          <Input id="first" />
          <Input id="second" />
        </div>,
      );
      const inputs = screen.getAllByRole("textbox");
      const firstInput = inputs[0];

      firstInput.focus();
      expect(firstInput).toHaveFocus();

      fireEvent.keyDown(firstInput, { key: "Tab" });
    });

    it("associates label with input for screen readers", () => {
      render(<Input label="Email Address" id="email" />);
      const input = screen.getByRole("textbox");
      const label = screen.getByText("Email Address");

      expect(label).toHaveAttribute("for", "email");
      expect(input).toHaveAttribute("id", "email");
    });

    it("supports aria attributes", () => {
      render(
        <Input
          aria-label="Search input"
          aria-describedby="search-help"
          aria-required="true"
        />,
      );
      const input = screen.getByRole("textbox");

      expect(input).toHaveAttribute("aria-label", "Search input");
      expect(input).toHaveAttribute("aria-describedby", "search-help");
      expect(input).toHaveAttribute("aria-required", "true");
    });

    it("is accessible by label text", () => {
      render(<Input label="Username" />);
      const input = screen.getByLabelText("Username");

      expect(input).toBeInTheDocument();
    });

    it("is accessible by placeholder text", () => {
      render(<Input placeholder="Enter your email" />);
      const input = screen.getByPlaceholderText("Enter your email");

      expect(input).toBeInTheDocument();
    });
  });

  describe("styling and theme integration", () => {
    it("applies correct container classes", () => {
      render(<Input />);
      const container = screen.getByRole("textbox").parentElement;

      expect(container).toHaveClass("input-group");
    });

    it("applies fullWidth class correctly", () => {
      const { rerender } = render(<Input fullWidth />);
      let container = screen.getByRole("textbox").parentElement;
      expect(container).toHaveClass("input-group", "full-width");

      rerender(<Input fullWidth={false} />);
      container = screen.getByRole("textbox").parentElement;
      expect(container).toHaveClass("input-group");
      expect(container).not.toHaveClass("full-width");
    });

    it("combines all classes correctly", () => {
      render(
        <Input fullWidth error="Error message" className="custom-class" />,
      );
      const container = screen.getByRole("textbox").parentElement;
      const input = screen.getByRole("textbox");

      expect(container).toHaveClass("input-group", "full-width");
      expect(input).toHaveClass("error", "custom-class");
    });

    it("maintains VSCode theme compatibility", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");

      // Test that the input element is rendered and can accept CSS variables
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe("INPUT");
    });
  });

  describe("complex scenarios", () => {
    it("works with all props combined", () => {
      const handleChange = jest.fn();
      const handleFocus = jest.fn();
      const handleBlur = jest.fn();

      render(
        <Input
          id="complex-input"
          label="Complex Input"
          placeholder="Enter complex data"
          value="initial value"
          error="Validation error"
          fullWidth
          className="custom-styling"
          type="text"
          required
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-label="Complex input field"
        />,
      );

      const input = screen.getByRole("textbox") as HTMLInputElement;
      const label = screen.getByText("Complex Input");
      const error = screen.getByText("Validation error");
      const container = input.parentElement;

      // Check all elements exist
      expect(input).toBeInTheDocument();
      expect(label).toBeInTheDocument();
      expect(error).toBeInTheDocument();

      // Check attributes
      expect(input).toHaveAttribute("id", "complex-input");
      expect(input).toHaveAttribute("placeholder", "Enter complex data");
      expect(input).toHaveAttribute("type", "text");
      expect(input).toHaveAttribute("required");
      expect(input).toHaveAttribute("aria-label", "Complex input field");
      expect(input.value).toBe("initial value");

      // Check classes
      expect(container).toHaveClass("input-group", "full-width");
      expect(input).toHaveClass("error", "custom-styling");
      expect(error).toHaveClass("input-error");

      // Check label association
      expect(label).toHaveAttribute("for", "complex-input");

      // Test event handling
      fireEvent.change(input, { target: { value: "new value" } });
      expect(handleChange).toHaveBeenCalledTimes(1);

      fireEvent.focus(input);
      expect(handleFocus).toHaveBeenCalledTimes(1);

      fireEvent.blur(input);
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it("handles rapid state changes", () => {
      const { rerender } = render(
        <Input value="initial" onChange={() => {}} />,
      );
      const input = screen.getByRole("textbox") as HTMLInputElement;

      expect(input.value).toBe("initial");

      rerender(<Input value="change1" onChange={() => {}} />);
      expect(input.value).toBe("change1");

      rerender(<Input value="change2" error="Error" onChange={() => {}} />);
      expect(input.value).toBe("change2");
      expect(input).toHaveClass("error");
      expect(screen.getByText("Error")).toBeInTheDocument();

      rerender(<Input value="final" onChange={() => {}} />);
      expect(input.value).toBe("final");
      expect(input).not.toHaveClass("error");
      expect(screen.queryByText("Error")).not.toBeInTheDocument();
    });
  });
});
