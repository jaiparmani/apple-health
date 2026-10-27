import type { DailyMetrics } from "./types";

/**
 * Correlation discovery over a FIXED, hand-picked set of metric pairs that
 * have a plausible physiological reason to relate (sleep -> next-day
 * recovery, activity -> same-night sleep). This deliberately does not
 * scan every possible pair — brute-forcing all pairs and reporting
 * whichever happen to correlate is exactly the multiple-comparisons trap
 * the brief warns against. Every result is correlation, not causation,
 * and is labeled as such.
 */

export interface CorrelationPairDef {
  id: string;
  label: string;
  metricA: keyof DailyMetrics; // the "predictor", measured on day D (or D if lagDays=0)
  metricB: keyof DailyMetrics; // the "outcome", measured on day D+lagDays
  lagDays: number;
  hypothesis: string;
}

const PAIR_DEFS: CorrelationPairDef[] = [
  { id: "sleep_next_hrv", label: "Sleep duration -> next-day HRV", metricA: "sleepHours", metricB: "hrv", lagDays: 1, hypothesis: "Longer sleep may be followed by higher HRV the next day." },
  { id: "sleep_next_rhr", label: "Sleep duration -> next-day resting heart rate", metricA: "sleepHours", metricB: "restingHeartRate", lagDays: 1, hypothesis: "Shorter sleep may be followed by a higher resting heart rate the next day." },
  // Sleep is attributed to the date it started (the evening before waking),
  // so same-night sleep after a day's exercise is lag 0, not lag 1.
  { id: "exercise_same_sleep", label: "Exercise minutes -> same-night sleep duration", metricA: "exerciseMinutes", metricB: "sleepHours", lagDays: 0, hypothesis: "More exercise during the day may relate to that night's sleep duration." },
  { id: "steps_next_hrv", label: "Daily steps -> next-day HRV", metricA: "steps", metricB: "hrv", lagDays: 1, hypothesis: "Activity volume may relate to next-day recovery." },
  { id: "strain_next_rhr", label: "Strain -> next-day resting heart rate", metricA: "strain", metricB: "restingHeartRate", lagDays: 1, hypothesis: "Higher cardiovascular load may relate to next-day resting heart rate." },
  { id: "sleep_eff_next_hrv", label: "Sleep efficiency -> next-day HRV", metricA: "sleepEfficiency", metricB: "hrv", lagDays: 1, hypothesis: "More efficient sleep may relate to next-day HRV." },
];

export interface CorrelationResult {
  id: string;
  label: string;
  hypothesis: string;
  sampleSize: number;
  r: number | null; // Pearson correlation coefficient
  strength: "negligible" | "weak" | "moderate" | "strong" | "insufficient_data";
  direction: "positive" | "negative" | null;
}

const MIN_SAMPLE_SIZE = 14;
const MIN_REPORTABLE_R = 0.25; // below this, call it negligible regardless of p-value

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

function strengthOf(r: number): CorrelationResult["strength"] {
  const abs = Math.abs(r);
  if (abs < MIN_REPORTABLE_R) return "negligible";
  if (abs < 0.4) return "weak";
  if (abs < 0.6) return "moderate";
  return "strong";
}

function dateIndex(days: DailyMetrics[]): Map<string, DailyMetrics> {
  const m = new Map<string, DailyMetrics>();
  for (const d of days) m.set(d.date, d);
  return m;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function computeCorrelation(days: DailyMetrics[], def: CorrelationPairDef): CorrelationResult {
  const byDate = dateIndex(days);
  const xs: number[] = [];
  const ys: number[] = [];

  for (const d of days) {
    const aVal = d[def.metricA];
    if (typeof aVal !== "number") continue;
    const bDate = def.lagDays === 0 ? d.date : addDays(d.date, def.lagDays);
    const bDay = byDate.get(bDate);
    const bVal = bDay ? bDay[def.metricB] : undefined;
    if (typeof bVal !== "number") continue;
    xs.push(aVal);
    ys.push(bVal);
  }

  if (xs.length < MIN_SAMPLE_SIZE) {
    return { id: def.id, label: def.label, hypothesis: def.hypothesis, sampleSize: xs.length, r: null, strength: "insufficient_data", direction: null };
  }

  const r = Math.round(pearson(xs, ys) * 1000) / 1000;
  return {
    id: def.id,
    label: def.label,
    hypothesis: def.hypothesis,
    sampleSize: xs.length,
    r,
    strength: strengthOf(r),
    direction: r === 0 ? null : r > 0 ? "positive" : "negative",
  };
}

export function computeCorrelations(days: DailyMetrics[]): CorrelationResult[] {
  return PAIR_DEFS.map((def) => computeCorrelation(days, def));
}
