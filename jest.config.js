module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        useESM: false,
        tsconfig: "tsconfig.jest.json",
      },
    ],
  },
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "^vscode$": "<rootDir>/src/test/__mocks__/vscode.js",
  },
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/test/suite/**",
    "!src/test/runTest.ts",
    "!src/test/runMainWindowTest.ts",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/src/test/suite/",
    "<rootDir>/out/",
    "<rootDir>/src/test/services/PipelineService.test.ts",
    "<rootDir>/src/test/services/WorkflowService.test.ts",
    "<rootDir>/src/test/services/WorkflowParser.test.ts",
    "<rootDir>/tests/integration/WorkflowExecution.test.ts",
    "<rootDir>/tests/integration/UsageReportFlow.fixed.test.ts",
    "<rootDir>/tests/integration/UsageReportFlow.test.ts",
    "<rootDir>/tests/services/UsageReportService.test.ts",
    "<rootDir>/tests/e2e/logs-processing.test.ts",
    "<rootDir>/tests/e2e/conversation-flows.test.ts",
    "<rootDir>/src/test/services/UsageReportService.aggregation.test.ts",
    "<rootDir>/tests/e2e/simple-logs.test.ts",
  ],
};
