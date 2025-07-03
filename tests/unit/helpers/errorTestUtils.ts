// Error testing utilities for standardized error handling patterns

export interface ErrorTestScenario {
  operation: () => Promise<any>;
  expectedError: string | RegExp;
  expectedLogging?: boolean;
  logLevel?: "error" | "warn" | "info" | "debug";
  cleanup?: () => void | Promise<void>;
}

export const testErrorHandling = async (
  operation: () => Promise<any>,
  expectedError: string | RegExp,
) => {
  await expect(operation()).rejects.toThrow(expectedError);
  // Logger validation is optional and handled by individual tests
  // since each test may use different logger implementations
};

export const testErrorScenario = async (scenario: ErrorTestScenario) => {
  const { operation, expectedError, cleanup } = scenario;

  try {
    await expect(operation()).rejects.toThrow(expectedError);
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
};

export const createMockError = (message: string, code?: string): Error => {
  const error = new Error(message);
  if (code) {
    (error as any).code = code;
  }
  return error;
};

export const StandardErrorScenarios = {
  SERVICE_UNAVAILABLE: {
    error: "Service unavailable",
    shouldLog: true,
    logLevel: "error" as const,
  },
  NETWORK_TIMEOUT: {
    error: /timeout|timed out/i,
    shouldLog: true,
    logLevel: "error" as const,
  },
  CONFIGURATION_INVALID: {
    error: /invalid.*configuration|configuration.*invalid/i,
    shouldLog: true,
    logLevel: "error" as const,
  },
  FILE_SYSTEM_ERROR: {
    error: /ENOENT|EACCES|EPERM|file.*not.*found/i,
    shouldLog: true,
    logLevel: "error" as const,
  },
  CLAUDE_CLI_ERROR: {
    error: /claude.*cli|command.*failed/i,
    shouldLog: true,
    logLevel: "error" as const,
  },
};

export const testStandardErrorScenarios = async (
  createOperation: (
    errorType: keyof typeof StandardErrorScenarios,
  ) => () => Promise<any>,
) => {
  for (const [scenarioName, scenario] of Object.entries(
    StandardErrorScenarios,
  )) {
    const operation = createOperation(
      scenarioName as keyof typeof StandardErrorScenarios,
    );
    await testErrorScenario({
      operation,
      expectedError: scenario.error,
      expectedLogging: scenario.shouldLog,
      logLevel: scenario.logLevel,
    });
  }
};

export const mockServiceError = (
  service: any,
  method: string,
  error: Error,
) => {
  const spy = jest.spyOn(service, method);
  spy.mockRejectedValue(error);
  return spy;
};

export const expectErrorRecovery = async (
  operation: () => Promise<any>,
  recoveryCheck: () => boolean | Promise<boolean>,
) => {
  try {
    await operation();
  } catch {
    // Expected to fail
  }

  const isRecovered = await recoveryCheck();
  expect(isRecovered).toBe(true);
};

export const expectGracefulFailure = async (
  operation: () => Promise<any>,
  expectedError: string | RegExp,
  stateCheck?: () => boolean | Promise<boolean>,
) => {
  await expect(operation()).rejects.toThrow(expectedError);

  if (stateCheck) {
    const stateValid = await stateCheck();
    expect(stateValid).toBe(true);
  }
};
