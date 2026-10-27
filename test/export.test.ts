import { describe, it, expect } from "vitest";
import { toCsv } from "../src/export";
import type { DailyMetrics } from "../src/types";

function day(date: string, fields: Partial<DailyMetrics>): DailyMetrics {
  return { date, receivedAt: "2026-01-01T00:00:00Z", ...fields };
}

describe("toCsv", () => {
  it("returns just a header for an empty dataset", () => {
    expect(toCsv([])).toBe("date\n");
  });

  it("discovers columns dynamically and sorts them alphabetically", () => {
    const csv = toCsv([day("2026-01-01", { steps: 1000, hrv: 30 })]);
    const [header] = csv.split("\n");
    expect(header).toBe("date,hrv,steps");
  });

  it("leaves missing values blank rather than writing 'undefined'", () => {
    const csv = toCsv([day("2026-01-01", { steps: 1000 }), day("2026-01-02", { hrv: 30 })]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("2026-01-01,,1000");
    expect(lines[2]).toBe("2026-01-02,30,");
  });

  it("flattens the extra bag into extra.<key> columns", () => {
    const csv = toCsv([day("2026-01-01", { extra: { UVExposure: 3, NumberOfTimesFallen: 1 } })]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe("date,extra.NumberOfTimesFallen,extra.UVExposure");
    expect(row).toBe("2026-01-01,1,3");
  });

  it("quotes and escapes a value containing a comma or quote", () => {
    const csv = toCsv([day("2026-01-01", { workoutType: 'Running, "Fun Run"' })]);
    const [, row] = csv.trim().split("\n");
    expect(row).toBe('2026-01-01,"Running, ""Fun Run"""');
  });

  it("never drops a day even if it has no metrics at all", () => {
    const csv = toCsv([day("2026-01-01", {}), day("2026-01-02", { steps: 500 })]);
    expect(csv.trim().split("\n").length).toBe(3); // header + 2 rows
  });
});
