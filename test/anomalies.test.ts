import { describe, it, expect } from "vitest";
import { detectAnomalies } from "../src/anomalies";
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

describe("detectAnomalies", () => {
  it("returns nothing when there isn't enough history for a baseline", () => {
    const days = buildDays(10, () => ({ restingHeartRate: 60 }));
    expect(detectAnomalies(days)).toEqual([]);
  });

  it("flags a clear spike in the recent window against a stable baseline", () => {
    const days = buildDays(50, (i) => ({ restingHeartRate: i === 45 ? 100 : 60 + (i % 2) }));
    const anomalies = detectAnomalies(days);
    const rhrAnomaly = anomalies.find((a) => a.metric === "restingHeartRate" && a.date === days[45].date);
    expect(rhrAnomaly).toBeDefined();
    expect(rhrAnomaly!.direction).toBe("above");
    expect(Math.abs(rhrAnomaly!.zScore)).toBeGreaterThan(2);
  });

  it("does not flag normal day-to-day noise within baseline range", () => {
    const days = buildDays(50, (i) => ({ restingHeartRate: 60 + ((i * 7) % 5) })); // 60-64, no real outliers
    const anomalies = detectAnomalies(days).filter((a) => a.metric === "restingHeartRate");
    expect(anomalies.length).toBe(0);
  });

  it("never uses the candidate day's own value to build its baseline", () => {
    // 40 days with small natural jitter (so baseline stddev isn't zero,
    // which would otherwise make computeBaseline skip the metric entirely),
    // then one extreme day. The baseline for that day must be computed from
    // the prior 30 days, not shifted by including itself.
    const days = buildDays(45, (i) => ({ hrv: i === 40 ? 200 : 30 + (i % 3) }));
    const anomalies = detectAnomalies(days);
    const hrvAnomaly = anomalies.find((a) => a.metric === "hrv" && a.date === days[40].date);
    expect(hrvAnomaly).toBeDefined();
    expect(hrvAnomaly!.baselineMean).toBeCloseTo(31, 0);
  });
});
