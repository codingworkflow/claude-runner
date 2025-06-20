import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { homedir } from "os";
import path from "path";
import { glob } from "glob";

// Types for usage data
export interface UsageData {
  timestamp: string;
  version?: string;
  message: {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    model?: string;
    id?: string;
  };
  costUSD?: number;
  requestId?: string;
}

export interface ModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
}

export interface UsageReport {
  date: string;
  models: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUSD: number;
}

export interface PeriodUsageReport {
  period: "today" | "week" | "month";
  startDate: string;
  endDate: string;
  dailyReports: UsageReport[];
  totals: Omit<UsageReport, "date" | "models"> & { models: string[] };
}

interface HourlyUsage {
  hour: string; // "2025-06-19T14:00:00.000Z"
  models: Record<
    string,
    {
      input: number;
      output: number;
      cacheCreate: number;
      cacheRead: number;
      cost: number;
    }
  >;
}

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

export class UsageReportService {
  private cachedPricing: Map<string, ModelPricing> | null = null;
  private pricingCacheTime: number = 0;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {}

  // ----------  cache paths ----------
  private getUsageDir(): string {
    return path.join(homedir(), ".claude", "usage");
  }

  private getHourlyDir(): string {
    return path.join(this.getUsageDir(), "hourly");
  }

  private getMetaPath(): string {
    return path.join(this.getUsageDir(), "meta.json");
  }

  // ----------  meta helpers ----------
  private async readMeta(): Promise<{ last?: string }> {
    try {
      return JSON.parse(await readFile(this.getMetaPath(), "utf8"));
    } catch {
      return {};
    }
  }

  private async writeMeta(last: string): Promise<void> {
    await mkdir(this.getUsageDir(), { recursive: true });
    await writeFile(this.getMetaPath(), JSON.stringify({ last }));
  }

  // ----------  hourly I/O ----------
  private hourlyFilename(dt: Date): string {
    return path.join(
      this.getHourlyDir(),
      `${dt.toISOString().slice(0, 13)}.json`,
    ); // YYYY-MM-DDTHH
  }

  private async appendToHourly(
    hour: string,
    delta: HourlyUsage,
  ): Promise<void> {
    const fp = this.hourlyFilename(new Date(hour));
    await mkdir(this.getHourlyDir(), { recursive: true });

    let current: HourlyUsage;
    try {
      const content = await readFile(fp, "utf8");
      current = content.trim() ? JSON.parse(content) : { hour, models: {} };
    } catch {
      current = { hour, models: {} };
    }

    // merge per-model numbers
    for (const [model, m] of Object.entries(delta.models)) {
      const tgt = (current.models[model] ||= {
        input: 0,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        cost: 0,
      });
      tgt.input += m.input;
      tgt.output += m.output;
      tgt.cacheCreate += m.cacheCreate;
      tgt.cacheRead += m.cacheRead;
      tgt.cost += m.cost;
    }
    await writeFile(fp, JSON.stringify(current));
  }

