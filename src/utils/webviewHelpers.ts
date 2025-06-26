import * as vscode from "vscode";
import { getWebviewHtml } from "../components/webview";

export interface WebviewConfig {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  viewType: string;
}

export function setupWebviewOptions(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): void {
  webview.options = {
    enableScripts: true,
    localResourceRoots: [
      extensionUri,
      vscode.Uri.joinPath(extensionUri, "dist"),
    ],
  };
}

export function setupWebviewHtml(config: WebviewConfig): void {
  setupWebviewOptions(config.webview, config.extensionUri);
  config.webview.html = getWebviewHtml(
    config.webview,
    config.extensionUri,
    "main",
  );
}

export function createWebviewCompatibleView(
  webviewPanel: vscode.WebviewPanel,
): vscode.WebviewView {
  return {
    webview: webviewPanel.webview,
    onDidChangeVisibility: webviewPanel.onDidChangeViewState,
    onDidDispose: webviewPanel.onDidDispose,
    visible: webviewPanel.visible,
    show: () => webviewPanel.reveal(),
    title: webviewPanel.title,
    viewType: "claude-runner-editor",
  } as unknown as vscode.WebviewView;
}
