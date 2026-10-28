import { describe, it, expect } from "vitest";
import { computeGoalProgress, currentValue, type Goal } from "../src/goals";
import { buildTemplatePlan, mondayOf, parseAiPlan, viewPlan, type StoredPlan } from "../src/plan";
import { healthBriefMessage, escapeMarkdown } from "../src/brief";
import { computeFitnessReport } from "../src/fitness";
import type { DailyMetrics, UserProfile } from "../src/types";

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function buildDays(n: number, valueFor: (i: number) => Partial<DailyMetrics>, start = "2026-01-01"): DailyMetrics[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), receivedAt: "", ...valueFor(i) }));
}
const profile: UserProfile = { birthDate: "1990-01-01", sex: "male", heightCm: 180 };

describe("goals", () => {
  const goal = (over: Partial<Goal>): Goal => ({ id: "g", title: "Steps", metric: "steps", target: 10000, deadline: "2026-03-01", startDate: "2026-01-01", startValue: 6000, ...over });

  it("reads weekly exercise as a 7-day total and VO2max as the latest reading", () => {
    const days = buildDays(10, (i) => ({ exerciseMinutes: 20, vo2max: i === 3 ? 41 : undefined }));
    expect(currentValue(days, "exerciseMinutes")).toBe(140);
    expect(currentValue(days, "vo2max")).toBe(41);
  });

  it("marks a reached goal as achieved", () => {
    const days = buildDays(20, () => ({ steps: 11000 }));
    expect(computeGoalProgress(days, goal({}), "2026-01-20").status).toBe("achieved");
  });

  it("calls a flat metric behind once time has passed", () => {
    const days = buildDays(45, () => ({ steps: 6500 }));
    const p = computeGoalProgress(days, goal({}), "2026-02-14");
    expect(p.status).toBe("behind");
    expect(p.progressPct).toBe(13);
    expect(p.expectedPct).toBeGreaterThan(70);
  });

  it("handles a goal where lower is better", () => {
    const days = buildDays(30, (i) => ({ restingHeartRate: 70 - i * 0.2 }));
    const p = computeGoalProgress(days, goal({ metric: "restingHeartRate", target: 60, startValue: 70 }), "2026-01-30");
    expect(p.progressPct).toBeGreaterThan(30);
    expect(p.projected).not.toBeNull();
    expect(p.projected!).toBeLessThan(p.current!);
  });
});

describe("plan", () => {
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-10-28")).toBe("2026-10-26"); // Wed
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // Sun
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
  });

  it("builds a 7-day template with a rest day and no back-to-back hard days", () => {
    const days = buildDays(60, (i) => ({ exerciseMinutes: i % 3 === 0 ? 30 : 5, vo2max: 36 }));
    const plan = buildTemplatePlan("2026-03-02", computeFitnessReport(days, profile), [], "Sat");
    expect(plan.days).toHaveLength(7);
    expect(plan.days.some((d) => d.type === "rest")).toBe(true);
    expect(plan.days.some((d) => d.type === "intervals")).toBe(true);
    const hard = ["intervals", "long", "strength"];
    for (let i = 1; i < 7; i++) expect(hard.includes(plan.days[i].type) && hard.includes(plan.days[i - 1].type)).toBe(false);
    expect(plan.days[5].type).not.toBe("rest"); // Saturday = least active weekday
  });

  it("rejects an AI plan that doesn't fit the contract", () => {
    expect(parseAiPlan({ days: [{ type: "rest" }] }, "2026-03-02")).toBeNull();
    expect(parseAiPlan({ days: Array(7).fill({ type: "crossfit", minutes: 30 }) }, "2026-03-02")).toBeNull();
    const ok = parseAiPlan({ rationale: "x", days: Array(7).fill({ type: "walk", title: "Walk", minutes: 500, detail: "go" }) }, "2026-03-02")!;
    expect(ok.days[6].date).toBe("2026-03-08");
    expect(ok.days[0].minutes).toBe(180);
  });

  const plan: StoredPlan = {
    weekStart: "2026-03-02", generatedAt: "", source: "template", rationale: "", done: ["2026-03-03"],
    days: [
      { date: "2026-03-02", type: "strength", title: "Strength", minutes: 40, detail: "" },
      { date: "2026-03-03", type: "walk", title: "Walk", minutes: 30, detail: "" },
      { date: "2026-03-04", type: "intervals", title: "Intervals", minutes: 30, detail: "" },
      { date: "2026-03-05", type: "rest", title: "Rest", minutes: 0, detail: "" },
      { date: "2026-03-06", type: "strength", title: "Strength", minutes: 40, detail: "" },
      { date: "2026-03-07", type: "long", title: "Long", minutes: 60, detail: "" },
      { date: "2026-03-08", type: "walk", title: "Walk", minutes: 30, detail: "" },
    ],
  };

  it("marks days done from data or a tick, missed, rest and upcoming", () => {
    const days = [{ date: "2026-03-02", receivedAt: "", exerciseMinutes: 35 }];
    const v = viewPlan(plan, days, "2026-03-04", { readiness: 70, highRecoveryFlag: null });
    expect(v.days.map((d) => d.status)).toEqual(["done", "done", "today", "rest", "upcoming", "upcoming", "upcoming"]);
    expect(v.days[0].autoDetected).toBe(true);
    expect(v.days[1].autoDetected).toBe(false);
    expect(v.completed).toBe(2);
    expect(v.planned).toBe(3);
  });

  it("swaps today's hard session for recovery when readiness is low", () => {
    const v = viewPlan(plan, [], "2026-03-04", { readiness: 38, highRecoveryFlag: null });
    expect(v.today!.adjusted!.type).toBe("walk");
    expect(v.today!.adjusted!.reason).toContain("38");
    expect(viewPlan(plan, [], "2026-03-04", { readiness: 75, highRecoveryFlag: null }).today!.adjusted).toBeNull();
  });
});

describe("morning brief", () => {
  it("escapes MarkdownV2 special characters", () => {
    expect(escapeMarkdown("4×4 (hard). Done!")).toBe("4×4 \\(hard\\)\\. Done\\!");
  });

  it("renders readiness, session, actions and a stale-data note", () => {
    const text = healthBriefMessage({
      today: "2026-03-04",
      lastDataDate: "2026-03-02",
      readiness: 38,
      review: { headline: "Recover today.", body: "Rest and recover.", concern: null },
      session: { date: "2026-03-04", type: "intervals", title: "Intervals", minutes: 30, detail: "4×4 min", weekday: "Wed", status: "today", actualMinutes: null, autoDetected: false,
        adjusted: { type: "walk", title: "Recovery walk", minutes: 25, detail: "Easy pace.", reason: "Readiness 38: swapped for recovery." } },
      actionItems: [{ priority: "high", area: "recovery", text: "Rest day", why: "x" }],
      goals: [],
      dashboardUrl: "https://example.com",
    })!;
    expect(text).toContain("*Health · Readiness 38/100*");
    expect(text).toContain("Recovery walk · 25 min");
    expect(text).toContain("_Readiness 38: swapped for recovery\\._");
    expect(text).toContain("• Rest day");
    expect(text).toContain("Data last synced");
    expect(text).toContain("[Open dashboard](https://example.com)");
  });

  it("says nothing without data", () => {
    expect(healthBriefMessage({ today: "2026-03-04", lastDataDate: null, readiness: null, review: null, session: null, actionItems: [], goals: [], dashboardUrl: "" })).toBeNull();
  });
});
