import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  RenderOptions,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { jest } from "@jest/globals";

export interface MockVSCodeAPI {
  postMessage: jest.MockedFunction<any>;
  getState?: jest.MockedFunction<any>;
  setState?: jest.MockedFunction<any>;
}

export interface ComponentTestSetup {
  render: typeof render;
  screen: typeof screen;
  fireEvent: typeof fireEvent;
  act: typeof act;
  mockAPI: MockVSCodeAPI;
  cleanup: () => void;
}

interface WindowWithVSCodeAPI {
  vscodeApi?: MockVSCodeAPI;
}

export const setupComponentTest = (): ComponentTestSetup => {
  const mockAPI: MockVSCodeAPI = {
    postMessage: jest.fn(),
    getState: jest.fn(),
    setState: jest.fn(),
  };

  const windowWithAPI = window as unknown as WindowWithVSCodeAPI;

  // Clean up any existing vscodeApi first
  if (windowWithAPI.vscodeApi) {
    delete windowWithAPI.vscodeApi;
  }

  // Set the mock API
  windowWithAPI.vscodeApi = mockAPI;

  const cleanup = () => {
    jest.clearAllMocks();
    delete windowWithAPI.vscodeApi;
  };

  return {
    render,
    screen,
    fireEvent,
    act,
    mockAPI,
    cleanup,
  };
};

export interface MockExtensionState {
  currentMode: "chat" | "task" | "pipeline";
  isTaskRunning: boolean;
  currentTask?: any;
  chatMessages: any[];
  pipelineConfig?: any;
  [key: string]: any;
}

export const createMockExtensionContext = (
  initialState: Partial<MockExtensionState> = {},
) => {
  const mockDispatch = jest.fn();

  const defaultState: MockExtensionState = {
    currentMode: "chat",
    isTaskRunning: false,
    chatMessages: [],
    ...initialState,
  };

  return {
    state: defaultState,
    dispatch: mockDispatch,
    actions: {
      switchMode: jest.fn(),
      runTask: jest.fn(),
      cancelTask: jest.fn(),
      sendChatMessage: jest.fn(),
      runPipeline: jest.fn(),
      updatePipelineConfig: jest.fn(),
      clearMessages: jest.fn(),
    },
  };
};

export const mockReactTestingLibrary = () => {
  const mockRender = jest.fn();
  const mockScreen = {
    getByText: jest.fn(),
    getByRole: jest.fn(),
    getByTestId: jest.fn(),
    getByPlaceholderText: jest.fn(),
    queryByText: jest.fn(),
    queryByRole: jest.fn(),
    queryByTestId: jest.fn(),
    findByText: jest.fn(),
    findByRole: jest.fn(),
    findByTestId: jest.fn(),
  };
  const mockFireEvent = {
    click: jest.fn(),
    change: jest.fn(),
    submit: jest.fn(),
    keyDown: jest.fn(),
    keyUp: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
  };

  return {
    render: mockRender,
    screen: mockScreen,
    fireEvent: mockFireEvent,
    act: jest.fn((callback: () => void) => callback()),
  };
};

export const renderWithContext = (
  component: React.ReactElement,
  context: ReturnType<typeof createMockExtensionContext>,
  options?: RenderOptions,
) => {
  const ContextProvider = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(
      "div",
      { "data-testid": "mock-context-provider" },
      children,
    );
  };

  return render(
    React.createElement(ContextProvider, { children: component }),
    options,
  );
};

export const waitForAsyncUpdates = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

export const simulateUserInput = {
  type: (element: HTMLElement, text: string) => {
    fireEvent.change(element, { target: { value: text } });
  },

  click: (element: HTMLElement) => {
    fireEvent.click(element);
  },

  submit: (form: HTMLElement) => {
    fireEvent.submit(form);
  },

  keyPress: (element: HTMLElement, key: string) => {
    fireEvent.keyDown(element, { key, code: key });
    fireEvent.keyUp(element, { key, code: key });
  },
};

export const expectElementToHaveText = (
  element: HTMLElement | null,
  text: string,
) => {
  expect(element).toBeInTheDocument();
  expect(element).toHaveTextContent(text);
};

export const expectElementToBeVisible = (element: HTMLElement | null) => {
  expect(element).toBeInTheDocument();
  expect(element).toBeVisible();
};

export const expectElementToBeHidden = (element: HTMLElement | null) => {
  if (element) {
    expect(element).not.toBeVisible();
  } else {
    expect(element).not.toBeInTheDocument();
  }
};
