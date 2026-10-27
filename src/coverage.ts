import type { DailyMetrics } from "./types";

/**
 * Data-quality/coverage engine: for every metric that appears anywhere in
 * the dataset (discovered dynamically, not a hardcoded list, so new HK
 * types showing up via the `extra` capture or future parser additions are
 * covered automatically), reports how much of the history actually has
 * that metric, when it was last seen, and whether it's gone stale.
 */

export interface MetricCoverage {
  metric: string;
  daysPresent: number;
  totalDays: number;
  coveragePct: number; // 0-1 over the full stored history
  firstSeen: string | null;
  lastSeen: string | null;
  staleDays: number; // days between lastSeen and the most recent day in the dataset
}

export interface CoverageReport {
  totalDays: number;
  dateRange: { start: string; end: string } | null;
  recentGapDays: number; // days between the most recent stored record and today
  metrics: MetricCoverage[];
}

const IGNORED_FIELDS = new Set(["date", "receivedAt", "source", "extra"]);

function toUtcDay(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDay(b) - toUtcDay(a)) / 86400000);
}

export function computeCoverage(days: DailyMetrics[]): CoverageReport {
  if (days.length === 0) return { totalDays: 0, dateRange: null, recentGapDays: 0, metrics: [] };

  const fieldSet = new Set<string>();
  for (const d of days) {
    for (const [k, v] of Object.entries(d)) {
      if (!IGNORED_FIELDS.has(k) && v !== undefined) fieldSet.add(k);
    }
  }

  const totalDays = days.length;
  const mostRecentDate = days[totalDays - 1].date;

  const metrics: MetricCoverage[] = [...fieldSet].map((field) => {
    let daysPresent = 0;
    let firstSeen: string | null = null;
    let lastSeen: string | null = null;
    for (const d of days) {
      if ((d as unknown as Record<string, unknown>)[field] !== undefined) {
        daysPresent++;
        if (!firstSeen) firstSeen = d.date;
        lastSeen = d.date;
      }
    }
    return {
      metric: field,
      daysPresent,
      totalDays,
      coveragePct: Math.round((daysPresent / totalDays) * 1000) / 1000,
      firstSeen,
      lastSeen,
      staleDays: lastSeen ? daysBetween(lastSeen, mostRecentDate) : totalDays,
    };
  });
  metrics.sort((a, b) => b.coveragePct - a.coveragePct);

  const today = new Date().toISOString().slice(0, 10);

  return {
    totalDays,
    dateRange: { start: days[0].date, end: mostRecentDate },
    recentGapDays: daysBetween(mostRecentDate, today),
    metrics,
  };
}
