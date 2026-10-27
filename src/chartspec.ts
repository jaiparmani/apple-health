import type { DailyMetrics } from "./types";
import { QUERYABLE_METRICS, clampDateRange } from "./query";

/**
 * AI-generated chart specs: the model picks a chart type, 1-3 metrics
 * (from the same whitelist "ask my health data" uses), and a date range —
 * nothing else. The app then queries the real stored data and renders it
 * with the existing Chart.js infrastructure. The model's output is never
 * executed as code and never supplies the actual data points.
 */

export const CHART_TYPES = ["line", "bar"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartSpec {
  title: string;
  type: ChartType;
  metrics: string[];
  startDate: string;
  endDate: string;
}

export interface ChartSeries {
  metric: string;
  values: (number | null)[];
}

export interface ChartData {
  spec: ChartSpec;
  labels: string[];
  series: ChartSeries[];
}

const MAX_METRICS = 3;

/**
 * Validates and clamps a raw (untrusted, model-produced) chart spec into
 * one that's safe to query: unknown metrics are dropped (not substituted
 * with something close), an unknown type falls back to "line", and the
 * date range is clamped to the dataset's actual bounds. Returns null only
 * when NO valid metric survives — there's nothing meaningful to chart.
 */
export function sanitizeChartSpec(days: DailyMetrics[], raw: Partial<ChartSpec>): ChartSpec | null {
  const metrics = Array.isArray(raw.metrics)
    ? raw.metrics.filter((m): m is string => typeof m === "string" && QUERYABLE_METRICS.includes(m)).slice(0, MAX_METRICS)
    : [];
  if (metrics.length === 0) return null;

  const type: ChartType = CHART_TYPES.includes(raw.type as ChartType) ? (raw.type as ChartType) : "line";
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : metrics.join(" vs ");

  const datasetStart = days[0]?.date ?? "2000-01-01";
  const datasetEnd = days[days.length - 1]?.date ?? datasetStart;
  const { start, end } = clampDateRange(
    days,
    typeof raw.startDate === "string" ? raw.startDate : datasetStart,
    typeof raw.endDate === "string" ? raw.endDate : datasetEnd
  );

  return { title, type, metrics, startDate: start, endDate: end };
}

export function buildChartData(days: DailyMetrics[], spec: ChartSpec): ChartData {
  const inRange = days.filter((d) => d.date >= spec.startDate && d.date <= spec.endDate);
  const labels = inRange.map((d) => d.date);
  const series: ChartSeries[] = spec.metrics.map((metric) => ({
    metric,
    values: inRange.map((d) => {
      const v = (d as unknown as Record<string, unknown>)[metric];
      return typeof v === "number" ? v : null;
    }),
  }));
  return { spec, labels, series };
}
