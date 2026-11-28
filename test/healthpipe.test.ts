import { describe, it, expect } from "vitest";
import { aggregateDay, applyPayload, isHealthPipePayload, payloadDays, type DayStore, type HpRecord } from "../src/healthpipe";

const TZ = "Asia/Kolkata";
const watch = { bundleId: "watch", device: "Watch", productType: "Watch7,14" };
const phone = { bundleId: "phone", device: "iPhone", productType: "iPhone17,5" };
const rec = (uuid: string, type: string, start: string, end: string, value: number, extra: Partial<HpRecord> = {}): HpRecord => ({
  uuid, type: `HKQuantityTypeIdentifier${type}`, start, end, value, source: watch, ...extra,
});
const payload = (records: HpRecord[], deleted: unknown[] = []) => ({ app: "HealthPipe", schema: "hp/1", records, deleted });

function run(stores: Map<string, DayStore>, date: string) {
  return aggregateDay(date, Object.values(stores.get(date) ?? {}), [], { age: 25, tz: TZ });
}

describe("HealthPipe ingest", () => {
  it("detects hp/1 payloads", () => {
    expect(isHealthPipePayload(payload([]))).toBe(true);
    expect(isHealthPipePayload({ steps: 5 })).toBe(false);
  });

  it("re-sending the same samples adds nothing (dedupe by UUID)", () => {
    const stores = new Map<string, DayStore>();
    const p = payload([rec("a", "StepCount", "2026-11-28T10:00:00+05:30", "2026-11-28T10:05:00+05:30", 500)]);
    expect(applyPayload(p, stores, TZ).added).toBe(1);
    const again = applyPayload(p, stores, TZ);
    expect(again.added).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(again.changedDays.size).toBe(0);
    expect(run(stores, "2026-11-28").steps).toBe(500);
  });

  it("incremental sends accumulate into the full-day total", () => {
    const stores = new Map<string, DayStore>();
    applyPayload(payload([rec("a", "StepCount", "2026-11-28T10:00:00+05:30", "2026-11-28T10:05:00+05:30", 500)]), stores, TZ);
    applyPayload(payload([
      rec("a", "StepCount", "2026-11-28T10:00:00+05:30", "2026-11-28T10:05:00+05:30", 500),
      rec("b", "StepCount", "2026-11-28T14:00:00+05:30", "2026-11-28T14:05:00+05:30", 300),
    ]), stores, TZ);
    expect(run(stores, "2026-11-28").steps).toBe(800);
  });

  it("does not double count Watch + iPhone steps for the same hour", () => {
    const stores = new Map<string, DayStore>();
    applyPayload(payload([
      rec("w", "StepCount", "2026-11-28T10:00:00+05:30", "2026-11-28T10:30:00+05:30", 1000),
      rec("p", "StepCount", "2026-11-28T10:00:00+05:30", "2026-11-28T10:30:00+05:30", 900, { source: phone }),
      rec("p2", "StepCount", "2026-11-28T18:00:00+05:30", "2026-11-28T18:30:00+05:30", 400, { source: phone }),
    ]), stores, TZ);
    expect(run(stores, "2026-11-28").steps).toBe(1400);
  });

  it("deletions remove samples", () => {
    const stores = new Map<string, DayStore>();
    applyPayload(payload([rec("a", "StepCount", "2026-11-28T10:00:00+05:30", "2026-11-28T10:05:00+05:30", 500)]), stores, TZ);
    const r = applyPayload(payload([], [{ uuid: "a" }]), stores, TZ);
    expect(r.deleted).toBe(1);
    expect(run(stores, "2026-11-28").steps).toBeUndefined();
  });

  it("files sleep under the wake day and computes stages", () => {
    const stores = new Map<string, DayStore>();
    const sleep = (uuid: string, s: string, e: string, valueName: string): HpRecord => ({
      uuid, type: "HKCategoryTypeIdentifierSleepAnalysis", start: s, end: e, valueName, source: watch,
    });
    applyPayload(payload([
      sleep("s1", "2026-11-27T23:30:00+05:30", "2026-11-28T01:30:00+05:30", "asleepCore"),
      sleep("s2", "2026-11-28T01:30:00+05:30", "2026-11-28T02:30:00+05:30", "asleepDeep"),
      sleep("s3", "2026-11-28T02:30:00+05:30", "2026-11-28T03:00:00+05:30", "awake"),
      sleep("s4", "2026-11-28T03:00:00+05:30", "2026-11-28T06:30:00+05:30", "asleepREM"),
    ]), stores, TZ);
    expect([...stores.keys()]).toEqual(["2026-11-28"]);
    const d = run(stores, "2026-11-28");
    expect(d.sleepHours).toBeCloseTo(6.5);
    expect(d.sleepDeepHours).toBeCloseTo(1);
    expect(d.sleepAwakeHours).toBeCloseTo(0.5);
    expect(d.extra?.sleepStartMin).toBeCloseTo(-30);
  });

  it("uses the activity summary for ring totals and goals", () => {
    const stores = new Map<string, DayStore>();
    applyPayload(payload([
      rec("e1", "ActiveEnergyBurned", "2026-11-28T10:00:00+05:30", "2026-11-28T10:01:00+05:30", 5),
      { type: "HKActivitySummaryType", start: "2026-11-28T05:30:00+05:30", end: "2026-11-29T05:30:00+05:30", value: 618,
        details: { date: "2026-11-28", activeEnergyBurned: 618, activeEnergyBurnedGoal: 360, appleExerciseTime: 73, appleExerciseTimeGoal: 30, appleStandHours: 5, appleStandHoursGoal: 6 } },
    ]), stores, TZ);
    const d = run(stores, "2026-11-28");
    expect(d.activeEnergy).toBe(618);
    expect(d.exerciseMinutes).toBe(73);
    expect(d.activeEnergyGoal).toBe(360);
    expect(d.standHours).toBe(5);
  });

  it("covers the range days so deletions can find their sample", () => {
    const days = payloadDays({ range: { start: "2026-11-27T00:00:00+05:30", end: "2026-11-28T20:00:00+05:30" }, records: [] }, TZ);
    expect(days).toContain("2026-11-27");
    expect(days).toContain("2026-11-28");
  });
});

