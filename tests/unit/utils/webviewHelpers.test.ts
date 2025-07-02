import * as vscode from "vscode";
import {
  setupWebviewOptions,
  setupWebviewHtml,
  createWebviewCompatibleView,
  WebviewConfig,
} from "../../../src/utils/webviewHelpers";

// Mock VSCode APIs
jest.mock("vscode", () => ({
  Uri: {
    joinPath: jest.fn((base, ...paths) => {
      if (!base) {
        return null;
      }
      return {
        toString: () => `${base.toString()}/${paths.join("/")}`,
        fsPath: `${base.fsPath}/${paths.join("/")}`,
      };
    }),
  },
}));

// Mock webview component
jest.mock("../../../src/components/webview", () => ({
  getWebviewHtml: jest.fn(() => "<html>Mock HTML</html>"),
}));

import { getWebviewHtml } from "../../../src/components/webview";

describe("webviewHelpers", () => {
  let mockWebview: jest.Mocked<vscode.Webview>;
  let mockExtensionUri: vscode.Uri;
  let mockWebviewPanel: jest.Mocked<vscode.WebviewPanel>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockExtensionUri = {
      toString: () => "/extension/path",
      fsPath: "/extension/path",
    } as vscode.Uri;

    mockWebview = {
      options: {},
      html: "",
      asWebviewUri: jest.fn(),
      postMessage: jest.fn(),
      onDidReceiveMessage: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    mockWebviewPanel = {
      webview: mockWebview,
      onDidChangeViewState: jest.fn(),
      onDidDispose: jest.fn(),
      visible: true,
      reveal: jest.fn(),
      title: "Test Panel",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });

  describe("setupWebviewOptions", () => {
    it("should configure webview options with correct settings", () => {
      setupWebviewOptions(mockWebview, mockExtensionUri);

      expect(mockWebview.options).toEqual({
        enableScripts: true,
        localResourceRoots: [
          mockExtensionUri,
          expect.objectContaining({
            fsPath: "/extension/path/dist",
          }),
        ],
      });
    });

    it("should set enableScripts to true", () => {
      setupWebviewOptions(mockWebview, mockExtensionUri);

      expect(mockWebview.options.enableScripts).toBe(true);
    });

    it("should include extension URI and dist folder in localResourceRoots", () => {
      setupWebviewOptions(mockWebview, mockExtensionUri);

      expect(mockWebview.options.localResourceRoots).toHaveLength(2);
      expect(mockWebview.options.localResourceRoots?.[0]).toBe(
        mockExtensionUri,
      );
      expect(vscode.Uri.joinPath).toHaveBeenCalledWith(
        mockExtensionUri,
        "dist",
      );
    });
  });

  describe("setupWebviewHtml", () => {
    it("should configure webview options and set HTML content", () => {
      const config: WebviewConfig = {
        webview: mockWebview,
        extensionUri: mockExtensionUri,
        viewType: "test",
      };

      setupWebviewHtml(config);

      expect(mockWebview.options).toEqual({
        enableScripts: true,
        localResourceRoots: [
          mockExtensionUri,
          expect.objectContaining({
            fsPath: "/extension/path/dist",
          }),
        ],
      });
      expect(mockWebview.html).toBe("<html>Mock HTML</html>");
    });

    it("should call getWebviewHtml with correct parameters", () => {
      const config: WebviewConfig = {
        webview: mockWebview,
        extensionUri: mockExtensionUri,
        viewType: "test",
      };

      setupWebviewHtml(config);

      expect(getWebviewHtml).toHaveBeenCalledWith(
        mockWebview,
        mockExtensionUri,
        "main",
      );
    });

    it("should set HTML content on webview", () => {
      const config: WebviewConfig = {
        webview: mockWebview,
        extensionUri: mockExtensionUri,
        viewType: "test",
      };

      setupWebviewHtml(config);

      expect(mockWebview.html).toBe("<html>Mock HTML</html>");
    });
  });

  describe("createWebviewCompatibleView", () => {
    it("should create a compatible webview view from webview panel", () => {
      const result = createWebviewCompatibleView(mockWebviewPanel);

      expect(result.webview).toBe(mockWebviewPanel.webview);
      expect(result.onDidChangeVisibility).toBe(
        mockWebviewPanel.onDidChangeViewState,
      );
      expect(result.onDidDispose).toBe(mockWebviewPanel.onDidDispose);
      expect(result.visible).toBe(mockWebviewPanel.visible);
      expect(result.title).toBe(mockWebviewPanel.title);
      expect(result.viewType).toBe("claude-runner-editor");
    });

    it("should create show function that calls panel reveal", () => {
      const result = createWebviewCompatibleView(mockWebviewPanel);

      result.show();

      expect(mockWebviewPanel.reveal).toHaveBeenCalled();
    });

    it("should preserve webview visibility state", () => {
      Object.defineProperty(mockWebviewPanel, "visible", {
        value: false,
        writable: true,
      });
      const result = createWebviewCompatibleView(mockWebviewPanel);

      expect(result.visible).toBe(false);
    });

    it("should preserve webview title", () => {
      Object.defineProperty(mockWebviewPanel, "title", {
        value: "Custom Title",
        writable: true,
      });
      const result = createWebviewCompatibleView(mockWebviewPanel);

      expect(result.title).toBe("Custom Title");
    });

    it("should set correct viewType", () => {
      const result = createWebviewCompatibleView(mockWebviewPanel);

      expect(result.viewType).toBe("claude-runner-editor");
    });
  });

  describe("WebviewConfig interface", () => {
    it("should accept valid configuration object", () => {
      const config: WebviewConfig = {
        webview: mockWebview,
        extensionUri: mockExtensionUri,
        viewType: "test-view",
      };

      expect(config.webview).toBe(mockWebview);
      expect(config.extensionUri).toBe(mockExtensionUri);
      expect(config.viewType).toBe("test-view");
    });
  });

  describe("error handling", () => {
    it("should handle webview with missing options", () => {
      const webviewWithoutOptions = {} as vscode.Webview;

      expect(() => {
        setupWebviewOptions(webviewWithoutOptions, mockExtensionUri);
      }).not.toThrow();

      expect(webviewWithoutOptions.options).toBeDefined();
    });

    it("should handle null extension URI gracefully", () => {
      const nullUri = null as unknown as vscode.Uri;

      expect(() => {
        setupWebviewOptions(mockWebview, nullUri);
      }).not.toThrow();

      expect(mockWebview.options).toEqual({
        enableScripts: true,
        localResourceRoots: [nullUri, null],
      });
    });
  });
});
