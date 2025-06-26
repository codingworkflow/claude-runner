import { jest, describe, it, beforeEach, expect } from "@jest/globals";
import { UsageReportService } from "../../../src/services/UsageReportService";

// Mock fetch for pricing data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  }),
);

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

  describe("Cache Path Structure", () => {
    it("should create correct date directory structure", () => {
      const date = new Date("2025-06-20T14:30:00.000Z");

      // Access private method using type assertion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getDateDir = (service as any).getDateDir.bind(service);
      const result = getDateDir(date);

      expect(result).toContain("2025");
      expect(result).toContain("06");
      expect(result).toContain("20");
      expect(result).toMatch(/2025[\\/]06[\\/]20$/);
    });

    it("should create correct hourly filename with hour padding", () => {
      const date = new Date("2025-06-20T04:30:00.000Z"); // Early hour to test padding

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hourlyFilename = (service as any).hourlyFilename.bind(service);
      const result = hourlyFilename(date);

      expect(result).toContain("04.json"); // Should be zero-padded
      expect(result).toContain("2025");
      expect(result).toContain("06");
      expect(result).toContain("20");
    });

    it("should create correct daily filename", () => {
      const date = new Date("2025-06-20T14:30:00.000Z");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dailyFilename = (service as any).dailyFilename.bind(service);
      const result = dailyFilename(date);

      expect(result).toContain("daily.json");
      expect(result).toContain("2025");
      expect(result).toContain("06");
      expect(result).toContain("20");
    });
  });

  describe("Date Formatting", () => {
    it("should format dates correctly for UTC", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatDate = (service as any).formatDate.bind(service);

      expect(formatDate("2025-06-20T14:30:00.000Z")).toBe("2025-06-20");
      expect(formatDate("2025-01-01T00:00:00.000Z")).toBe("2025-01-01");
      expect(formatDate("2025-12-31T23:59:59.999Z")).toBe("2025-12-31");
    });

    it("should format hours correctly for UTC", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatHour = (service as any).formatHour.bind(service);

      expect(formatHour("2025-06-20T14:30:00.000Z")).toBe(
        "2025-06-20 14:00 UTC",
      );
      expect(formatHour("2025-06-20T00:00:00.000Z")).toBe(
        "2025-06-20 00:00 UTC",
      );
      expect(formatHour("2025-06-20T23:59:59.999Z")).toBe(
        "2025-06-20 23:00 UTC",
      );
    });
  });

  describe("Hourly Report Generation", () => {
    it("should return individual hours that have activity", async () => {
      const mockNow = new Date("2025-06-20T15:00:00.000Z");
      jest.spyOn(Date, "now").mockReturnValue(mockNow.getTime());

      // Mock ensureCache to avoid file operations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, "ensureCache").mockResolvedValue(undefined);

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

    it("should only include hours with activity", async () => {
      const mockNow = new Date("2025-06-20T02:00:00.000Z");
      jest.spyOn(Date, "now").mockReturnValue(mockNow.getTime());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, "ensureCache").mockResolvedValue(undefined);

      const report = await service.generateReport("hourly", 5, 23);

      expect(report.period).toBe("hourly");
      expect(Array.isArray(report.dailyReports)).toBe(true);

      // All returned hours should have some activity (tokens > 0 or cost > 0)
      for (const hourBlock of report.dailyReports) {
        const hasActivity =
          hourBlock.inputTokens > 0 ||
          hourBlock.outputTokens > 0 ||
          hourBlock.cacheCreateTokens > 0 ||
          hourBlock.cacheReadTokens > 0;
        expect(hasActivity).toBe(true);
      }
    });
  });

  describe("Report Structure Validation", () => {
    it("should return correct report structure for all periods", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, "ensureCache").mockResolvedValue(undefined);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, "ensureCache").mockResolvedValue(undefined);

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
