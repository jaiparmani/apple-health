import type { DailyMetrics, RecoverySnapshot, SleepAnalysis, IllnessSignal } from "./types";

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
  recovery: RecoverySnapshot | null;
  sleepAnalysis: SleepAnalysis | null;
  illnessSignal: IllnessSignal | null;
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
 * Enhanced 5-pillar recovery score (Whoop-style): HRV, resting HR,
 * respiratory rate, SpO2, wrist temperature — all z-scored against trailing
 * 30-day baseline — plus a sleep quality component. Returns a full
 * RecoverySnapshot with per-pillar z-scores for the breakdown card.
 */
function computeRecovery(days: DailyMetrics[], sleepTarget = 7.5): RecoverySnapshot | null {
  if (days.length === 0) return null;
  const today = days[days.length - 1];
  const baseline = days.slice(-30, -1);
  if (baseline.length < 5) return null;

  let score = 50;
  let signals = 0;
  let hrvZ: number | null = null;
  let rhrZ: number | null = null;
  let respRateZ: number | null = null;
  let spo2Z: number | null = null;
  let tempDeviationC: number | null = null;
  let sleepScore: number | null = null;

  // Pillar 1: HRV (higher is better) — weight 25
  const hrvVals = baseline.map((d) => d.hrv).filter((v): v is number => typeof v === "number");
  if (typeof today.hrv === "number" && hrvVals.length >= 3) {
    const m = hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length;
    const sd = stddev(hrvVals) || 1;
    hrvZ = (today.hrv - m) / sd;
    score += Math.max(-12.5, Math.min(12.5, hrvZ * 6));
    signals++;
  }

  // Pillar 2: Resting HR (lower is better) — weight 25
  const rhrVals = baseline.map((d) => d.restingHeartRate).filter((v): v is number => typeof v === "number");
  if (typeof today.restingHeartRate === "number" && rhrVals.length >= 3) {
    const m = rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length;
    const sd = stddev(rhrVals) || 1;
    rhrZ = (m - today.restingHeartRate) / sd;
    score += Math.max(-12.5, Math.min(12.5, rhrZ * 6));
    signals++;
  }

  // Pillar 3: Respiratory rate (lower is better) — weight 15
  const respVals = baseline.map((d) => d.respiratoryRate).filter((v): v is number => typeof v === "number");
  if (typeof today.respiratoryRate === "number" && respVals.length >= 3) {
    const m = respVals.reduce((a, b) => a + b, 0) / respVals.length;
    const sd = stddev(respVals) || 1;
    respRateZ = (m - today.respiratoryRate) / sd;
    score += Math.max(-7.5, Math.min(7.5, respRateZ * 4));
    signals++;
  }

  // Pillar 4: SpO2 (higher is better) — weight 10
  const spo2Vals = baseline.map((d) => d.oxygenSaturation).filter((v): v is number => typeof v === "number");
  if (typeof today.oxygenSaturation === "number" && spo2Vals.length >= 3) {
    const m = spo2Vals.reduce((a, b) => a + b, 0) / spo2Vals.length;
    const sd = stddev(spo2Vals) || 0.005;
    spo2Z = (today.oxygenSaturation - m) / sd;
    score += Math.max(-5, Math.min(5, spo2Z * 3));
    signals++;
  }

  // Pillar 5: Wrist temperature deviation — weight 10
  const tempField = today.extra?.["AppleSleepingWristTemperature"];
  const tempVals = baseline.map((d) => d.extra?.["AppleSleepingWristTemperature"]).filter((v): v is number => typeof v === "number");
  if (typeof tempField === "number" && tempVals.length >= 3) {
    const m = tempVals.reduce((a, b) => a + b, 0) / tempVals.length;
    tempDeviationC = tempField - m;
    const penalty = Math.max(0, Math.abs(tempDeviationC) - 0.3) * 10;
    score -= Math.min(5, penalty);
    signals++;
  }

  // Sleep quality component — weight 15
  if (typeof today.sleepHours === "number") {
    const hoursScore = Math.min(1, today.sleepHours / sleepTarget) * 40;
    const effScore = typeof today.sleepEfficiency === "number" ? today.sleepEfficiency * 30 : 15;
    const deepRemScore = (typeof today.sleepDeepHours === "number" && typeof today.sleepRemHours === "number" && today.sleepHours > 0)
      ? Math.min(1, (today.sleepDeepHours + today.sleepRemHours) / (today.sleepHours * 0.4)) * 30
      : 15;
    sleepScore = Math.round(hoursScore + effScore + deepRemScore);
    const sleepContribution = (sleepScore / 100 - 0.5) * 15;
    score += Math.max(-7.5, Math.min(7.5, sleepContribution));
    signals++;
  }

  if (signals === 0) return null;
  return {
    date: today.date,
    score: Math.round(Math.max(0, Math.min(100, score))),
    hrvZ: hrvZ !== null ? Math.round(hrvZ * 100) / 100 : null,
    rhrZ: rhrZ !== null ? Math.round(rhrZ * 100) / 100 : null,
    respRateZ: respRateZ !== null ? Math.round(respRateZ * 100) / 100 : null,
    spo2Z: spo2Z !== null ? Math.round(spo2Z * 100) / 100 : null,
    tempDeviationC: tempDeviationC !== null ? Math.round(tempDeviationC * 100) / 100 : null,
    sleepScore,
  };
}

