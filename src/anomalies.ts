import type { DailyMetrics } from "./types";
import { computeBaseline, BASELINE_METRICS } from "./baselines";

/**
 * Anomaly detection: flags days in the recent window where a metric sat
 * unusually far from the person's own baseline (NOT a population range).
 * Entirely rule-based and deterministic — no LLM involved, so there's no
 * risk of an invented explanation. "Related observations" are other
 * metrics from the SAME day, reported as-measured, never interpreted as
 * a cause.
 */

export interface Anomaly {
  date: string;
  metric: string;
  value: number;
  baselineMean: number;
  baselineStddev: number;
  zScore: number;
  direction: "above" | "below";
  relatedObservations: Record<string, number>;
}

const ANOMALY_WINDOW_DAYS = 14; // look for anomalies in the most recent N days
const BASELINE_WINDOW_DAYS = 30; // baseline computed from the 30 days ending on each candidate day
const Z_THRESHOLD = 2; // ~2 stddev from personal baseline

// Metrics to surface as same-day context when something else is flagged,
// so the anomaly carries real observations rather than a guess.
const CONTEXT_METRICS: (keyof DailyMetrics)[] = ["sleepHours", "exerciseMinutes", "steps", "activeEnergy", "strain"];

export function detectAnomalies(days: DailyMetrics[]): Anomaly[] {
  if (days.length < BASELINE_WINDOW_DAYS + 5) return [];

  const anomalies: Anomaly[] = [];
  const candidates = days.slice(-ANOMALY_WINDOW_DAYS);

  for (const candidate of candidates) {
    const candidateIdx = days.findIndex((d) => d.date === candidate.date);
    if (candidateIdx < BASELINE_WINDOW_DAYS) continue;
    // Baseline from the 30 days strictly BEFORE this candidate day, so the
    // candidate's own value never inflates its own baseline.
    const priorWindow = days.slice(Math.max(0, candidateIdx - BASELINE_WINDOW_DAYS), candidateIdx);

    for (const field of BASELINE_METRICS) {
      const value = candidate[field];
      if (typeof value !== "number") continue;
      const baseline = computeBaseline(priorWindow, field, BASELINE_WINDOW_DAYS);
      if (!baseline || !baseline.sufficient || baseline.stddev === 0) continue;

      const z = (value - baseline.mean) / baseline.stddev;
      if (Math.abs(z) < Z_THRESHOLD) continue;

      const relatedObservations: Record<string, number> = {};
      for (const ctx of CONTEXT_METRICS) {
        if (ctx === field) continue;
        const ctxVal = candidate[ctx];
        if (typeof ctxVal === "number") relatedObservations[ctx as string] = ctxVal;
      }

      anomalies.push({
        date: candidate.date,
        metric: field as string,
        value,
        baselineMean: baseline.mean,
        baselineStddev: baseline.stddev,
        zScore: Math.round(z * 100) / 100,
        direction: z > 0 ? "above" : "below",
        relatedObservations,
      });
    }
  }

  // Most extreme deviations first.
  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  return anomalies;
}
