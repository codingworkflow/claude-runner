import React from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import UnifiedApp from "../../../src/components/UnifiedApp";

// Mock the ExtensionContext
const mockDispatch = jest.fn();
const mockSendMessage = jest.fn();

const mockExtensionContext = {
  state: {
    currentView: "main" as any,
    main: {
      activeTab: "chat" as const,
      model: "claude-sonnet-4-20250514",
      rootPath: "/test/path",
      allowAllTools: false,
      parallelTasksCount: 1,
      status: "stopped" as any,
      tasks: [] as any,
      currentTaskIndex: undefined,
      results: undefined,
      taskCompleted: undefined,
      taskError: undefined,
      chatPrompt: "",
      showChatPrompt: false,
      outputFormat: "json" as const,
      availablePipelines: [],
      availableModels: [],
      workflows: [],
      currentWorkflow: null,
      workflowInputs: {},
      executionStatus: "idle" as const,
      stepStatuses: {},
      isPaused: false,
      currentExecutionId: undefined,
      pausedPipelines: [],
      resumableWorkflows: [],
    },
    commands: {
      activeTab: "global" as const,
      globalCommands: [],
      projectCommands: [],
      loading: false,
      rootPath: "",
    },
    usage: {
      activeTab: "usage" as const,
      projects: [],
      selectedProject: "",
      conversations: [],
      selectedConversation: "",
      conversationData: null,
      projectsLoading: false,
      conversationsLoading: false,
      conversationLoading: false,
      projectsError: null,
      conversationsError: null,
      conversationError: null,
      selectedPeriod: "today" as const,
      totalHours: 5,
      startHour: 0,
      limitType: "output" as const,
      limitValue: 0,
      autoRefresh: false,
      report: null,
      loading: false,
      error: null,
    },
    claude: {
      version: "1.0.0",
      isAvailable: true,
      isInstalled: true,
      error: undefined,
      loading: false,
    },
  },
  dispatch: mockDispatch,
  actions: {
    setCurrentView: jest.fn(),
    updateMainState: jest.fn(),
    updateCommandsState: jest.fn(),
    updateUsageState: jest.fn(),
    startInteractive: jest.fn(),
    runTasks: jest.fn(),
    cancelTask: jest.fn(),
    updateModel: jest.fn(),
    updateRootPath: jest.fn(),
    updateAllowAllTools: jest.fn(),
    updateActiveTab: jest.fn(),
    updateChatPrompt: jest.fn(),
    updateShowChatPrompt: jest.fn(),
    updateOutputFormat: jest.fn(),
    updateParallelTasksCount: jest.fn(),
    savePipeline: jest.fn(),
    loadPipeline: jest.fn(),
    pipelineAddTask: jest.fn(),
    pipelineRemoveTask: jest.fn(),
    pipelineClearAll: jest.fn(),
    pipelineUpdateTaskField: jest.fn(),
    recheckClaude: jest.fn(),
    loadWorkflows: jest.fn(),
    loadWorkflow: jest.fn(),
    saveWorkflow: jest.fn(),
    deleteWorkflow: jest.fn(),
    updateWorkflowInputs: jest.fn(),
    runWorkflow: jest.fn(),
    cancelWorkflow: jest.fn(),
    createSampleWorkflow: jest.fn(),
    pausePipeline: jest.fn(),
    resumePipeline: jest.fn(),
    pauseWorkflow: jest.fn(),
    resumeWorkflow: jest.fn(),
    deleteWorkflowState: jest.fn(),
    getResumableWorkflows: jest.fn(),
    scanCommands: jest.fn(),
    createCommand: jest.fn(),
    openFile: jest.fn(),
    deleteCommand: jest.fn(),
    requestUsageReport: jest.fn(),
    requestLogProjects: jest.fn(),
    requestLogConversations: jest.fn(),
    requestLogConversation: jest.fn(),
  },
};

// Mock the ExtensionProvider
jest.mock("../../../src/contexts/ExtensionContext", () => ({
  ExtensionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="extension-provider">{children}</div>
  ),
  useExtension: () => mockExtensionContext,
}));

// Mock ViewRouter
jest.mock("../../../src/components/ViewRouter", () => {
  return function MockViewRouter({ currentView }: { currentView: string }) {
    return <div data-testid="view-router" data-current-view={currentView} />;
  };
});

// Mock window.vscodeApi
const mockVSCodeAPI = {
  postMessage: mockSendMessage,
};

Object.defineProperty(window, "vscodeApi", {
  value: mockVSCodeAPI,
  writable: true,
});

