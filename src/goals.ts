import type { DailyMetrics } from "./types";

/**
 * Goals: a target for one metric by a date, with progress, a straight-line
 * "where you should be by now" check, and a projection from the last 30
 * days' trend. All computed in code; the AI only reads the results.
 */

export type GoalMetricKey = "steps" | "exerciseMinutes" | "vo2max" | "restingHeartRate" | "hrv" | "weightKg" | "sleepHours" | "walkingSpeed";

interface GoalMetricDef {
  label: string;
  unit: string;
  dp: number;
  // How "current value" is read: 7-day average, 7-day total, or the latest
  // reading in 30 days (for metrics that aren't measured every day).
  mode: "avg7" | "sum7" | "latest";
}

export const GOAL_METRICS: Record<GoalMetricKey, GoalMetricDef> = {
  steps: { label: "Daily steps", unit: "steps", dp: 0, mode: "avg7" },
  exerciseMinutes: { label: "Weekly exercise", unit: "min", dp: 0, mode: "sum7" },
  vo2max: { label: "VO2max", unit: "", dp: 1, mode: "latest" },
  restingHeartRate: { label: "Resting heart rate", unit: "bpm", dp: 0, mode: "avg7" },
  hrv: { label: "HRV", unit: "ms", dp: 0, mode: "avg7" },
  weightKg: { label: "Weight", unit: "kg", dp: 1, mode: "latest" },
  sleepHours: { label: "Sleep", unit: "h", dp: 1, mode: "avg7" },
  walkingSpeed: { label: "Walking speed", unit: "m/s", dp: 2, mode: "avg7" },
};

export interface Goal {
  id: string;
  title: string;
  metric: GoalMetricKey;
  target: number;
  deadline: string; // YYYY-MM-DD
  startDate: string;
  startValue: number | null;
}

export type GoalStatus = "achieved" | "ahead" | "on_track" | "behind" | "no_data";

export interface GoalProgress {
  goal: Goal;
  label: string;
  unit: string;
  current: number | null;
  progressPct: number | null; // 0-100, start -> target
  expectedPct: number; // 0-100, share of time elapsed
  projected: number | null; // value at the deadline if the 30-day trend holds
  daysLeft: number;
  status: GoalStatus;
  summary: string; // one crisp line
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** The metric's current value as of `asOf`, read the way GOAL_METRICS says. */
export function currentValue(days: DailyMetrics[], metric: GoalMetricKey, asOf?: string): number | null {
  if (days.length === 0) return null;
  const end = asOf ?? days[days.length - 1].date;
  const def = GOAL_METRICS[metric];
  if (def.mode === "latest") {
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (d.date > end) continue;
      if (d.date <= addDays(end, -30)) break;
      if (typeof d[metric] === "number") return d[metric] as number;
    }
    return null;
  }
  const window = days.filter((d) => d.date > addDays(end, -7) && d.date <= end);
  const vals = window.map((d) => d[metric]).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return def.mode === "sum7" ? sum : sum / vals.length;
}

/**
 * Smoothed daily rate of change: this week's value vs the same reading four
 * weeks earlier. Fitting a line through raw daily points made noisy metrics
 * (steps swing 1k-13k day to day) project absurd values.
 */
function dailyRate(days: DailyMetrics[], metric: GoalMetricKey, current: number): number | null {
  if (days.length === 0) return null;
  const end = days[days.length - 1].date;
  const past = currentValue(days, metric, addDays(end, -28));
  return past === null ? null : (current - past) / 28;
}

export function computeGoalProgress(days: DailyMetrics[], goal: Goal, today: string): GoalProgress {
  const def = GOAL_METRICS[goal.metric];
  const current = currentValue(days, goal.metric);
  const totalDays = Math.max(1, daysBetween(goal.startDate, goal.deadline));
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(goal.startDate, today)));
  const daysLeft = Math.max(0, daysBetween(today, goal.deadline));
  const expectedPct = Math.round((elapsed / totalDays) * 100);
  const up = goal.startValue === null ? true : goal.target >= goal.startValue;

  let progressPct: number | null = null;
  if (current !== null && goal.startValue !== null && goal.target !== goal.startValue) {
    progressPct = Math.round(Math.max(0, Math.min(100, ((current - goal.startValue) / (goal.target - goal.startValue)) * 100)));
  }

  // Projection from the smoothed 4-week rate, capped at ±50% of today's
  // value — a trend is a hint, not a promise.
  let projected: number | null = null;
  const rate = current === null ? null : dailyRate(days, goal.metric, current);
  if (current !== null && rate !== null) {
    const raw = current + rate * daysLeft;
    projected = round(Math.min(current * 1.5, Math.max(current * 0.5, raw)), def.dp);
  }

  const fmt = (v: number) => (def.dp === 0 ? Math.round(v).toLocaleString("en-US") : v.toFixed(def.dp));
  const unit = def.unit ? ` ${def.unit}` : "";
  const reached = current !== null && (up ? current >= goal.target : current <= goal.target);

  let status: GoalStatus;
  let summary: string;
  if (current === null) {
    status = "no_data";
    summary = `No ${def.label.toLowerCase()} data in the last 30 days.`;
  } else if (reached) {
    status = "achieved";
    summary = `Reached: ${fmt(current)}${unit} vs target ${fmt(goal.target)}${unit}.`;
  } else {
    const gap = Math.abs(goal.target - current);
    const projectedHits = projected !== null && (up ? projected >= goal.target : projected <= goal.target);
    if (progressPct !== null && progressPct >= expectedPct + 10) status = "ahead";
    else if (projectedHits || (progressPct !== null && progressPct >= expectedPct - 10)) status = "on_track";
    else status = "behind";
    summary =
      daysLeft === 0
        ? `Deadline passed. ${fmt(gap)}${unit} short.`
        : `${fmt(gap)}${unit} to go, ${daysLeft} days left.` +
          (projected !== null ? ` On current trend: ${fmt(projected)}${unit} by the deadline.` : "");
  }

  return {
    goal,
    label: def.label,
    unit: def.unit,
    current: current === null ? null : round(current, def.dp),
    progressPct,
    expectedPct,
    projected,
    daysLeft,
    status,
    summary,
  };
}

export function isGoalMetric(v: unknown): v is GoalMetricKey {
  return typeof v === "string" && v in GOAL_METRICS;
}
