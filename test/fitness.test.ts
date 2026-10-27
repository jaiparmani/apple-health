import { describe, it, expect } from "vitest";
import { computeFitnessReport, computeLoadSeries, dailyLoad, vo2Category } from "../src/fitness";
import { guideFor, METRIC_GUIDE } from "../src/metricGuide";
import { buildReviewContext } from "../src/reviewContext";
import { REVIEW_DOMAINS } from "../src/ai";
import type { DailyMetrics, UserProfile } from "../src/types";

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

const profile: UserProfile = { birthDate: "1990-01-01", sex: "male", heightCm: 180 };

describe("dailyLoad", () => {
  it("falls back to minutes/energy when there is no heart-rate data", () => {
    expect(dailyLoad({ date: "2026-01-01", receivedAt: "", exerciseMinutes: 60, activeEnergy: 600 }, 36)).toBeGreaterThan(8);
    expect(dailyLoad({ date: "2026-01-01", receivedAt: "" }, 36)).toBe(0);
  });
});

describe("computeLoadSeries", () => {
  it("fills calendar gaps with zero-load days so the EWMA stays continuous", () => {
    const days = [
      { date: "2026-01-01", receivedAt: "", exerciseMinutes: 60, activeEnergy: 500 },
      { date: "2026-01-04", receivedAt: "", exerciseMinutes: 60, activeEnergy: 500 },
    ];
    const s = computeLoadSeries(days, 36);
    expect(s.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
    expect(s[1].load).toBe(0);
  });

  it("goes negative on form after a sudden load spike", () => {
    const days = buildDays(60, (i) => (i < 50 ? { exerciseMinutes: 20, activeEnergy: 200 } : { exerciseMinutes: 120, activeEnergy: 1200 }));
    const last = computeLoadSeries(days, 36).at(-1)!;
    expect(last.fatigue).toBeGreaterThan(last.fitness);
    expect(last.form).toBeLessThan(0);
  });
});

describe("vo2Category", () => {
  it("grades against age/sex bands", () => {
    expect(vo2Category(55, 25, "male")).toBe("superior");
    expect(vo2Category(36, 25, "male")).toBe("poor");
    expect(vo2Category(36, 45, "female")).toBe("excellent");
  });
});

describe("computeFitnessReport", () => {
  it("returns an empty report for no data", () => {
    expect(computeFitnessReport([], profile).metrics).toEqual([]);
  });

  it("gives every metric a meaning and an action", () => {
    const days = buildDays(90, (i) => ({
      exerciseMinutes: 30,
      activeEnergy: 400,
      steps: 7000,
      hrv: 45 + (i % 5),
      restingHeartRate: 58 + (i % 3),
      vo2max: 44,
      sleepHours: 7,
      walkingSpeed: 1.3,
      weightKg: 78,
    }));
    const r = computeFitnessReport(days, profile);
    expect(r.metrics.length).toBeGreaterThan(10);
    for (const m of r.metrics) {
      expect(m.meaning.length).toBeGreaterThan(20);
      expect(m.action.length).toBeGreaterThan(5);
    }
    expect(r.weekly).toHaveLength(8);
    expect(r.loadSeries.length).toBeLessThanOrEqual(120);
  });

  it("flags a load spike and a resting-HR rise as high-priority action items", () => {
    const days = buildDays(60, (i) =>
      i < 53
        ? { exerciseMinutes: 20, activeEnergy: 200, restingHeartRate: 55, hrv: 60 }
        : { exerciseMinutes: 150, activeEnergy: 1500, restingHeartRate: 63, hrv: 35 }
    );
    const r = computeFitnessReport(days, profile);
    const acwr = r.metrics.find((m) => m.key === "acwr")!;
    expect(acwr.status).toBe("bad");
    expect(r.actionItems[0].priority).toBe("high");
    expect(r.actionItems.some((a) => /volume/i.test(a.text))).toBe(true);
    expect(r.actionItems.some((a) => a.area === "recovery")).toBe(true);
    expect(r.actionItems.some((a) => /Green light/.test(a.text))).toBe(false);
  });

  it("asks for more movement when weekly minutes are below WHO 150", () => {
    const days = buildDays(30, () => ({ exerciseMinutes: 5, steps: 3000 }));
    const r = computeFitnessReport(days, profile);
    expect(r.metrics.find((m) => m.key === "weeklyMinutes")!.status).toBe("bad");
    expect(r.actionItems.some((a) => /exercise minutes/.test(a.text))).toBe(true);
  });
});

describe("metric guide", () => {
  it("picks the first matching rule", () => {
    expect(guideFor("steps", 12000)!.status).toBe("good");
    expect(guideFor("steps", 3000)!.status).toBe("bad");
    expect(guideFor("sleepHours", 5.5)!.status).toBe("bad");
  });

  it("falls back to generic guidance when there's no value", () => {
    const g = guideFor("vo2max", null)!;
    expect(g.status).toBeNull();
    expect(g.action).toBe(METRIC_GUIDE.vo2max.fallback);
  });

  it("returns null for unknown metrics", () => {
    expect(guideFor("notAMetric", 1)).toBeNull();
  });

  it("every entry has a meaning", () => {
    for (const [k, e] of Object.entries(METRIC_GUIDE)) expect(e.meaning.length, k).toBeGreaterThan(15);
  });
});

describe("buildReviewContext", () => {
  it("builds a non-empty, JSON-serialisable context for every review domain", () => {
    const days = buildDays(40, (i) => ({ exerciseMinutes: 30, steps: 8000, hrv: 50 + (i % 4), restingHeartRate: 58, sleepHours: 7 }));
    for (const domain of REVIEW_DOMAINS) {
      const ctx = buildReviewContext(domain, { days, profile, knowledge: { notes: [], goals: "run a 10k" }, bioHistory: [] });
      expect(Object.keys(ctx).length, domain).toBeGreaterThan(0);
      expect(() => JSON.stringify(ctx)).not.toThrow();
    }
  });
});
