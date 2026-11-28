import type { DailyMetrics } from "./types";
import { computeWorkoutStrain, estimateMaxHeartRate } from "./analytics";

/**
 * HealthPipe (gethealthpipe.com) "hp/1" raw-sample ingest.
 *
 * HealthPipe posts raw HealthKit samples, each with its HealthKit UUID. The
 * same samples are re-sent on every run (a "today" or "last N days" window),
 * so the server keeps a per-day store of samples keyed by UUID: re-sends are
 * idempotent, only genuinely new samples change anything, and deletions in
 * `deleted` remove samples. Each touched day is then re-aggregated from the
 * FULL unique set — never from one payload — into the same DailyMetrics the
 * HealthSync iOS app produced (same sleep-night rules, HR-zone math, etc.).
 */

export interface HpRecord {
  uuid?: string;
  type: string;
  start: string;
  end: string;
  value?: number;
  valueName?: string;
  unit?: string;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  source?: { bundleId?: string; device?: string; productType?: string; name?: string };
}

export interface HpPayload {
  types?: string[];
  app?: string;
  schema?: string;
  range?: { start?: string; end?: string };
  records?: HpRecord[];
  deleted?: unknown[];
}

/** Compact stored sample. Kept small: a day can hold several thousand. */
export interface StoredSample {
  t: string; // type with HK prefix stripped, e.g. "StepCount", "SleepAnalysis", "Workout", "ActivitySummary"
  s: number; // start, epoch ms
  e: number; // end, epoch ms
  v?: number;
  n?: string; // category valueName
  src?: string; // source bundle id
  w?: 1; // source is an Apple Watch
  d?: Record<string, unknown>; // details (activity summary / workout only)
}

export type DayStore = Record<string, StoredSample>; // uuid -> sample

export function isHealthPipePayload(body: unknown): body is HpPayload {
  if (typeof body !== "object" || body === null) return false;
  const b = body as HpPayload;
  return (typeof b.schema === "string" && b.schema.startsWith("hp/")) || (b.app === "HealthPipe" && Array.isArray(b.records));
}

export function shortType(type: string): string {
  if (/^HKWorkout(Type|ActivityType)/.test(type) || type === "workout") return "Workout";
  if (type === "HKActivitySummaryType") return "ActivitySummary";
  return type.replace(/^HK(Quantity|Category|Correlation)TypeIdentifier|^HKDataTypeIdentifier/, "");
}

/** YYYY-MM-DD of an instant in the user's timezone. */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
const dayCache = new Map<string, string>(); // "tz|hour" -> date; every sample in an hour shares a date
export function localDate(ms: number, tz: string): string {
  const hourKey = `${tz}|${Math.floor(ms / 3600_000)}`;
  const hit = dayCache.get(hourKey);
  if (hit) return hit;
  let fmt = fmtCache.get(tz);
  if (!fmt) { fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz }); fmtCache.set(tz, fmt); }
  const out = fmt.format(new Date(ms));
  if (dayCache.size > 5000) dayCache.clear();
  dayCache.set(hourKey, out);
  return out;
}

/** Start-of-day epoch ms for a local date (handles fixed-offset zones like Asia/Kolkata exactly). */
export function localDayStart(date: string, tz: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return guess - (asLocal - guess);
}

const SLEEP_TYPES = new Set(["SleepAnalysis", "AppleSleepingWristTemperature"]);

/**
 * The day a sample belongs to. Sleep (and wrist temperature) belong to the
 * night that ENDS on a day — the iOS app's window 18:00 the evening before →
 * 18:00 that day — so shift by 6h. Activity summaries carry their own date.
 */
export function sampleDay(sample: StoredSample, tz: string): string {
  if (sample.t === "ActivitySummary" && typeof sample.d?.date === "string") return sample.d.date as string;
  if (SLEEP_TYPES.has(sample.t)) return localDate(sample.s + 6 * 3600_000, tz);
  return localDate(sample.s, tz);
}