function readinessScore(days: DailyMetrics[]): number | null {
  const recovery = computeRecovery(days);
  return recovery?.score ?? null;
}

/**
 * Illness prediction: compounds elevated RHR, depressed HRV, elevated
 * respiratory rate, and elevated wrist temperature into a 0-100 likelihood
 * score. Each signal contributes 25 points when 2+ stddevs from baseline.
 */
function computeIllnessSignal(days: DailyMetrics[]): IllnessSignal | null {
  if (days.length === 0) return null;
  const today = days[days.length - 1];
  const baseline = days.slice(-30, -1);
  if (baseline.length < 7) return null;

  let score = 0;
  const signals = { rhrElevated: false, hrvDepressed: false, tempElevated: false, respRateElevated: false };

  const rhrVals = baseline.map((d) => d.restingHeartRate).filter((v): v is number => typeof v === "number");
  if (typeof today.restingHeartRate === "number" && rhrVals.length >= 5) {
    const m = rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length;
    const sd = stddev(rhrVals) || 1;
    const z = (today.restingHeartRate - m) / sd;
    if (z > 1.5) { signals.rhrElevated = true; score += Math.min(25, z * 10); }
  }

  const hrvVals = baseline.map((d) => d.hrv).filter((v): v is number => typeof v === "number");
  if (typeof today.hrv === "number" && hrvVals.length >= 5) {
    const m = hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length;
    const sd = stddev(hrvVals) || 1;
    const z = (m - today.hrv) / sd;
    if (z > 1.5) { signals.hrvDepressed = true; score += Math.min(25, z * 10); }
  }

  const tempVals = baseline.map((d) => d.extra?.["AppleSleepingWristTemperature"]).filter((v): v is number => typeof v === "number");
  const todayTemp = today.extra?.["AppleSleepingWristTemperature"];
  if (typeof todayTemp === "number" && tempVals.length >= 5) {
    const m = tempVals.reduce((a, b) => a + b, 0) / tempVals.length;
    const deviation = todayTemp - m;
    if (deviation > 0.5) { signals.tempElevated = true; score += Math.min(25, deviation * 20); }
  }

  const respVals = baseline.map((d) => d.respiratoryRate).filter((v): v is number => typeof v === "number");
  if (typeof today.respiratoryRate === "number" && respVals.length >= 5) {
    const m = respVals.reduce((a, b) => a + b, 0) / respVals.length;
    const sd = stddev(respVals) || 0.5;
    const z = (today.respiratoryRate - m) / sd;
    if (z > 1.5) { signals.respRateElevated = true; score += Math.min(25, z * 10); }
  }

  const flagCount = Object.values(signals).filter(Boolean).length;
  if (flagCount === 0) return null;

  const clamped = Math.round(Math.min(100, score));
  const likelihood = clamped >= 60 ? "high" : clamped >= 30 ? "moderate" : "low";
  const flagNames: string[] = [];
  if (signals.rhrElevated) flagNames.push("elevated resting HR");
  if (signals.hrvDepressed) flagNames.push("depressed HRV");
  if (signals.tempElevated) flagNames.push("elevated wrist temp");
  if (signals.respRateElevated) flagNames.push("elevated respiratory rate");

  return {
    date: today.date,
    likelihood,
    score: clamped,
    signals,
    detail: `${flagCount} signal${flagCount > 1 ? "s" : ""}: ${flagNames.join(", ")}. ${likelihood === "high" ? "Consider resting and monitoring symptoms." : likelihood === "moderate" ? "Keep today easy and monitor." : "Mild deviation — probably fine, but watch it."}`,
  };
}

/**
 * Comprehensive sleep analysis: dynamic need, consistency, performance
 * composite, onset latency, optimal bedtime recommendation.
 */