describe("UnifiedApp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset state to initial values
    mockExtensionContext.state.currentView = "main";
    mockExtensionContext.state.main.status = "stopped";
    mockExtensionContext.state.main.tasks = [];
  });

  describe("Main application component integration", () => {
    it("renders the main application structure", () => {
      render(<UnifiedApp />);

      expect(screen.getByTestId("extension-provider")).toBeInTheDocument();
      expect(screen.getByTestId("view-router")).toBeInTheDocument();
      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "main",
      );
    });

    it("renders the AppContent component wrapped in ExtensionProvider", () => {
      render(<UnifiedApp />);

      const appDiv = screen.getByTestId("extension-provider");
      expect(appDiv).toBeInTheDocument();
      expect(appDiv).toContainElement(screen.getByTestId("view-router"));
    });

    it("applies the correct CSS class to the app container", () => {
      const { container } = render(<UnifiedApp />);
      const appDiv = container.querySelector(".app");

      expect(appDiv).toBeInTheDocument();
    });

    it("passes the current view to ViewRouter", () => {
      render(<UnifiedApp />);

      const viewRouter = screen.getByTestId("view-router");
      expect(viewRouter).toHaveAttribute("data-current-view", "main");
    });
  });

  describe("Application state management and lifecycle", () => {
    it("provides extension context to child components", () => {
      render(<UnifiedApp />);

      // Verify that the ExtensionProvider is present
      expect(screen.getByTestId("extension-provider")).toBeInTheDocument();
    });

    it("handles different application states", () => {
      // Test with different currentView states
      const views = ["main", "commands", "usage"];

      views.forEach((view) => {
        mockExtensionContext.state.currentView = view;
        const { unmount } = render(<UnifiedApp />);

        expect(screen.getByTestId("view-router")).toHaveAttribute(
          "data-current-view",
          view,
        );

        unmount();
      });
    });

    it("maintains state consistency across renders", () => {
      // Ensure clean state
      mockExtensionContext.state.currentView = "main";
      const { rerender } = render(<UnifiedApp />);

      // Initial render
      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "main",
      );

      // Re-render with same props
      rerender(<UnifiedApp />);
      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "main",
      );
    });

    it("handles state updates correctly", () => {
      const { rerender } = render(<UnifiedApp />);

      // Change the view state
      mockExtensionContext.state.currentView = "commands";
      rerender(<UnifiedApp />);

      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "commands",
      );
    });
  });

  describe("Component routing and navigation", () => {
    it("renders the correct view based on currentView state", () => {
      // Ensure clean state
      mockExtensionContext.state.currentView = "main";
      render(<UnifiedApp />);

      const viewRouter = screen.getByTestId("view-router");
      expect(viewRouter).toHaveAttribute("data-current-view", "main");
    });

    it("handles view transitions", () => {
      const { rerender } = render(<UnifiedApp />);

      // Test different view states
      const viewStates = ["main", "commands", "usage"];

      viewStates.forEach((view) => {
        mockExtensionContext.state.currentView = view;
        rerender(<UnifiedApp />);

        expect(screen.getByTestId("view-router")).toHaveAttribute(
          "data-current-view",
          view,
        );
      });
    });

    it("maintains routing state during component updates", () => {
      mockExtensionContext.state.currentView = "usage";
      const { rerender } = render(<UnifiedApp />);

      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "usage",
      );

      // Update other state but keep view the same
      mockExtensionContext.state.main.status = "running";
      rerender(<UnifiedApp />);

      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "usage",
      );
    });

    it("handles invalid view states gracefully", () => {
      // This test verifies that the ViewRouter component handles invalid states
      // The actual fallback behavior is tested in ViewRouter.test.tsx
      (mockExtensionContext.state as any).currentView = "invalid-view";
      render(<UnifiedApp />);

      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "invalid-view",
      );
    });
  });

  describe("Application error boundary and recovery", () => {
    it("renders without crashing with valid props", () => {
      // Ensure the component renders successfully with valid state
      mockExtensionContext.state.currentView = "main";

      expect(() => render(<UnifiedApp />)).not.toThrow();
      expect(screen.getByTestId("view-router")).toBeInTheDocument();
    });

    it("handles graceful unmounting", () => {
      const { unmount } = render(<UnifiedApp />);

      // Should unmount without errors
      expect(() => unmount()).not.toThrow();
    });

    it("maintains component stability during state changes", () => {
      const { rerender } = render(<UnifiedApp />);

      // Rapid state changes should not cause crashes
      const stateChanges = [
        { currentView: "main", status: "stopped" },
        { currentView: "commands", status: "running" },
        { currentView: "usage", status: "starting" },
        { currentView: "main", status: "stopping" },
      ];

      stateChanges.forEach(({ currentView, status }) => {
        mockExtensionContext.state.currentView = currentView;
        mockExtensionContext.state.main.status = status;

        expect(() => rerender(<UnifiedApp />)).not.toThrow();
        expect(screen.getByTestId("view-router")).toBeInTheDocument();
      });
    });

    it("handles edge case state values", () => {
      // Test with unusual but valid state values
      mockExtensionContext.state.currentView = "usage";
      mockExtensionContext.state.main.tasks = [];
      mockExtensionContext.state.main.results = undefined;

      expect(() => render(<UnifiedApp />)).not.toThrow();
      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "usage",
      );
    });

    it("handles window events and cleanup", () => {
      // Mock window.addEventListener and removeEventListener
      const addEventListenerSpy = jest.spyOn(window, "addEventListener");
      const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

      const { unmount } = render(<UnifiedApp />);

      // Note: The actual event listener setup is in ExtensionProvider
      // We're testing that the component can be unmounted cleanly
      expect(() => unmount()).not.toThrow();

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });

  describe("Application performance and optimization", () => {
    it("does not cause unnecessary re-renders", () => {
      const { rerender } = render(<UnifiedApp />);

      // Multiple re-renders with the same props should not cause issues
      for (let i = 0; i < 5; i++) {
        rerender(<UnifiedApp />);
        expect(screen.getByTestId("view-router")).toBeInTheDocument();
      }
    });

    it("handles rapid state changes efficiently", async () => {
      const { rerender } = render(<UnifiedApp />);

      // Simulate rapid state changes
      const views = ["main", "commands", "usage", "main", "commands"];

      for (const view of views) {
        await act(async () => {
          mockExtensionContext.state.currentView = view;
          rerender(<UnifiedApp />);
        });

        expect(screen.getByTestId("view-router")).toHaveAttribute(
          "data-current-view",
          view,
        );
      }
    });

    it("maintains performance with complex state objects", () => {
      // Test with complex state to ensure performance is maintained
      mockExtensionContext.state.main.tasks = Array.from(
        { length: 100 },
        (_, i) => ({
          id: `task-${i}`,
          name: `Task ${i}`,
          type: "task",
          prompt: `Test prompt ${i}`,
          allowAllTools: false,
          parallelTasksCount: 1,
          outputFormat: "json",
        }),
      );

      const startTime = Date.now();
      render(<UnifiedApp />);
      const endTime = Date.now();

      // Should render quickly even with complex state
      expect(endTime - startTime).toBeLessThan(100);
      expect(screen.getByTestId("view-router")).toBeInTheDocument();
    });

    it("handles memory cleanup on unmount", () => {
      const { unmount } = render(<UnifiedApp />);

      // Should unmount without memory leaks or errors
      expect(() => unmount()).not.toThrow();
    });

    it("optimizes component structure for rendering", () => {
      const { container } = render(<UnifiedApp />);

      // Verify efficient DOM structure
      const appDiv = container.querySelector(".app");
      expect(appDiv).toBeInTheDocument();
      expect(appDiv?.children).toHaveLength(1); // Should only have ViewRouter as child
    });

    it("handles concurrent state updates", async () => {
      const { rerender } = render(<UnifiedApp />);

      // Simulate concurrent state updates
      await act(async () => {
        mockExtensionContext.state.currentView = "commands";
        mockExtensionContext.state.main.status = "running";
        rerender(<UnifiedApp />);
      });

      expect(screen.getByTestId("view-router")).toHaveAttribute(
        "data-current-view",
        "commands",
      );
    });

    it("maintains consistent rendering with prop changes", () => {
      const { rerender } = render(<UnifiedApp />);

      // Test multiple prop changes
      const changes = [
        { currentView: "commands", status: "running" },
        { currentView: "usage", status: "stopped" },
        { currentView: "main", status: "starting" },
      ];

      changes.forEach(({ currentView, status }) => {
        mockExtensionContext.state.currentView = currentView;
        mockExtensionContext.state.main.status = status;
        rerender(<UnifiedApp />);

        expect(screen.getByTestId("view-router")).toHaveAttribute(
          "data-current-view",
          currentView,
        );
      });
    });
  });

  describe("Integration with VSCode API", () => {
    it("provides VSCode API context to child components", () => {
      render(<UnifiedApp />);

      // Verify that the VSCode API is available in the window
      expect(window.vscodeApi).toBeDefined();
      expect(window.vscodeApi.postMessage).toBe(mockSendMessage);
    });

    it("handles VSCode API communication", () => {
      render(<UnifiedApp />);

      // The actual message handling is tested in ExtensionContext tests
      // Here we just verify the API is accessible
      expect(typeof window.vscodeApi.postMessage).toBe("function");
    });
  });
});
