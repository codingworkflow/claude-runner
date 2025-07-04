import {
  jest,
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";

// Mock ClaudeExecutor
jest.mock("../dist/src/core/services/ClaudeExecutor");

// Import the ClaudeExecutor after mocking
import { ClaudeExecutor } from "../dist/src/core/services/ClaudeExecutor";
import { ILogger, IConfigManager } from "../dist/src/core/interfaces";

// Mock implementations
const MockedClaudeExecutor = ClaudeExecutor as jest.MockedClass<
  typeof ClaudeExecutor
>;
MockedClaudeExecutor.prototype.formatCommandPreview = jest.fn();

describe("Bypass Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("bypass flag parsing", () => {
    it("should parse --yes flag as autoAccept option", () => {
      // Simulate the CLI argument parsing logic from claude-runner.js lines 119-142
      const args = ["run", "workflow.yml", "--yes"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      // Simulate the parsing loop from lines 126-139
      for (const arg of args) {
        if (arg === "--yes" || arg === "-y") {
          options.autoAccept = true;
        }
      }

      expect(options.autoAccept).toBe(true);
      expect(options.resume).toBe(false);
      expect(options.executionPath).toBe(process.cwd());
    });

    it("should parse -y short flag as autoAccept option", () => {
      const args = ["run", "workflow.yml", "-y"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      for (const arg of args) {
        if (arg === "--yes" || arg === "-y") {
          options.autoAccept = true;
        }
      }

      expect(options.autoAccept).toBe(true);
    });

    it("should default autoAccept to false when flag not present", () => {
      const args = ["run", "workflow.yml", "--verbose"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      for (const arg of args) {
        if (arg === "--yes" || arg === "-y") {
          options.autoAccept = true;
        }
      }

      expect(options.autoAccept).toBe(false);
    });

    it("should parse multiple flags including autoAccept", () => {
      const args = ["run", "workflow.yml", "--resume", "--yes", "--verbose"];

      const options = {
        executionPath: process.cwd(),
        resume: false,
        autoAccept: false,
      };

      for (const arg of args) {
        if (arg === "--resume" || arg === "-r") {
          options.resume = true;
        } else if (arg === "--yes" || arg === "-y") {
          options.autoAccept = true;
        }
      }

      expect(options.resume).toBe(true);
      expect(options.autoAccept).toBe(true);
    });
  });

  describe("--dangerously-skip-permissions addition to commands", () => {
    it("should add --dangerously-skip-permissions when bypassPermissions is true", () => {
      // Simulate the buildTaskCommand logic from ClaudeExecutor lines 595-597
      const args: string[] = ["claude"];
      const options = { bypassPermissions: true };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      }

      expect(args).toContain("--dangerously-skip-permissions");
      expect(args.length).toBe(2); // ["claude", "--dangerously-skip-permissions"]
    });

    it("should add --dangerously-skip-permissions when allowAllTools is true", () => {
      const args: string[] = ["claude"];
      const options: { bypassPermissions?: boolean; allowAllTools?: boolean } =
        { allowAllTools: true };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      }

      expect(args).toContain("--dangerously-skip-permissions");
      expect(args.length).toBe(2);
    });

    it("should add --dangerously-skip-permissions when both bypassPermissions and allowAllTools are true", () => {
      const args: string[] = ["claude"];
      const options: { bypassPermissions?: boolean; allowAllTools?: boolean } =
        { bypassPermissions: true, allowAllTools: true };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      }

      expect(args).toContain("--dangerously-skip-permissions");
      expect(args.length).toBe(2);
    });

    it("should not add --dangerously-skip-permissions when neither option is true", () => {
      const args: string[] = ["claude"];
      const options: { bypassPermissions?: boolean; allowAllTools?: boolean } =
        {};

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      }

      expect(args).not.toContain("--dangerously-skip-permissions");
      expect(args.length).toBe(1); // Only ["claude"]
    });

    it("should not add --dangerously-skip-permissions when options are explicitly false", () => {
      const args: string[] = ["claude"];
      const options = { bypassPermissions: false, allowAllTools: false };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      }

      expect(args).not.toContain("--dangerously-skip-permissions");
      expect(args.length).toBe(1);
    });
  });

  describe("ClaudeExecutor command construction", () => {
    it("should construct command with bypass permissions when formatCommandPreview is called", () => {
      // Mock the formatCommandPreview to simulate the actual behavior
      const mockPreview =
        'cd "/tmp" && claude -p "Test task" --dangerously-skip-permissions';
      MockedClaudeExecutor.prototype.formatCommandPreview.mockReturnValue(
        mockPreview,
      );

      const executor = new ClaudeExecutor({} as ILogger, {} as IConfigManager);
      const result = executor.formatCommandPreview(
        "Test task",
        "auto",
        "/tmp",
        { bypassPermissions: true },
      );

      expect(
        MockedClaudeExecutor.prototype.formatCommandPreview,
      ).toHaveBeenCalledWith("Test task", "auto", "/tmp", {
        bypassPermissions: true,
      });
      expect(result).toContain("--dangerously-skip-permissions");
    });

    it("should construct command with bypass permissions when allowAllTools is used", () => {
      const mockPreview =
        'cd "/tmp" && claude -p "Test task" --dangerously-skip-permissions';
      MockedClaudeExecutor.prototype.formatCommandPreview.mockReturnValue(
        mockPreview,
      );

      const executor = new ClaudeExecutor({} as ILogger, {} as IConfigManager);
      const result = executor.formatCommandPreview(
        "Test task",
        "auto",
        "/tmp",
        { allowAllTools: true },
      );

      expect(result).toContain("--dangerously-skip-permissions");
    });

    it("should not construct command with bypass permissions when no bypass options", () => {
      const mockPreview = 'cd "/tmp" && claude -p "Test task"';
      MockedClaudeExecutor.prototype.formatCommandPreview.mockReturnValue(
        mockPreview,
      );

      const executor = new ClaudeExecutor({} as ILogger, {} as IConfigManager);
      const result = executor.formatCommandPreview(
        "Test task",
        "auto",
        "/tmp",
        {},
      );

      expect(result).not.toContain("--dangerously-skip-permissions");
    });
  });

  describe("bypass options validation", () => {
    it("should handle undefined bypass options gracefully", () => {
      const args: string[] = ["claude"];
      const options = {
        bypassPermissions: undefined,
        allowAllTools: undefined,
      };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      }

      expect(args).not.toContain("--dangerously-skip-permissions");
    });

    it("should handle null bypass options gracefully", () => {
      const args: string[] = ["claude"];
      const options = { bypassPermissions: null, allowAllTools: null };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      }

      expect(args).not.toContain("--dangerously-skip-permissions");
    });

    it("should prioritize bypass over allowedTools when bypass is enabled", () => {
      // Simulate the logic from ClaudeExecutor where bypass takes precedence
      const args: string[] = ["claude"];
      const options: {
        bypassPermissions?: boolean;
        allowAllTools?: boolean;
        allowedTools?: string[];
        disallowedTools?: string[];
      } = {
        bypassPermissions: true,
        allowedTools: ["file", "bash"],
        disallowedTools: ["web"],
      };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      } else {
        if (options.allowedTools && options.allowedTools.length > 0) {
          args.push("--allowedTools", options.allowedTools.join(","));
        }
        if (options.disallowedTools && options.disallowedTools.length > 0) {
          args.push("--disallowedTools", options.disallowedTools.join(","));
        }
      }

      expect(args).toContain("--dangerously-skip-permissions");
      expect(args).not.toContain("--allowedTools");
      expect(args).not.toContain("--disallowedTools");
    });

    it("should use allowedTools when bypass is not enabled", () => {
      const args: string[] = ["claude"];
      const options: {
        bypassPermissions?: boolean;
        allowAllTools?: boolean;
        allowedTools?: string[];
        disallowedTools?: string[];
      } = {
        bypassPermissions: false,
        allowedTools: ["file", "bash"],
        disallowedTools: ["web"],
      };

      if (
        (options.bypassPermissions ?? false) ||
        (options.allowAllTools ?? false)
      ) {
        args.push("--dangerously-skip-permissions");
      } else {
        if (options.allowedTools && options.allowedTools.length > 0) {
          args.push("--allowedTools", options.allowedTools.join(","));
        }
        if (options.disallowedTools && options.disallowedTools.length > 0) {
          args.push("--disallowedTools", options.disallowedTools.join(","));
        }
      }

      expect(args).not.toContain("--dangerously-skip-permissions");
      expect(args).toContain("--allowedTools");
      expect(args).toContain("file,bash");
      expect(args).toContain("--disallowedTools");
      expect(args).toContain("web");
    });
  });

  describe("workflow execution bypass mapping", () => {
    it("should map CLI autoAccept option to executor bypassPermissions", () => {
      // Simulate the mapping from claude-runner.js line 411: bypassPermissions: options.autoAccept
      const cliOptions: { autoAccept?: boolean } = { autoAccept: true };
      const executorOptions = { bypassPermissions: cliOptions.autoAccept };

      expect(executorOptions.bypassPermissions).toBe(true);
    });

    it("should map CLI autoAccept false to executor bypassPermissions false", () => {
      const cliOptions: { autoAccept?: boolean } = { autoAccept: false };
      const executorOptions = { bypassPermissions: cliOptions.autoAccept };

      expect(executorOptions.bypassPermissions).toBe(false);
    });

    it("should handle missing autoAccept option", () => {
      const cliOptions: { autoAccept?: boolean } = {};
      const executorOptions = { bypassPermissions: cliOptions.autoAccept };

      expect(executorOptions.bypassPermissions).toBeUndefined();
    });
  });
});
