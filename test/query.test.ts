import { describe, it, expect } from "vitest";
import { runQuery, clampDateRange, QUERYABLE_METRICS } from "../src/query";
import type { DailyMetrics } from "../src/types";

function day(date: string, fields: Partial<DailyMetrics>): DailyMetrics {
  return { date, receivedAt: "2026-01-01T00:00:00Z", ...fields };
}

const days = [
  day("2026-01-01", { steps: 1000, hrv: 20 }),
  day("2026-01-02", { steps: 2000, hrv: 25 }),
  day("2026-01-03", { steps: 3000, hrv: 30 }),
  day("2026-01-04", { steps: 4000 }), // no hrv this day
];

describe("clampDateRange", () => {
  it("clamps an out-of-range request to the dataset's actual bounds", () => {
    const { start, end } = clampDateRange(days, "2020-01-01", "2099-01-01");
    expect(start).toBe("2026-01-01");
    expect(end).toBe("2026-01-04");
  });

  it("swaps start/end if given reversed", () => {
    const { start, end } = clampDateRange(days, "2026-01-04", "2026-01-01");
    expect(start).toBe("2026-01-01");
    expect(end).toBe("2026-01-04");
  });
});

describe("runQuery", () => {
  it("computes average correctly and reports sample count", () => {
    const result = runQuery(days, { metric: "steps", startDate: "2026-01-01", endDate: "2026-01-04", aggregation: "average" });
    expect(result.value).toBe(2500);
    expect(result.sampleCount).toBe(4);
  });

  it("computes sum correctly", () => {
    const result = runQuery(days, { metric: "steps", startDate: "2026-01-01", endDate: "2026-01-04", aggregation: "sum" });
    expect(result.value).toBe(10000);
  });

  it("finds min/max with the correct date attached", () => {
    const max = runQuery(days, { metric: "hrv", startDate: "2026-01-01", endDate: "2026-01-04", aggregation: "max" });
    expect(max.value).toBe(30);
    expect(max.bestDate).toBe("2026-01-03");

    const min = runQuery(days, { metric: "hrv", startDate: "2026-01-01", endDate: "2026-01-04", aggregation: "min" });
    expect(min.value).toBe(20);
    expect(min.bestDate).toBe("2026-01-01");
  });

  it("computes a trend direction and the raw change", () => {
    const result = runQuery(days, { metric: "hrv", startDate: "2026-01-01", endDate: "2026-01-04", aggregation: "trend" });
    expect(result.trendDirection).toBe("up");
    expect(result.trendChange).toBe(10);
  });

  it("returns a clear note instead of a fabricated value when there's no data", () => {
    const result = runQuery(days, { metric: "vo2max", startDate: "2026-01-01", endDate: "2026-01-04", aggregation: "average" });
    expect(result.value).toBeNull();
    expect(result.sampleCount).toBe(0);
    expect(result.note).toBeTruthy();
  });

  it("only counts samples that actually have the metric, not every day in range", () => {
    const result = runQuery(days, { metric: "hrv", startDate: "2026-01-01", endDate: "2026-01-04", aggregation: "count" });
    expect(result.value).toBe(3); // day 4 has no hrv
  });
});

describe("QUERYABLE_METRICS", () => {
  it("is non-empty and contains no duplicates", () => {
    expect(QUERYABLE_METRICS.length).toBeGreaterThan(0);
    expect(new Set(QUERYABLE_METRICS).size).toBe(QUERYABLE_METRICS.length);
  });
});
