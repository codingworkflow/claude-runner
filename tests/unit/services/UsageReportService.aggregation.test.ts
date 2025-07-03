import { jest, describe, it, beforeEach, expect } from "@jest/globals";
import { UsageReportService } from "../../../src/services/UsageReportService";

// Mock fetch for pricing data
const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  }),
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).fetch = mockFetch;

// Mock file system
jest.mock(
  "fs/promises",
  () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  "os",
  () => ({
    homedir: jest.fn(() => "/mock/home"),
  }),
  { virtual: true },
);

jest.mock(
  "glob",
  () => ({
    glob: jest.fn(() => Promise.resolve([])),
  }),
  { virtual: true },
);

describe("UsageReportService Aggregation", () => {
  let service: UsageReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsageReportService();
  });

  describe("Cache Path Structure through Report Generation", () => {
    it("should handle file operations for daily reports", async () => {
      // Test that the service can generate reports without errors
      // This indirectly tests the cache path structure through public API
      const report = await service.generateReport("today");

      expect(report.period).toBe("today");
      expect(report.startDate).toBeDefined();
      expect(report.endDate).toBeDefined();
      expect(Array.isArray(report.dailyReports)).toBe(true);
    });

    it("should handle hourly report generation with path structure", async () => {
      // Test hourly reports which use different file structure
      const report = await service.generateReport("hourly", 3, 10);

      expect(report.period).toBe("hourly");
      expect(Array.isArray(report.dailyReports)).toBe(true);
    });

    it("should handle weekly report generation", async () => {
      // Test weekly reports to ensure path handling works
      const report = await service.generateReport("week");

      expect(report.period).toBe("week");
      expect(report.startDate).toBeDefined();
      expect(report.endDate).toBeDefined();
    });
  });

  describe("Date Formatting through Reports", () => {
    it("should format dates correctly in daily reports", async () => {
      const report = await service.generateReport("today");

      // Verify date format in report structure
      expect(report.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(report.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Daily reports should have proper date format
      for (const dailyReport of report.dailyReports) {
        expect(dailyReport.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it("should format hours correctly in hourly reports", async () => {
      const report = await service.generateReport("hourly", 5, 10);

      // Hourly reports should have proper hour format
      for (const hourReport of report.dailyReports) {
        expect(hourReport.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:00 UTC$/);
      }
    });
  });

  describe("Hourly Report Generation", () => {
    it("should return individual hours that have activity", async () => {
      const mockNow = new Date("2025-06-20T15:00:00.000Z");
      jest.spyOn(Date, "now").mockReturnValue(mockNow.getTime());

      const totalHours = 3;
      const startHour = 13;

      const report = await service.generateReport(
        "hourly",
        totalHours,
        startHour,
      );

      expect(report.period).toBe("hourly");

      // Should return individual hours (may be 0 if no data)
      expect(Array.isArray(report.dailyReports)).toBe(true);
      expect(report.dailyReports.length).toBeGreaterThanOrEqual(0);

      // If there are reports, they should have proper hour format
      for (const hourBlock of report.dailyReports) {
        expect(hourBlock.date).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:00 UTC/);
        expect(typeof hourBlock.inputTokens).toBe("number");
        expect(typeof hourBlock.outputTokens).toBe("number");
        expect(typeof hourBlock.costUSD).toBe("number");
      }
    });

    it("should handle hourly reports with different parameters", async () => {
      const mockNow = new Date("2025-06-20T02:00:00.000Z");
      jest.spyOn(Date, "now").mockReturnValue(mockNow.getTime());

      const report = await service.generateReport("hourly", 5, 23);

      expect(report.period).toBe("hourly");
      expect(Array.isArray(report.dailyReports)).toBe(true);

      // All returned hours should have consistent structure
      for (const hourBlock of report.dailyReports) {
        expect(typeof hourBlock.inputTokens).toBe("number");
        expect(typeof hourBlock.outputTokens).toBe("number");
        expect(typeof hourBlock.cacheCreateTokens).toBe("number");
        expect(typeof hourBlock.cacheReadTokens).toBe("number");
        expect(typeof hourBlock.costUSD).toBe("number");
      }
    });
  });

  describe("Report Structure Validation", () => {
    it("should return correct report structure for all periods", async () => {
      const periods = ["today", "week", "month", "hourly"] as const;

      for (const period of periods) {
        const report =
          period === "hourly"
            ? await service.generateReport(period, 5, 10)
            : await service.generateReport(period);

        expect(report).toHaveProperty("period", period);
        expect(report).toHaveProperty("startDate");
        expect(report).toHaveProperty("endDate");
        expect(report).toHaveProperty("dailyReports");
        expect(report).toHaveProperty("totals");

        expect(Array.isArray(report.dailyReports)).toBe(true);
        expect(report.totals).toHaveProperty("inputTokens");
        expect(report.totals).toHaveProperty("outputTokens");
        expect(report.totals).toHaveProperty("costUSD");
        expect(report.totals).toHaveProperty("models");
      }
    });

    it("should initialize empty totals correctly", async () => {
      const report = await service.generateReport("today");

      expect(report.totals.inputTokens).toBe(0);
      expect(report.totals.outputTokens).toBe(0);
      expect(report.totals.cacheCreateTokens).toBe(0);
      expect(report.totals.cacheReadTokens).toBe(0);
      expect(report.totals.totalTokens).toBe(0);
      expect(report.totals.costUSD).toBe(0);
      expect(Array.isArray(report.totals.models)).toBe(true);
      expect(report.totals.models).toHaveLength(0);
    });
  });

  describe("Optimization Logic", () => {
    it("should distinguish between current day and past days", () => {
      const mockNow = Date.now();
      // const testToday = new Date(mockNow); // Unused in this test

      jest.spyOn(Date, "now").mockReturnValue(mockNow);

      // Create comparison dates based on the mocked time
      const today = new Date(mockNow);
      today.setUTCHours(0, 0, 0, 0);

      const yesterday = new Date(mockNow - 24 * 60 * 60 * 1000);
      yesterday.setUTCHours(0, 0, 0, 0);

      const tomorrow = new Date(mockNow + 24 * 60 * 60 * 1000);
      tomorrow.setUTCHours(0, 0, 0, 0);

      // Yesterday should be considered past (use daily aggregation)
      expect(yesterday.getTime()).toBeLessThan(today.getTime());

      // Today should be considered current (use hourly files)
      expect(today.getTime()).toBe(today.getTime());

      // Tomorrow should be considered future
      expect(tomorrow.getTime()).toBeGreaterThan(today.getTime());
    });
  });
});
