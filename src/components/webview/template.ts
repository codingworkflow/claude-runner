import * as vscode from "vscode";

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  viewType?: "main" | "commands" | "usage",
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview.js"),
  );

  const viewTypeScript = viewType
    ? `
    <script>
      window.initialViewType = '${viewType}';
    </script>`
    : "";

  return `<!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Claude Runner</title>
          </head>
          <body>
              <div id="root"></div>${viewTypeScript}
              <script src="${scriptUri}"></script>
          </body>
          </html>`;
}
