import type { DailyMetrics, UserProfile } from "./types";
import { chronologicalAge, computeStrain } from "./analytics";

/**
 * Training & fitness metrics, all computed deterministically in code from the
 * stored daily records — the AI reviews only ever *narrate* these numbers,
 * they never compute them.
 *
 * Every metric carries three things beyond its value:
 *   - meaning: what this number actually measures, in one plain sentence
 *   - action:  what to DO given the current value (not a generic tip)
 *   - status:  good / ok / watch / bad, so the UI can color it
 *
 * Load is built on the per-day strain score (src/analytics.ts computeStrain),
 * which falls back to exercise minutes / active energy when a day has no
 * heart-rate data, so the training model still works on sparse exports.
 */

export type MetricStatus = "good" | "ok" | "watch" | "bad" | "unknown";

export interface FitnessMetric {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  display: string; // pre-formatted value for the UI ("1.12", "4 / 7", "—")
  status: MetricStatus;
  meaning: string;
  action: string;
}

export interface ActionItem {
  priority: "high" | "medium" | "low";
  area: "training" | "recovery" | "activity" | "sleep" | "body";
  text: string;
  why: string;
}

export interface LoadPoint {
  date: string;
  load: number;
  fitness: number; // CTL, 42-day EWMA
  fatigue: number; // ATL, 7-day EWMA
  form: number; // TSB = fitness - fatigue
}

export interface FitnessReport {
  asOf: string | null;
  metrics: FitnessMetric[];
  actionItems: ActionItem[];
  loadSeries: LoadPoint[]; // last 120 days, for the Training tab chart
  weekly: WeeklySummary[]; // last 8 weeks
}

export interface WeeklySummary {
  weekStart: string;
  activeDays: number;
  exerciseMinutes: number;
  workouts: number;
  distanceKm: number;
  load: number;
}

const WHO_WEEKLY_MINUTES = 150;
const ACTIVE_DAY_MINUTES = 20;

