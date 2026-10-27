import { describe, it, expect } from "vitest";
import { computeExperimentResult, type Experiment } from "../src/experiments";
import type { DailyMetrics } from "../src/types";

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function buildDays(n: number, start: string, valueFor: (i: number) => Partial<DailyMetrics>): DailyMetrics[] {
  const days: DailyMetrics[] = [];
  let date = start;
  for (let i = 0; i < n; i++) {
    days.push({ date, receivedAt: "2026-01-01T00:00:00Z", ...valueFor(i) });
    date = addDays(date, 1);
  }
  return days;
}

describe("computeExperimentResult", () => {
  it("compares the experiment period against an equal-length baseline immediately before it", () => {
    // 20 days before start: hrv=30. 10 days from start: hrv=40.
    const before = buildDays(20, "2026-01-01", () => ({ hrv: 30 }));
    const after = buildDays(10, "2026-01-21", () => ({ hrv: 40 }));
    const days = [...before, ...after];

    const exp: Experiment = { id: "e1", title: "test", metric: "hrv", startDate: "2026-01-21", adherenceDates: [] };
    const result = computeExperimentResult(days, exp);

    expect(result.baselineAvg).toBe(30);
    expect(result.duringAvg).toBe(40);
    expect(result.direction).toBe("up");
    expect(result.changePct).toBeCloseTo(33.3, 0);
  });

  it("calls a tiny move 'flat' rather than up/down", () => {
    const before = buildDays(10, "2026-02-01", () => ({ steps: 5000 }));
    const after = buildDays(5, "2026-02-11", () => ({ steps: 5010 }));
    const exp: Experiment = { id: "e2", title: "test", metric: "steps", startDate: "2026-02-11", adherenceDates: [] };
    const result = computeExperimentResult([...before, ...after], exp);
    expect(result.direction).toBe("flat");
  });

  it("reports unknown direction when there's no baseline data at all", () => {
    const after = buildDays(5, "2026-03-01", () => ({ hrv: 35 }));
    const exp: Experiment = { id: "e3", title: "test", metric: "hrv", startDate: "2026-03-01", adherenceDates: [] };
    const result = computeExperimentResult(after, exp);
    expect(result.baselineAvg).toBeNull();
    expect(result.direction).toBe("unknown");
  });

  it("caps adherence at 100% even if more dates were logged than days elapsed", () => {
    const days = buildDays(10, "2026-04-01", () => ({ hrv: 30 }));
    const exp: Experiment = {
      id: "e4",
      title: "test",
      metric: "hrv",
      startDate: "2026-04-01",
      adherenceDates: ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10", "2026-04-11"],
    };
    const result = computeExperimentResult(days, exp);
    expect(result.adherencePct).toBeLessThanOrEqual(100);
  });

  it("always includes the confounder caveat", () => {
    const days = buildDays(5, "2026-05-01", () => ({ hrv: 30 }));
    const exp: Experiment = { id: "e5", title: "test", metric: "hrv", startDate: "2026-05-01", adherenceDates: [] };
    const result = computeExperimentResult(days, exp);
    expect(result.confounderNote).toMatch(/not a controlled experiment/i);
  });
});
