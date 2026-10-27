import type { DailyMetrics } from "./types";
import { BASELINE_METRICS } from "./baselines";
import { detectAnomalies, type Anomaly } from "./anomalies";
import { computeCorrelations, type CorrelationResult } from "./correlations";

/**
 * Structured weekly/monthly reports: a period compared against the
 * immediately preceding period of the same length, plus whatever
 * anomalies and notable correlations apply. Deliberately reuses the
 * existing deterministic layers (baselines' metric list, anomalies,
 * correlations) rather than recomputing anything — this is a composition
 * layer, not a new source of numbers.
 */

export type ReportPeriod = "week" | "month";

const PERIOD_LENGTH_DAYS: Record<ReportPeriod, number> = { week: 7, month: 28 };

export interface MetricChange {
  metric: string;
  currentAvg: number | null;
  previousAvg: number | null;
  changePct: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  sampleCount: number;
}

export interface PeriodReport {
  period: ReportPeriod;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  metricChanges: MetricChange[];
  anomalies: Anomaly[];
  notableCorrelations: CorrelationResult[];
  coverage: { daysWithAnyData: number; totalDaysInPeriod: number };
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function avgOf(days: DailyMetrics[], field: keyof DailyMetrics): { avg: number | null; count: number } {
  const values = days.map((d) => d[field]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return { avg: null, count: 0 };
  return { avg: values.reduce((a, b) => a + b, 0) / values.length, count: values.length };
}

export function computePeriodReport(days: DailyMetrics[], period: ReportPeriod, endDate?: string): PeriodReport | null {
  if (days.length === 0) return null;

  const len = PERIOD_LENGTH_DAYS[period];
  const requestedIdx = endDate ? days.findIndex((d) => d.date === endDate) : -1;
  const endIdx = requestedIdx >= 0 ? requestedIdx : days.length - 1;
  const end = days[endIdx].date;

  const currentSlice = days.slice(Math.max(0, endIdx - len + 1), endIdx + 1);
  const previousSlice = days.slice(Math.max(0, endIdx - len * 2 + 1), Math.max(0, endIdx - len + 1));

  const metricChanges: MetricChange[] = BASELINE_METRICS.map((field) => {
    const cur = avgOf(currentSlice, field);
    const prev = avgOf(previousSlice, field);
    let direction: MetricChange["direction"] = "unknown";
    let changePct: number | null = null;

    if (cur.avg !== null && prev.avg !== null) {
      changePct = prev.avg === 0 ? null : round(((cur.avg - prev.avg) / Math.abs(prev.avg)) * 100, 1);
      const delta = cur.avg - prev.avg;
      const threshold = Math.max(Math.abs(prev.avg) * 0.03, 0.01); // ignore <3% moves as noise
      direction = Math.abs(delta) < threshold ? "flat" : delta > 0 ? "up" : "down";
    }

    return {
      metric: field as string,
      currentAvg: cur.avg !== null ? round(cur.avg) : null,
      previousAvg: prev.avg !== null ? round(prev.avg) : null,
      changePct,
      direction,
      sampleCount: cur.count,
    };
  });

  // detectAnomalies only scans the trailing 14 days of the WHOLE dataset
  // (by design — see anomalies.ts), so a month-long report can miss an
  // anomaly from earlier in that period if the dataset's end is well past
  // it. Acceptable for a report that describes "recently", not a strict
  // historical audit.
  const anomalies = detectAnomalies(days).filter((a) => a.date >= currentSlice[0].date && a.date <= end);
  const notableCorrelations = computeCorrelations(days).filter((c) => c.strength !== "negligible" && c.strength !== "insufficient_data");

  return {
    period,
    currentStart: currentSlice[0].date,
    currentEnd: end,
    previousStart: previousSlice[0]?.date ?? currentSlice[0].date,
    previousEnd: previousSlice[previousSlice.length - 1]?.date ?? currentSlice[0].date,
    metricChanges,
    anomalies,
    notableCorrelations,
    coverage: { daysWithAnyData: currentSlice.length, totalDaysInPeriod: len },
  };
}
