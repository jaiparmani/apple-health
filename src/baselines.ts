import type { DailyMetrics } from "./types";

/**
 * Personal baselines: for a handful of metrics, "normal" is defined by YOUR
 * OWN recent history over a rolling window, not a population reference
 * curve. This is deliberately separate from analytics.ts's biological-age
 * curves (which are population-average by design) — baselines answer "is
 * this high or low FOR ME", not "what age does this value imply".
 */

export const BASELINE_METRICS: (keyof DailyMetrics)[] = [
  "restingHeartRate",
  "hrv",
  "heartRateAvg",
  "vo2max",
  "steps",
  "activeEnergy",
  "exerciseMinutes",
  "standMinutes",
  "sleepHours",
  "sleepEfficiency",
  "weightKg",
  "walkingSpeed",
  "strain",
  "workoutMinutes",
];

export interface BaselineStats {
  metric: string;
  windowDays: number;
  sampleCount: number;
  coverage: number; // 0-1, sampleCount / calendar days in the window
  sufficient: boolean; // enough samples to trust mean/stddev/trend
  mean: number;
  median: number;
  stddev: number;
  p25: number;
  p75: number;
  trend: "up" | "down" | "flat" | "unknown";
  latest?: number;
  zScore?: number; // how many stddevs the latest value is from the baseline mean
}

function round(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Least-squares slope of value vs. day index, normalized by the series'
// own spread so "trend" reflects a real directional move rather than
// noise. A slope under ~0.15 stddev per the window is called "flat".
function trendDirection(values: number[]): BaselineStats["trend"] {
  const n = values.length;
  if (n < 4) return "unknown";
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return "flat";
  const slope = num / den;
  const sd = stddev(values, yMean);
  if (sd === 0) return "flat";
  const normalizedSlope = (slope * n) / sd; // total change over the window, in stddevs
  if (normalizedSlope > 0.5) return "up";
  if (normalizedSlope < -0.5) return "down";
  return "flat";
}

const MIN_SAMPLES = 5;
const MIN_COVERAGE = 0.4;

export function computeBaseline(allDays: DailyMetrics[], field: keyof DailyMetrics, windowDays: number): BaselineStats | null {
  const windowSlice = allDays.slice(-windowDays);
  if (windowSlice.length === 0) return null;

  const values = windowSlice
    .map((d) => d[field])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;

  const sampleCount = values.length;
  const coverage = sampleCount / windowSlice.length;
  const sufficient = sampleCount >= MIN_SAMPLES && coverage >= MIN_COVERAGE;

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / sampleCount;
  const sd = stddev(values, mean);

  const latestRaw = windowSlice[windowSlice.length - 1][field];
  const latest = typeof latestRaw === "number" ? latestRaw : undefined;
  const zScore = sufficient && sd > 0 && latest !== undefined ? (latest - mean) / sd : undefined;

  return {
    metric: field as string,
    windowDays,
    sampleCount,
    coverage: round(coverage, 3),
    sufficient,
    mean: round(mean, 2),
    median: round(median(sorted), 2),
    stddev: round(sd, 2),
    p25: round(percentile(sorted, 25), 2),
    p75: round(percentile(sorted, 75), 2),
    trend: sufficient ? trendDirection(values) : "unknown",
    latest,
    zScore: zScore !== undefined ? round(zScore, 2) : undefined,
  };
}

export function computeBaselines(days: DailyMetrics[], windowDays: number): BaselineStats[] {
  return BASELINE_METRICS.map((field) => computeBaseline(days, field, windowDays)).filter(
    (b): b is BaselineStats => b !== null
  );
}
