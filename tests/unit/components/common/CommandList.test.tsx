import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CommandList from "../../../../src/components/common/CommandList";
import { CommandFile } from "../../../../src/contexts/ExtensionContext";

const mockCommands: CommandFile[] = [
  {
    name: "test-command-1",
    path: "/path/to/command1.txt",
    description: "First test command",
    isProject: false,
  },
  {
    name: "test-command-2",
    path: "/path/to/command2.txt",
    description: "Second test command",
    isProject: true,
  },
  {
    name: "test-command-3",
    path: "/path/to/command3.txt",
    isProject: false,
  },
];

describe("CommandList", () => {
  describe("command list display and rendering", () => {
    it("renders command list with commands", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={mockCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText("test-command-1")).toBeInTheDocument();
      expect(screen.getByText("test-command-2")).toBeInTheDocument();
      expect(screen.getByText("test-command-3")).toBeInTheDocument();
    });

    it("renders command descriptions when provided", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={mockCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText("First test command")).toBeInTheDocument();
      expect(screen.getByText("Second test command")).toBeInTheDocument();
    });

    it("does not render description element when description is not provided", () => {
      const commandWithoutDescription: CommandFile = {
        name: "no-description",
        path: "/path/to/command.txt",
        isProject: false,
      };
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[commandWithoutDescription]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const commandItem = screen
        .getByText("no-description")
        .closest(".command-item");
      expect(
        commandItem?.querySelector(".command-description"),
      ).not.toBeInTheDocument();
    });

    it("renders edit and delete buttons for each command", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={mockCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const editButtons = screen.getAllByText("Edit");
      const deleteButtons = screen.getAllByText("🗑️");

      expect(editButtons).toHaveLength(3);
      expect(deleteButtons).toHaveLength(3);
    });

    it("applies correct CSS classes to elements", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(
        screen.getByText("test-command-1").closest(".command-list"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("test-command-1").closest(".command-item"),
      ).toBeInTheDocument();
      expect(screen.getByText("test-command-1").parentElement).toHaveClass(
        "command-header",
      );
      expect(screen.getByText("test-command-1")).toHaveClass("command-name");
      expect(screen.getByText("First test command")).toHaveClass(
        "command-description",
      );
    });
  });

  describe("command list item interactions", () => {
    it("calls onEdit when edit button is clicked", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const editButton = screen.getByText("Edit");
      fireEvent.click(editButton);

      expect(mockOnEdit).toHaveBeenCalledTimes(1);
      expect(mockOnEdit).toHaveBeenCalledWith(mockCommands[0]);
    });

    it("calls onDelete when delete button is clicked", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const deleteButton = screen.getByText("🗑️");
      fireEvent.click(deleteButton);

      expect(mockOnDelete).toHaveBeenCalledTimes(1);
      expect(mockOnDelete).toHaveBeenCalledWith(mockCommands[0]);
    });

    it("calls correct handlers for different commands", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={mockCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const editButtons = screen.getAllByText("Edit");
      const deleteButtons = screen.getAllByText("🗑️");

      fireEvent.click(editButtons[1]);
      fireEvent.click(deleteButtons[2]);

      expect(mockOnEdit).toHaveBeenCalledWith(mockCommands[1]);
      expect(mockOnDelete).toHaveBeenCalledWith(mockCommands[2]);
    });

    it("does not call handlers when buttons are disabled", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          disabled={true}
        />,
      );

      const editButton = screen.getByText("Edit");
      const deleteButton = screen.getByText("🗑️");

      fireEvent.click(editButton);
      fireEvent.click(deleteButton);

      expect(mockOnEdit).not.toHaveBeenCalled();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it("disables buttons when disabled prop is true", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          disabled={true}
        />,
      );

      const editButton = screen.getByText("Edit");
      const deleteButton = screen.getByText("🗑️");

      expect(editButton).toBeDisabled();
      expect(deleteButton).toBeDisabled();
    });

    it("enables buttons when disabled prop is false", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          disabled={false}
        />,
      );

      const editButton = screen.getByText("Edit");
      const deleteButton = screen.getByText("🗑️");

      expect(editButton).not.toBeDisabled();
      expect(deleteButton).not.toBeDisabled();
    });
  });

  describe("command list empty state handling", () => {
    it("shows default empty message when no commands", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText("No commands found")).toBeInTheDocument();
      expect(screen.getByText("No commands found")).toHaveClass("no-commands");
    });

    it("shows custom empty message when provided", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();
      const customMessage = "Custom empty state message";

      render(
        <CommandList
          commands={[]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          emptyMessage={customMessage}
        />,
      );

      expect(screen.getByText(customMessage)).toBeInTheDocument();
      expect(screen.getByText(customMessage)).toHaveClass("no-commands");
    });

    it("does not render command list container when empty", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const container = screen.getByText("No commands found").parentElement;
      expect(container?.querySelector(".command-list")).not.toBeInTheDocument();
      expect(container?.querySelector(".command-item")).not.toBeInTheDocument();
    });

    it("does not render buttons when empty", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.queryByText("Edit")).not.toBeInTheDocument();
      expect(screen.queryByText("🗑️")).not.toBeInTheDocument();
    });
  });

  describe("component memoization", () => {
    it("memoizes component to prevent unnecessary re-renders", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      const { rerender } = render(
        <CommandList
          commands={mockCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const firstRender = screen.getByText("test-command-1");

      rerender(
        <CommandList
          commands={mockCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const secondRender = screen.getByText("test-command-1");
      expect(firstRender).toBe(secondRender);
    });

    it("re-renders when commands prop changes", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();
      const newCommands: CommandFile[] = [
        {
          name: "new-command",
          path: "/path/to/new.txt",
          description: "New command",
          isProject: false,
        },
      ];

      const { rerender } = render(
        <CommandList
          commands={mockCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText("test-command-1")).toBeInTheDocument();

      rerender(
        <CommandList
          commands={newCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.queryByText("test-command-1")).not.toBeInTheDocument();
      expect(screen.getByText("new-command")).toBeInTheDocument();
    });
  });

  describe("accessibility and HTML attributes", () => {
    it("applies title attribute to delete button", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const deleteButton = screen.getByText("🗑️");
      expect(deleteButton).toHaveAttribute("title", "Delete command");
    });

    it("maintains proper button roles", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const editButton = screen.getByRole("button", { name: "Edit" });
      const deleteButton = screen.getByRole("button", { name: "🗑️" });

      expect(editButton).toBeInTheDocument();
      expect(deleteButton).toBeInTheDocument();
    });

    it("maintains keyboard accessibility when not disabled", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const editButton = screen.getByText("Edit");
      const deleteButton = screen.getByText("🗑️");

      editButton.focus();
      expect(editButton).toHaveFocus();

      deleteButton.focus();
      expect(deleteButton).toHaveFocus();
    });
  });

  describe("edge cases and prop validation", () => {
    it("handles commands with special characters in names", () => {
      const specialCommand: CommandFile = {
        name: "command-with-special-chars!@#$%",
        path: "/path/to/special.md",
        description: "Special & chars < > in description",
        isProject: true,
      };
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[specialCommand]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(
        screen.getByText("command-with-special-chars!@#$%"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Special & chars < > in description"),
      ).toBeInTheDocument();
    });

    it("handles very long command names and descriptions", () => {
      const longCommand: CommandFile = {
        name: "very-long-command-name-that-might-cause-layout-issues-in-the-ui-component",
        path: "/path/to/long.md",
        description:
          "This is a very long description that might cause layout issues and should be handled gracefully by the component without breaking the UI structure and layout",
        isProject: false,
      };
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[longCommand]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(
        screen.getByText(
          "very-long-command-name-that-might-cause-layout-issues-in-the-ui-component",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This is a very long description/),
      ).toBeInTheDocument();
    });

    it("handles single command correctly", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText("test-command-1")).toBeInTheDocument();
      expect(screen.getAllByText("Edit")).toHaveLength(1);
      expect(screen.getAllByText("🗑️")).toHaveLength(1);
    });

    it("handles undefined disabled prop correctly", () => {
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[mockCommands[0]]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const editButton = screen.getByText("Edit");
      const deleteButton = screen.getByText("🗑️");

      expect(editButton).not.toBeDisabled();
      expect(deleteButton).not.toBeDisabled();
    });

    it("handles empty string description", () => {
      const commandWithEmptyDesc: CommandFile = {
        name: "empty-desc-command",
        path: "/path/to/empty.md",
        description: "",
        isProject: true,
      };
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[commandWithEmptyDesc]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText("empty-desc-command")).toBeInTheDocument();
      const commandItem = screen
        .getByText("empty-desc-command")
        .closest(".command-item");
      expect(
        commandItem?.querySelector(".command-description"),
      ).not.toBeInTheDocument();
    });

    it("handles whitespace-only description", () => {
      const commandWithWhitespaceDesc: CommandFile = {
        name: "whitespace-desc-command",
        path: "/path/to/whitespace.md",
        description: "   ",
        isProject: false,
      };
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      render(
        <CommandList
          commands={[commandWithWhitespaceDesc]}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      expect(screen.getByText("whitespace-desc-command")).toBeInTheDocument();
      const commandItem = screen
        .getByText("whitespace-desc-command")
        .closest(".command-item");
      const descriptionElement = commandItem?.querySelector(
        ".command-description",
      );
      expect(descriptionElement).toBeInTheDocument();
    });

    it("maintains proper key prop for command items", () => {
      const duplicateNameCommands: CommandFile[] = [
        {
          name: "same-name",
          path: "/path/to/first.md",
          description: "First command",
          isProject: true,
        },
        {
          name: "same-name",
          path: "/path/to/second.md",
          description: "Second command",
          isProject: false,
        },
      ];
      const mockOnEdit = jest.fn();
      const mockOnDelete = jest.fn();

      const { container } = render(
        <CommandList
          commands={duplicateNameCommands}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
        />,
      );

      const commandItems = container.querySelectorAll(".command-item");
      expect(commandItems).toHaveLength(2);
      expect(screen.getByText("First command")).toBeInTheDocument();
      expect(screen.getByText("Second command")).toBeInTheDocument();
    });
  });
});