function computeSleepAnalysis(days: DailyMetrics[], sleepTarget = 7.5): SleepAnalysis | null {
  const last14 = days.slice(-14);
  const sleepDays = last14.filter((d) => typeof d.sleepHours === "number");
  if (sleepDays.length < 3) return null;

  const sleepVals = sleepDays.map((d) => d.sleepHours!);
  const avgHours = sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length;

  // Dynamic sleep need: base target + strain adjustment + debt recovery
  const last7 = days.slice(-7);
  const strainVals = last7.map((d) => d.strain).filter((v): v is number => typeof v === "number");
  const avgStrain = strainVals.length ? strainVals.reduce((a, b) => a + b, 0) / strainVals.length : 0;
  const strainAdjustment = Math.max(0, (avgStrain - 10) * 0.05);
  const sleepDebtRaw = last7.filter((d) => typeof d.sleepHours === "number")
    .reduce((debt, d) => debt + Math.max(0, sleepTarget - d.sleepHours!), 0);
  const debtRecovery = Math.min(0.5, sleepDebtRaw * 0.1);
  const dynamicNeedHours = Math.round((sleepTarget + strainAdjustment + debtRecovery) * 10) / 10;

  // Sleep debt (7-day)
  const debtHours = Math.round(sleepDebtRaw * 10) / 10;

  // Sleep consistency: stddev of sleep and wake times (approximated from
  // sleepInBedHours start). Lower stddev = more consistent.
  const inBedDays = last14.filter((d) => typeof d.sleepInBedHours === "number" && typeof d.sleepHours === "number");
  let consistencyScore: number | null = null;
  let bedtimeStddevMin: number | null = null;
  let wakeStddevMin: number | null = null;
  if (inBedDays.length >= 5) {
    const totalHours = inBedDays.map((d) => d.sleepInBedHours!);
    const sleepHrs = inBedDays.map((d) => d.sleepHours!);
    bedtimeStddevMin = Math.round(stddev(totalHours) * 60);
    wakeStddevMin = Math.round(stddev(sleepHrs) * 60);
    const avgStddev = (bedtimeStddevMin + wakeStddevMin) / 2;
    consistencyScore = Math.round(Math.max(0, Math.min(100, 100 - avgStddev * 1.5)));
  }

  // Sleep performance composite: duration (30%), efficiency (25%),
  // deep+REM ratio (25%), consistency (20%)
  const durationScore = Math.min(100, (avgHours / dynamicNeedHours) * 100);
  const effVals = sleepDays.map((d) => d.sleepEfficiency).filter((v): v is number => typeof v === "number");
  const effScore = effVals.length ? (effVals.reduce((a, b) => a + b, 0) / effVals.length) * 100 : 50;
  const deepRemDays = sleepDays.filter((d) => typeof d.sleepDeepHours === "number" && typeof d.sleepRemHours === "number" && d.sleepHours! > 0);
  const stageScore = deepRemDays.length
    ? Math.min(100, deepRemDays.reduce((a, d) => a + (d.sleepDeepHours! + d.sleepRemHours!) / d.sleepHours!, 0) / deepRemDays.length * 250)
    : 50;
  const performanceScore = Math.round(durationScore * 0.3 + effScore * 0.25 + stageScore * 0.25 + (consistencyScore ?? 50) * 0.2);

  // Sleep onset latency
  const latencyDays = sleepDays.filter((d) => typeof d.sleepInBedHours === "number" && typeof d.sleepAwakeHours === "number");
  let onsetLatencyMin: number | null = null;
  if (latencyDays.length >= 3) {
    const latencies = latencyDays.map((d) => Math.max(0, (d.sleepInBedHours! - d.sleepHours! - d.sleepAwakeHours!) * 60));
    onsetLatencyMin = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  }

  // Optimal bedtime: work backward from typical wake time using dynamic need
  let optimalBedtime: string | null = null;
  if (inBedDays.length >= 5) {
    const avgInBed = inBedDays.reduce((a, d) => a + d.sleepInBedHours!, 0) / inBedDays.length;
    const estimatedWakeHour = 7;
    const bedHour = estimatedWakeHour - dynamicNeedHours - (avgInBed - avgHours > 0 ? (avgInBed - avgHours) * 0.5 : 0);
    const adjHour = bedHour < 0 ? bedHour + 24 : bedHour;
    const h = Math.floor(adjHour);
    const m = Math.round((adjHour - h) * 60);
    optimalBedtime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return {
    avgHours: Math.round(avgHours * 10) / 10,
    dynamicNeedHours,
    debtHours,
    consistencyScore,
    performanceScore: Math.round(Math.max(0, Math.min(100, performanceScore))),
    onsetLatencyMin,
    optimalBedtime,
    bedtimeStddevMin,
    wakeStddevMin,
  };
}

export function computeTrends(days: DailyMetrics[], sleepTarget = 7.5): Trends {
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
    recovery: computeRecovery(days, sleepTarget),
    sleepAnalysis: computeSleepAnalysis(days, sleepTarget),
    illnessSignal: computeIllnessSignal(days),
  };
}
