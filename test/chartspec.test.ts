import { describe, it, expect } from "vitest";
import { sanitizeChartSpec, buildChartData } from "../src/chartspec";
import type { DailyMetrics } from "../src/types";

function day(date: string, fields: Partial<DailyMetrics>): DailyMetrics {
  return { date, receivedAt: "2026-01-01T00:00:00Z", ...fields };
}

const days = [
  day("2026-01-01", { steps: 1000, hrv: 20 }),
  day("2026-01-02", { steps: 2000, hrv: 25 }),
  day("2026-01-03", { steps: 3000 }),
];

describe("sanitizeChartSpec", () => {
  it("drops unknown metrics instead of substituting or inventing one", () => {
    const spec = sanitizeChartSpec(days, { metrics: ["steps", "madeUpMetric"], type: "line" });
    expect(spec!.metrics).toEqual(["steps"]);
  });

  it("returns null when every requested metric is unknown", () => {
    const spec = sanitizeChartSpec(days, { metrics: ["madeUpMetric"] });
    expect(spec).toBeNull();
  });

  it("falls back to 'line' for an invalid chart type instead of throwing", () => {
    const spec = sanitizeChartSpec(days, { metrics: ["steps"], type: "pie" as never });
    expect(spec!.type).toBe("line");
  });

  it("caps the metric count at 3", () => {
    const spec = sanitizeChartSpec(days, { metrics: ["steps", "hrv", "restingHeartRate", "vo2max", "weightKg"] });
    expect(spec!.metrics.length).toBe(3);
  });

  it("clamps the date range to the dataset's actual bounds", () => {
    const spec = sanitizeChartSpec(days, { metrics: ["steps"], startDate: "2000-01-01", endDate: "2099-01-01" });
    expect(spec!.startDate).toBe("2026-01-01");
    expect(spec!.endDate).toBe("2026-01-03");
  });

  it("generates a default title from the metrics when none is given", () => {
    const spec = sanitizeChartSpec(days, { metrics: ["steps", "hrv"] });
    expect(spec!.title).toBe("steps vs hrv");
  });
});

describe("buildChartData", () => {
  it("aligns each series to the same date labels, with null for missing days", () => {
    const spec = sanitizeChartSpec(days, { metrics: ["steps", "hrv"] })!;
    const data = buildChartData(days, spec);
    expect(data.labels).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    const hrvSeries = data.series.find((s) => s.metric === "hrv")!;
    expect(hrvSeries.values).toEqual([20, 25, null]); // day 3 has no hrv
  });

  it("never fabricates a data point outside the requested range", () => {
    const spec = { title: "t", type: "line" as const, metrics: ["steps"], startDate: "2026-01-02", endDate: "2026-01-02" };
    const data = buildChartData(days, spec);
    expect(data.labels).toEqual(["2026-01-02"]);
  });
});
