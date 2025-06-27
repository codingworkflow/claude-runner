import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import ConditionalStepBuilder, {
  ConditionalStepConfig,
} from "../../../../src/components/pipeline/ConditionalStepBuilder";

describe("ConditionalStepBuilder", () => {
  const mockOnChange = jest.fn();
  const mockAvailableSteps = [
    { id: "step1", name: "First Step" },
    { id: "step2", name: "Second Step" },
  ];

  const defaultConfig: ConditionalStepConfig = {
    condition: "always",
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it("renders condition options correctly", () => {
    const { container } = render(
      <ConditionalStepBuilder
        config={defaultConfig}
        availableSteps={[]}
        onChange={mockOnChange}
      />,
    );

    expect(container.textContent).toContain("Always run");
    expect(container.textContent).toContain("Run on success");
    expect(container.textContent).toContain("Run on failure");
  });

  it("handles condition change", () => {
    const { container } = render(
      <ConditionalStepBuilder
        config={defaultConfig}
        availableSteps={[]}
        onChange={mockOnChange}
      />,
    );

    const onSuccessRadio = container.querySelector(
      'input[value="on_success"]',
    ) as HTMLInputElement;
    fireEvent.click(onSuccessRadio);

    expect(mockOnChange).toHaveBeenCalledWith({
      condition: "on_success",
    });
  });

  it("handles check command input", () => {
    const { container } = render(
      <ConditionalStepBuilder
        config={defaultConfig}
        availableSteps={[]}
        onChange={mockOnChange}
      />,
    );

    const checkInput = container.querySelector(
      ".check-command-input",
    ) as HTMLInputElement;
    fireEvent.change(checkInput, { target: { value: "npm test" } });

    expect(mockOnChange).toHaveBeenCalledWith({
      condition: "always",
      check: "npm test",
    });
  });

  it("shows dependencies section when available steps exist", () => {
    const { container } = render(
      <ConditionalStepBuilder
        config={defaultConfig}
        availableSteps={mockAvailableSteps}
        onChange={mockOnChange}
      />,
    );

    expect(container.textContent).toContain("Dependencies");
    expect(container.textContent).toContain("First Step");
    expect(container.textContent).toContain("Second Step");
  });

  it("hides dependencies section when no available steps", () => {
    const { container } = render(
      <ConditionalStepBuilder
        config={defaultConfig}
        availableSteps={[]}
        onChange={mockOnChange}
      />,
    );

    expect(container.textContent).not.toContain("Dependencies");
  });

  it("displays summary correctly", () => {
    const configWithAll: ConditionalStepConfig = {
      condition: "on_success",
      check: "npm test",
      dependsOn: ["step1"],
    };

    const { container } = render(
      <ConditionalStepBuilder
        config={configWithAll}
        availableSteps={mockAvailableSteps}
        onChange={mockOnChange}
      />,
    );

    expect(container.textContent).toContain(
      "Execute only if previous steps succeeded",
    );
    expect(container.textContent).toContain("npm test");
    expect(container.textContent).toContain("First Step");
  });

  it("disables all inputs when disabled prop is true", () => {
    const { container } = render(
      <ConditionalStepBuilder
        config={defaultConfig}
        availableSteps={mockAvailableSteps}
        onChange={mockOnChange}
        disabled={true}
      />,
    );

    const alwaysRadio = container.querySelector(
      'input[value="always"]',
    ) as HTMLInputElement;
    const checkInput = container.querySelector(
      ".check-command-input",
    ) as HTMLInputElement;

    expect(alwaysRadio.disabled).toBe(true);
    expect(checkInput.disabled).toBe(true);
  });
});
