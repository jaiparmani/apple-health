import type { DailyMetrics, Env } from "./types";
import { callGateway } from "./ai";
import { computeStrain } from "./analytics";
import { computeTrends } from "./trends";
import { computeLoadSeries } from "./fitness";

/**
 * "How was the day, and what does the body need?" — one verdict per day,
 * for today and any past day. Code builds the snapshot *as of that date*
 * (no peeking at later days) plus a rule-based anchor call; the model reads
 * it and writes the verdict. If the model is unavailable or returns junk,
 * the rule-based call is served instead, so a day always has a verdict.
 */

export type VerdictCall = "rest" | "easy" | "train" | "push";
export type DayRating = "great" | "good" | "okay" | "rough";

export const VERDICT_CALLS: VerdictCall[] = ["rest", "easy", "train", "push"];
const DAY_RATINGS: DayRating[] = ["great", "good", "okay", "rough"];

export interface DayVerdict {
  date: string;
  call: VerdictCall; // what the body needs next
  rating: DayRating; // how the day went
  headline: string;
  summary: string; // how the day went, with numbers
  next: string; // what to do next (rest of today, or the following day)
  why: string[]; // the 2-3 numbers behind the call
  source: "ai" | "rules";
}

export interface VerdictCacheEntry {
  sig: string;
  generatedAt: string;
  verdict: DayVerdict;
}

/** The days the verdict for `date` may look at: that day and the 30 before it. */
export function daysUpTo(days: DailyMetrics[], date: string): DailyMetrics[] {
  return days.filter((d) => d.date <= date).slice(-31);
}