export function compact(r: HpRecord): StoredSample | null {
  const s = Date.parse(r.start);
  const e = Date.parse(r.end ?? r.start);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const t = shortType(r.type);
  const out: StoredSample = { t, s, e };
  if (typeof r.value === "number" && Number.isFinite(r.value)) out.v = Math.round(normalizeUnit(t, r.value, r.unit) * 1e4) / 1e4;
  if (typeof r.valueName === "string") out.n = r.valueName;
  // Bundle ids are long ("com.apple.health.<UUID>") and repeat on every
  // sample; only their identity matters, so keep a short tail.
  if (r.source?.bundleId) out.src = r.source.bundleId.slice(-8);
  if (r.source?.device === "Watch" || r.source?.productType?.startsWith("Watch")) out.w = 1;
  if ((t === "ActivitySummary" || t === "Workout") && r.details) out.d = r.details;
  if (t === "Workout") {
    // Workout fields may live on the record itself rather than in details.
    const { uuid: _u, type: _t, start: _s, end: _e, source: _src, metadata: _m, details: _d, ...rest } = r as unknown as Record<string, unknown>;
    out.d = { ...rest, ...(r.details ?? {}) };
  }
  return out;
}

/** Bring a value into the unit the DailyMetrics fields use. */
function normalizeUnit(t: string, v: number, unit?: string): number {
  const u = (unit ?? "").toLowerCase();
  if (t.startsWith("Distance")) {
    if (u === "m") return v / 1000;
    if (u === "mi") return v * 1.60934;
    if (u === "ft") return v * 0.0003048;
    return v;
  }
  if (u === "kj") return v / 4.184;
  if (u === "degf") return ((v - 32) * 5) / 9;
  if (u === "lb") return v * 0.453592;
  if (u.includes("km/hr") || u.includes("km/h")) return v / 3.6;
  if (u.includes("mi/hr") || u.includes("mph")) return v * 0.44704;
  if (u === "%" && v > 1) return v / 100;
  return v;
}

/** Deleted entries may be bare UUID strings or objects carrying one. */
export function deletedUuids(deleted: unknown[] | undefined): string[] {
  const out: string[] = [];
  for (const d of deleted ?? []) {
    if (typeof d === "string") out.push(d);
    else if (d && typeof d === "object" && typeof (d as { uuid?: unknown }).uuid === "string") out.push((d as { uuid: string }).uuid);
  }
  return out;
}

/** Stable key for records without a UUID (e.g. the activity summary). */
export function recordKey(r: HpRecord, sample: StoredSample): string {
  if (r.uuid) return r.uuid;
  if (sample.t === "ActivitySummary") return `summary:${sample.d?.date ?? sample.s}`;
  return `${sample.t}:${sample.s}:${sample.e}:${sample.src ?? ""}`;
}

/**
 * Merge a payload into per-day stores. Returns the set of days whose store
 * actually changed (new UUID, changed value, or deletion).
 */
export function applyPayload(
  payload: HpPayload,
  stores: Map<string, DayStore>,
  tz: string
): { changedDays: Set<string>; added: number; duplicates: number; deleted: number } {
  const changedDays = new Set<string>();
  let added = 0, duplicates = 0, deleted = 0;
  for (const r of payload.records ?? []) {
    if (!r || typeof r.type !== "string" || typeof r.start !== "string") continue;
    const sample = compact(r);
    if (!sample) continue;
    const day = sampleDay(sample, tz);
    const key = recordKey(r, sample);
    let store = stores.get(day);
    if (!store) { store = {}; stores.set(day, store); }
    const prev = store[key];
    if (prev && prev.s === sample.s && prev.e === sample.e && prev.v === sample.v && prev.n === sample.n &&
        (sample.d === undefined || JSON.stringify(prev.d) === JSON.stringify(sample.d))) { duplicates++; continue; }
    store[key] = sample;
    changedDays.add(day);
    added++;
  }
  const gone = deletedUuids(payload.deleted);
  if (gone.length) {
    for (const [day, store] of stores) {
      for (const id of gone) {
        if (id in store) { delete store[id]; changedDays.add(day); deleted++; }
      }
    }
  }
  return { changedDays, added, duplicates, deleted };
}

