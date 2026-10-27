import { describe, it, expect } from "vitest";
import { computeCoverage } from "../src/coverage";
import type { DailyMetrics } from "../src/types";

function day(date: string, fields: Partial<DailyMetrics>): DailyMetrics {
  return { date, receivedAt: "2026-01-01T00:00:00Z", ...fields };
}

describe("computeCoverage", () => {
  it("returns an empty report for no data", () => {
    const report = computeCoverage([]);
    expect(report.totalDays).toBe(0);
    expect(report.dateRange).toBeNull();
    expect(report.metrics).toEqual([]);
  });

  it("computes per-metric coverage, first/last seen, and ignores metadata fields", () => {
    const days = [
      day("2026-01-01", { steps: 1000 }),
      day("2026-01-02", { steps: 2000, hrv: 30 }),
      day("2026-01-03", { steps: 3000 }),
      day("2026-01-04", { steps: 4000, hrv: 35, extra: { Foo: 1 } }),
    ];
    const report = computeCoverage(days);
    expect(report.totalDays).toBe(4);
    expect(report.dateRange).toEqual({ start: "2026-01-01", end: "2026-01-04" });

    const steps = report.metrics.find((m) => m.metric === "steps")!;
    expect(steps.daysPresent).toBe(4);
    expect(steps.coveragePct).toBe(1);

    const hrv = report.metrics.find((m) => m.metric === "hrv")!;
    expect(hrv.daysPresent).toBe(2);
    expect(hrv.coveragePct).toBe(0.5);
    expect(hrv.firstSeen).toBe("2026-01-02");
    expect(hrv.lastSeen).toBe("2026-01-04");

    // "extra" and "date"/"receivedAt"/"source" are bookkeeping, not metrics.
    expect(report.metrics.some((m) => m.metric === "extra")).toBe(false);
    expect(report.metrics.some((m) => m.metric === "date")).toBe(false);
  });

  it("flags a metric as stale when it hasn't appeared near the most recent day", () => {
    const days = [
      day("2026-01-01", { hrv: 30, steps: 1000 }),
      day("2026-01-15", { steps: 2000 }),
      day("2026-02-01", { steps: 3000 }),
    ];
    const report = computeCoverage(days);
    const hrv = report.metrics.find((m) => m.metric === "hrv")!;
    expect(hrv.staleDays).toBe(31); // 2026-01-01 to 2026-02-01
  });
});