import { coveredDays } from "../src/healthpipe";
describe("coveredDays", () => {
  it("counts only days the range covers from local midnight", () => {
    const p = { range: { start: "2026-11-26T20:46:00+05:30", end: "2026-11-28T20:46:00+05:30" } };
    expect(coveredDays(p, TZ)).toEqual(["2026-11-27", "2026-11-28"]);
  });
  it("includes the start day when the range starts exactly at midnight", () => {
    const p = { range: { start: "2026-11-28T00:00:00.000+05:30", end: "2026-11-28T20:20:11.000+05:30" } };
    expect(coveredDays(p, TZ)).toEqual(["2026-11-28"]);
  });
  it("covers nothing when the range starts mid-day and ends the same day", () => {
    const p = { range: { start: "2026-11-28T10:00:00+05:30", end: "2026-11-28T20:00:00+05:30" } };
    expect(coveredDays(p, TZ)).toEqual([]);
  });
});

describe("HealthPipe workouts", () => {
  it("reads HealthPipe's nested workout shape (activityType, duration, stats)", () => {
    const stores = new Map<string, DayStore>();
    applyPayload(payload([{
      uuid: "w1", type: "HKWorkoutTypeIdentifier", start: "2026-11-28T12:14:18+05:30", end: "2026-11-28T13:07:56+05:30", source: watch,
      details: { workout: { activityType: "traditionalStrengthTraining", duration: 3218, stats: [
        { type: "HKQuantityTypeIdentifierActiveEnergyBurned", sum: 336.8, unit: "kcal" },
        { type: "HKQuantityTypeIdentifierHeartRate", avg: 111.5, max: 135, min: 89, unit: "count/min" },
      ] } },
    }]), stores, TZ);
    const d = run(stores, "2026-11-28");
    expect(d.workoutCount).toBe(1);
    expect(d.workoutType).toBe("TraditionalStrengthTraining");
    expect(d.workoutMinutes).toBeCloseTo(53.6, 1);
    expect(d.workoutEnergy).toBeCloseTo(336.8);
    expect(d.workoutStrains?.[0].avgHR).toBeCloseTo(111.5);
  });
});
