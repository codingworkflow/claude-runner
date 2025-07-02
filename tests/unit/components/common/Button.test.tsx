import React from "react";
import "@testing-library/jest-dom";
import Button from "../../../../src/components/common/Button";
import { setupComponentTest } from "../../helpers/componentTestUtils";

describe("Button", () => {
  const { render, screen, fireEvent } = setupComponentTest();

  describe("rendering and props", () => {
    it("renders with default props", () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole("button", { name: "Click me" });

      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("primary", "medium");
      expect(button).not.toBeDisabled();
    });

    it("renders with custom variant", () => {
      render(<Button variant="secondary">Click me</Button>);
      const button = screen.getByRole("button");

      expect(button).toHaveClass("secondary");
      expect(button).not.toHaveClass("primary");
    });

    it("renders with custom size", () => {
      render(<Button size="large">Click me</Button>);
      const button = screen.getByRole("button");

      expect(button).toHaveClass("large");
      expect(button).not.toHaveClass("medium");
    });

    it("renders with custom className", () => {
      render(<Button className="custom-class">Click me</Button>);
      const button = screen.getByRole("button");

      expect(button).toHaveClass("custom-class");
    });

    it("forwards HTML button attributes", () => {
      render(
        <Button
          type="submit"
          id="test-button"
          data-testid="custom-button"
          aria-label="Custom label"
        >
          Submit
        </Button>,
      );
      const button = screen.getByRole("button");

      expect(button).toHaveAttribute("type", "submit");
      expect(button).toHaveAttribute("id", "test-button");
      expect(button).toHaveAttribute("data-testid", "custom-button");
      expect(button).toHaveAttribute("aria-label", "Custom label");
    });
  });

  describe("click event handling", () => {
    it("calls onClick handler when clicked", () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      const button = screen.getByRole("button");

      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", () => {
      const handleClick = jest.fn();
      render(
        <Button onClick={handleClick} disabled>
          Click me
        </Button>,
      );
      const button = screen.getByRole("button");

      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("does not call onClick when loading", () => {
      const handleClick = jest.fn();
      render(
        <Button onClick={handleClick} loading>
          Click me
        </Button>,
      );
      const button = screen.getByRole("button");

      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("disabled state behavior", () => {
    it("is disabled when disabled prop is true", () => {
      render(<Button disabled>Click me</Button>);
      const button = screen.getByRole("button");

      expect(button).toBeDisabled();
    });

    it("is disabled when loading is true", () => {
      render(<Button loading>Click me</Button>);
      const button = screen.getByRole("button");

      expect(button).toBeDisabled();
    });

    it("is disabled when both disabled and loading are true", () => {
      render(
        <Button disabled loading>
          Click me
        </Button>,
      );
      const button = screen.getByRole("button");

      expect(button).toBeDisabled();
    });

    it("is not disabled when neither disabled nor loading", () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole("button");

      expect(button).not.toBeDisabled();
    });
  });

  describe("styling and theme integration", () => {
    it("applies variant classes correctly", () => {
      const { rerender } = render(<Button variant="primary">Button</Button>);
      let button = screen.getByRole("button");
      expect(button).toHaveClass("primary");

      rerender(<Button variant="secondary">Button</Button>);
      button = screen.getByRole("button");
      expect(button).toHaveClass("secondary");
      expect(button).not.toHaveClass("primary");
    });

    it("applies size classes correctly", () => {
      const { rerender } = render(<Button size="small">Button</Button>);
      let button = screen.getByRole("button");
      expect(button).toHaveClass("small");

      rerender(<Button size="medium">Button</Button>);
      button = screen.getByRole("button");
      expect(button).toHaveClass("medium");
      expect(button).not.toHaveClass("small");

      rerender(<Button size="large">Button</Button>);
      button = screen.getByRole("button");
      expect(button).toHaveClass("large");
      expect(button).not.toHaveClass("medium");
    });

    it("applies loading class when loading", () => {
      render(<Button loading>Loading</Button>);
      const button = screen.getByRole("button");

      expect(button).toHaveClass("loading");
    });

    it("combines all classes correctly", () => {
      render(
        <Button
          variant="secondary"
          size="large"
          loading
          className="custom-class"
        >
          Button
        </Button>,
      );
      const button = screen.getByRole("button");

      expect(button).toHaveClass(
        "secondary",
        "large",
        "loading",
        "custom-class",
      );
    });
  });

  describe("loading state", () => {
    it("shows loading spinner when loading", () => {
      render(<Button loading>Loading</Button>);
      const spinner = screen
        .getByRole("button")
        .querySelector(".loading-spinner");

      expect(spinner).toBeInTheDocument();
    });

    it("does not show loading spinner when not loading", () => {
      render(<Button>Not loading</Button>);
      const spinner = screen
        .getByRole("button")
        .querySelector(".loading-spinner");

      expect(spinner).not.toBeInTheDocument();
    });

    it("shows both spinner and children when loading", () => {
      render(<Button loading>Loading text</Button>);
      const button = screen.getByRole("button");
      const spinner = button.querySelector(".loading-spinner");

      expect(spinner).toBeInTheDocument();
      expect(button).toHaveTextContent("Loading text");
    });
  });

  describe("accessibility features", () => {
    it("has proper button role", () => {
      render(<Button>Accessible button</Button>);
      const button = screen.getByRole("button");

      expect(button).toBeInTheDocument();
    });

    it("is focusable when not disabled", () => {
      render(<Button>Focusable button</Button>);
      const button = screen.getByRole("button");

      button.focus();
      expect(button).toHaveFocus();
    });

    it("is not focusable when disabled", () => {
      render(<Button disabled>Disabled button</Button>);
      const button = screen.getByRole("button");

      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("disabled");
    });

    it("supports keyboard navigation", () => {
      render(<Button>Keyboard button</Button>);
      const button = screen.getByRole("button");

      button.focus();
      expect(button).toHaveFocus();

      // Test that the button can receive and maintain focus
      expect(document.activeElement).toBe(button);
    });

    it("maintains accessible text content", () => {
      render(<Button>Accessible text</Button>);
      const button = screen.getByRole("button", { name: "Accessible text" });

      expect(button).toBeInTheDocument();
    });

    it("supports aria attributes", () => {
      render(
        <Button
          aria-label="Custom aria label"
          aria-describedby="description"
          aria-pressed="false"
        >
          ARIA button
        </Button>,
      );
      const button = screen.getByRole("button");

      expect(button).toHaveAttribute("aria-label", "Custom aria label");
      expect(button).toHaveAttribute("aria-describedby", "description");
      expect(button).toHaveAttribute("aria-pressed", "false");
    });
  });
});