/** Days a payload's samples and deletions could touch (range ± 1 day). */
export function payloadDays(payload: HpPayload, tz: string): string[] {
  const days = new Set<string>();
  for (const r of payload.records ?? []) {
    const sample = r && typeof r.start === "string" && typeof r.type === "string" ? compact(r) : null;
    if (sample) days.add(sampleDay(sample, tz));
  }
  const rs = Date.parse(payload.range?.start ?? "");
  const re = Date.parse(payload.range?.end ?? "");
  if (Number.isFinite(rs) && Number.isFinite(re) && re >= rs && re - rs <= 40 * 86400_000) {
    for (let t = rs - 86400_000; t <= re + 86400_000; t += 86400_000) days.add(localDate(t, tz));
    days.add(localDate(re + 6 * 3600_000, tz));
  }
  return [...days].sort();
}

// ---------------------------------------------------------------- aggregation

// Cumulative quantities: summed, de-duplicated across sources (Watch + iPhone
// both write steps/distance for the same walk) by taking, per clock hour, the
// source with the larger total — close to how Health's own totals behave.
const SUM_FIELDS: Record<string, keyof DailyMetrics> = {
  StepCount: "steps",
  ActiveEnergyBurned: "activeEnergy",
  BasalEnergyBurned: "basalEnergy",
  AppleExerciseTime: "exerciseMinutes",
  AppleStandTime: "standMinutes",
  FlightsClimbed: "flightsClimbed",
  DistanceWalkingRunning: "distanceKm",
  DistanceCycling: "distanceCyclingKm",
  TimeInDaylight: "daylightMinutes",
};

const AVG_FIELDS: Record<string, keyof DailyMetrics> = {
  RestingHeartRate: "restingHeartRate",
  WalkingHeartRateAverage: "walkingHeartRateAvg",
  HeartRateVariabilitySDNN: "hrv",
  RespiratoryRate: "respiratoryRate",
  OxygenSaturation: "oxygenSaturation",
  BodyTemperature: "bodyTemperature",
  VO2Max: "vo2max",
  WalkingSpeed: "walkingSpeed",
  WalkingStepLength: "walkingStepLength",
  WalkingAsymmetryPercentage: "walkingAsymmetryPct",
  WalkingDoubleSupportPercentage: "walkingDoubleSupportPct",
  BloodPressureSystolic: "bloodPressureSystolic",
  BloodPressureDiastolic: "bloodPressureDiastolic",
  BloodGlucose: "bloodGlucose",
};

const LAST_FIELDS: Record<string, keyof DailyMetrics> = {
  BodyMass: "weightKg",
  BodyFatPercentage: "bodyFatPct",
};

const EXTRA_SUM_HINT = /Energy|Distance|Count|Time|Duration|Flights|Steps|Water|Caffeine|Protein|Carbohydrate|Fat[A-Z]|Sugar|Sodium|Fiber|Cholesterol|Calcium|Iron|Vitamin|NumberOf|UsageEvent/;

