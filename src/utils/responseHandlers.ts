export interface ResponseHandler {
  postMessage: (message: Record<string, unknown>) => void;
}

export function createDataHandler(
  command: string,
  postMessage: (message: Record<string, unknown>) => void,
) {
  return (data: unknown): void => {
    postMessage({
      command: `${command}Data`,
      data: data,
    });
  };
}

export function createErrorHandler(
  command: string,
  postMessage: (message: Record<string, unknown>) => void,
) {
  return (error: string): void => {
    postMessage({
      command: `${command}Error`,
      error: error,
    });
  };
}