/** Cheap content hash so a verdict is rewritten only when its inputs change. */
export function verdictSignature(days: DailyMetrics[], date: string, workoutsForDay: unknown[]): string {
  const window = daysUpTo(days, date).slice(-3);
  const text = JSON.stringify([window, workoutsForDay]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `v2:${(h >>> 0).toString(36)}`;
}

const r = (v: number | null | undefined, dp = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function mean(values: (number | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export interface VerdictSnapshot {
  date: string;
  isToday: boolean;
  dayOfWeek: string;
  day: Record<string, unknown>;
  baseline7: Record<string, number | null>;
  recoveryScore: number | null;
  readinessScore: number | null;
  last3DaysStrain: { date: string; strain: number | null }[];
  consecutiveHardDays: number;
  form: number | null;
  loggedWorkouts: unknown[];
  ruleCall: VerdictCall;
  ruleReasons: string[];
}

export function buildVerdictSnapshot(
  allDays: DailyMetrics[],
  date: string,
  isToday: boolean,
  age: number | null,
  loggedWorkouts: unknown[]
): VerdictSnapshot | null {
  const days = daysUpTo(allDays, date);
  const day = days[days.length - 1];
  if (!day || day.date !== date) return null;
  const prior = days.slice(-8, -1);

  const trends = computeTrends(days);
  const strainOf = (d: DailyMetrics) => r(d.strain ?? computeStrain(d, age), 1);
  const last3 = days.slice(-3).map((d) => ({ date: d.date, strain: strainOf(d) }));
  let hard = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const s = strainOf(days[i]);
    if (s != null && s >= 12) hard++;
    else break;
  }
  const series = computeLoadSeries(days, age);
  const form = series.length ? series[series.length - 1].form : null;

  const baseline7 = {
    hrv: r(mean(prior.map((d) => d.hrv))),
    restingHeartRate: r(mean(prior.map((d) => d.restingHeartRate))),
    sleepHours: r(mean(prior.map((d) => d.sleepHours)), 1),
    steps: r(mean(prior.map((d) => d.steps))),
    exerciseMinutes: r(mean(prior.map((d) => d.exerciseMinutes))),
    strain: r(mean(prior.map((d) => strainOf(d) ?? undefined)), 1),
  };

  const recoveryScore = (trends.recovery as { score?: number } | null)?.score ?? null;
  const { call, reasons } = ruleCall(day, baseline7, recoveryScore, hard, strainOf(day));

  const dayView: Record<string, unknown> = {
    sleepHours: r(day.sleepHours, 1),
    sleepDeepHours: r(day.sleepDeepHours, 1),
    sleepRemHours: r(day.sleepRemHours, 1),
    hrv: r(day.hrv),
    restingHeartRate: r(day.restingHeartRate),
    steps: r(day.steps),
    activeEnergy: r(day.activeEnergy),
    exerciseMinutes: r(day.exerciseMinutes),
    standHours: day.standHours ?? null,
    strain: strainOf(day),
    workoutType: day.workoutType ?? null,
    workoutMinutes: r(day.workoutMinutes),
    hrZone2PlusMinutes: r((day.hrZone2Min ?? 0) + (day.hrZone3Min ?? 0) + (day.hrZone4Min ?? 0) + (day.hrZone5Min ?? 0)),
    moveGoalPct: day.activeEnergy && day.activeEnergyGoal ? r((day.activeEnergy / day.activeEnergyGoal) * 100) : null,
  };
  for (const k of Object.keys(dayView)) if (dayView[k] == null) delete dayView[k];

  return {
    date,
    isToday,
    dayOfWeek: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
    day: dayView,
    baseline7,
    recoveryScore: r(recoveryScore),
    readinessScore: r(trends.readinessScore),
    last3DaysStrain: last3,
    consecutiveHardDays: hard,
    form: r(form, 1),
    loggedWorkouts,
    ruleCall: call,
    ruleReasons: reasons,
  };
}

/** The deterministic call: recovery first, then accumulated load, then under-activity. */
export function ruleCall(
  day: DailyMetrics,
  base: Record<string, number | null>,
  recoveryScore: number | null,
  consecutiveHard: number,
  strain: number | null
): { call: VerdictCall; reasons: string[] } {
  const reasons: string[] = [];
  const hrvDrop = day.hrv != null && base.hrv ? (day.hrv - base.hrv) / base.hrv : null;
  const rhrUp = day.restingHeartRate != null && base.restingHeartRate ? day.restingHeartRate - base.restingHeartRate : null;
  const shortSleep = day.sleepHours != null && day.sleepHours < 6;

  let fatigue = 0;
  if (recoveryScore != null && recoveryScore < 40) { fatigue += 2; reasons.push(`Recovery ${Math.round(recoveryScore)}/100`); }
  else if (recoveryScore != null && recoveryScore < 60) { fatigue += 1; reasons.push(`Recovery ${Math.round(recoveryScore)}/100`); }
  if (hrvDrop != null && hrvDrop <= -0.15) { fatigue += 2; reasons.push(`HRV ${Math.round(day.hrv!)} ms vs ${base.hrv} usual`); }
  else if (hrvDrop != null && hrvDrop <= -0.07) { fatigue += 1; reasons.push(`HRV ${Math.round(day.hrv!)} ms vs ${base.hrv} usual`); }
  if (rhrUp != null && rhrUp >= 5) { fatigue += 2; reasons.push(`Resting HR +${Math.round(rhrUp)} bpm`); }
  else if (rhrUp != null && rhrUp >= 3) { fatigue += 1; reasons.push(`Resting HR +${Math.round(rhrUp)} bpm`); }
  if (shortSleep) { fatigue += 1; reasons.push(`Slept ${day.sleepHours!.toFixed(1)} h`); }
  if (consecutiveHard >= 3) { fatigue += 2; reasons.push(`${consecutiveHard} hard days in a row`); }

  if (fatigue >= 4) return { call: "rest", reasons };
  if (fatigue >= 2) return { call: "easy", reasons };

  const lowActivity = (strain != null && strain < 6) || (day.steps != null && day.steps < 5000);
  const fresh = (recoveryScore != null && recoveryScore >= 75) || (hrvDrop != null && hrvDrop >= 0.08);
  if (fresh && lowActivity) {
    reasons.push(day.steps != null ? `Only ${Math.round(day.steps)} steps` : `Strain ${strain}`);
    return { call: "push", reasons };
  }
  if (lowActivity && reasons.length === 0) reasons.push(day.steps != null ? `Only ${Math.round(day.steps)} steps` : `Strain ${strain}`);
  if (reasons.length === 0) reasons.push("Recovery markers near your normal");
  return { call: "train", reasons };
}

export function ruleVerdict(s: VerdictSnapshot): DayVerdict {
  const d = s.day as Record<string, number | undefined>;
  const rating: DayRating =
    s.ruleCall === "rest" ? "rough" : s.ruleCall === "easy" ? "okay" : (d.strain ?? 0) >= 10 || (d.steps ?? 0) >= 8000 ? "great" : "good";
  const headline = {
    rest: "Body needs rest",
    easy: "Go easy — recovery is lagging",
    train: "Ready to train",
    push: "Fresh and under-used — push",
  }[s.ruleCall];
  const bits: string[] = [];
  if (d.sleepHours != null) bits.push(`${d.sleepHours} h sleep`);
  if (d.hrv != null) bits.push(`HRV ${d.hrv} ms`);
  if (d.steps != null) bits.push(`${d.steps} steps`);
  if (d.strain != null) bits.push(`strain ${d.strain}`);
  return {
    date: s.date,
    call: s.ruleCall,
    rating,
    headline,
    summary: bits.length ? `${bits.join(", ")}.` : "Not much data for this day.",
    next: {
      rest: "Skip training. Walk only, early night.",
      easy: "Light movement only: walk, mobility, zone 2.",
      train: "Normal session is fine.",
      push: "Good day for a hard session.",
    }[s.ruleCall],
    why: s.ruleReasons.slice(0, 3),
    source: "rules",
  };
}

const VERDICT_PROMPT =
  "You are a blunt, specific coach judging ONE day of one person's Apple Health data from a JSON snapshot. " +
  "The person lifts at the gym and plays pickleball sometimes. Use only numbers in the snapshot; never invent one. " +
  "Compare the day to baseline7 (their own prior-7-day average). " +
  "Decide 'call': what their body needs NEXT — one of rest | easy | train | push. " +
  "rest = recovery is clearly down (HRV well below usual, resting HR up, short sleep, or stacked hard days). " +
  "easy = mixed signals. train = recovered, normal session. push = recovered AND they under-moved, so do more. " +
  "ruleCall is a rule-based suggestion; agree unless the numbers clearly say otherwise. " +
  "Decide 'rating' for how the day went: great | good | okay | rough. " +
  "If isToday is true the day is still in progress: 'summary' is how it is going so far, 'next' is what to do with the rest of today and tonight. " +
  "If isToday is false: 'summary' judges how the day went (did they do too much or too little for how recovered they were), " +
  "and 'next' is what the following day should have been. " +
  "Reply with ONLY JSON: {\"call\": string, \"rating\": string, \"headline\": string (max 8 words, the verdict), " +
  "\"summary\": string (max 2 short sentences, with numbers), \"next\": string (1 short imperative sentence), " +
  "\"why\": string[] (2-3 items, each max 6 words, each with a number)}. " +
  "Plain English: 'resting heart rate' not 'RHR'. Whole numbers for steps, bpm, ms. No medical diagnoses. No exclamation points.";

export function parseVerdict(data: Record<string, unknown>, s: VerdictSnapshot): DayVerdict | null {
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");
  const call = VERDICT_CALLS.includes(data.call as VerdictCall) ? (data.call as VerdictCall) : null;
  const rating = DAY_RATINGS.includes(data.rating as DayRating) ? (data.rating as DayRating) : null;
  const headline = str(data.headline, 90);
  const summary = str(data.summary, 320);
  if (!call || !headline || !summary) return null;
  const why = Array.isArray(data.why)
    ? data.why.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 60)).slice(0, 3)
    : [];
  const fallback = ruleVerdict(s);
  return {
    date: s.date,
    call,
    rating: rating ?? fallback.rating,
    headline,
    summary,
    next: str(data.next, 200) || fallback.next,
    why: why.length ? why : fallback.why,
    source: "ai",
  };
}

export async function generateDayVerdict(env: Env, s: VerdictSnapshot): Promise<DayVerdict> {
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return ruleVerdict(s);
  try {
    const data = await callGateway(
      env,
      [
        { role: "system", content: VERDICT_PROMPT },
        { role: "user", content: `Snapshot:\n${JSON.stringify(s)}` },
      ],
      "call",
      400
    );
    return parseVerdict(data, s) ?? ruleVerdict(s);
  } catch {
    return ruleVerdict(s);
  }
}
