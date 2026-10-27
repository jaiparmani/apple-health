import { describe, it, expect } from "vitest";
import { chronologicalAge, estimateBiologicalAge, estimateMaxHeartRate, computeStrain } from "../src/analytics";
import type { DailyMetrics, UserProfile } from "../src/types";

function day(date: string, fields: Partial<DailyMetrics>): DailyMetrics {
  return { date, receivedAt: "2026-01-01T00:00:00Z", ...fields };
}

describe("chronologicalAge", () => {
  it("computes age correctly before and after the birthday", () => {
    expect(chronologicalAge("2000-11-04", "2026-11-03")).toBe(25); // day before birthday
    expect(chronologicalAge("2000-11-04", "2026-11-04")).toBe(26); // on birthday
  });
});

describe("estimateMaxHeartRate", () => {
  it("follows the Tanaka formula", () => {
    expect(estimateMaxHeartRate(40)).toBeCloseTo(208 - 0.7 * 40, 5);
  });
});

describe("computeStrain", () => {
  it("returns null when heart rate data is missing", () => {
    expect(computeStrain(day("2026-01-01", {}), 35)).toBeNull();
  });

  it("returns a higher strain for a harder day, within the 0-21 bound", () => {
    const easy = computeStrain(day("2026-01-01", { heartRateAvg: 65, restingHeartRate: 60, exerciseMinutes: 0, activeEnergy: 100 }), 35)!;
    const hard = computeStrain(day("2026-01-01", { heartRateAvg: 140, restingHeartRate: 60, exerciseMinutes: 90, activeEnergy: 900 }), 35)!;
    expect(easy).toBeGreaterThanOrEqual(0);
    expect(hard).toBeLessThanOrEqual(21);
    expect(hard).toBeGreaterThan(easy);
  });
});

describe("estimateBiologicalAge", () => {
  const profile: UserProfile = { birthDate: "1996-01-01", sex: "male" };

  it("falls back to chronological age when no markers are available", () => {
    const result = estimateBiologicalAge([day("2026-01-01", {})], profile, "2026-01-01");
    expect(result.chronologicalAge).toBe(30);
    expect(result.biologicalAge).toBe(30);
    expect(result.markers).toEqual([]);
  });

  it("never drifts more than 15 years from chronological age even with extreme marker values", () => {
    const extreme = day("2026-01-01", { vo2max: 5, restingHeartRate: 200, hrv: 1, bodyFatPct: 60, walkingSpeed: 0.1 });
    const result = estimateBiologicalAge([extreme], profile, "2026-01-01");
    expect(result.biologicalAge).toBeLessThanOrEqual(result.chronologicalAge + 15);
    expect(result.biologicalAge).toBeGreaterThanOrEqual(result.chronologicalAge - 15);
  });

  it("never throws on a resting-heart-rate curve lookup (regression: duplicate control points caused /0)", () => {
    // Historically RHR_CURVE had two equal consecutive values, which made
    // ageForValue's extrapolation slope divide by zero (Infinity/NaN age).
    for (const rhr of [30, 50, 64, 65, 77, 90, 120]) {
      const result = estimateBiologicalAge([day("2026-01-01", { restingHeartRate: rhr })], profile, "2026-01-01");
      expect(Number.isFinite(result.biologicalAge)).toBe(true);
    }
  });

  it("produces a lower biological age for better marker values, holding everything else fixed", () => {
    const fit = day("2026-01-01", { vo2max: 50, restingHeartRate: 50, hrv: 60 });
    const unfit = day("2026-01-01", { vo2max: 20, restingHeartRate: 90, hrv: 15 });
    const fitResult = estimateBiologicalAge([fit], profile, "2026-01-01");
    const unfitResult = estimateBiologicalAge([unfit], profile, "2026-01-01");
    expect(fitResult.biologicalAge).toBeLessThan(unfitResult.biologicalAge);
  });
});
