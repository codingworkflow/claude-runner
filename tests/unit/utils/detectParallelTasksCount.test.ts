import { exec, type ChildProcess } from "child_process";
import { detectParallelTasksCount } from "../../../src/utils/detectParallelTasksCount";

// Mock child_process module
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));

// Mock util module
jest.mock("util", () => ({
  promisify: jest.fn((fn) => {
    return jest.fn().mockImplementation(async (...args) => {
      return new Promise((resolve, reject) => {
        const callback = (
          error: Error | null,
          stdout: string,
          stderr: string,
        ) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        };
        fn(...args, callback);
      });
    });
  }),
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;

describe("detectParallelTasksCount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Parallel task count detection logic", () => {
    it("should return parsed value for valid config output", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "4", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(4);
    });

    it("should trim whitespace from config output", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "  3  \n", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(3);
    });

    it("should handle string numbers correctly", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "2", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(2);
    });
  });

  describe("System resource analysis and optimization", () => {
    it("should respect minimum task count limit", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "0", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should respect maximum task count limit", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "10", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle edge case of exactly max limit", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "8", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(8);
    });

    it("should handle edge case of exactly min limit", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "1", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });
  });

  describe("Task count validation and limits", () => {
    it("should reject negative numbers", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "-1", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should reject non-numeric strings", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "invalid", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle floating point numbers by truncating", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "3.5", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(3); // parseInt truncates to 3
    });

    it("should reject empty output", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should reject Infinity", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "Infinity", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should reject NaN", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "NaN", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });
  });

  describe("Performance impact assessment", () => {
    it("should use 3 second timeout for config command", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        expect(cmd).toBe("claude config get --global parallelTasksCount");
        expect(options).toEqual({ timeout: 3000 });
        if (callback) {
          callback(null, "2", "");
        }
        return {} as ChildProcess;
      });

      await detectParallelTasksCount();
    });

    it("should fallback on timeout", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(new Error("Command timed out"), "", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle command execution errors gracefully", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(new Error("Command not found"), "", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });
  });

  describe("Task count configuration management", () => {
    it("should query global parallelTasksCount config", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        expect(cmd).toBe("claude config get --global parallelTasksCount");
        if (callback) {
          callback(null, "2", "");
        }
        return {} as ChildProcess;
      });

      await detectParallelTasksCount();
    });

    it("should provide safe fallback when config is unavailable", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(new Error("Config not found"), "", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle stderr output gracefully", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "3", "warning: deprecated option");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(3);
    });

    it("should provide consistent fallback behavior", async () => {
      const results: number[] = [];

      for (let i = 0; i < 3; i++) {
        mockExec.mockImplementationOnce((cmd, options, callback) => {
          if (callback) {
            callback(new Error("Failed"), "", "");
          }
          return {} as ChildProcess;
        });
        results.push(await detectParallelTasksCount());
      }

      expect(results).toEqual([1, 1, 1]);
    });

    it("should validate all valid task counts within range", async () => {
      const validCounts = [1, 2, 3, 4, 5, 6, 7, 8];

      for (const count of validCounts) {
        mockExec.mockImplementationOnce((cmd, options, callback) => {
          if (callback) {
            callback(null, count.toString(), "");
          }
          return {} as ChildProcess;
        });

        const result = await detectParallelTasksCount();
        expect(result).toBe(count);
      }
    });

    it("should handle missing configuration file", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(new Error("ENOENT: no such file or directory"), "", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle permission denied errors", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(new Error("EACCES: permission denied"), "", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle corrupted configuration data", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "corrupted_data_#$%", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });
  });

  describe("Edge cases and boundary conditions", () => {
    it("should handle mixed alphanumeric strings", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "3abc", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(3);
    });

    it("should handle leading zeros", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "003", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(3);
    });

    it("should handle scientific notation (outside valid range)", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "1e2", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1); // 100 is outside valid range
    });

    it("should handle hexadecimal format", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "0x5", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1); // parseInt with base 10 returns 0 for "0x5"
    });

    it("should handle null stdout", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, null as unknown as string, "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle undefined stdout", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, undefined as unknown as string, "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle very large numbers", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "999999999", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(1);
    });

    it("should handle multiple whitespace characters", async () => {
      mockExec.mockImplementation((cmd, options, callback) => {
        if (callback) {
          callback(null, "   \t\n  5   \t\n  ", "");
        }
        return {} as ChildProcess;
      });

      const result = await detectParallelTasksCount();
      expect(result).toBe(5);
    });
  });
});
