import { describe, it, expect } from "vitest";
import { computeCorrelation, computeCorrelations, type CorrelationPairDef } from "../src/correlations";
import type { DailyMetrics } from "../src/types";

function day(date: string, fields: Partial<DailyMetrics>): DailyMetrics {
  return { date, receivedAt: "2026-01-01T00:00:00Z", ...fields };
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

describe("computeCorrelation", () => {
  const def: CorrelationPairDef = {
    id: "test_pair",
    label: "A -> next-day B",
    metricA: "sleepHours",
    metricB: "hrv",
    lagDays: 1,
    hypothesis: "test",
  };

  it("reports insufficient_data below the minimum sample size", () => {
    const days = Array.from({ length: 5 }, (_, i) => day(`2026-01-0${i + 1}`, { sleepHours: 7, hrv: 30 }));
    const result = computeCorrelation(days, def);
    expect(result.strength).toBe("insufficient_data");
    expect(result.r).toBeNull();
  });

  it("detects a strong positive correlation with the correct lag alignment", () => {
    const days: DailyMetrics[] = [];
    let date = "2026-01-01";
    for (let i = 0; i < 20; i++) {
      const sleep = 6 + (i % 3);
      days.push(day(date, { sleepHours: sleep }));
      date = addDays(date, 1);
    }
    // next day's HRV tracks sleep exactly (perfect correlation, lag 1)
    for (let i = 1; i < days.length; i++) {
      days[i].hrv = 20 + (days[i - 1].sleepHours as number) * 5;
    }
    const result = computeCorrelation(days, def);
    expect(result.strength).toBe("strong");
    expect(result.direction).toBe("positive");
    expect(result.r).toBeGreaterThan(0.9);
  });

  it("calls a near-zero relationship negligible, not a false discovery", () => {
    // Two independent pseudo-random sequences (different multipliers/moduli,
    // so neither is a phase-shifted copy of the other) — any correlation
    // here is sampling noise, not signal.
    const days: DailyMetrics[] = [];
    let date = "2026-01-01";
    for (let i = 0; i < 40; i++) {
      const sleep = 6 + ((i * 37) % 11) * 0.2;
      const hrv = 25 + ((i * 53 + 7) % 13) * 1.3;
      days.push(day(date, { sleepHours: sleep, hrv }));
      date = addDays(date, 1);
    }
    const result = computeCorrelation(days, def);
    expect(["negligible", "weak"]).toContain(result.strength);
  });
});

describe("computeCorrelations", () => {
  it("runs every defined pair without throwing on an empty dataset", () => {
    const results = computeCorrelations([]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.strength === "insufficient_data")).toBe(true);
  });
});