function dedupedSum(samples: StoredSample[]): number {
  const byHour = new Map<number, Map<string, number>>();
  for (const s of samples) {
    const hour = Math.floor(s.s / 3600_000);
    let bySrc = byHour.get(hour);
    if (!bySrc) { bySrc = new Map(); byHour.set(hour, bySrc); }
    const src = s.src ?? "?";
    bySrc.set(src, (bySrc.get(src) ?? 0) + (s.v ?? 0));
  }
  let total = 0;
  for (const bySrc of byHour.values()) total += Math.max(...bySrc.values());
  return total;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const round = (n: number | undefined, dp: number) => (n === undefined ? undefined : Math.round(n * 10 ** dp) / 10 ** dp);

// --- sleep (port of the iOS SleepAnalyzer) ---
type Stage = 0 | 1 | 2 | 3 | 4 | 5; // inBed, awake, unspecified, core, rem, deep (also overlap priority)
interface Seg { s: number; e: number; stage: Stage; src: string; w: boolean }

export function sleepStage(sample: StoredSample): Stage | null {
  const n = (sample.n ?? "").toLowerCase();
  if (n) {
    if (n.includes("inbed")) return 0;
    if (n.includes("awake")) return 1;
    if (n.includes("deep")) return 5;
    if (n.includes("rem")) return 4;
    if (n.includes("core")) return 3;
    if (n.includes("asleep") || n.includes("unspecified")) return 2;
  }
  // HKCategoryValueSleepAnalysis raw values.
  switch (sample.v) {
    case 0: return 0;
    case 1: return 2;
    case 2: return 1;
    case 3: return 3;
    case 4: return 5;
    case 5: return 4;
    default: return null;
  }
}

function paint(segs: Seg[]): Seg[] {
  const bounds = [...new Set(segs.flatMap((x) => [x.s, x.e]))].sort((a, b) => a - b);
  const out: Seg[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i], b = bounds[i + 1], mid = (a + b) / 2;
    let top: Seg | undefined;
    for (const x of segs) if (x.s <= mid && x.e > mid && (!top || x.stage > top.stage)) top = x;
    if (!top) continue;
    const last = out[out.length - 1];
    if (last && last.e === a && last.stage === top.stage) last.e = b;
    else out.push({ s: a, e: b, stage: top.stage, src: top.src, w: top.w });
  }
  return out;
}

