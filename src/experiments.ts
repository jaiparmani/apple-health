import type { DailyMetrics } from "./types";

/**
 * Personal experiments: a user-defined behavior change ("consistent
 * 10:30pm bedtime"), tracked against one outcome metric with a simple
 * before/after comparison — the baseline period is the same length as the
 * experiment period, immediately preceding it. This is explicitly NOT a
 * controlled experiment: every result carries a confounder caveat, and
 * nothing here claims causation.
 */

export interface Experiment {
  id: string;
  title: string;
  metric: string;
  startDate: string;
  endDate?: string;
  adherenceDates: string[];
  notes?: string;
}

export interface ExperimentResult {
  experiment: Experiment;
  baselineAvg: number | null;
  duringAvg: number | null;
  sampleCountBaseline: number;
  sampleCountDuring: number;
  adherencePct: number;
  changePct: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  confounderNote: string;
}

const CONFOUNDER_NOTE =
  "Before/after comparison only, not a controlled experiment — other things that changed over the same period could explain some or all of this difference.";

function toUtcDay(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDay(b) - toUtcDay(a)) / 86400000);
}

function addDays(date: string, n: number): string {
  const dt = new Date(toUtcDay(date));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeExperimentResult(days: DailyMetrics[], exp: Experiment): ExperimentResult {
  const metric = exp.metric as keyof DailyMetrics;
  const latestDate = days[days.length - 1]?.date ?? exp.startDate;
  const endDate = exp.endDate ?? latestDate;

  const periodLen = Math.max(1, daysBetween(exp.startDate, endDate) + 1);
  const duringDays = days.filter((d) => d.date >= exp.startDate && d.date <= endDate);
  const baselineStart = addDays(exp.startDate, -periodLen);
  const baselineEnd = addDays(exp.startDate, -1);
  const baselineDays = days.filter((d) => d.date >= baselineStart && d.date <= baselineEnd);

  const duringVals = duringDays.map((d) => d[metric]).filter((v): v is number => typeof v === "number");
  const baselineVals = baselineDays.map((d) => d[metric]).filter((v): v is number => typeof v === "number");

  const duringAvg = duringVals.length > 0 ? avg(duringVals) : null;
  const baselineAvg = baselineVals.length > 0 ? avg(baselineVals) : null;

  let changePct: number | null = null;
  let direction: ExperimentResult["direction"] = "unknown";
  if (duringAvg !== null && baselineAvg !== null) {
    changePct = baselineAvg === 0 ? null : round(((duringAvg - baselineAvg) / Math.abs(baselineAvg)) * 100, 1);
    const delta = duringAvg - baselineAvg;
    const threshold = Math.max(Math.abs(baselineAvg) * 0.03, 0.01);
    direction = Math.abs(delta) < threshold ? "flat" : delta > 0 ? "up" : "down";
  }

  const elapsedDays = Math.max(1, daysBetween(exp.startDate, latestDate < endDate ? latestDate : endDate) + 1);
  const adherencePct = Math.min(100, round((exp.adherenceDates.length / elapsedDays) * 100, 1));

  return {
    experiment: exp,
    baselineAvg: baselineAvg !== null ? round(baselineAvg) : null,
    duringAvg: duringAvg !== null ? round(duringAvg) : null,
    sampleCountBaseline: baselineVals.length,
    sampleCountDuring: duringVals.length,
    adherencePct,
    changePct,
    direction,
    confounderNote: CONFOUNDER_NOTE,
  };
}
