export interface IProgress {
  report(value: number, message?: string): void;
}

export interface INotification {
  showInfo(message: string): Promise<void>;
  showWarning(message: string): Promise<void>;
  showError(message: string): Promise<void>;
  showProgress<T>(
    title: string,
    task: (progress: IProgress) => Promise<T>,
  ): Promise<T>;
}