function unionLength(intervals: [number, number][]): number {
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of [...intervals].sort((x, y) => x[0] - y[0])) {
    if (cur && iv[0] <= cur[1]) cur[1] = Math.max(cur[1], iv[1]);
    else { if (cur) total += cur[1] - cur[0]; cur = [iv[0], iv[1]]; }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

export interface Night { asleepH: number; coreH: number; deepH: number; remH: number; awakeH: number; inBedH: number; start: number; end: number }

export function analyzeSleep(samples: StoredSample[]): Night | null {
  const segs: Seg[] = [];
  for (const x of samples) {
    const stage = sleepStage(x);
    if (stage === null || x.e <= x.s) continue;
    segs.push({ s: x.s, e: x.e, stage, src: x.src ?? "?", w: !!x.w });
  }
  const staged = segs.filter((x) => x.stage !== 0);
  // Prefer a Watch source (it records stages), else the source with the most sleep.
  const totals = new Map<string, { asleep: number; w: boolean }>();
  for (const x of staged) if (x.stage >= 2) {
    const t = totals.get(x.src) ?? { asleep: 0, w: x.w };
    totals.set(x.src, { asleep: t.asleep + (x.e - x.s), w: t.w || x.w });
  }
  let best: string | undefined;
  for (const [src, t] of totals) {
    const b = best ? totals.get(best)! : undefined;
    if (!b || (t.w && !b.w) || (t.w === b.w && t.asleep > b.asleep)) best = src;
  }
  if (!best) return null;
  const painted = paint(staged.filter((x) => x.src === best));
  const asleep = painted.filter((x) => x.stage >= 2).sort((a, b) => a.s - b.s);
  const groups: Seg[][] = [];
  for (const x of asleep) {
    const g = groups[groups.length - 1];
    if (g && x.s - g[g.length - 1].e <= 2 * 3600_000) g.push(x);
    else groups.push([x]);
  }
  const dur = (g: Seg[]) => g.reduce((a, x) => a + (x.e - x.s), 0);
  const main = groups.reduce<Seg[] | null>((m, g) => (!m || dur(g) > dur(m) ? g : m), null);
  if (!main) return null;
  const start = main[0].s, end = main[main.length - 1].e;
  const n: Night = { asleepH: 0, coreH: 0, deepH: 0, remH: 0, awakeH: 0, inBedH: 0, start, end };
  for (const p of painted) {
    if (p.s < start || p.e > end) continue;
    const h = (p.e - p.s) / 3600_000;
    if (p.stage === 5) { n.deepH += h; n.asleepH += h; }
    else if (p.stage === 4) { n.remH += h; n.asleepH += h; }
    else if (p.stage === 3) { n.coreH += h; n.asleepH += h; }
    else if (p.stage === 2) n.asleepH += h;
    else if (p.stage === 1) n.awakeH += h;
  }
  if (n.asleepH <= 0) return null;
  const margin = 3600_000;
  const bed: [number, number][] = segs
    .filter((x) => x.stage === 0 && x.e > start - margin && x.s < end + margin)
    .map((x) => [x.s, x.e]);
  bed.push([start, end]);
  n.inBedH = unionLength(bed) / 3600_000;
  return n;
}

/** Minutes per HR zone (<60, 60-70, 70-80, 80-90, >90% max), each sample credited until the next, capped at 10 min. */
export function hrZoneMinutes(hr: StoredSample[], maxHR: number): number[] {
  const sorted = [...hr].sort((a, b) => a.s - b.s);
  const zones = [0, 0, 0, 0, 0];
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1].s : sorted[i].s + 60_000;
    const seconds = Math.min(600, Math.max(0, (next - sorted[i].s) / 1000));
    const pct = (sorted[i].v ?? 0) / maxHR;
    const z = pct < 0.6 ? 0 : pct < 0.7 ? 1 : pct < 0.8 ? 2 : pct < 0.9 ? 3 : 4;
    zones[z] += seconds / 60;
  }
  return zones.map((z) => Math.round(z * 10) / 10);
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "qty" in v) return num((v as { qty: unknown }).qty);
  if (v && typeof v === "object" && "value" in v) return num((v as { value: unknown }).value);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** HealthPipe nests workout fields under details.workout; tolerate a flat shape too. */
function workoutFields(d: Record<string, unknown> | undefined): Record<string, unknown> {
  const inner = d?.workout;
  return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : d ?? {};
}

/** A per-workout statistic from `stats: [{ type, sum | avg, unit }]`. */
function workoutStat(w: Record<string, unknown>, match: (type: string) => boolean, key: "sum" | "avg"): { value: number; unit: string } | undefined {
  if (!Array.isArray(w.stats)) return undefined;
  let total: number | undefined;
  let unit = "";
  for (const st of w.stats as Record<string, unknown>[]) {
    if (typeof st?.type !== "string" || !match(st.type)) continue;
    const v = num(st[key]);
    if (v === undefined) continue;
    total = key === "sum" ? (total ?? 0) + normalizeUnit(shortType(st.type), v, String(st.unit ?? "")) : v;
    unit = String(st.unit ?? "");
  }
  return total === undefined ? undefined : { value: total, unit };
}

