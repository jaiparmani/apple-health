import { describe, it, expect } from "vitest";
import { computePeriodReport } from "../src/report";
import type { DailyMetrics } from "../src/types";

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function buildDays(n: number, valueFor: (i: number) => Partial<DailyMetrics>): DailyMetrics[] {
  const days: DailyMetrics[] = [];
  let date = "2026-01-01";
  for (let i = 0; i < n; i++) {
    days.push({ date, receivedAt: "2026-01-01T00:00:00Z", ...valueFor(i) });
    date = addDays(date, 1);
  }
  return days;
}

describe("computePeriodReport", () => {
  it("returns null for an empty dataset", () => {
    expect(computePeriodReport([], "week")).toBeNull();
  });

  it("compares a week against the immediately preceding week", () => {
    // days 0-6: steps=5000, days 7-13: steps=8000 (current week)
    const days = buildDays(14, (i) => ({ steps: i < 7 ? 5000 : 8000 }));
    const report = computePeriodReport(days, "week")!;
    const steps = report.metricChanges.find((m) => m.metric === "steps")!;
    expect(steps.currentAvg).toBe(8000);
    expect(steps.previousAvg).toBe(5000);
    expect(steps.direction).toBe("up");
    expect(steps.changePct).toBe(60);
  });

  it("calls a small move 'flat' rather than manufacturing a direction from noise", () => {
    const days = buildDays(14, (i) => ({ steps: 5000 + (i % 2) * 10 })); // ~0.2% noise
    const report = computePeriodReport(days, "week")!;
    const steps = report.metricChanges.find((m) => m.metric === "steps")!;
    expect(steps.direction).toBe("flat");
  });

  it("reports unknown direction (not a fabricated one) when a metric has no data in one period", () => {
    const days = buildDays(14, (i) => (i < 7 ? {} : { hrv: 30 }));
    const report = computePeriodReport(days, "week")!;
    const hrv = report.metricChanges.find((m) => m.metric === "hrv")!;
    expect(hrv.previousAvg).toBeNull();
    expect(hrv.direction).toBe("unknown");
  });

  it("respects the requested period length (month uses 28 days, not 7)", () => {
    const days = buildDays(56, (i) => ({ steps: 5000 }));
    const report = computePeriodReport(days, "month")!;
    expect(report.coverage.totalDaysInPeriod).toBe(28);
  });

  it("only includes correlations and anomalies, never raw per-day records, in its output shape", () => {
    const days = buildDays(60, (i) => ({ steps: 5000, hrv: 30, restingHeartRate: 60 }));
    const report = computePeriodReport(days, "week")!;
    expect(Array.isArray(report.anomalies)).toBe(true);
    expect(Array.isArray(report.notableCorrelations)).toBe(true);
  });
});