function nums(days: DailyMetrics[], pick: (d: DailyMetrics) => number | undefined | null): number[] {
  return days.map(pick).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

function round(n: number | null, dp = 1): number | null {
  if (n === null) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// Least-squares slope per day over the given (index, value) points.
function slopePerDay(points: [number, number][]): number | null {
  if (points.length < 4) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * One load number per day on the 0-21 strain scale. Uses the stored/derived
 * strain when there's heart-rate data; otherwise a minutes+energy proxy run
 * through the same saturating curve, so a day without HR isn't a zero.
 */
export function dailyLoad(day: DailyMetrics, age: number | null): number {
  if (typeof day.strain === "number") return day.strain;
  const s = computeStrain(day, age);
  if (s !== null) return s;
  const minutes = Math.max(day.exerciseMinutes ?? 0, day.workoutMinutes ?? 0);
  const energy = day.activeEnergy ?? 0;
  const raw = minutes * 0.6 + energy / 12;
  return Math.round(21 * (1 - Math.exp(-raw / 55)) * 10) / 10;
}

/**
 * Fill calendar gaps with zero-load days: a missing day in the export is far
 * more often "didn't train / didn't wear the watch" than "trained hard", and
 * EWMA fitness/fatigue models need a continuous daily series.
 */
function continuousLoads(days: DailyMetrics[], age: number | null): { date: string; load: number }[] {
  if (days.length === 0) return [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: { date: string; load: number }[] = [];
  let date = days[0].date;
  const end = days[days.length - 1].date;
  while (date <= end) {
    const d = byDate.get(date);
    out.push({ date, load: d ? dailyLoad(d, age) : 0 });
    date = addDays(date, 1);
  }
  return out;
}

/**
 * Banister-style fitness/fatigue model (as popularised by TrainingPeaks'
 * CTL/ATL/TSB): fitness = 42-day exponentially weighted load, fatigue =
 * 7-day, form = fitness − fatigue.
 */
export function computeLoadSeries(days: DailyMetrics[], age: number | null): LoadPoint[] {
  const loads = continuousLoads(days, age);
  const kFit = 1 - Math.exp(-1 / 42);
  const kFat = 1 - Math.exp(-1 / 7);
  let fitness = 0;
  let fatigue = 0;
  return loads.map(({ date, load }) => {
    fitness += (load - fitness) * kFit;
    fatigue += (load - fatigue) * kFat;
    return { date, load, fitness: round(fitness, 2)!, fatigue: round(fatigue, 2)!, form: round(fitness - fatigue, 2)! };
  });
}

function weeklySummaries(days: DailyMetrics[], age: number | null, weeks: number): WeeklySummary[] {
  if (days.length === 0) return [];
  const end = days[days.length - 1].date;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: WeeklySummary[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = addDays(end, -7 * w - 6);
    let activeDays = 0;
    let exerciseMinutes = 0;
    let workouts = 0;
    let distanceKm = 0;
    let load = 0;
    for (let i = 0; i < 7; i++) {
      const d = byDate.get(addDays(weekStart, i));
      if (!d) continue;
      const mins = d.exerciseMinutes ?? 0;
      if (mins >= ACTIVE_DAY_MINUTES || (d.workoutCount ?? 0) > 0) activeDays++;
      exerciseMinutes += mins;
      workouts += d.workoutCount ?? 0;
      distanceKm += (d.distanceKm ?? 0) + (d.distanceCyclingKm ?? 0);
      load += dailyLoad(d, age);
    }
    out.push({ weekStart, activeDays, exerciseMinutes: Math.round(exerciseMinutes), workouts, distanceKm: round(distanceKm, 1)!, load: round(load, 1)! });
  }
  return out;
}

// ACSM-style VO2max fitness categories (ml/kg/min), lower bounds of
// "fair / good / excellent / superior" by age band. Rough, rounded figures
// from ACSM's Guidelines for Exercise Testing — for self-tracking only.
const VO2_BANDS_MALE: [maxAge: number, bounds: [number, number, number, number]][] = [
  [29, [38, 42, 46, 52]],
  [39, [36, 40, 44, 50]],
  [49, [34, 38, 42, 47]],
  [59, [31, 35, 39, 44]],
  [69, [28, 32, 36, 41]],
  [200, [25, 29, 33, 38]],
];
const VO2_BANDS_FEMALE: [maxAge: number, bounds: [number, number, number, number]][] = [
  [29, [31, 35, 39, 44]],
  [39, [29, 33, 37, 42]],
  [49, [27, 31, 35, 40]],
  [59, [25, 28, 32, 36]],
  [69, [22, 25, 29, 33]],
  [200, [20, 23, 27, 31]],
];
const VO2_CATEGORIES = ["poor", "fair", "good", "excellent", "superior"] as const;

export function vo2Category(vo2: number, age: number, sex: "male" | "female"): (typeof VO2_CATEGORIES)[number] {
  const bands = sex === "male" ? VO2_BANDS_MALE : VO2_BANDS_FEMALE;
  const bounds = (bands.find(([maxAge]) => age <= maxAge) ?? bands[bands.length - 1])[1];
  let idx = 0;
  for (const b of bounds) if (vo2 >= b) idx++;
  return VO2_CATEGORIES[idx];
}

export function computeFitnessReport(days: DailyMetrics[], profile: UserProfile | null, sleepTargetHours = 7.5): FitnessReport {
  if (days.length === 0) return { asOf: null, metrics: [], actionItems: [], loadSeries: [], weekly: [] };

  const asOf = days[days.length - 1].date;
  const age = profile ? chronologicalAge(profile.birthDate, asOf) : null;
  const series = computeLoadSeries(days, age);
  const lastPoint = series[series.length - 1];
  const loads = series.map((p) => p.load);
  const last7Loads = loads.slice(-7);
  const last28Loads = loads.slice(-28);

  const last7 = days.filter((d) => d.date > addDays(asOf, -7));
  const last28 = days.filter((d) => d.date > addDays(asOf, -28));
  const last90 = days.filter((d) => d.date > addDays(asOf, -90));
  const prior60 = days.filter((d) => d.date > addDays(asOf, -67) && d.date <= addDays(asOf, -7));

  const metrics: FitnessMetric[] = [];
  const actionItems: ActionItem[] = [];

  // ---- Acute:chronic workload ratio ----
  const acute = mean(last7Loads);
  const chronic = mean(last28Loads);
  const acwr = acute !== null && chronic !== null && chronic > 0.5 ? acute / chronic : null;
  {
    let status: MetricStatus = "unknown";
    let action = "Need ~4 weeks of activity data to compute this.";
    if (acwr !== null) {
      if (acwr > 1.5) {
        status = "bad";
        action = `This week's load is ${Math.round((acwr - 1) * 100)}% above your 4-week norm — the zone most linked to overuse injury. Hold volume flat or cut 20% for the next 5-7 days.`;
        actionItems.push({ priority: "high", area: "training", text: "Cut training volume ~20% this week", why: `Acute:chronic load ratio is ${acwr.toFixed(2)} (>1.5 spike zone).` });
      } else if (acwr > 1.3) {
        status = "watch";
        action = "Ramping fast. Fine for a planned build week, but don't add more — keep the next 3 days easy-to-moderate.";
        actionItems.push({ priority: "medium", area: "training", text: "No new intensity for 3 days", why: `Load ratio ${acwr.toFixed(2)} is above the 0.8-1.3 sweet spot.` });
      } else if (acwr >= 0.8) {
        status = "good";
        action = "Sweet spot. You can progress total weekly volume by up to ~10% next week.";
      } else {
        status = "watch";
        action = "Training less than your recent norm — fitness will start to decay. Add one extra session or 20-30 min to an existing one this week.";
        actionItems.push({ priority: "medium", area: "training", text: "Add one session this week", why: `Load ratio ${acwr.toFixed(2)} is below 0.8 (detraining).` });
      }
    }
    metrics.push({
      key: "acwr",
      label: "Acute:chronic load",
      value: round(acwr, 2),
      unit: "",
      display: acwr === null ? "—" : acwr.toFixed(2),
      status,
      meaning: "Last 7 days of training load divided by your 28-day average. 0.8-1.3 is the productive range; above 1.5 is a spike.",
      action,
    });
  }

  // ---- Fitness / fatigue / form ----
  const fitness = lastPoint?.fitness ?? null;
  const fitness28Ago = series.length > 28 ? series[series.length - 29].fitness : null;
  const fitnessChange = fitness !== null && fitness28Ago !== null ? fitness - fitness28Ago : null;
  metrics.push({
    key: "fitness",
    label: "Fitness (CTL)",
    value: round(fitness, 1),
    unit: "",
    display: fitness === null ? "—" : fitness.toFixed(1) + (fitnessChange !== null ? ` (${fitnessChange >= 0 ? "+" : ""}${fitnessChange.toFixed(1)} / 4wk)` : ""),
    status: fitnessChange === null ? "unknown" : fitnessChange > 0.3 ? "good" : fitnessChange < -0.5 ? "watch" : "ok",
    meaning: "42-day weighted average of daily load — your long-term training base. It rises slowly with consistency and decays when you stop.",
    action:
      fitnessChange === null
        ? "Keep logging; needs 4+ weeks of history."
        : fitnessChange < -0.5
          ? "Base is eroding. Consistency beats intensity here: aim for 4+ active days a week before adding hard sessions."
          : fitnessChange > 0.3
            ? "Base is building. Keep the routine; schedule an easier week every 3-4 weeks to absorb it."
            : "Base is holding steady. To grow it, add ~10% weekly volume, not more intensity.",
  });

  const form = lastPoint?.form ?? null;
  {
    let status: MetricStatus = "unknown";
    let action = "Keep logging.";
    if (form !== null) {
      if (form < -5) {
        status = "bad";
        action = "Deeply fatigued relative to your base. Take a rest or very easy day before the next hard session.";
        actionItems.push({ priority: "high", area: "recovery", text: "Rest or easy day today", why: `Form (TSB) is ${form.toFixed(1)} — fatigue well above fitness.` });
      } else if (form < -2) {
        status = "watch";
        action = "Productive fatigue — normal mid-block. Keep hard days hard and easy days genuinely easy.";
      } else if (form <= 3) {
        status = "good";
        action = "Balanced. Good day for a quality session if readiness agrees.";
      } else {
        status = "ok";
        action = "Fresh — fatigue is low relative to fitness. Ideal for a test, race or PR attempt; if it stays here for weeks you're under-training.";
      }
    }
    metrics.push({
      key: "form",
      label: "Form (TSB)",
      value: round(form, 1),
      unit: "",
      display: form === null ? "—" : (form > 0 ? "+" : "") + form.toFixed(1),
      status,
      meaning: "Fitness minus fatigue (7-day load). Negative = carrying fatigue; positive = fresh.",
      action,
    });
  }

  // ---- Training monotony (Foster) ----
  const mono = last7Loads.length >= 7 && sd(last7Loads) > 0 ? mean(last7Loads)! / sd(last7Loads) : null;
  metrics.push({
    key: "monotony",
    label: "Training monotony",
    value: round(mono, 2),
    unit: "",
    display: mono === null ? "—" : mono.toFixed(2),
    status: mono === null ? "unknown" : mono > 2 ? "watch" : "good",
    meaning: "Average daily load ÷ its day-to-day variation over 7 days. High (>2) means every day looks the same — linked to staleness and illness.",
    action:
      mono === null
        ? "Needs 7 days of data."
        : mono > 2
          ? "Vary it: make 1-2 days clearly hard and 1-2 clearly easy or off, instead of medium every day."
          : "Good hard/easy variation. Keep it.",
  });
  if (mono !== null && mono > 2) {
    actionItems.push({ priority: "low", area: "training", text: "Polarise the week: 1-2 hard days, 1-2 off days", why: `Monotony ${mono.toFixed(2)} (>2).` });
  }

  // ---- Weekly activity minutes vs WHO 150 ----
  const weekMinutes = nums(last7, (d) => d.exerciseMinutes).reduce((a, b) => a + b, 0);
  metrics.push({
    key: "weeklyMinutes",
    label: "Exercise min (7d)",
    value: Math.round(weekMinutes),
    unit: "min",
    display: `${Math.round(weekMinutes)} / ${WHO_WEEKLY_MINUTES}`,
    status: weekMinutes >= 300 ? "good" : weekMinutes >= WHO_WEEKLY_MINUTES ? "good" : weekMinutes >= 90 ? "watch" : "bad",
    meaning: "Apple Exercise-ring minutes over the last 7 days, vs the WHO minimum of 150 min/week of moderate activity (300 for extra benefit).",
    action:
      weekMinutes >= WHO_WEEKLY_MINUTES
        ? weekMinutes >= 300
          ? "Above the extended target. Prioritise recovery quality over adding more minutes."
          : `Minimum met. ${Math.round(300 - weekMinutes)} more minutes this week reaches the 300-min tier where most of the additional longevity benefit sits.`
        : `${Math.round(WHO_WEEKLY_MINUTES - weekMinutes)} min short. That's ~${Math.ceil((WHO_WEEKLY_MINUTES - weekMinutes) / 30)} brisk 30-min walks or rides.`,
  });
  if (weekMinutes < WHO_WEEKLY_MINUTES) {
    actionItems.push({
      priority: weekMinutes < 90 ? "high" : "medium",
      area: "activity",
      text: `Get ${Math.round(WHO_WEEKLY_MINUTES - weekMinutes)} more exercise minutes this week`,
      why: `${Math.round(weekMinutes)} of the WHO-recommended 150 min in the last 7 days.`,
    });
  }

  // ---- Consistency: active days in 28 ----
  const activeDays28 = last28.filter((d) => (d.exerciseMinutes ?? 0) >= ACTIVE_DAY_MINUTES || (d.workoutCount ?? 0) > 0).length;
  metrics.push({
    key: "consistency",
    label: "Active days (28d)",
    value: activeDays28,
    unit: "days",
    display: `${activeDays28} / 28`,
    status: activeDays28 >= 16 ? "good" : activeDays28 >= 10 ? "ok" : activeDays28 >= 6 ? "watch" : "bad",
    meaning: `Days in the last 4 weeks with ≥${ACTIVE_DAY_MINUTES} exercise minutes or a logged workout. Consistency is the strongest driver of long-term fitness.`,
    action:
      activeDays28 >= 16
        ? "Excellent rhythm (4+ days/week). Protect at least 1 full rest day a week."
        : activeDays28 >= 10
          ? "~3 days/week. Adding a 4th short session is the cheapest fitness gain available."
          : "Under 3 days/week. Lock in fixed calendar slots (e.g. Mon/Wed/Sat) — schedule beats motivation.",
  });
  if (activeDays28 < 10) {
    actionItems.push({ priority: "high", area: "training", text: "Schedule 3 fixed training slots for next week", why: `Only ${activeDays28} active days in the last 28.` });
  }

  // ---- Days since rest ----
  let daysSinceRest = 0;
  for (let i = series.length - 1; i >= 0 && series[i].load >= 8; i--) daysSinceRest++;
  metrics.push({
    key: "daysSinceRest",
    label: "Days since easy day",
    value: daysSinceRest,
    unit: "days",
    display: String(daysSinceRest),
    status: daysSinceRest >= 6 ? "bad" : daysSinceRest >= 4 ? "watch" : "good",
    meaning: "Consecutive days with moderate-or-higher load (strain ≥ 8). Adaptation happens during recovery, not during the session.",
    action:
      daysSinceRest >= 6
        ? "Take an easy/off day today."
        : daysSinceRest >= 4
          ? "Plan an easy day within the next 48 hours."
          : "Recovery cadence is fine.",
  });
  if (daysSinceRest >= 6) {
    actionItems.push({ priority: "high", area: "recovery", text: "Take a rest day today", why: `${daysSinceRest} consecutive moderate+ load days.` });
  }

  // ---- VO2max: category + 90-day trend ----
  const vo2Recent = mean(nums(days.slice(-30), (d) => d.vo2max));
  const vo2Points: [number, number][] = [];
  last90.forEach((d, i) => {
    if (typeof d.vo2max === "number") vo2Points.push([i, d.vo2max]);
  });
  const vo2Slope = slopePerDay(vo2Points);
  const vo2Cat = vo2Recent !== null && age !== null && profile ? vo2Category(vo2Recent, age, profile.sex) : null;
  metrics.push({
    key: "vo2Category",
    label: "Cardio fitness class",
    value: round(vo2Recent, 1),
    unit: "ml/kg/min",
    display: vo2Recent === null ? "—" : `${vo2Recent.toFixed(1)}${vo2Cat ? " · " + vo2Cat : ""}`,
    status: vo2Cat === null ? "unknown" : vo2Cat === "superior" || vo2Cat === "excellent" ? "good" : vo2Cat === "good" ? "ok" : vo2Cat === "fair" ? "watch" : "bad",
    meaning: "VO2max vs ACSM norms for your age and sex. It's one of the strongest single predictors of all-cause mortality — moving up one category matters more than almost any other metric here.",
    action:
      vo2Recent === null
        ? "Apple Watch estimates VO2max from outdoor walks/runs with GPS + HR. Do a 20+ min outdoor brisk walk or run weekly to get readings."
        : vo2Cat === "superior" || vo2Cat === "excellent"
          ? "Maintain with 1 interval session + 2-3 easy aerobic sessions a week."
          : "Biggest lever: 1x/week intervals (e.g. 4×4 min hard, 3 min easy) plus 2-3 Zone-2 sessions (conversational pace, 30-45 min). Expect +3-5 ml/kg/min over 8-12 weeks.",
  });
  if (vo2Cat && (vo2Cat === "poor" || vo2Cat === "fair")) {
    actionItems.push({ priority: "medium", area: "training", text: "Add one 4×4 interval session per week", why: `VO2max ${vo2Recent!.toFixed(1)} is '${vo2Cat}' for your age.` });
  }
  if (vo2Slope !== null) {
    const per30 = vo2Slope * 30;
    metrics.push({
      key: "vo2Trend",
      label: "VO2max trend",
      value: round(per30, 2),
      unit: "/30d",
      display: (per30 >= 0 ? "+" : "") + per30.toFixed(2) + " /mo",
      status: per30 > 0.1 ? "good" : per30 < -0.2 ? "bad" : "ok",
      meaning: "Linear trend of VO2max over the last 90 days, per month.",
      action:
        per30 < -0.2
          ? "Declining. Usually means fewer sustained aerobic sessions — re-add 2 sessions of 30+ min at a steady effort."
          : per30 > 0.1
            ? "Climbing — your current training is working. Don't change much."
            : "Flat. A new stimulus (intervals or longer easy sessions) is needed to move it.",
    });
  }

  // ---- HRV vs 60-day baseline + HRV stability ----
  const hrv7 = mean(nums(last7, (d) => d.hrv));
  const hrvBaseVals = nums(prior60, (d) => d.hrv);
  const hrvBase = mean(hrvBaseVals);
  if (hrv7 !== null && hrvBase !== null && hrvBaseVals.length >= 10) {
    const pct = ((hrv7 - hrvBase) / hrvBase) * 100;
    const bandPct = (sd(hrvBaseVals) / hrvBase) * 100 * 0.5;
    const status: MetricStatus = pct < -bandPct * 2 ? "bad" : pct < -bandPct ? "watch" : "good";
    metrics.push({
      key: "hrvVsBaseline",
      label: "HRV vs baseline",
      value: round(pct, 1),
      unit: "%",
      display: `${hrv7.toFixed(0)} ms (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`,
      status,
      meaning: "7-day average HRV vs your own prior 60 days. A sustained drop below your normal band signals accumulated stress (training, sleep, illness, alcohol).",
      action:
        status === "bad"
          ? "Well below your normal band. Swap hard sessions for easy ones until it recovers; check sleep, alcohol and illness."
          : status === "watch"
            ? "Slightly suppressed. Fine to train, but keep intensity moderate and prioritise sleep tonight."
            : "Within or above your normal band — your nervous system is absorbing current load. Green light for planned training.",
    });
    if (status === "bad") {
      actionItems.push({ priority: "high", area: "recovery", text: "Keep training easy until HRV recovers", why: `7-day HRV ${hrv7.toFixed(0)} ms is ${Math.abs(pct).toFixed(0)}% below your 60-day baseline.` });
    }
  }

  // ---- RHR drift ----
  const rhr7 = mean(nums(last7, (d) => d.restingHeartRate));
  const rhrBase = mean(nums(prior60, (d) => d.restingHeartRate));
  if (rhr7 !== null && rhrBase !== null) {
    const diff = rhr7 - rhrBase;
    const status: MetricStatus = diff >= 5 ? "bad" : diff >= 3 ? "watch" : diff <= -2 ? "good" : "ok";
    metrics.push({
      key: "rhrDrift",
      label: "Resting HR drift",
      value: round(diff, 1),
      unit: "bpm",
      display: `${rhr7.toFixed(0)} bpm (${diff >= 0 ? "+" : ""}${diff.toFixed(1)})`,
      status,
      meaning: "7-day resting HR vs your prior 60 days. Long-term, falling RHR = improving aerobic fitness; a short-term rise of 3-5+ bpm is an early sign of fatigue, illness or dehydration.",
      action:
        diff >= 5
          ? "Elevated 5+ bpm. Treat as a recovery flag: easy days only, extra sleep and fluids; if you feel ill, rest fully."
          : diff >= 3
            ? "Creeping up. Keep the next session moderate and watch it tomorrow."
            : diff <= -2
              ? "Falling — a classic sign of improving aerobic fitness."
              : "Stable.",
    });
    if (diff >= 5) {
      actionItems.push({ priority: "high", area: "recovery", text: "Recovery day: easy movement, fluids, early night", why: `Resting HR is up ${diff.toFixed(1)} bpm vs baseline.` });
    }
  }

  // ---- Sleep debt (7d) ----
  const sleepVals = nums(last7, (d) => d.sleepHours);
  if (sleepVals.length >= 3) {
    const debt = sleepVals.reduce((a, h) => a + Math.max(0, sleepTargetHours - h), 0);
    const avgSleep = mean(sleepVals)!;
    metrics.push({
      key: "sleepDebt",
      label: "Sleep debt (7d)",
      value: round(debt, 1),
      unit: "hr",
      display: `${debt.toFixed(1)} hr`,
      status: debt >= 5 ? "bad" : debt >= 2.5 ? "watch" : "good",
      meaning: `Total hours short of your ${sleepTargetHours}h target across the last ${sleepVals.length} logged nights. Sleep debt blunts training adaptation, HRV and appetite control.`,
      action:
        debt >= 2.5
          ? `Pull bedtime ${Math.min(60, Math.round((debt / 7) * 60 + 15))} min earlier for the next 4 nights; skip hard sessions after a <6h night.`
          : `On target (avg ${avgSleep.toFixed(1)}h). Keep the same bed/wake window, including weekends.`,
    });
    if (debt >= 2.5) {
      actionItems.push({ priority: debt >= 5 ? "high" : "medium", area: "sleep", text: "Bedtime 30-45 min earlier for 4 nights", why: `${debt.toFixed(1)}h sleep debt over the last week.` });
    }
  }

  // ---- Daily steps (NEAT) ----
  const steps7 = mean(nums(last7, (d) => d.steps));
  if (steps7 !== null) {
    metrics.push({
      key: "steps7",
      label: "Avg steps (7d)",
      value: Math.round(steps7),
      unit: "",
      display: Math.round(steps7).toLocaleString("en-US"),
      status: steps7 >= 8000 ? "good" : steps7 >= 6000 ? "ok" : steps7 >= 4000 ? "watch" : "bad",
      meaning: "Background daily movement outside training. Mortality-risk benefits rise steeply up to ~7-8k steps/day and flatten after ~10k.",
      action:
        steps7 >= 8000
          ? "In the high-benefit zone. Maintain."
          : `Add ~${Math.round((8000 - steps7) / 100) * 100} steps/day — a 10-min walk after two meals covers most of it (and helps glucose).`,
    });
    if (steps7 < 6000) {
      actionItems.push({ priority: "medium", area: "activity", text: "10-min walk after lunch and dinner", why: `Averaging ${Math.round(steps7).toLocaleString("en-US")} steps/day (<6k).` });
    }
  }

  // ---- Sedentary/stand ----
  const stand7 = mean(nums(last7, (d) => d.standHours));
  if (stand7 !== null) {
    metrics.push({
      key: "standHours",
      label: "Stand hours (7d avg)",
      value: round(stand7, 1),
      unit: "hr",
      display: `${stand7.toFixed(1)} / 12`,
      status: stand7 >= 10 ? "good" : stand7 >= 8 ? "ok" : "watch",
      meaning: "Hours per day with at least 1 minute of standing. Breaking up long sitting spells matters independently of workouts.",
      action: stand7 >= 10 ? "Good. Keep breaking up sitting." : "Set a 50-minute stand/walk reminder during work hours.",
    });
  }

  // ---- Walking speed & gait ----
  const gait = mean(nums(days.slice(-30), (d) => d.walkingSpeed));
  if (gait !== null) {
    metrics.push({
      key: "gaitSpeed",
      label: "Walking speed (30d)",
      value: round(gait, 2),
      unit: "m/s",
      display: `${gait.toFixed(2)} m/s`,
      status: gait >= 1.3 ? "good" : gait >= 1.1 ? "ok" : gait >= 1.0 ? "watch" : "bad",
      meaning: "Your everyday walking pace, measured passively by iPhone. Gait speed is a well-replicated marker of physiological age; >1.3 m/s is strong.",
      action:
        gait >= 1.3
          ? "Strong. Maintain leg strength (2x/week squats/lunges) to keep it there."
          : "Add 2x/week lower-body strength (squats, step-ups, lunges) and some brisk-pace walking — both raise habitual pace.",
    });
  }
  const asym = mean(nums(days.slice(-30), (d) => d.walkingAsymmetryPct));
  if (asym !== null) {
    metrics.push({
      key: "gaitAsymmetry",
      label: "Walking asymmetry",
      value: round(asym * 100, 1),
      unit: "%",
      display: `${(asym * 100).toFixed(1)}%`,
      status: asym <= 0.03 ? "good" : asym <= 0.06 ? "watch" : "bad",
      meaning: "How uneven your left vs right step timing is. Under ~3% is typical; persistent rises often trace to a niggle, injury or one-sided weakness.",
      action: asym <= 0.03 ? "Normal. Nothing to do." : "Elevated. Check for a niggle; add single-leg work (split squats, single-leg RDLs) to even sides out.",
    });
  }

  // ---- Body: BMI & weight trend ----
  const weight = mean(nums(days.slice(-14), (d) => d.weightKg));
  if (weight !== null && profile?.heightCm) {
    const bmi = weight / (profile.heightCm / 100) ** 2;
    metrics.push({
      key: "bmi",
      label: "BMI",
      value: round(bmi, 1),
      unit: "",
      display: bmi.toFixed(1),
      status: bmi < 18.5 ? "watch" : bmi < 25 ? "good" : bmi < 30 ? "watch" : "bad",
      meaning: "Weight relative to height. A crude screen — it can't tell muscle from fat, so read it alongside body-fat % and waist.",
      action: bmi < 18.5 ? "Underweight range: prioritise protein (1.6 g/kg) and progressive strength training." : bmi < 25 ? "Healthy range. Track body-fat % for a better picture." : "Above 25: if body-fat % is also high, a 300-500 kcal/day deficit with high protein and strength training preserves muscle while losing fat.",
    });
  }
  const wPoints: [number, number][] = [];
  days.slice(-60).forEach((d, i) => {
    if (typeof d.weightKg === "number") wPoints.push([i, d.weightKg]);
  });
  const wSlope = slopePerDay(wPoints);
  if (wSlope !== null && weight !== null) {
    const perWeek = wSlope * 7;
    const pctPerWeek = (perWeek / weight) * 100;
    metrics.push({
      key: "weightTrend",
      label: "Weight trend",
      value: round(perWeek, 2),
      unit: "kg/wk",
      display: `${perWeek >= 0 ? "+" : ""}${perWeek.toFixed(2)} kg/wk`,
      status: Math.abs(pctPerWeek) > 1 ? "watch" : "ok",
      meaning: "60-day linear weight trend. Faster than ~1% of body weight per week (either direction) usually means losing muscle or gaining fat.",
      action: Math.abs(pctPerWeek) > 1 ? "Changing fast. Slow it: adjust intake by ~250 kcal/day and keep protein high." : "Rate of change is in a sustainable range.",
    });
  }

  // ---- Readiness-style "train today?" summary item (always first) ----
  const todayRec = days[days.length - 1];
  const highFlags = actionItems.filter((a) => a.priority === "high" && a.area === "recovery").length;
  if (highFlags === 0 && form !== null && form >= -2 && (acwr === null || acwr <= 1.3)) {
    actionItems.unshift({
      priority: "medium",
      area: "training",
      text: "Green light: quality session today",
      why: `Form ${form >= 0 ? "+" : ""}${form.toFixed(1)}, no recovery flags${todayRec.hrv ? `, HRV ${todayRec.hrv.toFixed(0)} ms` : ""}.`,
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  actionItems.sort((a, b) => order[a.priority] - order[b.priority]);

  return {
    asOf,
    metrics,
    actionItems: actionItems.slice(0, 8),
    loadSeries: series.slice(-120),
    weekly: weeklySummaries(days, age, 8),
  };
}
