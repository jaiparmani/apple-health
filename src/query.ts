import type { DailyMetrics } from "./types";
import { BASELINE_METRICS } from "./baselines";

/**
 * A fixed, whitelisted query surface for "ask my health data": the LLM is
 * only ever allowed to pick a metric + date range + aggregation from this
 * menu. All arithmetic happens here, in deterministic code — the model
 * never does math on raw samples and can never cite a number we didn't
 * compute for it.
 */

export const QUERYABLE_METRICS: string[] = [
  ...(BASELINE_METRICS as string[]),
  "sleepCoreHours",
  "sleepDeepHours",
  "sleepRemHours",
  "bodyFatPct",
  "workoutCount",
  "workoutEnergy",
  "workoutDistanceKm",
  "flightsClimbed",
  "distanceKm",
  "mindfulMinutes",
];

export const AGGREGATIONS = ["average", "sum", "min", "max", "latest", "trend", "count"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export interface QuerySpec {
  metric: string;
  startDate: string;
  endDate: string;
  aggregation: Aggregation;
}

export interface QueryResult {
  spec: QuerySpec;
  sampleCount: number;
  value: number | null;
  bestDate?: string; // date of the min/max/latest value
  trendDirection?: "up" | "down" | "flat";
  trendChange?: number;
  note?: string;
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

// Clamp a requested date range to the dataset's actual bounds, so the LLM
// can never point the query outside data that exists.
export function clampDateRange(days: DailyMetrics[], startDate: string, endDate: string): { start: string; end: string } {
  if (days.length === 0) return { start: startDate, end: endDate };
  const datasetStart = days[0].date;
  const datasetEnd = days[days.length - 1].date;
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const validEnd = /^\d{4}-\d{2}-\d{2}$/.test(endDate);
  let start = validStart && startDate >= datasetStart && startDate <= datasetEnd ? startDate : datasetStart;
  let end = validEnd && endDate >= datasetStart && endDate <= datasetEnd ? endDate : datasetEnd;
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

export function runQuery(days: DailyMetrics[], spec: QuerySpec): QueryResult {
  const inRange = days.filter((d) => d.date >= spec.startDate && d.date <= spec.endDate);
  const values = inRange
    .map((d) => ({ date: d.date, value: (d as unknown as Record<string, unknown>)[spec.metric] }))
    .filter((v): v is { date: string; value: number } => typeof v.value === "number");

  if (values.length === 0) {
    return { spec, sampleCount: 0, value: null, note: "No recorded data for this metric in that date range." };
  }

  const nums = values.map((v) => v.value);

  switch (spec.aggregation) {
    case "average":
      return { spec, sampleCount: values.length, value: round(nums.reduce((a, b) => a + b, 0) / nums.length) };
    case "sum":
      return { spec, sampleCount: values.length, value: round(nums.reduce((a, b) => a + b, 0)) };
    case "count":
      return { spec, sampleCount: values.length, value: values.length };
    case "latest": {
      const last = values[values.length - 1];
      return { spec, sampleCount: values.length, value: round(last.value), bestDate: last.date };
    }
    case "min": {
      const m = values.reduce((a, b) => (b.value < a.value ? b : a));
      return { spec, sampleCount: values.length, value: round(m.value), bestDate: m.date };
    }
    case "max": {
      const m = values.reduce((a, b) => (b.value > a.value ? b : a));
      return { spec, sampleCount: values.length, value: round(m.value), bestDate: m.date };
    }
    case "trend": {
      if (values.length < 2) return { spec, sampleCount: values.length, value: null, note: "Not enough samples to compute a trend." };
      const first = values[0].value;
      const last = values[values.length - 1].value;
      const change = last - first;
      const threshold = 0.05 * Math.max(Math.abs(first), 1);
      const direction = Math.abs(change) < threshold ? "flat" : change > 0 ? "up" : "down";
      return { spec, sampleCount: values.length, value: round(last), trendDirection: direction, trendChange: round(change) };
    }
  }
}
