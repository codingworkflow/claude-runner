import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import TabNavigation, {
  Tab,
} from "../../../../src/components/common/TabNavigation";

type TestTabId = "tab1" | "tab2" | "tab3";

const mockTabs: Tab<TestTabId>[] = [
  { id: "tab1", label: "First Tab" },
  { id: "tab2", label: "Second Tab" },
  { id: "tab3", label: "Third Tab" },
];

describe("TabNavigation", () => {
  describe("rendering and basic props", () => {
    it("renders all tabs with correct labels", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      expect(
        screen.getByRole("button", { name: "First Tab" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Second Tab" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Third Tab" }),
      ).toBeInTheDocument();
    });

    it("renders with proper tab navigation container class", () => {
      const mockOnTabChange = jest.fn();
      const { container } = render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      expect(container.firstChild).toHaveClass("tab-navigation");
    });

    it("renders empty tab list without errors", () => {
      const mockOnTabChange = jest.fn();
      const { container } = render(
        <TabNavigation
          tabs={[]}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      expect(container.firstChild).toHaveClass("tab-navigation");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders single tab correctly", () => {
      const singleTab: Tab<TestTabId>[] = [{ id: "tab1", label: "Only Tab" }];
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={singleTab}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Only Tab" }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });
  });

  describe("tab switching and active state", () => {
    it("applies active class to the active tab", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab2"
          onTabChange={mockOnTabChange}
        />,
      );

      const activeTab = screen.getByRole("button", { name: "Second Tab" });
      const inactiveTab1 = screen.getByRole("button", { name: "First Tab" });
      const inactiveTab3 = screen.getByRole("button", { name: "Third Tab" });

      expect(activeTab).toHaveClass("tab-button", "active");
      expect(inactiveTab1).toHaveClass("tab-button");
      expect(inactiveTab1).not.toHaveClass("active");
      expect(inactiveTab3).toHaveClass("tab-button");
      expect(inactiveTab3).not.toHaveClass("active");
    });

    it("calls onTabChange when clicking inactive tab", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const secondTab = screen.getByRole("button", { name: "Second Tab" });
      fireEvent.click(secondTab);

      expect(mockOnTabChange).toHaveBeenCalledTimes(1);
      expect(mockOnTabChange).toHaveBeenCalledWith("tab2");
    });

    it("calls onTabChange when clicking active tab", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const activeTab = screen.getByRole("button", { name: "First Tab" });
      fireEvent.click(activeTab);

      expect(mockOnTabChange).toHaveBeenCalledTimes(1);
      expect(mockOnTabChange).toHaveBeenCalledWith("tab1");
    });

    it("updates active state when activeTab prop changes", () => {
      const mockOnTabChange = jest.fn();
      const { rerender } = render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      let firstTab = screen.getByRole("button", { name: "First Tab" });
      let secondTab = screen.getByRole("button", { name: "Second Tab" });
      expect(firstTab).toHaveClass("active");
      expect(secondTab).not.toHaveClass("active");

      rerender(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab2"
          onTabChange={mockOnTabChange}
        />,
      );

      firstTab = screen.getByRole("button", { name: "First Tab" });
      secondTab = screen.getByRole("button", { name: "Second Tab" });
      expect(firstTab).not.toHaveClass("active");
      expect(secondTab).toHaveClass("active");
    });
  });

  describe("disabled state behavior", () => {
    it("applies disabled class to all tabs when disabled", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
          disabled={true}
        />,
      );

      const tabs = screen.getAllByRole("button");
      tabs.forEach((tab) => {
        expect(tab).toHaveClass("disabled");
        expect(tab).toBeDisabled();
      });
    });

    it("does not apply disabled class when disabled is false", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
          disabled={false}
        />,
      );

      const tabs = screen.getAllByRole("button");
      tabs.forEach((tab) => {
        expect(tab).not.toHaveClass("disabled");
        expect(tab).not.toBeDisabled();
      });
    });

    it("does not call onTabChange when disabled and tab is clicked", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
          disabled={true}
        />,
      );

      const secondTab = screen.getByRole("button", { name: "Second Tab" });
      fireEvent.click(secondTab);

      expect(mockOnTabChange).not.toHaveBeenCalled();
    });

    it("defaults disabled to false when not provided", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const tabs = screen.getAllByRole("button");
      tabs.forEach((tab) => {
        expect(tab).not.toHaveClass("disabled");
        expect(tab).not.toBeDisabled();
      });
    });
  });

  describe("accessibility and keyboard navigation", () => {
    it("renders tabs as buttons with proper role", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const tabs = screen.getAllByRole("button");
      expect(tabs).toHaveLength(3);
      tabs.forEach((tab) => {
        expect(tab.tagName).toBe("BUTTON");
      });
    });

    it("supports keyboard focus on enabled tabs", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const firstTab = screen.getByRole("button", { name: "First Tab" });
      const secondTab = screen.getByRole("button", { name: "Second Tab" });

      firstTab.focus();
      expect(firstTab).toHaveFocus();

      secondTab.focus();
      expect(secondTab).toHaveFocus();
    });

    it("prevents focus on disabled tabs", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
          disabled={true}
        />,
      );

      const tabs = screen.getAllByRole("button");
      tabs.forEach((tab) => {
        expect(tab).toBeDisabled();
        expect(tab).toHaveAttribute("disabled");
      });
    });

    it("maintains accessible text content for screen readers", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      expect(
        screen.getByRole("button", { name: "First Tab" }),
      ).toHaveTextContent("First Tab");
      expect(
        screen.getByRole("button", { name: "Second Tab" }),
      ).toHaveTextContent("Second Tab");
      expect(
        screen.getByRole("button", { name: "Third Tab" }),
      ).toHaveTextContent("Third Tab");
    });

    it("supports keyboard navigation between tabs", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const firstTab = screen.getByRole("button", { name: "First Tab" });
      const secondTab = screen.getByRole("button", { name: "Second Tab" });

      firstTab.focus();
      expect(document.activeElement).toBe(firstTab);

      fireEvent.keyDown(firstTab, { key: "Tab" });
      secondTab.focus();
      expect(document.activeElement).toBe(secondTab);
    });
  });

  describe("styling and CSS classes", () => {
    it("applies base tab-button class to all tabs", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const tabs = screen.getAllByRole("button");
      tabs.forEach((tab) => {
        expect(tab).toHaveClass("tab-button");
      });
    });

    it("combines active and disabled classes correctly", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab2"
          onTabChange={mockOnTabChange}
          disabled={true}
        />,
      );

      const activeTab = screen.getByRole("button", { name: "Second Tab" });
      const inactiveTab = screen.getByRole("button", { name: "First Tab" });

      expect(activeTab).toHaveClass("tab-button", "active", "disabled");
      expect(inactiveTab).toHaveClass("tab-button", "disabled");
      expect(inactiveTab).not.toHaveClass("active");
    });

    it("applies classes independently for each tab", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const activeTab = screen.getByRole("button", { name: "First Tab" });
      const inactiveTab1 = screen.getByRole("button", { name: "Second Tab" });
      const inactiveTab2 = screen.getByRole("button", { name: "Third Tab" });

      expect(activeTab).toHaveClass("tab-button", "active");
      expect(activeTab).not.toHaveClass("disabled");

      expect(inactiveTab1).toHaveClass("tab-button");
      expect(inactiveTab1).not.toHaveClass("active", "disabled");

      expect(inactiveTab2).toHaveClass("tab-button");
      expect(inactiveTab2).not.toHaveClass("active", "disabled");
    });
  });

  describe("tab validation and error handling", () => {
    it("handles tabs with special characters in labels", () => {
      const specialTabs: Tab<TestTabId>[] = [
        { id: "tab1", label: "Tab with & special chars!" },
        { id: "tab2", label: "Tab@#$%^&*()" },
        { id: "tab3", label: "Empty Label" },
      ];
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={specialTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Tab with & special chars!" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Tab@#$%^&*()" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Empty Label" }),
      ).toBeInTheDocument();
    });

    it("handles activeTab that does not exist in tabs array", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab={"nonexistent" as TestTabId}
          onTabChange={mockOnTabChange}
        />,
      );

      const tabs = screen.getAllByRole("button");
      tabs.forEach((tab) => {
        expect(tab).not.toHaveClass("active");
      });
    });

    it("preserves tab order when rendering", () => {
      const orderedTabs: Tab<TestTabId>[] = [
        { id: "tab3", label: "Third" },
        { id: "tab1", label: "First" },
        { id: "tab2", label: "Second" },
      ];
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={orderedTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const tabs = screen.getAllByRole("button");
      expect(tabs[0]).toHaveTextContent("Third");
      expect(tabs[1]).toHaveTextContent("First");
      expect(tabs[2]).toHaveTextContent("Second");
    });

    it("handles rapid tab changes without errors", () => {
      const mockOnTabChange = jest.fn();
      render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      const tab1 = screen.getByRole("button", { name: "First Tab" });
      const tab2 = screen.getByRole("button", { name: "Second Tab" });
      const tab3 = screen.getByRole("button", { name: "Third Tab" });

      fireEvent.click(tab2);
      fireEvent.click(tab3);
      fireEvent.click(tab1);
      fireEvent.click(tab2);

      expect(mockOnTabChange).toHaveBeenCalledTimes(4);
      expect(mockOnTabChange).toHaveBeenNthCalledWith(1, "tab2");
      expect(mockOnTabChange).toHaveBeenNthCalledWith(2, "tab3");
      expect(mockOnTabChange).toHaveBeenNthCalledWith(3, "tab1");
      expect(mockOnTabChange).toHaveBeenNthCalledWith(4, "tab2");
    });

    it("maintains component stability with prop changes", () => {
      const mockOnTabChange = jest.fn();
      const { rerender } = render(
        <TabNavigation
          tabs={mockTabs}
          activeTab="tab1"
          onTabChange={mockOnTabChange}
        />,
      );

      expect(screen.getAllByRole("button")).toHaveLength(3);

      const newTabs: Tab<TestTabId>[] = [
        { id: "tab1", label: "Updated First" },
        { id: "tab2", label: "Updated Second" },
      ];

      rerender(
        <TabNavigation
          tabs={newTabs}
          activeTab="tab2"
          onTabChange={mockOnTabChange}
          disabled={true}
        />,
      );

      expect(screen.getAllByRole("button")).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: "Updated First" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Updated Second" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Updated Second" }),
      ).toHaveClass("active");
    });
  });
});
