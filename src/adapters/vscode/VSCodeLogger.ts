import { ILogger } from "../../core/interfaces/ILogger";

export class VSCodeLogger implements ILogger {
  private readonly isTestEnvironment =
    process.env.NODE_ENV === "test" ||
    process.env.JEST_WORKER_ID !== undefined ||
    global?.jest;

  info(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(message, ...args);
  }

  error(message: string, error?: Error): void {
    if (error) {
      // eslint-disable-next-line no-console
      console.error(message, error);
    } else {
      // eslint-disable-next-line no-console
      console.error(message);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    // Suppress debug logging in test environment per CLAUDE.md logging rules
    if (this.isTestEnvironment) {
      return;
    }
    // eslint-disable-next-line no-console
    console.debug(message, ...args);
  }
}
