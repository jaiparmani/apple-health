import type { DailyMetrics, UserProfile } from "./types";
import type { Trends } from "./trends";
import type { FitnessReport } from "./fitness";
import { chronologicalAge } from "./analytics";
import { dailyLoad, vo2Category } from "./fitness";

/**
 * The Overview page's analytics, all computed in code: a 0-100 health score
 * with plain-language parts, a feed of highlights (wins / things to watch),
 * a this-week strip, weekday patterns and 12-month trends. Everything here
 * is phrased for a person, not an engineer — `title`/`detail` strings are
 * shown verbatim in the UI.
 */

export type Tone = "win" | "watch" | "info";

export interface ScorePart {
  key: "recovery" | "activity" | "fitness" | "sleep";
  label: string;
  score: number | null; // 0-100
  word: string; // "Strong", "Fair", ...
  detail: string; // one plain sentence
}

export interface HealthScore {
  overall: number | null;
  word: string;
  summary: string;
  parts: ScorePart[];
}

export interface Highlight {
  tone: Tone;
  title: string;
  detail: string;
}

export interface WeekDay {
  date: string;
  weekday: string; // "Mon"
  steps: number | null;
  exerciseMinutes: number | null;
  load: number;
  sleepHours: number | null;
  ringsClosed: number; // 0-3
  ringsTracked: number; // how many rings had a goal that day
  workoutType: string | null;
}

export interface WeekdayPattern {
  weekday: string;
  avgSteps: number | null;
  avgExerciseMinutes: number | null;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  steps: number | null;
  exerciseMinutes: number | null;
  restingHeartRate: number | null;
  hrv: number | null;
  vo2max: number | null;
  weightKg: number | null;
}

