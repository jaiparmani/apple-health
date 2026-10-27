import { describe, it, expect } from "vitest";
import { computeBaseline, computeBaselines } from "../src/baselines";
import type { DailyMetrics } from "../src/types";

function day(date: string, fields: Partial<DailyMetrics>): DailyMetrics {
  return { date, receivedAt: "2026-01-01T00:00:00Z", ...fields };
}

describe("computeBaseline", () => {
  it("returns null when the metric never appears in the window", () => {
    const days = [day("2026-01-01", {}), day("2026-01-02", {})];
    expect(computeBaseline(days, "hrv", 30)).toBeNull();
  });

  it("flags insufficient history below the minimum sample/coverage threshold", () => {
    const days = Array.from({ length: 10 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, "0")}`, i < 2 ? { hrv: 30 } : {}));
    const result = computeBaseline(days, "hrv", 30)!;
    expect(result.sampleCount).toBe(2);
    expect(result.sufficient).toBe(false);
  });

  it("computes mean/median/stddev correctly for a clean series", () => {
    const values = [10, 20, 30, 40, 50];
    const days = values.map((v, i) => day(`2026-01-${String(i + 1).padStart(2, "0")}`, { steps: v }));
    const result = computeBaseline(days, "steps", 30)!;
    expect(result.mean).toBe(30);
    expect(result.median).toBe(30);
    expect(result.sampleCount).toBe(5);
    expect(result.sufficient).toBe(true);
  });

  it("detects an upward trend and a flat trend correctly", () => {
    const upDays = Array.from({ length: 10 }, (_, i) => day(`2026-02-${String(i + 1).padStart(2, "0")}`, { restingHeartRate: 50 + i * 3 }));
    expect(computeBaseline(upDays, "restingHeartRate", 30)!.trend).toBe("up");

    // Constant series: zero variance, unambiguously flat (and exercises the
    // stddev===0 guard rather than relying on a noisy pattern happening to
    // average out).
    const flatDays = Array.from({ length: 10 }, (_, i) => day(`2026-03-${String(i + 1).padStart(2, "0")}`, { restingHeartRate: 60 }));
    expect(computeBaseline(flatDays, "restingHeartRate", 30)!.trend).toBe("flat");
  });

  it("computes a z-score for the latest value relative to the window mean", () => {
    const days = [10, 10, 10, 10, 10, 10, 50].map((v, i) => day(`2026-04-${String(i + 1).padStart(2, "0")}`, { hrv: v }));
    const result = computeBaseline(days, "hrv", 30)!;
    expect(result.latest).toBe(50);
    expect(result.zScore).toBeGreaterThan(2);
  });
});

describe("computeBaselines", () => {
  it("skips metrics with no data instead of returning a null entry", () => {
    const days = [day("2026-01-01", { steps: 5000 })];
    const results = computeBaselines(days, 30);
    expect(results.every((r) => r !== null)).toBe(true);
    expect(results.some((r) => r.metric === "steps")).toBe(true);
    expect(results.some((r) => r.metric === "hrv")).toBe(false);
  });
});
