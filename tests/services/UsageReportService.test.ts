import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { UsageReportService } from "../../src/services/UsageReportService";

// Integration test using real usage data (anonymized)
// This test works with the actual file system and real data format

// Mock fetch for pricing data
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe("UsageReportService (Integration with Real Data)", () => {
  let service: UsageReportService;

  beforeEach(() => {
    service = new UsageReportService();
    jest.clearAllMocks();

    // Mock fetch for pricing data
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        "claude-sonnet-4-20250514": {
          input_cost_per_token: 0.000003,
          output_cost_per_token: 0.000015,
          cache_creation_input_token_cost: 0.0000035,
          cache_read_input_token_cost: 0.0000003,
        },
        "claude-haiku-3-5-20241022": {
          input_cost_per_token: 0.0000008,
          output_cost_per_token: 0.000004,
        },
      }),
    } as Response);
  });

  describe("generateReport with real usage data", () => {
    it("should generate report for today period", async () => {
      const report = await service.generateReport("today");

      expect(report.period).toBe("today");
      expect(report.startDate).toBe(new Date().toISOString().substring(0, 10));
      expect(report.endDate).toBe(new Date().toISOString().substring(0, 10));
      expect(Array.isArray(report.dailyReports)).toBe(true);
      expect(typeof report.totals.inputTokens).toBe("number");
      expect(typeof report.totals.outputTokens).toBe("number");
      expect(typeof report.totals.cacheCreateTokens).toBe("number");
      expect(typeof report.totals.cacheReadTokens).toBe("number");
      expect(typeof report.totals.costUSD).toBe("number");
      expect(Array.isArray(report.totals.models)).toBe(true);

      // Verify totals are non-negative
      expect(report.totals.inputTokens).toBeGreaterThanOrEqual(0);
      expect(report.totals.outputTokens).toBeGreaterThanOrEqual(0);
      expect(report.totals.costUSD).toBeGreaterThanOrEqual(0);

      // Verify each daily report has required structure
      for (const daily of report.dailyReports) {
        expect(typeof daily.date).toBe("string");
        expect(daily.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
        expect(typeof daily.inputTokens).toBe("number");
        expect(typeof daily.outputTokens).toBe("number");
        expect(typeof daily.cacheCreateTokens).toBe("number");
        expect(typeof daily.cacheReadTokens).toBe("number");
        expect(typeof daily.costUSD).toBe("number");
        expect(Array.isArray(daily.models)).toBe(true);
        expect(daily.totalTokens).toBe(
          daily.inputTokens +
            daily.outputTokens +
            daily.cacheCreateTokens +
            daily.cacheReadTokens,
        );
      }
    });

    it("should generate report for week period", async () => {
      const report = await service.generateReport("week");

      expect(report.period).toBe("week");
      expect(Array.isArray(report.dailyReports)).toBe(true);
      expect(report.dailyReports.length).toBeLessThanOrEqual(7); // At most 7 days

      // Verify date range makes sense
      const startDate = new Date(report.startDate);
      const endDate = new Date(report.endDate);
      expect(endDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());

      // Verify aggregation logic: totals should equal sum of daily reports
      if (report.dailyReports.length > 0) {
        const summedInput = report.dailyReports.reduce(
          (sum, d) => sum + d.inputTokens,
          0,
        );
        const summedOutput = report.dailyReports.reduce(
          (sum, d) => sum + d.outputTokens,
          0,
        );
        const summedCost = report.dailyReports.reduce(
          (sum, d) => sum + d.costUSD,
          0,
        );

        expect(report.totals.inputTokens).toBe(summedInput);
        expect(report.totals.outputTokens).toBe(summedOutput);
        expect(Math.abs(report.totals.costUSD - summedCost)).toBeLessThan(
          0.001,
        ); // Allow for floating point precision

        // Verify models aggregation
        const allModels = new Set<string>();
        for (const daily of report.dailyReports) {
          for (const model of daily.models) {
            allModels.add(model);
          }
        }
        expect(report.totals.models.sort()).toEqual([...allModels].sort());
      }
    });

    it("should generate report for month period", async () => {
      const report = await service.generateReport("month");

      expect(report.period).toBe("month");
      expect(Array.isArray(report.dailyReports)).toBe(true);
      expect(report.dailyReports.length).toBeLessThanOrEqual(31); // At most 31 days

      // Verify structure
      expect(typeof report.totals.inputTokens).toBe("number");
      expect(typeof report.totals.outputTokens).toBe("number");
      expect(typeof report.totals.costUSD).toBe("number");
      expect(Array.isArray(report.totals.models)).toBe(true);
    });

    it("should filter out synthetic models from results", async () => {
      const report = await service.generateReport("today");

      // Verify no synthetic models appear in results
      expect(report.totals.models).not.toContain("<synthetic>");

      for (const daily of report.dailyReports) {
        expect(daily.models).not.toContain("<synthetic>");
      }
    });

    it("should handle pricing fetch errors gracefully", async () => {
      // Mock fetch to fail
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Network error"),
      );

      const report = await service.generateReport("today");

      // Should still generate report structure even without pricing
      expect(report.period).toBe("today");
      expect(Array.isArray(report.dailyReports)).toBe(true);
      expect(typeof report.totals.inputTokens).toBe("number");
    });

    it("should validate period parameter", async () => {
      await expect(
        service.generateReport("invalid" as "today" | "week" | "month"),
      ).rejects.toThrow(); // Any error for invalid period
    });

    it("should handle empty usage gracefully", async () => {
      // This test uses real file system, so we can't guarantee empty usage
      // But we can verify the service handles the case where no files are found
      const report = await service.generateReport("today");

      // Even with no data, should return valid structure
      expect(report.period).toBe("today");
      expect(Array.isArray(report.dailyReports)).toBe(true);
      expect(typeof report.totals.inputTokens).toBe("number");
      expect(report.totals.inputTokens).toBeGreaterThanOrEqual(0);
    });
  });
});