export interface OverviewReport {
  asOf: string | null;
  score: HealthScore;
  highlights: Highlight[];
  week: WeekDay[];
  weekdayPattern: WeekdayPattern[];
  monthly: MonthlyPoint[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function nums(days: DailyMetrics[], f: keyof DailyMetrics): number[] {
  return days.map((d) => d[f]).filter((v): v is number => typeof v === "number");
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function word(score: number): string {
  return score >= 80 ? "Excellent" : score >= 65 ? "Strong" : score >= 50 ? "Fair" : score >= 35 ? "Needs work" : "Low";
}

/**
 * "TraditionalStrengthTraining" -> "Strength training": Apple's workout
 * activity types are CamelCase identifiers, not something to show a person.
 */
export function workoutLabel(type: string | undefined | null): string | null {
  if (!type) return null;
  const words = type
    .replace(/^HKWorkoutActivityType/, "")
    .replace(/^(Traditional|Functional)(?=StrengthTraining)/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// ---------------- Health score ----------------

export function computeHealthScore(
  days: DailyMetrics[],
  trends: Trends,
  fitness: FitnessReport,
  profile: UserProfile | null,
  sleepTarget = 7.5
): HealthScore {
  const last7 = days.slice(-7);
  const parts: ScorePart[] = [];

  // Recovery: today's readiness (already a 0-100 vs-your-baseline score).
  const readiness = trends.readinessScore;
  parts.push({
    key: "recovery",
    label: "Recovery",
    score: readiness,
    word: readiness === null ? "No data" : word(readiness),
    detail:
      readiness === null
        ? "Needs a few days of overnight heart data."
        : readiness >= 70
          ? "Your heart data says you've bounced back — ready for a hard day."
          : readiness >= 45
            ? "Partly recovered. Fine to train, just not all-out."
            : "Your body is still recovering. Keep today easy.",
  });

  // Activity: weekly exercise minutes vs 150 (60%) + average steps vs 8k (40%).
  const weekMin = nums(last7, "exerciseMinutes").reduce((a, b) => a + b, 0);
  const steps7 = mean(nums(last7, "steps"));
  let activity: number | null = null;
  if (steps7 !== null || weekMin > 0) {
    activity = clamp(Math.min(1, weekMin / 150) * 60 + Math.min(1, (steps7 ?? 0) / 8000) * 40);
  }
  parts.push({
    key: "activity",
    label: "Activity",
    score: activity,
    word: activity === null ? "No data" : word(activity),
    detail:
      activity === null
        ? "No movement data this week."
        : `${Math.round(weekMin)} of 150 exercise minutes this week, ${steps7 !== null ? fmtInt(steps7) : "—"} steps a day on average.`,
  });

  // Fitness: VO2max category for age (70%) + consistency over 28 days (30%).
  const vo2 = mean(nums(days.slice(-30), "vo2max"));
  const active28 = fitness.metrics.find((m) => m.key === "consistency")?.value ?? null;
  let fitnessScore: number | null = null;
  let fitnessDetail = "Needs VO2max readings (from outdoor walks or runs with your Watch).";
  if (vo2 !== null && profile) {
    const age = chronologicalAge(profile.birthDate, days[days.length - 1].date);
    const cat = vo2Category(vo2, age, profile.sex);
    const catScore = { poor: 25, fair: 50, good: 70, excellent: 85, superior: 100 }[cat];
    fitnessScore = clamp(catScore * 0.7 + Math.min(1, (active28 ?? 0) / 16) * 30);
    fitnessDetail = `Cardio fitness is "${cat}" for your age (VO2max ${vo2.toFixed(1)}), and you were active ${active28 ?? 0} of the last 28 days.`;
  }
  parts.push({ key: "fitness", label: "Fitness", score: fitnessScore, word: fitnessScore === null ? "No data" : word(fitnessScore), detail: fitnessDetail });

  // Sleep: average of last 7 logged nights vs target (needs 3+ nights).
  const sleepVals = nums(last7, "sleepHours");
  let sleep: number | null = null;
  let sleepDetail = "Not enough sleep tracked this week — wear your Watch to bed to score this.";
  if (sleepVals.length >= 3) {
    const avg = mean(sleepVals)!;
    sleep = clamp(100 - Math.max(0, sleepTarget - avg) * 30 - Math.max(0, avg - 9.5) * 15);
    sleepDetail = `${avg.toFixed(1)} hours a night on average vs your ${sleepTarget}h goal.`;
  }
  parts.push({ key: "sleep", label: "Sleep", score: sleep, word: sleep === null ? "No data" : word(sleep), detail: sleepDetail });

  const scored = parts.filter((p) => p.score !== null).map((p) => p.score as number);
  const overall = scored.length ? clamp(mean(scored)!) : null;
  const weakest = parts.filter((p) => p.score !== null).sort((a, b) => (a.score as number) - (b.score as number))[0];
  const strongest = parts.filter((p) => p.score !== null).sort((a, b) => (b.score as number) - (a.score as number))[0];
  const summary =
    overall === null
      ? "Import your Apple Health data to see your score."
      : weakest && strongest && weakest !== strongest
        ? `${strongest.label} is your strongest area; ${weakest.label.toLowerCase()} has the most room to improve.`
        : `Based on ${scored.length} area${scored.length === 1 ? "" : "s"} with enough data.`;

  return { overall, word: overall === null ? "No data" : word(overall), summary, parts };
}

// ---------------- Highlights ----------------

interface ChangeDef {
  field: keyof DailyMetrics;
  name: string;
  higherIsBetter: boolean;
  threshold: number; // % change needed to mention it
  unit: string;
  dp: number;
}

const CHANGE_DEFS: ChangeDef[] = [
  { field: "steps", name: "Daily steps", higherIsBetter: true, threshold: 10, unit: "", dp: 0 },
  { field: "exerciseMinutes", name: "Exercise minutes", higherIsBetter: true, threshold: 15, unit: " min/day", dp: 0 },
  { field: "activeEnergy", name: "Calories burned moving", higherIsBetter: true, threshold: 15, unit: " kcal/day", dp: 0 },
  { field: "hrv", name: "Heart rate variability", higherIsBetter: true, threshold: 8, unit: " ms", dp: 0 },
  { field: "restingHeartRate", name: "Resting heart rate", higherIsBetter: false, threshold: 4, unit: " bpm", dp: 0 },
  { field: "sleepHours", name: "Sleep", higherIsBetter: true, threshold: 7, unit: " h/night", dp: 1 },
  { field: "walkingSpeed", name: "Walking speed", higherIsBetter: true, threshold: 4, unit: " m/s", dp: 2 },
];

function streak(days: DailyMetrics[], ok: (d: DailyMetrics) => boolean): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (ok(days[i])) n++;
    else break;
  }
  return n;
}

export function computeHighlights(days: DailyMetrics[], trends: Trends, fitness: FitnessReport): Highlight[] {
  if (days.length === 0) return [];
  const out: Highlight[] = [];
  const asOf = days[days.length - 1].date;
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);

  // Week-over-week changes, phrased by whether the move is good or bad.
  for (const c of CHANGE_DEFS) {
    const curr = mean(nums(last7, c.field));
    const prev = mean(nums(prev7, c.field));
    const pct = pctChange(curr, prev);
    if (pct === null || Math.abs(pct) < c.threshold) continue;
    const up = pct > 0;
    const good = up === c.higherIsBetter;
    const fmtV = (v: number) => (c.dp === 0 ? fmtInt(v) : v.toFixed(c.dp));
    out.push({
      tone: good ? "win" : "watch",
      title: `${c.name} ${up ? "up" : "down"} ${Math.abs(pct).toFixed(0)}% this week`,
      detail: `${fmtV(prev!)}${c.unit} → ${fmtV(curr!)}${c.unit} vs the week before.${good ? "" : c.higherIsBetter ? " Worth turning around." : " Keep an eye on it."}`,
    });
  }

  // Personal bests set in the last 7 days.
  const bestLabels: Record<string, string> = {
    lowestRestingHeartRate: "Lowest resting heart rate ever",
    highestHrv: "Highest HRV ever",
    highestVo2max: "Highest VO2max ever",
    mostSteps: "Most steps in a day, ever",
    fastestWalkingSpeed: "Fastest walking speed ever",
    longestExerciseMinutes: "Longest exercise day ever",
  };
  for (const [k, b] of Object.entries(trends.bests)) {
    if (b && b.date > addDays(asOf, -7)) {
      out.push({ tone: "win", title: `New record: ${bestLabels[k] ?? k}`, detail: `${Number.isInteger(b.value) ? fmtInt(b.value) : b.value.toFixed(1)} on ${b.date}.` });
    }
  }

  // Streaks.
  const stepStreak = streak(days, (d) => (d.steps ?? 0) >= 8000);
  if (stepStreak >= 3) out.push({ tone: "win", title: `${stepStreak}-day streak of 8,000+ steps`, detail: "Daily walking is one of the strongest habits for long-term health. Keep it going today." });
  const exStreak = streak(days, (d) => typeof d.exerciseMinutesGoal === "number" && (d.exerciseMinutes ?? 0) >= d.exerciseMinutesGoal);
  if (exStreak >= 3) out.push({ tone: "win", title: `${exStreak} days in a row closing your Exercise ring`, detail: "Consistency beats intensity — this is exactly how fitness builds." });

  // Ring closure rate.
  const ringDays = last7.filter((d) => typeof d.activeEnergyGoal === "number");
  if (ringDays.length >= 4) {
    const moveClosed = ringDays.filter((d) => (d.activeEnergy ?? 0) >= (d.activeEnergyGoal as number)).length;
    out.push({
      tone: moveClosed >= 5 ? "win" : moveClosed <= 2 ? "watch" : "info",
      title: `Move ring closed ${moveClosed} of ${ringDays.length} days`,
      detail: moveClosed >= 5 ? "Strong week for daily movement." : "A 15-minute walk in the evening usually closes the gap.",
    });
  }

  // Best day this week.
  const bestDay = last7.filter((d) => typeof d.steps === "number").sort((a, b) => (b.steps as number) - (a.steps as number))[0];
  if (bestDay && (bestDay.steps as number) >= 5000) {
    out.push({ tone: "info", title: `Most active day: ${WEEKDAY_NAMES[weekdayOf(bestDay.date)]}`, detail: `${fmtInt(bestDay.steps as number)} steps${bestDay.workoutType ? ` and a ${workoutLabel(bestDay.workoutType)!.toLowerCase()} session` : ""}.` });
  }

  // Month vs prior month (28-day blocks) for steps.
  const m1 = mean(nums(days.slice(-28), "steps"));
  const m0 = mean(nums(days.slice(-56, -28), "steps"));
  const mp = pctChange(m1, m0);
  if (mp !== null && Math.abs(mp) >= 10) {
    out.push({
      tone: mp > 0 ? "win" : "watch",
      title: `Last 4 weeks: ${mp > 0 ? "more" : "less"} walking than the 4 before`,
      detail: `${fmtInt(m0!)} → ${fmtInt(m1!)} steps a day (${mp > 0 ? "+" : ""}${mp.toFixed(0)}%).`,
    });
  }

  // Training-model flags worth surfacing to non-experts.
  const fit = fitness.metrics.find((m) => m.key === "fitness");
  if (fit && fit.status === "watch") out.push({ tone: "watch", title: "Your training base is slipping", detail: fit.action });
  const vo2t = fitness.metrics.find((m) => m.key === "vo2Trend");
  if (vo2t && vo2t.status === "bad") out.push({ tone: "watch", title: "Cardio fitness (VO2max) is trending down", detail: vo2t.action });
  if (vo2t && vo2t.status === "good") out.push({ tone: "win", title: "Cardio fitness (VO2max) is climbing", detail: vo2t.action });

  // Weekday pattern.
  const pattern = computeWeekdayPattern(days);
  const withSteps = pattern.filter((p) => p.avgSteps !== null);
  if (withSteps.length === 7) {
    const sorted = [...withSteps].sort((a, b) => (b.avgSteps as number) - (a.avgSteps as number));
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    if ((hi.avgSteps as number) > (lo.avgSteps as number) * 1.3) {
      out.push({
        tone: "info",
        title: `${WEEKDAY_NAMES[WEEKDAYS.indexOf(hi.weekday)]}s are your most active day, ${WEEKDAY_NAMES[WEEKDAYS.indexOf(lo.weekday)]}s the least`,
        detail: `${fmtInt(hi.avgSteps as number)} vs ${fmtInt(lo.avgSteps as number)} steps on average over 12 weeks. Plan a walk or session on ${WEEKDAY_NAMES[WEEKDAYS.indexOf(lo.weekday)]}s.`,
      });
    }
  }

  const order: Record<Tone, number> = { win: 0, watch: 1, info: 2 };
  // Interleave: wins first, then watches, then info — but keep it to a readable size.
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 10);
}

// ---------------- Week strip, weekday pattern, monthly ----------------

export function computeWeek(days: DailyMetrics[], age: number | null): WeekDay[] {
  if (days.length === 0) return [];
  const asOf = days[days.length - 1].date;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(asOf, -i);
    const d = byDate.get(date);
    let closed = 0;
    let tracked = 0;
    if (d) {
      const rings: [number | undefined, number | undefined][] = [
        [d.activeEnergy, d.activeEnergyGoal],
        [d.exerciseMinutes, d.exerciseMinutesGoal],
        [d.standHours, d.standHoursGoal],
      ];
      for (const [actual, goal] of rings) {
        if (typeof goal !== "number" || goal <= 0) continue;
        tracked++;
        if ((actual ?? 0) >= goal) closed++;
      }
    }
    out.push({
      date,
      weekday: WEEKDAYS[weekdayOf(date)],
      steps: d?.steps ?? null,
      exerciseMinutes: d?.exerciseMinutes ?? null,
      load: d ? dailyLoad(d, age) : 0,
      sleepHours: d?.sleepHours ?? null,
      ringsClosed: closed,
      ringsTracked: tracked,
      workoutType: workoutLabel(d?.workoutType),
    });
  }
  return out;
}

