import { describe, it, expect } from "vitest";
import { normalizePayload, mergeDaily } from "../src/normalize";

describe("normalizePayload", () => {
  it("resolves case/punctuation-insensitive aliases to canonical field names", () => {
    const result = normalizePayload({ date: "2026-01-01", "Resting Heart Rate": "58", steps: "4321" }, "shortcut");
    expect(result.restingHeartRate).toBe(58);
    expect(result.steps).toBe(4321);
  });

  it("normalizes 0-100 percentages to 0-1 for sleepEfficiency and oxygenSaturation", () => {
    const result = normalizePayload({ date: "2026-01-01", sleepEfficiency: 87, oxygenSaturation: 97 }, "shortcut");
    expect(result.sleepEfficiency).toBeCloseTo(0.87);
    expect(result.oxygenSaturation).toBeCloseTo(0.97);
  });

  it("leaves an already-fractional sleepEfficiency untouched", () => {
    const result = normalizePayload({ date: "2026-01-01", sleepEfficiency: 0.9 }, "shortcut");
    expect(result.sleepEfficiency).toBeCloseTo(0.9);
  });

  it("passes through the extra bag, dropping non-numeric values", () => {
    const result = normalizePayload({ date: "2026-01-01", extra: { UVExposure: 3, Garbage: "not a number" } }, "import");
    expect(result.extra).toEqual({ UVExposure: 3 });
  });

  it("passes through a string workoutType without running it through the numeric alias lookup", () => {
    const result = normalizePayload({ date: "2026-01-01", workoutType: "Running" }, "import");
    expect(result.workoutType).toBe("Running");
  });

  it("ignores unknown fields instead of throwing", () => {
    const result = normalizePayload({ date: "2026-01-01", madeUpField: 42 }, "shortcut");
    expect((result as unknown as Record<string, unknown>).madeUpField).toBeUndefined();
  });
});

describe("mergeDaily", () => {
  it("returns the incoming record untouched when there's nothing existing", () => {
    const incoming = normalizePayload({ date: "2026-01-01", steps: 100 }, "shortcut");
    expect(mergeDaily(null, incoming)).toEqual(incoming);
  });

  it("prefers incoming values but keeps existing fields the new payload didn't provide", () => {
    const existing = normalizePayload({ date: "2026-01-01", steps: 100, hrv: 30 }, "shortcut");
    const incoming = normalizePayload({ date: "2026-01-01", steps: 200 }, "shortcut");
    const merged = mergeDaily(existing, incoming);
    expect(merged.steps).toBe(200); // overwritten
    expect(merged.hrv).toBe(30); // preserved
  });

  it("deep-merges the extra bag instead of letting one side replace the other wholesale", () => {
    const existing = normalizePayload({ date: "2026-01-01", extra: { A: 1, B: 2 } }, "import");
    const incoming = normalizePayload({ date: "2026-01-01", extra: { B: 20, C: 3 } }, "import");
    const merged = mergeDaily(existing, incoming);
    expect(merged.extra).toEqual({ A: 1, B: 20, C: 3 });
  });
});
