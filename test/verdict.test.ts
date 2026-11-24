import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildVerdictSnapshot, parseVerdict, ruleCall, ruleVerdict, verdictSignature } from "../src/verdict";
import { buildWorkoutContext, parseWorkoutAnalysis, ruleWorkoutAnalysis } from "../src/workoutAnalysis";
import { renderDashboard } from "../src/dashboard";
import type { DailyMetrics } from "../src/types";

const series = JSON.parse(readFileSync(new URL("../data/series.json", import.meta.url), "utf8")) as { days: DailyMetrics[] };
const workouts = JSON.parse(readFileSync(new URL("../data/manual-workouts.json", import.meta.url), "utf8")).workouts;
const days = series.days;
const base = { hrv: 50, restingHeartRate: 60, sleepHours: 7.5, steps: 8000, exerciseMinutes: 30, strain: 9 };

describe("ruleCall", () => {
  it("calls rest when HRV is crashed, resting HR up, sleep short", () => {
    const d = { date: "2026-01-01", hrv: 35, restingHeartRate: 67, sleepHours: 5 } as DailyMetrics;
    expect(ruleCall(d, base, null, 0, 8).call).toBe("rest");
  });
  it("calls push when fresh and under-moved", () => {
    const d = { date: "2026-01-01", hrv: 58, restingHeartRate: 59, sleepHours: 8, steps: 3000 } as DailyMetrics;
    expect(ruleCall(d, base, 80, 0, 4).call).toBe("push");
  });
  it("calls train on a normal day", () => {
    const d = { date: "2026-01-01", hrv: 51, restingHeartRate: 60, sleepHours: 7.6, steps: 9000 } as DailyMetrics;
    expect(ruleCall(d, base, 65, 0, 10).call).toBe("train");
  });
});

describe("verdict snapshot on real data", () => {
  it("builds for the latest and a past day without using later days", () => {
    const last = days[days.length - 1].date;
    const past = days[days.length - 5].date;
    const s = buildVerdictSnapshot(days, past, false, 25, []);
    expect(s?.date).toBe(past);
    expect(s?.last3DaysStrain.every((x) => x.date <= past)).toBe(true);
    expect(buildVerdictSnapshot(days, last, true, 25, [])?.isToday).toBe(true);
    expect(buildVerdictSnapshot(days, "1999-01-01", false, 25, [])).toBeNull();
    expect(ruleVerdict(s!).headline).toBeTruthy();
  });
  it("signature changes only when the day's inputs change", () => {
    const d = days[days.length - 3].date;
    expect(verdictSignature(days, d, [])).toBe(verdictSignature(days, d, []));
    expect(verdictSignature(days, d, [])).not.toBe(verdictSignature(days, d, [{ type: "Gym" }]));
  });
  it("parses AI output and rejects junk", () => {
    const s = buildVerdictSnapshot(days, days[days.length - 1].date, true, 25, [])!;
    const ok = parseVerdict({ call: "rest", rating: "rough", headline: "HRV down, rest today", summary: "HRV 28 ms vs 40.", next: "Walk only.", why: ["HRV 28 ms"] }, s);
    expect(ok?.call).toBe("rest");
    expect(ok?.source).toBe("ai");
    expect(parseVerdict({ call: "sprint", headline: "x", summary: "y" }, s)).toBeNull();
  });
});

describe("workout analysis", () => {
  it("builds context for a watch workout day and a logged workout", () => {
    const wDay = days.filter((d) => d.workoutMinutes).pop();
    if (wDay) {
      const c = buildWorkoutContext(days, workouts, wDay.date, null, 25);
      expect(c?.watch).toBeTruthy();
      expect(ruleWorkoutAnalysis(c!, null).improve.length).toBeGreaterThan(0);
    }
    if (workouts.length) {
      const w = workouts[workouts.length - 1];
      const c = buildWorkoutContext(days, workouts, w.date, w.id, 25);
      expect(c?.logged).toBeTruthy();
      const a = parseWorkoutAnalysis({ rating: "solid", headline: "On par", improve: ["Bench +2.5kg"], nextTime: "Add a set" }, c!, w.id);
      expect(a?.rating).toBe("solid");
    }
    expect(buildWorkoutContext(days, [], "1999-01-01", null, 25)).toBeNull();
  });
});

describe("dashboard script", () => {
  it("parses as valid JavaScript", () => {
    const html = renderDashboard();
    const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
    expect(html).toContain("function loadVerdicts");
    expect(html).toContain("function loadWorkoutAnalysis");
  });
});