function workoutName(d: Record<string, unknown> | undefined): string {
  const raw = d?.activityTypeName ?? d?.workoutActivityTypeName ?? d?.activityType ?? d?.workoutActivityType ?? d?.name;
  if (typeof raw === "string" && raw) {
    const s = raw.replace(/^HKWorkoutActivityType/, "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return "Other";
}

/**
 * Aggregate one day. `samples` is that day's store; `prevSamples` (the day
 * before) supplies vitals for the part of the night before midnight.
 */
export function aggregateDay(
  date: string,
  samples: StoredSample[],
  prevSamples: StoredSample[],
  opts: { age: number | null; tz: string }
): DailyMetrics {
  const m: DailyMetrics = { date, receivedAt: new Date().toISOString(), source: "healthpipe" };
  const set = (k: keyof DailyMetrics, v: number | undefined) => {
    if (v !== undefined && Number.isFinite(v)) (m as unknown as Record<string, unknown>)[k] = v;
  };
  const byType = new Map<string, StoredSample[]>();
  for (const x of samples) {
    let a = byType.get(x.t);
    if (!a) { a = []; byType.set(x.t, a); }
    a.push(x);
  }
  const extra: Record<string, number> = {};
  const values = (t: string) => (byType.get(t) ?? []).map((x) => x.v).filter((v): v is number => v !== undefined);

  for (const [t, field] of Object.entries(SUM_FIELDS)) {
    const xs = byType.get(t);
    if (xs?.length) set(field, round(dedupedSum(xs), 2));
  }
  for (const [t, field] of Object.entries(AVG_FIELDS)) set(field, avg(values(t)));
  for (const [t, field] of Object.entries(LAST_FIELDS)) {
    const xs = [...(byType.get(t) ?? [])].sort((a, b) => a.s - b.s);
    if (xs.length) set(field, xs[xs.length - 1].v);
  }
  if (m.bodyFatPct !== undefined && m.bodyFatPct <= 1) m.bodyFatPct = m.bodyFatPct * 100;
  if (m.oxygenSaturation !== undefined && m.oxygenSaturation > 1) m.oxygenSaturation /= 100;
  for (const k of ["walkingAsymmetryPct", "walkingDoubleSupportPct"] as const) {
    if (m[k] !== undefined && m[k]! > 1) m[k] = m[k]! / 100;
  }

  const hr = byType.get("HeartRate") ?? [];
  const hrVals = hr.map((x) => x.v!).filter((v) => v !== undefined);
  if (hrVals.length) {
    set("heartRateAvg", avg(hrVals));
    set("heartRateMin", Math.min(...hrVals));
    set("heartRateMax", Math.max(...hrVals));
    const z = hrZoneMinutes(hr, estimateMaxHeartRate(opts.age ?? 35));
    m.hrZone1Min = z[0]; m.hrZone2Min = z[1]; m.hrZone3Min = z[2]; m.hrZone4Min = z[3]; m.hrZone5Min = z[4];
  }

  // Mindful minutes: session durations.
  const mindful = byType.get("MindfulSession");
  if (mindful?.length) set("mindfulMinutes", Math.round(mindful.reduce((a, x) => a + (x.e - x.s), 0) / 60_000));

  // Stand hours from AppleStandHour (valueName "stood" / raw 0).
  const standHour = byType.get("AppleStandHour");
  if (standHour?.length) m.standHours = standHour.filter((x) => (x.n ? x.n.toLowerCase() === "stood" : x.v === 0)).length;

  // Sleep: the night ending on this day.
  const night = analyzeSleep(byType.get("SleepAnalysis") ?? []);
  if (night) {
    const dayStart = localDayStart(date, opts.tz);
    m.sleepHours = night.asleepH;
    m.sleepCoreHours = night.coreH;
    m.sleepDeepHours = night.deepH;
    m.sleepRemHours = night.remH;
    m.sleepAwakeHours = night.awakeH;
    m.sleepInBedHours = night.inBedH;
    if (night.inBedH > 0) m.sleepEfficiency = Math.min(1, night.asleepH / night.inBedH);
    extra.sleepStartMin = (night.start - dayStart) / 60_000;
    extra.sleepEndMin = (night.end - dayStart) / 60_000;
    const inNight = (t: string) =>
      [...samples, ...prevSamples].filter((x) => x.t === t && x.s >= night.start && x.s <= night.end && x.v !== undefined).map((x) => x.v!);
    const sleepHrv = avg(inNight("HeartRateVariabilitySDNN"));
    if (sleepHrv !== undefined) {
      if (m.hrv !== undefined) extra.hrvAllDay = m.hrv;
      extra.hrvSleep = sleepHrv;
      m.hrv = sleepHrv;
    }
    const sleepHr = inNight("HeartRate");
    if (sleepHr.length) { extra.sleepHeartRateMin = Math.min(...sleepHr); extra.sleepHeartRateAvg = avg(sleepHr)!; }
    const resp = avg(inNight("RespiratoryRate"));
    if (resp !== undefined) extra.sleepRespiratoryRate = resp;
  }
  const wrist = [...(byType.get("AppleSleepingWristTemperature") ?? [])].sort((a, b) => a.s - b.s);
  if (wrist.length && wrist[wrist.length - 1].v !== undefined) extra.AppleSleepingWristTemperature = wrist[wrist.length - 1].v!;

  // Workouts.
  const workouts = [...(byType.get("Workout") ?? [])].sort((a, b) => a.s - b.s);
  if (workouts.length) {
    let minutes = 0, energy = 0, distance = 0;
    const minutesByType = new Map<string, number>();
    const strains: NonNullable<DailyMetrics["workoutStrains"]> = [];
    for (const w of workouts) {
      const d = workoutFields(w.d);
      const durSec = num(d.duration);
      const mins = durSec !== undefined ? (durSec > 600 * 60 ? durSec / 60_000 : durSec / 60) : (w.e - w.s) / 60_000;
      const name = workoutName(d);
      minutes += mins;
      energy += workoutStat(d, (t) => t.endsWith("ActiveEnergyBurned"), "sum")?.value
        ?? num(d.totalEnergyBurned) ?? num(d.activeEnergyBurned) ?? num(d.activeEnergy) ?? num(d.energy) ?? 0;
      const statKm = workoutStat(d, (t) => /Distance/.test(t), "sum")?.value;
      let km = statKm ?? num(d.totalDistance) ?? num(d.distance) ?? 0;
      const du = String(d.totalDistanceUnit ?? d.distanceUnit ?? "km").toLowerCase();
      if (statKm === undefined && du === "m") km /= 1000;
      else if (statKm === undefined && du === "mi") km *= 1.60934;
      distance += km;
      minutesByType.set(name, (minutesByType.get(name) ?? 0) + mins);
      const whr = hr.filter((x) => x.s >= w.s && x.s <= w.e).map((x) => x.v!);
      const avgHR = workoutStat(d, (t) => t.endsWith("HeartRate"), "avg")?.value ?? num(d.averageHeartRate) ?? num(d.avgHeartRate) ?? avg(whr);
      if (avgHR !== undefined) {
        const strain = computeWorkoutStrain(avgHR, m.restingHeartRate ?? 60, mins, opts.age);
        strains.push({ type: name, strain, minutes: round(mins, 1)!, avgHR: round(avgHR, 1)! });
      }
    }
    m.workoutCount = workouts.length;
    m.workoutMinutes = round(minutes, 1);
    if (energy > 0) m.workoutEnergy = round(energy, 1);
    if (distance > 0) m.workoutDistanceKm = round(distance, 2);
    m.workoutType = [...minutesByType.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).join(",");
    if (strains.length) m.workoutStrains = strains;
  }

  // Activity summary: Apple's own de-duplicated ring totals win over our sums.
  const summary = (byType.get("ActivitySummary") ?? [])[0]?.d;
  if (summary) {
    const pos = (v: unknown) => { const n = num(v); return n !== undefined && n > 0 ? n : undefined; };
    set("activeEnergy", pos(summary.activeEnergyBurned) ?? m.activeEnergy);
    set("exerciseMinutes", num(summary.appleExerciseTime) ?? m.exerciseMinutes);
    set("standHours", num(summary.appleStandHours) ?? m.standHours);
    set("activeEnergyGoal", pos(summary.activeEnergyBurnedGoal));
    set("exerciseMinutesGoal", pos(summary.appleExerciseTimeGoal));
    set("standHoursGoal", pos(summary.appleStandHoursGoal));
  }

  // Everything else lands in `extra` so nothing is silently dropped.
  const handled = new Set([
    ...Object.keys(SUM_FIELDS), ...Object.keys(AVG_FIELDS), ...Object.keys(LAST_FIELDS),
    "HeartRate", "MindfulSession", "AppleStandHour", "HKCharacteristics", "HeartbeatSeries", "SleepAnalysis", "AppleSleepingWristTemperature", "Workout", "ActivitySummary",
  ]);
  for (const [t, xs] of byType) {
    if (handled.has(t)) continue;
    const vals = xs.map((x) => x.v).filter((v): v is number => v !== undefined);
    const isCategory = xs.some((x) => x.n !== undefined);
    if (isCategory || !vals.length) extra[`${t}Count`] = xs.length;
    else if (EXTRA_SUM_HINT.test(t)) extra[t] = round(dedupedSum(xs), 2)!;
    else extra[t] = round(avg(vals), 3)!;
  }
  if (Object.keys(extra).length) m.extra = extra;
  return m;
}

// ---------------------------------------------------------------- D1 rows

/** One hp_samples row (see migrations/0001_hp_samples.sql). */
export interface SampleRow {
  uuid: string;
  day: string;
  t: string;
  s: number;
  e: number;
  v: number | null;
  n: string | null;
  src: string | null;
  w: number | null;
  d: string | null;
}

/** Payload records → rows, de-duplicated within the payload (last wins). */
export function toRows(payload: HpPayload, tz: string): SampleRow[] {
  const rows = new Map<string, SampleRow>();
  for (const r of payload.records ?? []) {
    if (!r || typeof r.type !== "string" || typeof r.start !== "string") continue;
    if (r.type === "HKCharacteristics") continue; // profile facts, not samples
    const x = compact(r);
    if (!x) continue;
    const uuid = recordKey(r, x);
    rows.set(uuid, {
      uuid, day: sampleDay(x, tz), t: x.t, s: x.s, e: x.e,
      v: x.v ?? null, n: x.n ?? null, src: x.src ?? null, w: x.w ?? null,
      d: x.d === undefined ? null : JSON.stringify(x.d),
    });
  }
  return [...rows.values()];
}

export function rowToSample(r: Omit<SampleRow, "uuid" | "day">): StoredSample {
  const x: StoredSample = { t: r.t, s: r.s, e: r.e };
  if (r.v !== null && r.v !== undefined) x.v = r.v;
  if (r.n !== null && r.n !== undefined) x.n = r.n;
  if (r.src) x.src = r.src;
  if (r.w) x.w = 1;
  if (r.d) { try { x.d = JSON.parse(r.d); } catch { /* ignore malformed */ } }
  return x;
}

/**
 * Days a payload covers from local midnight onward: the range must start at
 * or before the day's start. Only these can be trusted as complete.
 */
export function coveredDays(payload: HpPayload, tz: string): string[] {
  const rs = Date.parse(payload.range?.start ?? "");
  const re = Date.parse(payload.range?.end ?? "");
  if (!Number.isFinite(rs) || !Number.isFinite(re) || re < rs || re - rs > 400 * 86400_000) return [];
  const out: string[] = [];
  for (let t = rs; t <= re + 86400_000; t += 86400_000) {
    const day = localDate(t, tz);
    const start = localDayStart(day, tz);
    if (start >= rs && start <= re && !out.includes(day)) out.push(day);
  }
  // The range's own start day counts only if it began exactly at midnight.
  const first = localDate(rs, tz);
  if (localDayStart(first, tz) === rs && !out.includes(first)) out.unshift(first);
  return out.sort();
}

/** Short type names a payload's job covers (its `types` list, else what it contains). */
export function payloadTypes(payload: HpPayload): string[] {
  const src = Array.isArray(payload.types) && payload.types.length
    ? payload.types
    : (payload.records ?? []).map((r) => r?.type).filter((t): t is string => typeof t === "string");
  return [...new Set(src.map(shortType))];
}
