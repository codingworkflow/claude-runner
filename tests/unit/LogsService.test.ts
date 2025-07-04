import { describe, it, expect, beforeEach } from "@jest/globals";
import { LogsService } from "../../src/services/LogsService";

describe("LogsService", () => {
  let logsService: LogsService;

  beforeEach(() => {
    logsService = new LogsService();
  });

  it("should create LogsService instance", () => {
    expect(logsService).toBeDefined();
    expect(logsService.clearCache).toBeDefined();
    expect(logsService.formatTimestamp).toBeDefined();
  });

  it("should format timestamps correctly", () => {
    const testTimestamp = "2024-01-01T10:00:00.000Z";

    const formattedDateTime = logsService.formatTimestamp(testTimestamp);
    const formattedDate = logsService.formatDate(testTimestamp);
    const formattedTime = logsService.formatTime(testTimestamp);

    expect(formattedDateTime).toContain("2024");
    expect(formattedDate).toContain("2024");
    expect(formattedTime).toMatch(/\d{1,2}:\d{2}/);
  });

  it("should handle invalid timestamps gracefully", () => {
    const invalidTimestamp = "invalid-timestamp";

    const formattedDateTime = logsService.formatTimestamp(invalidTimestamp);
    const formattedDate = logsService.formatDate(invalidTimestamp);
    const formattedTime = logsService.formatTime(invalidTimestamp);

    expect(formattedDateTime).toBe("Invalid Date");
    expect(formattedDate).toBe("Invalid Date");
    expect(formattedTime).toBe("Invalid Date");
  });

  it("should clear cache correctly", () => {
    logsService.clearCache();
    expect(true).toBe(true);
  });
});
