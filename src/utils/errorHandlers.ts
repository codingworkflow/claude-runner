import * as vscode from "vscode";

export interface ErrorContext {
  source: string;
  showNotification?: boolean;
  postMessage?: (message: Record<string, unknown>) => void;
}

export function handleUnexpectedError(
  error: unknown,
  context: ErrorContext,
): void {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error occurred";

  console.error(`[${context.source}] Unhandled error:`, error);

  // Send error to webview to prevent UI freezing
  if (context.postMessage) {
    try {
      context.postMessage({
        command: "error",
        error: errorMessage,
      });
    } catch (postMessageError) {
      // Ignore postMessage errors to prevent error propagation loop
    }
  }

  // Show notification to user if requested
  if (context.showNotification !== false) {
    vscode.window.showErrorMessage(
      `${context.source} encountered an error: ${errorMessage}`,
    );
  }
}
