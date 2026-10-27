import { describe, it, expect } from "vitest";
import { computeOverview, computeHealthScore, computeHighlights, computeWeek, computeMonthly, computeWeekdayPattern } from "../src/overview";
import { computeFitnessReport } from "../src/fitness";
import { computeTrends } from "../src/trends";
import type { DailyMetrics, UserProfile } from "../src/types";

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function buildDays(n: number, valueFor: (i: number) => Partial<DailyMetrics>, start = "2026-01-01"): DailyMetrics[] {
  const days: DailyMetrics[] = [];
  let date = start;
  for (let i = 0; i < n; i++) {
    days.push({ date, receivedAt: "", ...valueFor(i) });
    date = addDays(date, 1);
  }
  return days;
}

const profile: UserProfile = { birthDate: "1990-01-01", sex: "male", heightCm: 180 };

function overviewOf(days: DailyMetrics[]) {
  return computeOverview(days, computeTrends(days), computeFitnessReport(days, profile), profile);
}

describe("computeHealthScore", () => {
  it("leaves out areas without data instead of scoring them zero", () => {
    const days = buildDays(30, () => ({ steps: 9000, exerciseMinutes: 30 }));
    const s = computeHealthScore(days, computeTrends(days), computeFitnessReport(days, profile), profile);
    expect(s.parts.find((p) => p.key === "sleep")!.score).toBeNull();
    expect(s.parts.find((p) => p.key === "activity")!.score).toBe(100);
    expect(s.overall).toBe(100);
  });

  it("scores short sleep lower than on-target sleep", () => {
    const short = buildDays(10, () => ({ sleepHours: 5.5 }));
    const good = buildDays(10, () => ({ sleepHours: 7.8 }));
    const sleepScore = (d: DailyMetrics[]) =>
      computeHealthScore(d, computeTrends(d), computeFitnessReport(d, profile), profile).parts.find((p) => p.key === "sleep")!.score!;
    expect(sleepScore(short)).toBeLessThan(sleepScore(good));
    expect(sleepScore(good)).toBe(100);
  });

  it("handles an empty dataset", () => {
    expect(overviewOf([]).score.overall).toBeNull();
  });
});

describe("computeHighlights", () => {
  it("calls a step increase a win and a resting-HR increase a watch", () => {
    const days = buildDays(14, (i) => (i < 7 ? { steps: 5000, restingHeartRate: 55 } : { steps: 8000, restingHeartRate: 62 }));
    const h = computeHighlights(days, computeTrends(days), computeFitnessReport(days, profile));
    expect(h.find((x) => x.title.startsWith("Daily steps up"))!.tone).toBe("win");
    expect(h.find((x) => x.title.startsWith("Resting heart rate up"))!.tone).toBe("watch");
  });

  it("reports a step streak", () => {
    const days = buildDays(10, (i) => ({ steps: i < 5 ? 3000 : 9000 }));
    const h = computeHighlights(days, computeTrends(days), computeFitnessReport(days, profile));
    expect(h.some((x) => x.title === "5-day streak of 8,000+ steps")).toBe(true);
  });

  it("is capped at a readable length", () => {
    const days = buildDays(120, (i) => ({ steps: 4000 + (i % 7) * 2000 + i * 30, exerciseMinutes: i % 3 ? 10 : 60, hrv: 40 + (i % 9), restingHeartRate: 60 - (i % 4) }));
    expect(computeHighlights(days, computeTrends(days), computeFitnessReport(days, profile)).length).toBeLessThanOrEqual(10);
  });
});

describe("computeWeek", () => {
  it("returns 7 calendar days ending on the latest day, with rings counted", () => {
    const days = buildDays(3, () => ({ steps: 9000, activeEnergy: 500, activeEnergyGoal: 400, exerciseMinutes: 10, exerciseMinutesGoal: 30 }));
    const w = computeWeek(days, 36);
    expect(w).toHaveLength(7);
    expect(w[6].date).toBe(days[2].date);
    expect(w[0].steps).toBeNull();
    expect(w[6].ringsClosed).toBe(1);
    expect(w[6].ringsTracked).toBe(2);
  });
});

describe("computeMonthly / computeWeekdayPattern", () => {
  it("averages by calendar month, last 12 only", () => {
    const days = buildDays(500, () => ({ steps: 7000 }));
    const m = computeMonthly(days);
    expect(m).toHaveLength(12);
    expect(m.every((p) => p.steps === 7000)).toBe(true);
  });

  it("finds the weekday with the most steps", () => {
    // 2026-01-04 is a Sunday
    const days = buildDays(84, (i) => ({ steps: i % 7 === 0 ? 15000 : 5000 }), "2026-01-04");
    const p = computeWeekdayPattern(days);
    expect(p.find((x) => x.weekday === "Sun")!.avgSteps).toBe(15000);
    expect(p.find((x) => x.weekday === "Mon")!.avgSteps).toBe(5000);
  });
});
