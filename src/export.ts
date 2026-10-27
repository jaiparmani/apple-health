import type { DailyMetrics } from "./types";

/**
 * CSV export of the stored daily series. Columns are discovered dynamically
 * from whatever fields actually appear in the data (same approach as
 * coverage.ts), so new metrics show up automatically without a code change.
 * `extra` (the generic HK-type bag) is flattened into its own `extra.<key>`
 * columns rather than dropped, since it can hold real data for metrics that
 * never got a dedicated column.
 */

const BASE_IGNORED = new Set(["date", "receivedAt", "source", "extra"]);

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(days: DailyMetrics[]): string {
  if (days.length === 0) return "date\n";

  const fieldSet = new Set<string>();
  const extraKeySet = new Set<string>();
  for (const d of days) {
    for (const [k, v] of Object.entries(d)) {
      if (BASE_IGNORED.has(k) || v === undefined) continue;
      fieldSet.add(k);
    }
    if (d.extra) for (const k of Object.keys(d.extra)) extraKeySet.add(k);
  }

  const fields = [...fieldSet].sort();
  const extraKeys = [...extraKeySet].sort();
  const header = ["date", ...fields, ...extraKeys.map((k) => `extra.${k}`)];

  const rows = days.map((d) => {
    const row = [
      d.date,
      ...fields.map((f) => csvEscape((d as unknown as Record<string, unknown>)[f])),
      ...extraKeys.map((k) => csvEscape(d.extra?.[k])),
    ];
    return row.join(",");
  });

  return [header.join(","), ...rows].join("\n") + "\n";
}
