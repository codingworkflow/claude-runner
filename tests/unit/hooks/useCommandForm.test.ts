import { renderHook, act } from "@testing-library/react";
import { useCommandForm } from "../../../src/hooks/useCommandForm";

describe("useCommandForm", () => {
  let mockOnSubmit: jest.Mock;

  beforeEach(() => {
    mockOnSubmit = jest.fn();
    jest.clearAllMocks();
  });

  describe("Initial state", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      expect(result.current.showForm).toBe(false);
      expect(result.current.commandName).toBe("");
      expect(typeof result.current.setCommandName).toBe("function");
      expect(typeof result.current.handleSubmit).toBe("function");
      expect(typeof result.current.handleCancel).toBe("function");
      expect(typeof result.current.showAddForm).toBe("function");
    });
  });

  describe("Form visibility", () => {
    it("should show form when showAddForm is called", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.showAddForm();
      });

      expect(result.current.showForm).toBe(true);
    });

    it("should hide form when handleCancel is called", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.showAddForm();
      });

      expect(result.current.showForm).toBe(true);

      act(() => {
        result.current.handleCancel();
      });

      expect(result.current.showForm).toBe(false);
    });

    it("should hide form after successful submission", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.showAddForm();
        result.current.setCommandName("test command");
      });

      expect(result.current.showForm).toBe(true);

      act(() => {
        result.current.handleSubmit();
      });

      expect(result.current.showForm).toBe(false);
    });
  });

  describe("Command name state", () => {
    it("should update command name", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.setCommandName("test command");
      });

      expect(result.current.commandName).toBe("test command");
    });

    it("should clear command name when cancelled", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.setCommandName("test command");
      });

      expect(result.current.commandName).toBe("test command");

      act(() => {
        result.current.handleCancel();
      });

      expect(result.current.commandName).toBe("");
    });

    it("should clear command name after successful submission", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.setCommandName("test command");
      });

      expect(result.current.commandName).toBe("test command");

      act(() => {
        result.current.handleSubmit();
      });

      expect(result.current.commandName).toBe("");
    });
  });

  describe("Form submission", () => {
    it("should call onSubmit with trimmed command name", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.setCommandName("  test command  ");
      });

      expect(result.current.commandName).toBe("  test command  ");

      act(() => {
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).toHaveBeenCalledWith("test command");
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    it("should not call onSubmit with empty command name", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.setCommandName("");
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should not call onSubmit with whitespace-only command name", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.setCommandName("   ");
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should not reset state when submission is invalid", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.showAddForm();
        result.current.setCommandName("   ");
        result.current.handleSubmit();
      });

      expect(result.current.showForm).toBe(true);
      expect(result.current.commandName).toBe("   ");
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe("Form reset functionality", () => {
    it("should reset all form state when cancelled", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.showAddForm();
        result.current.setCommandName("test command");
      });

      expect(result.current.showForm).toBe(true);
      expect(result.current.commandName).toBe("test command");

      act(() => {
        result.current.handleCancel();
      });

      expect(result.current.showForm).toBe(false);
      expect(result.current.commandName).toBe("");
    });

    it("should reset all form state after successful submission", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.showAddForm();
        result.current.setCommandName("test command");
      });

      expect(result.current.showForm).toBe(true);
      expect(result.current.commandName).toBe("test command");

      act(() => {
        result.current.handleSubmit();
      });

      expect(result.current.showForm).toBe(false);
      expect(result.current.commandName).toBe("");
      expect(mockOnSubmit).toHaveBeenCalledWith("test command");
    });
  });

  describe("Form lifecycle", () => {
    it("should handle multiple form show/hide cycles", () => {
      const localMockOnSubmit = jest.fn();
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: localMockOnSubmit }),
      );

      act(() => {
        result.current.showAddForm();
      });
      expect(result.current.showForm).toBe(true);

      act(() => {
        result.current.handleCancel();
      });
      expect(result.current.showForm).toBe(false);

      act(() => {
        result.current.showAddForm();
      });
      expect(result.current.showForm).toBe(true);

      act(() => {
        result.current.setCommandName("command");
      });

      act(() => {
        result.current.handleSubmit();
      });

      expect(result.current.showForm).toBe(false);
      expect(localMockOnSubmit).toHaveBeenCalledWith("command");
    });

    it("should handle rapid state changes", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );

      act(() => {
        result.current.setCommandName("test");
      });

      act(() => {
        result.current.setCommandName("modified test");
      });

      act(() => {
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).toHaveBeenCalledWith("modified test");
      expect(result.current.showForm).toBe(false);
      expect(result.current.commandName).toBe("");
    });
  });

  describe("Edge cases", () => {
    it("should handle very long command names", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );
      const longCommand = "a".repeat(1000);

      act(() => {
        result.current.setCommandName(longCommand);
      });

      act(() => {
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).toHaveBeenCalledWith(longCommand);
    });

    it("should handle special characters in command names", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );
      const specialCommand = "npm run test:unit -- --watch";

      act(() => {
        result.current.setCommandName(specialCommand);
      });

      act(() => {
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).toHaveBeenCalledWith(specialCommand);
    });

    it("should handle unicode characters in command names", () => {
      const { result } = renderHook(() =>
        useCommandForm({ onSubmit: mockOnSubmit }),
      );
      const unicodeCommand = "echo 🚀 deployment";

      act(() => {
        result.current.setCommandName(unicodeCommand);
      });

      act(() => {
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).toHaveBeenCalledWith(unicodeCommand);
    });
  });
});
