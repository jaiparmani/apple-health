import type { DailyMetrics } from "./types";

type NumericField = Exclude<
  { [K in keyof DailyMetrics]: DailyMetrics[K] extends number | undefined ? K : never }[keyof DailyMetrics],
  undefined
>;

function avg(days: DailyMetrics[], field: NumericField): number | null {
  const values = days.map((d) => d[field]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface PeriodAverages {
  restingHeartRate: number | null;
  heartRateAvg: number | null;
  hrv: number | null;
  vo2max: number | null;
  steps: number | null;
  activeEnergy: number | null;
  exerciseMinutes: number | null;
  standMinutes: number | null;
  sleepHours: number | null;
  weightKg: number | null;
  walkingSpeed: number | null;
}

const PERIOD_FIELDS: NumericField[] = [
  "restingHeartRate",
  "heartRateAvg",
  "hrv",
  "vo2max",
  "steps",
  "activeEnergy",
  "exerciseMinutes",
  "standMinutes",
  "sleepHours",
  "weightKg",
  "walkingSpeed",
];

function periodAverages(days: DailyMetrics[]): PeriodAverages {
  const out = {} as PeriodAverages;
  for (const f of PERIOD_FIELDS) (out as unknown as Record<string, number | null>)[f] = avg(days, f);
  return out;
}

export interface PersonalBest {
  value: number;
  date: string;
}

export interface Trends {
  last7: PeriodAverages;
  prev7: PeriodAverages;
  last30: PeriodAverages;
  bests: {
    lowestRestingHeartRate: PersonalBest | null;
    highestHrv: PersonalBest | null;
    highestVo2max: PersonalBest | null;
    mostSteps: PersonalBest | null;
    fastestWalkingSpeed: PersonalBest | null;
    longestExerciseMinutes: PersonalBest | null;
  };
  stepGoalStreakDays: number;
  readinessScore: number | null; // 0-100, today vs trailing 30-day baseline
}

function best(days: DailyMetrics[], field: NumericField, pick: "min" | "max"): PersonalBest | null {
  let result: PersonalBest | null = null;
  for (const d of days) {
    const v = d[field];
    if (typeof v !== "number") continue;
    if (!result || (pick === "min" ? v < result.value : v > result.value)) {
      result = { value: v, date: d.date };
    }
  }
  return result;
}

function stepGoalStreak(days: DailyMetrics[], goal: number): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const steps = days[i].steps;
    if (typeof steps === "number" && steps >= goal) streak++;
    else break;
  }
  return streak;
}

/**
 * A 0-100 "how recovered are you today" score: today's HRV and resting HR
 * compared to their own trailing 30-day mean/spread (z-scores), blended with
 * last night's sleep vs. 7.5h target. Purely relative to the user's own
 * recent baseline — never compared across people — so it stays meaningful
 * even though the absolute HRV/RHR numbers vary hugely person to person.
 */
function readinessScore(days: DailyMetrics[]): number | null {
  if (days.length === 0) return null;
  const today = days[days.length - 1];
  const baseline = days.slice(-30, -1); // trailing 30 days, excluding today
  if (baseline.length < 5) return null;

  let score = 50;
  let signals = 0;

  const hrvBaseline = baseline.map((d) => d.hrv).filter((v): v is number => typeof v === "number");
  if (typeof today.hrv === "number" && hrvBaseline.length >= 3) {
    const m = hrvBaseline.reduce((a, b) => a + b, 0) / hrvBaseline.length;
    const sd = stddev(hrvBaseline) || 1;
    const z = (today.hrv - m) / sd;
    score += Math.max(-25, Math.min(25, z * 12));
    signals++;
  }

  const rhrBaseline = baseline.map((d) => d.restingHeartRate).filter((v): v is number => typeof v === "number");
  if (typeof today.restingHeartRate === "number" && rhrBaseline.length >= 3) {
    const m = rhrBaseline.reduce((a, b) => a + b, 0) / rhrBaseline.length;
    const sd = stddev(rhrBaseline) || 1;
    const z = (m - today.restingHeartRate) / sd; // lower RHR than baseline is better
    score += Math.max(-25, Math.min(25, z * 12));
    signals++;
  }

  if (typeof today.sleepHours === "number") {
    const deviation = today.sleepHours - 7.5;
    score += Math.max(-15, Math.min(15, deviation * 6));
    signals++;
  }

  if (signals === 0) return null;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function computeTrends(days: DailyMetrics[]): Trends {
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const last30 = days.slice(-30);

  return {
    last7: periodAverages(last7),
    prev7: periodAverages(prev7),
    last30: periodAverages(last30),
    bests: {
      lowestRestingHeartRate: best(days, "restingHeartRate", "min"),
      highestHrv: best(days, "hrv", "max"),
      highestVo2max: best(days, "vo2max", "max"),
      mostSteps: best(days, "steps", "max"),
      fastestWalkingSpeed: best(days, "walkingSpeed", "max"),
      longestExerciseMinutes: best(days, "exerciseMinutes", "max"),
    },
    stepGoalStreakDays: stepGoalStreak(days, 8000),
    readinessScore: readinessScore(days),
  };
}