  private async fetchPricing(): Promise<Map<string, ModelPricing>> {
    const now = Date.now();

    // Return cached pricing if still valid
    if (
      this.cachedPricing &&
      now - this.pricingCacheTime < this.CACHE_DURATION
    ) {
      return this.cachedPricing;
    }

    try {
      const response = await fetch(LITELLM_PRICING_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch pricing data: ${response.statusText}`);
      }

      const data = await response.json();
      const pricing = new Map<string, ModelPricing>();

      for (const [modelName, modelData] of Object.entries(
        data as Record<string, unknown>,
      )) {
        if (typeof modelData === "object" && modelData !== null) {
          // Validate and extract pricing data
          const pricingData: ModelPricing = {};
          const model = modelData as Record<string, unknown>;
          if (typeof model.input_cost_per_token === "number") {
            pricingData.input_cost_per_token = model.input_cost_per_token;
          }
          if (typeof model.output_cost_per_token === "number") {
            pricingData.output_cost_per_token = model.output_cost_per_token;
          }
          if (typeof model.cache_creation_input_token_cost === "number") {
            pricingData.cache_creation_input_token_cost =
              model.cache_creation_input_token_cost;
          }
          if (typeof model.cache_read_input_token_cost === "number") {
            pricingData.cache_read_input_token_cost =
              model.cache_read_input_token_cost;
          }

          if (Object.keys(pricingData).length > 0) {
            pricing.set(modelName, pricingData);
          }
        }
      }

      this.cachedPricing = pricing;
      this.pricingCacheTime = now;
      return pricing;
    } catch (error) {
      console.error("Failed to fetch model pricing:", error);
      // Return empty map on error to prevent crashes
      if (!this.cachedPricing) {
        this.cachedPricing = new Map();
      }
      return this.cachedPricing;
    }
  }

  private async getModelPricing(
    modelName: string,
  ): Promise<ModelPricing | null> {
    const pricing = await this.fetchPricing();

    // Direct match
    const directMatch = pricing.get(modelName);
    if (directMatch) {
      return directMatch;
    }

    // Try with provider prefix variations
    const variations = [
      modelName,
      `anthropic/${modelName}`,
      `claude-3-5-${modelName}`,
      `claude-3-${modelName}`,
      `claude-${modelName}`,
    ];

    for (const variant of variations) {
      const match = pricing.get(variant);
      if (match) {
        return match;
      }
    }

    // Try partial matches
    const lowerModel = modelName.toLowerCase();
    for (const [key, value] of pricing) {
      if (
        key.toLowerCase().includes(lowerModel) ||
        lowerModel.includes(key.toLowerCase())
      ) {
        return value;
      }
    }

    return null;
  }

  private async calculateCost(
    usage: UsageData["message"]["usage"],
    modelName: string,
  ): Promise<number> {
    const pricing = await this.getModelPricing(modelName);
    if (!pricing) {
      return 0;
    }

    let cost = 0;

    if (pricing.input_cost_per_token) {
      cost += usage.input_tokens * pricing.input_cost_per_token;
    }

    if (pricing.output_cost_per_token) {
      cost += usage.output_tokens * pricing.output_cost_per_token;
    }

    if (
      usage.cache_creation_input_tokens &&
      pricing.cache_creation_input_token_cost
    ) {
      cost +=
        usage.cache_creation_input_tokens *
        pricing.cache_creation_input_token_cost;
    }

    if (usage.cache_read_input_tokens && pricing.cache_read_input_token_cost) {
      cost +=
        usage.cache_read_input_tokens * pricing.cache_read_input_token_cost;
    }

    return cost;
  }

  private getDefaultClaudePath(): string {
    return path.join(homedir(), ".claude");
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private createUniqueHash(data: UsageData): string | null {
    const messageId = data.message.id;
    const requestId = data.requestId;

    if (!messageId || !requestId) {
      return null;
    }

    return `${messageId}:${requestId}`;
  }

  private async readNewLines(since: Date): Promise<UsageData[]> {
    const claudePath = this.getDefaultClaudePath();
    const claudeDir = path.join(claudePath, "projects");

    try {
      const files = await glob("**/*.jsonl", {
        cwd: claudeDir,
        absolute: true,
      });

      if (files.length === 0) {
        return [];
      }

      const processedHashes = new Set<string>();
      const newEntries: UsageData[] = [];

      for (const file of files) {
        try {
          // 🚀 FAST EXIT – file hasn't changed since we last saw it
          const { mtime } = await stat(file);
          if (mtime <= since) {
            continue;
          }

          const content = await readFile(file, "utf-8");
          const lines = content
            .trim()
            .split("\n")
            .filter((line) => line.length > 0);

          for (const line of lines) {
            try {
              const data = JSON.parse(line) as UsageData;

              // Basic validation
              if (!data.timestamp || !data.message?.usage) {
                continue;
              }

              // Skip entries older than since
              const entryDate = new Date(data.timestamp);
              if (entryDate <= since) {
                continue;
              }

              // Check for duplicates
              const uniqueHash = this.createUniqueHash(data);
              if (uniqueHash && processedHashes.has(uniqueHash)) {
                continue;
              }

              if (uniqueHash) {
                processedHashes.add(uniqueHash);
              }

              newEntries.push(data);
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return newEntries;
    } catch (error) {
      console.error("Failed to read new usage data:", error);
      return [];
    }
  }

  private async loadUsageData(): Promise<UsageData[]> {
    const meta = await this.readMeta();
    const since = meta.last ? new Date(meta.last) : new Date(0);

    const rawLines = await this.readNewLines(since);
    if (rawLines.length === 0) {
      return [];
    }

    const byHour: Record<string, HourlyUsage> = {};
    let newest = since;

    for (const entry of rawLines) {
      const ts = new Date(entry.timestamp);
      if (ts > newest) {
        newest = ts;
      }
      const hourIso = ts.toISOString().slice(0, 13) + ":00:00.000Z";

      const m = entry.message.model ?? "unknown";
      byHour[hourIso] ??= { hour: hourIso, models: {} };
      const agg = (byHour[hourIso].models[m] ||= {
        input: 0,
        output: 0,
        cacheCreate: 0,
        cacheRead: 0,
        cost: 0,
      });

      agg.input += entry.message.usage.input_tokens;
      agg.output += entry.message.usage.output_tokens;
      agg.cacheCreate += entry.message.usage.cache_creation_input_tokens ?? 0;
      agg.cacheRead += entry.message.usage.cache_read_input_tokens ?? 0;
      agg.cost +=
        entry.costUSD ?? (await this.calculateCost(entry.message.usage, m));
    }

    // persist each hour block
    for (const h of Object.values(byHour)) {
      await this.appendToHourly(h.hour, h);
    }

    await this.writeMeta(newest.toISOString());
    return [];
  }

  /**
   * Make sure the on-disk hourly cache is current.
   * `loadUsageData()` already performs a meta-timestamp check internally,
   * so calling it once is enough – if there is nothing new it returns almost
   * immediately, otherwise it processes the fresh lines and updates meta.
   */
  private async ensureCache(): Promise<void> {
    await this.loadUsageData(); // single scan, single write
  }

  public async generateReport(
    period: "today" | "week" | "month",
  ): Promise<PeriodUsageReport> {
    // Bring the hourly cache up to date (cheap no-op when unchanged)
    await this.ensureCache();

    const now = new Date();
    let startDate: Date;
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    switch (period) {
      case "today":
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "month":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    // locate which hour files fall in [startDate, endDate]
    const hours: string[] = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setHours(d.getHours() + 1)
    ) {
      hours.push(this.hourlyFilename(d));
    }

    const hourlyData: HourlyUsage[] = [];
    for (const fp of hours) {
      try {
        hourlyData.push(JSON.parse(await readFile(fp, "utf8")));
      } catch {
        /* missing hour – user idle, safe to ignore */
      }
    }

    // Group hourly data by date
    const dailyData = new Map<string, HourlyUsage[]>();
    for (const hourData of hourlyData) {
      const date = this.formatDate(hourData.hour);
      if (!dailyData.has(date)) {
        dailyData.set(date, []);
      }
      dailyData.get(date)?.push(hourData);
    }

    // Generate daily reports
    const dailyReports: UsageReport[] = [];
    const allModels = new Set<string>();

    for (const [date, hours] of dailyData) {
      const modelStats = new Map<
        string,
        {
          inputTokens: number;
          outputTokens: number;
          cacheCreateTokens: number;
          cacheReadTokens: number;
          cost: number;
        }
      >();

      for (const hourData of hours) {
        for (const [model, stats] of Object.entries(hourData.models)) {
          if (model !== "<synthetic>") {
            allModels.add(model);
          }

          const existing = modelStats.get(model) ?? {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0,
            cost: 0,
          };

          modelStats.set(model, {
            inputTokens: existing.inputTokens + stats.input,
            outputTokens: existing.outputTokens + stats.output,
            cacheCreateTokens: existing.cacheCreateTokens + stats.cacheCreate,
            cacheReadTokens: existing.cacheReadTokens + stats.cacheRead,
            cost: existing.cost + stats.cost,
          });
        }
      }

      // Aggregate totals for the day
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheCreateTokens = 0;
      let totalCacheReadTokens = 0;
      let totalCost = 0;
      const modelsUsed: string[] = [];

      for (const [model, stats] of modelStats) {
        if (model !== "<synthetic>") {
          modelsUsed.push(model);
        }
        totalInputTokens += stats.inputTokens;
        totalOutputTokens += stats.outputTokens;
        totalCacheCreateTokens += stats.cacheCreateTokens;
        totalCacheReadTokens += stats.cacheReadTokens;
        totalCost += stats.cost;
      }

      const totalTokens =
        totalInputTokens +
        totalOutputTokens +
        totalCacheCreateTokens +
        totalCacheReadTokens;

      dailyReports.push({
        date,
        models: modelsUsed.filter((m) => m !== "unknown"),
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheCreateTokens: totalCacheCreateTokens,
        cacheReadTokens: totalCacheReadTokens,
        totalTokens,
        costUSD: totalCost,
      });
    }

    // Sort by date
    dailyReports.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate totals
    const totals = dailyReports.reduce(
      (acc, report) => ({
        inputTokens: acc.inputTokens + report.inputTokens,
        outputTokens: acc.outputTokens + report.outputTokens,
        cacheCreateTokens: acc.cacheCreateTokens + report.cacheCreateTokens,
        cacheReadTokens: acc.cacheReadTokens + report.cacheReadTokens,
        totalTokens: acc.totalTokens + report.totalTokens,
        costUSD: acc.costUSD + report.costUSD,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreateTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        costUSD: 0,
      },
    );

    return {
      period,
      startDate: this.formatDate(startDate.toISOString()),
      endDate: this.formatDate(endDate.toISOString()),
      dailyReports,
      totals: {
        ...totals,
        models: Array.from(allModels).filter(
          (m) => m !== "unknown" && m !== "<synthetic>",
        ),
      },
    };
  }
}
