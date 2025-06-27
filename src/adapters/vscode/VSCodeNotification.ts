import * as vscode from "vscode";
import { INotification, IProgress } from "../../core/interfaces/INotification";

class VSCodeProgress implements IProgress {
  constructor(
    private readonly progress: vscode.Progress<{
      message?: string;
      increment?: number;
    }>,
  ) {}

  report(value: number, message?: string): void {
    this.progress.report({
      increment: value,
      message,
    });
  }
}

export class VSCodeNotification implements INotification {
  async showInfo(message: string): Promise<void> {
    vscode.window.showInformationMessage(message);
  }

  async showWarning(message: string): Promise<void> {
    vscode.window.showWarningMessage(message);
  }

  async showError(message: string): Promise<void> {
    vscode.window.showErrorMessage(message);
  }

  async showProgress<T>(
    title: string,
    task: (progress: IProgress) => Promise<T>,
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      async (progress) => {
        const vsCodeProgress = new VSCodeProgress(progress);
        return await task(vsCodeProgress);
      },
    );
  }
}
