import React, { useState, useEffect, useRef, useCallback } from "react";
import Card from "../common/Card";
import { useVSCodeAPI } from "../hooks/useVSCodeAPI";

interface UsageReportPanelProps {
  disabled?: boolean;
}

type Period = "hourly" | "today" | "week" | "month";

interface UsageReport {
  date: string;
  models: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUSD: number;
}

interface PeriodUsageReport {
  period: Period;
  startDate: string;
  endDate: string;
  dailyReports: UsageReport[];
  totals: Omit<UsageReport, "date" | "models"> & { models: string[] };
}

const UsageReportPanel: React.FC<UsageReportPanelProps> = ({
  disabled = false,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("today");
  const [totalHours, setTotalHours] = useState<number>(5);
  // Get UTC hour instead of local timezone hour
  const [startHour, setStartHour] = useState<number>(new Date().getUTCHours());
  const [limitType, setLimitType] = useState<"input" | "output" | "cost">(
    "output",
  );
  const [limitValue, setLimitValue] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [report, setReport] = useState<PeriodUsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { requestUsageReport } = useVSCodeAPI();

  const getCurrentValue = (): number => {
    if (!report) {
      return 0;
    }
    switch (limitType) {
      case "input":
        return report.totals.inputTokens;
      case "output":
        return report.totals.outputTokens;
      case "cost":
        return report.totals.costUSD;
      default:
        return 0;
    }
  };

  const loadReport = useCallback(
    (period: Period, hours?: number, start?: number, silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (period === "hourly" && hours !== undefined && start !== undefined) {
        requestUsageReport(period, hours, start);
      } else {
        requestUsageReport(period);
      }

      // Add timeout to handle cases where extension doesn't respond
      timeoutRef.current = setTimeout(() => {
        setLoading(false);
        setError("Request timed out. Please try again.");
      }, 30000); // 30 second timeout
    },
    [requestUsageReport],
  );

  useEffect(() => {
    if (selectedPeriod === "hourly") {
      loadReport(selectedPeriod, totalHours, startHour);
    } else {
      loadReport(selectedPeriod);
    }
  }, [selectedPeriod, totalHours, startHour]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(
        () => {
          // Use silent mode for auto-refresh to avoid loading spinner
          if (selectedPeriod === "hourly") {
            loadReport(selectedPeriod, totalHours, startHour, true);
          } else {
            loadReport(selectedPeriod, undefined, undefined, true);
          }
        },
        5 * 60 * 1000,
      ); // 5 minutes
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedPeriod, totalHours, startHour, loadReport]);

  // Listen for usage report data from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.command === "usageReportData") {
        // Clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setLoading(false);
        setReport(message.data);
        setError(null);
      } else if (message.command === "usageReportError") {
        // Clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setLoading(false);
        setError(message.error || "Failed to load usage report");
        setReport(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatCurrency = (amount: number): string => {
    return `$${amount.toFixed(2)}`;
  };

  const getPeriodLabel = (period: Period): string => {
    switch (period) {
      case "today":
        return "Today";
      case "week":
        return "Last 7 Days";
      case "month":
        return "Last 30 Days";
      case "hourly": {
        const endHour = startHour + totalHours;
        const startDisplay =
          startHour < 0
            ? `-${Math.abs(startHour).toString().padStart(2, "0")}`
            : startHour.toString().padStart(2, "0");
        const endDisplay =
          endHour < 0
            ? `-${Math.abs(endHour).toString().padStart(2, "0")}`
            : endHour.toString().padStart(2, "0");
        return `${totalHours} Hours (${startDisplay}:00 – ${endDisplay}:00 UTC)`;
      }
    }
  };

  return (
    <div className="usage-report-panel">
      <Card>
        <div className="usage-report-header">
          <h3>Usage Report</h3>

          <div className="period-selector">
            <label htmlFor="period-select">Period:</label>
            <select
              id="period-select"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as Period)}
              disabled={disabled || loading}
              className="dropdown"
            >
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
        </div>

        {selectedPeriod === "hourly" && (
          <div className="hourly-options">
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div>
                <label htmlFor="total-hours">Total hours:</label>
                <input
                  id="total-hours"
                  type="number"
                  min="1"
                  max="24"
                  value={totalHours}
                  onChange={(e) => {
                    const newValue = Math.max(
                      1,
                      Math.min(24, parseInt(e.target.value) || 1),
                    );
                    setTotalHours(newValue);
                  }}
                  disabled={disabled || loading}
                  className="dropdown"
                  style={{
                    width: "50px",
                    textAlign: "center",
                    marginLeft: "8px",
                  }}
                />
              </div>
              <div>
                <label htmlFor="start-hour">Start:</label>
                <select
                  id="start-hour"
                  value={startHour}
                  onChange={(e) => setStartHour(parseInt(e.target.value))}
                  disabled={disabled || loading}
                  className="dropdown"
                  style={{ marginLeft: "8px", width: "70px" }}
                >
                  {Array.from({ length: 28 }, (_, i) => {
                    const hour = i - 4; // Range from -4 to 23
                    const displayValue =
                      hour < 0
                        ? `-${Math.abs(hour).toString().padStart(2, "0")}`
                        : hour.toString().padStart(2, "0");
                    return (
                      <option key={hour} value={hour}>
                        {displayValue}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div>
                <label htmlFor="limit-type">Type:</label>
                <select
                  id="limit-type"
                  value={limitType}
                  onChange={(e) =>
                    setLimitType(e.target.value as "input" | "output" | "cost")
                  }
                  disabled={disabled || loading}
                  className="dropdown"
                  style={{ marginLeft: "8px", width: "80px" }}
                >
                  <option value="input">Input</option>
                  <option value="output">Output</option>
                  <option value="cost">Cost</option>
                </select>
              </div>
              <div>
                <label htmlFor="limit-value">Value:</label>
                <input
                  id="limit-value"
                  type="number"
                  min="0"
                  value={limitValue}
                  onChange={(e) => setLimitValue(parseInt(e.target.value) || 0)}
                  disabled={disabled || loading}
                  className="dropdown"
                  style={{
                    width: "80px",
                    textAlign: "center",
                    marginLeft: "8px",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginTop: "8px",
              }}
            >
              <input
                id="auto-refresh"
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                disabled={disabled || loading}
              />
              <label htmlFor="auto-refresh" style={{ fontSize: "12px" }}>
                auto refresh
              </label>
            </div>
            {limitValue > 0 && report && (
              <div style={{ marginTop: "8px" }}>
                <div style={{ fontSize: "12px", marginBottom: "4px" }}>
                  {limitType === "input" &&
                    `Input tokens: ${report.totals.inputTokens} / ${limitValue}`}
                  {limitType === "output" &&
                    `Output tokens: ${report.totals.outputTokens} / ${limitValue}`}
                  {limitType === "cost" &&
                    `Cost: $${report.totals.costUSD.toFixed(2)} / $${limitValue}`}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    backgroundColor: "var(--vscode-progressBar-background)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (getCurrentValue() / limitValue) * 100)}%`,
                      height: "100%",
                      backgroundColor:
                        getCurrentValue() > limitValue
                          ? "var(--vscode-errorForeground)"
                          : "#4CAF50",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="state-message loading">
            <p>Loading usage data...</p>
          </div>
        )}

        {error && (
          <div className="state-message error">
            <p className="error-message">Error: {error}</p>
            <button
              onClick={() => {
                if (selectedPeriod === "hourly") {
                  loadReport(selectedPeriod, totalHours, startHour);
                } else {
                  loadReport(selectedPeriod);
                }
              }}
              disabled={disabled}
              className="button primary"
            >
              Retry
            </button>
          </div>
        )}

        {report && !loading && (
          <div className="usage-report-content">
            <div className="report-summary">
              <h4>{getPeriodLabel(selectedPeriod)} Summary</h4>
              <p className="date-range">
                {report.startDate} to {report.endDate}
              </p>
            </div>

            <div className="usage-totals">
              <div className="total-row">
                <span className="label">Models Used:</span>
                <span className="value">
                  {report.totals.models.length > 0
                    ? report.totals.models.join(", ")
                    : "None"}
                </span>
              </div>

              <div className="total-row">
                <span className="label">Input Tokens:</span>
                <span className="value">
                  {formatNumber(report.totals.inputTokens)}
                </span>
              </div>

              <div className="total-row">
                <span className="label">Output Tokens:</span>
                <span className="value">
                  {formatNumber(report.totals.outputTokens)}
                </span>
              </div>

              <div className="total-row">
                <span className="label">Cache Create:</span>
                <span className="value">
                  {formatNumber(report.totals.cacheCreateTokens)}
                </span>
              </div>

              <div className="total-row">
                <span className="label">Cache Read:</span>
                <span className="value">
                  {formatNumber(report.totals.cacheReadTokens)}
                </span>
              </div>

              <div className="total-row total-tokens">
                <span className="label">Total Tokens:</span>
                <span className="value">
                  {formatNumber(report.totals.totalTokens)}
                </span>
              </div>

              <div className="total-row total-cost">
                <span className="label">Total Cost:</span>
                <span className="value cost">
                  {formatCurrency(report.totals.costUSD)}
                </span>
              </div>
            </div>

            {report.dailyReports.length > 0 && (
              <div className="daily-breakdown">
                <h4>
                  {selectedPeriod === "hourly"
                    ? "Hourly Breakdown"
                    : "Daily Breakdown"}
                </h4>
                <div className="daily-list">
                  {report.dailyReports.map((dailyReport) => (
                    <div key={dailyReport.date} className="daily-item">
                      <div className="daily-header">
                        <span className="daily-date">{dailyReport.date}</span>
                        <span className="daily-cost">
                          {formatCurrency(dailyReport.costUSD)}
                        </span>
                      </div>

                      <div className="daily-details">
                        <div className="daily-row">
                          <span className="daily-label">Models:</span>
                          <span className="daily-value">
                            {dailyReport.models.length > 0
                              ? dailyReport.models.join(", ")
                              : "None"}
                          </span>
                        </div>

                        <div className="daily-metrics">
                          <div className="metric">
                            <span className="metric-label">Input:</span>
                            <span className="metric-value">
                              {formatNumber(dailyReport.inputTokens)}
                            </span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Output:</span>
                            <span className="metric-value">
                              {formatNumber(dailyReport.outputTokens)}
                            </span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Cache C:</span>
                            <span className="metric-value">
                              {formatNumber(dailyReport.cacheCreateTokens)}
                            </span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Cache R:</span>
                            <span className="metric-value">
                              {formatNumber(dailyReport.cacheReadTokens)}
                            </span>
                          </div>
                        </div>

                        <div className="daily-total">
                          <span className="total-label">Total Tokens:</span>
                          <span className="total-value">
                            {formatNumber(dailyReport.totalTokens)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.dailyReports.length === 0 && (
              <div className="state-message no-data">
                <p>No usage data found for the selected period.</p>
                <p className="help-text">
                  Usage data is stored in <code>~/.claude/projects/</code>. Make
                  sure you have used Claude Code recently to see data here.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default React.memo(UsageReportPanel);
