import { ILogger } from "../../core/interfaces/ILogger";

export class VSCodeLogger implements ILogger {
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
    // eslint-disable-next-line no-console
    console.debug(message, ...args);
  }
}