export function computeWeekdayPattern(days: DailyMetrics[]): WeekdayPattern[] {
  const recent = days.slice(-84);
  return WEEKDAYS.map((wd, i) => {
    const on = recent.filter((d) => weekdayOf(d.date) === i);
    const s = mean(nums(on, "steps"));
    const e = mean(nums(on, "exerciseMinutes"));
    return { weekday: wd, avgSteps: s === null ? null : Math.round(s), avgExerciseMinutes: e === null ? null : Math.round(e) };
  });
}

export function computeMonthly(days: DailyMetrics[], months = 12): MonthlyPoint[] {
  const byMonth = new Map<string, DailyMetrics[]>();
  for (const d of days) {
    const m = d.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(d);
  }
  const keys = [...byMonth.keys()].sort().slice(-months);
  const r = (v: number | null, dp: number) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);
  return keys.map((month) => {
    const ds = byMonth.get(month)!;
    return {
      month,
      steps: r(mean(nums(ds, "steps")), 0),
      exerciseMinutes: r(mean(nums(ds, "exerciseMinutes")), 0),
      restingHeartRate: r(mean(nums(ds, "restingHeartRate")), 1),
      hrv: r(mean(nums(ds, "hrv")), 1),
      vo2max: r(mean(nums(ds, "vo2max")), 1),
      weightKg: r(mean(nums(ds, "weightKg")), 1),
    };
  });
}

export function computeOverview(
  days: DailyMetrics[],
  trends: Trends,
  fitness: FitnessReport,
  profile: UserProfile | null,
  sleepTarget = 7.5
): OverviewReport {
  if (days.length === 0) {
    return { asOf: null, score: computeHealthScore([], trends, fitness, profile, sleepTarget), highlights: [], week: [], weekdayPattern: [], monthly: [] };
  }
  const asOf = days[days.length - 1].date;
  const age = profile ? chronologicalAge(profile.birthDate, asOf) : null;
  return {
    asOf,
    score: computeHealthScore(days, trends, fitness, profile, sleepTarget),
    highlights: computeHighlights(days, trends, fitness),
    week: computeWeek(days, age),
    weekdayPattern: computeWeekdayPattern(days),
    monthly: computeMonthly(days),
  };
}
