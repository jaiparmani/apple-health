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
    let action = "Needs about 4 weeks of data.";
    if (acwr !== null) {
      if (acwr > 1.5) {
        status = "bad";
        action = `${Math.round((acwr - 1) * 100)}% above your normal. Injury risk is up. Cut volume 20% this week.`;
        actionItems.push({ priority: "high", area: "training", text: "Cut training volume 20% this week", why: `This week's load is ${acwr.toFixed(2)}× your normal (above 1.5 is a spike).` });
      } else if (acwr > 1.3) {
        status = "watch";
        action = "Ramping fast. Keep the next 3 days easy to moderate.";
        actionItems.push({ priority: "medium", area: "training", text: "No new intensity for 3 days", why: `Load is ${acwr.toFixed(2)}× your normal (sweet spot: 0.8-1.3).` });
      } else if (acwr >= 0.8) {
        status = "good";
        action = "Sweet spot. You can add up to 10% volume next week.";
      } else {
        status = "watch";
        action = "Below your normal. Add one session this week to stop fitness slipping.";
        actionItems.push({ priority: "medium", area: "training", text: "Add one session this week", why: `Load is ${acwr.toFixed(2)}× your normal (below 0.8 loses fitness).` });
      }
    }
    metrics.push({
      key: "acwr",
      label: "This week vs your normal load",
      value: round(acwr, 2),
      unit: "",
      display: acwr === null ? "—" : acwr.toFixed(2),
      status,
      meaning: "This week's load vs your 4-week average. 0.8-1.3 builds fitness; above 1.5 risks injury.",
      action,
    });
  }

  // ---- Fitness / fatigue / form ----
  const fitness = lastPoint?.fitness ?? null;
  const fitness28Ago = series.length > 28 ? series[series.length - 29].fitness : null;
  const fitnessChange = fitness !== null && fitness28Ago !== null ? fitness - fitness28Ago : null;
  metrics.push({
    key: "fitness",
    label: "Fitness base",
    value: round(fitness, 1),
    unit: "",
    display: fitness === null ? "—" : fitness.toFixed(1) + (fitnessChange !== null ? ` (${fitnessChange >= 0 ? "+" : ""}${fitnessChange.toFixed(1)} / 4wk)` : ""),
    status: fitnessChange === null ? "unknown" : fitnessChange > 0.3 ? "good" : fitnessChange < -0.5 ? "watch" : "ok",
    meaning: "Your long-term training base: 6 weeks of load. Builds slowly, fades when you stop.",
    action:
      fitnessChange === null
        ? "Needs 4+ weeks of data."
        : fitnessChange < -0.5
          ? "Slipping. Aim for 4 active days a week before adding intensity."
          : fitnessChange > 0.3
            ? "Building. Keep going; take an easy week every 3-4 weeks."
            : "Steady. Add 10% weekly volume to grow it.",
  });

  const form = lastPoint?.form ?? null;
  {
    let status: MetricStatus = "unknown";
    let action = "Keep logging.";
    if (form !== null) {
      if (form < -5) {
        status = "bad";
        action = "Very tired. Rest or go easy before your next hard session.";
        actionItems.push({ priority: "high", area: "recovery", text: "Rest or easy day today", why: `Freshness is ${form.toFixed(1)}: fatigue is well above fitness.` });
      } else if (form < -2) {
        status = "watch";
        action = "Normal training fatigue. Keep easy days truly easy.";
      } else if (form <= 3) {
        status = "good";
        action = "Balanced. A good day for a quality session.";
      } else {
        status = "ok";
        action = "Fresh. Great for a race or PR. Stay here for weeks and you're undertraining.";
      }
    }
    metrics.push({
      key: "form",
      label: "Freshness (form)",
      value: round(form, 1),
      unit: "",
      display: form === null ? "—" : (form > 0 ? "+" : "") + form.toFixed(1),
      status,
      meaning: "Fitness base minus recent fatigue. Negative means tired, positive means fresh.",
      action,
    });
  }

  // ---- Training monotony (Foster) ----
  const mono = last7Loads.length >= 7 && sd(last7Loads) > 0 ? mean(last7Loads)! / sd(last7Loads) : null;
  metrics.push({
    key: "monotony",
    label: "Training variety",
    value: round(mono, 2),
    unit: "",
    display: mono === null ? "—" : mono.toFixed(2),
    status: mono === null ? "unknown" : mono > 2 ? "watch" : "good",
    meaning: "How similar your days are. Above 2 means every day is the same, which leads to burnout.",
    action:
      mono === null
        ? "Needs 7 days of data."
        : mono > 2
          ? "Make 1-2 days hard and 1-2 easy, not every day medium."
          : "Good mix of hard and easy days.",
  });
  if (mono !== null && mono > 2) {
    actionItems.push({ priority: "low", area: "training", text: "Mix it up: 1-2 hard days, 1-2 off days", why: `Every day looks the same (variety score ${mono.toFixed(2)}).` });
  }

  // ---- Weekly activity minutes vs WHO 150 ----
  const weekMinutes = nums(last7, (d) => d.exerciseMinutes).reduce((a, b) => a + b, 0);
  metrics.push({
    key: "weeklyMinutes",
    label: "Exercise this week",
    value: Math.round(weekMinutes),
    unit: "min",
    display: `${Math.round(weekMinutes)} / ${WHO_WEEKLY_MINUTES}`,
    status: weekMinutes >= 300 ? "good" : weekMinutes >= WHO_WEEKLY_MINUTES ? "good" : weekMinutes >= 90 ? "watch" : "bad",
    meaning: "Exercise-ring minutes in the last 7 days. The WHO minimum is 150; 300 adds more benefit.",
    action:
      weekMinutes >= WHO_WEEKLY_MINUTES
        ? weekMinutes >= 300
          ? "Above 300. Focus on recovery, not more minutes."
          : `Target met. ${Math.round(300 - weekMinutes)} more minutes reaches the 300 tier.`
        : `${Math.round(WHO_WEEKLY_MINUTES - weekMinutes)} minutes short: ${Math.ceil((WHO_WEEKLY_MINUTES - weekMinutes) / 30)} brisk 30-minute walks.`,
  });
  if (weekMinutes < WHO_WEEKLY_MINUTES) {
    actionItems.push({
      priority: weekMinutes < 90 ? "high" : "medium",
      area: "activity",
      text: `Get ${Math.round(WHO_WEEKLY_MINUTES - weekMinutes)} more exercise minutes this week`,
      why: `${Math.round(weekMinutes)} of 150 minutes in the last 7 days.`,
    });
  }

  // ---- Consistency: active days in 28 ----
  const activeDays28 = last28.filter((d) => (d.exerciseMinutes ?? 0) >= ACTIVE_DAY_MINUTES || (d.workoutCount ?? 0) > 0).length;
  metrics.push({
    key: "consistency",
    label: "Active days, last 4 weeks",
    value: activeDays28,
    unit: "days",
    display: `${activeDays28} / 28`,
    status: activeDays28 >= 16 ? "good" : activeDays28 >= 10 ? "ok" : activeDays28 >= 6 ? "watch" : "bad",
    meaning: `Days with ${ACTIVE_DAY_MINUTES}+ exercise minutes or a workout. Consistency builds fitness most.`,
    action:
      activeDays28 >= 16
        ? "4+ days a week. Keep one full rest day."
        : activeDays28 >= 10
          ? "About 3 days a week. A 4th short session is your easiest gain."
          : "Under 3 days a week. Book fixed slots, e.g. Mon/Wed/Sat.",
  });
  if (activeDays28 < 10) {
    actionItems.push({ priority: "high", area: "training", text: "Schedule 3 fixed training slots for next week", why: `Only ${activeDays28} active days in the last 28.` });
  }

  // ---- Days since rest ----
  let daysSinceRest = 0;
  for (let i = series.length - 1; i >= 0 && series[i].load >= 8; i--) daysSinceRest++;
  metrics.push({
    key: "daysSinceRest",
    label: "Days since an easy day",
    value: daysSinceRest,
    unit: "days",
    display: String(daysSinceRest),
    status: daysSinceRest >= 6 ? "bad" : daysSinceRest >= 4 ? "watch" : "good",
    meaning: "Days in a row with moderate or hard load. You get fitter while recovering.",
    action:
      daysSinceRest >= 6
        ? "Take an easy day today."
        : daysSinceRest >= 4
          ? "Plan an easy day in the next 2 days."
          : "Recovery rhythm is fine.",
  });
  if (daysSinceRest >= 6) {
    actionItems.push({ priority: "high", area: "recovery", text: "Take a rest day today", why: `${daysSinceRest} hard-ish days in a row.` });
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
    meaning: "VO2max graded for your age and sex. One of the strongest predictors of lifespan.",
    action:
      vo2Recent === null
        ? "Do a 20-minute brisk outdoor walk or run weekly to get readings."
        : vo2Cat === "superior" || vo2Cat === "excellent"
          ? "Keep 1 interval and 2-3 easy cardio sessions a week."
          : "Weekly 4×4-minute intervals plus 2-3 easy 30-45 minute sessions. Expect +3-5 in 3 months.",
  });
  if (vo2Cat && (vo2Cat === "poor" || vo2Cat === "fair")) {
    actionItems.push({ priority: "medium", area: "training", text: "Add one 4×4 interval session per week", why: `VO2max ${vo2Recent!.toFixed(1)} is "${vo2Cat}" for your age.` });
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
      meaning: "How your VO2max moved over 90 days, per month.",
      action:
        per30 < -0.2
          ? "Falling. Add 2 steady 30-minute cardio sessions a week."
          : per30 > 0.1
            ? "Rising. Your training works; keep it."
            : "Flat. Add intervals or longer easy sessions to move it.",
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
      label: "HRV vs your normal",
      value: round(pct, 1),
      unit: "%",
      display: `${hrv7.toFixed(0)} ms (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`,
      status,
      meaning: "This week's HRV vs your last 60 days. A lasting drop means stress is piling up.",
      action:
        status === "bad"
          ? "Well below normal. Train easy until it recovers."
          : status === "watch"
            ? "Slightly low. Train moderately; sleep early tonight."
            : "Normal. Train as planned.",
    });
    if (status === "bad") {
      actionItems.push({ priority: "high", area: "recovery", text: "Keep training easy until HRV recovers", why: `HRV ${hrv7.toFixed(0)} ms, ${Math.abs(pct).toFixed(0)}% below your normal.` });
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
      label: "Resting heart rate vs normal",
      value: round(diff, 1),
      unit: "bpm",
      display: `${rhr7.toFixed(0)} bpm (${diff >= 0 ? "+" : ""}${diff.toFixed(1)})`,
      status,
      meaning: "This week vs your last 60 days. Falling means fitter; a 3-5 bpm jump flags fatigue or illness.",
      action:
        diff >= 5
          ? "Up 5+ bpm. Easy days, extra sleep and fluids. Rest if you feel ill."
          : diff >= 3
            ? "Creeping up. Keep the next session moderate."
            : diff <= -2
              ? "Falling. A classic sign of better fitness."
              : "Stable.",
    });
    if (diff >= 5) {
      actionItems.push({ priority: "high", area: "recovery", text: "Recovery day: easy movement, fluids, early night", why: `Resting heart rate is up ${diff.toFixed(1)} bpm on your normal.` });
    }
  }

  // ---- Sleep debt (7d) ----
  const sleepVals = nums(last7, (d) => d.sleepHours);
  if (sleepVals.length >= 3) {
    const debt = sleepVals.reduce((a, h) => a + Math.max(0, sleepTargetHours - h), 0);
    const avgSleep = mean(sleepVals)!;
    metrics.push({
      key: "sleepDebt",
      label: "Sleep debt this week",
      value: round(debt, 1),
      unit: "hr",
      display: `${debt.toFixed(1)} hr`,
      status: debt >= 5 ? "bad" : debt >= 2.5 ? "watch" : "good",
      meaning: `Hours short of your ${sleepTargetHours}h goal over ${sleepVals.length} nights. Debt blunts recovery and fitness gains.`,
      action:
        debt >= 2.5
          ? `Go to bed ${Math.min(60, Math.round((debt / 7) * 60 + 15))} minutes earlier for 4 nights.`
          : `On target at ${avgSleep.toFixed(1)}h. Keep your bedtime steady.`,
    });
    if (debt >= 2.5) {
      actionItems.push({ priority: debt >= 5 ? "high" : "medium", area: "sleep", text: "Bedtime 30-45 min earlier for 4 nights", why: `${debt.toFixed(1)} hours of sleep debt this week.` });
    }
  }

  // ---- Daily steps (NEAT) ----
  const steps7 = mean(nums(last7, (d) => d.steps));
  if (steps7 !== null) {
    metrics.push({
      key: "steps7",
      label: "Steps per day (7-day avg)",
      value: Math.round(steps7),
      unit: "",
      display: Math.round(steps7).toLocaleString("en-US"),
      status: steps7 >= 8000 ? "good" : steps7 >= 6000 ? "ok" : steps7 >= 4000 ? "watch" : "bad",
      meaning: "Everyday movement. Benefits climb to ~8,000 a day, then level off.",
      action:
        steps7 >= 8000
          ? "In the high-benefit zone."
          : `Add ~${Math.round((8000 - steps7) / 100) * 100} a day: walk 10 minutes after two meals.`,
    });
    if (steps7 < 6000) {
      actionItems.push({ priority: "medium", area: "activity", text: "Walk 10 minutes after lunch and dinner", why: `${Math.round(steps7).toLocaleString("en-US")} steps a day on average.` });
    }
  }

  // ---- Sedentary/stand ----
  const stand7 = mean(nums(last7, (d) => d.standHours));
  if (stand7 !== null) {
    metrics.push({
      key: "standHours",
      label: "Stand hours per day",
      value: round(stand7, 1),
      unit: "hr",
      display: `${stand7.toFixed(1)} / 12`,
      status: stand7 >= 10 ? "good" : stand7 >= 8 ? "ok" : "watch",
      meaning: "Hours with a minute of standing. Breaking up sitting matters, even if you exercise.",
      action: stand7 >= 10 ? "Good." : "Set a 50-minute stand reminder at work.",
    });
  }

  // ---- Walking speed & gait ----
  const gait = mean(nums(days.slice(-30), (d) => d.walkingSpeed));
  if (gait !== null) {
    metrics.push({
      key: "gaitSpeed",
      label: "Walking speed (30-day avg)",
      value: round(gait, 2),
      unit: "m/s",
      display: `${gait.toFixed(2)} m/s`,
      status: gait >= 1.3 ? "good" : gait >= 1.1 ? "ok" : gait >= 1.0 ? "watch" : "bad",
      meaning: "Your everyday pace. A strong marker of physical age. Above 1.3 m/s is strong.",
      action:
        gait >= 1.3
          ? "Strong. Train legs twice a week to keep it."
          : "Train legs twice a week and walk briskly more often.",
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
      meaning: "How uneven your left and right steps are. Under 3% is normal.",
      action: asym <= 0.03 ? "Normal." : "Uneven. Check for a niggle; add single-leg exercises.",
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
      meaning: "Weight for your height. Crude: it can't tell muscle from fat.",
      action: bmi < 18.5 ? "Underweight. Eat more protein and lift." : bmi < 25 ? "Healthy range." : "Above 25. If body fat is high too: small deficit, high protein, lift.",
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
      meaning: "Weight change per week over 60 days. Over 1% a week is too fast.",
      action: Math.abs(pctPerWeek) > 1 ? "Too fast. Adjust food by ~250 kcal a day." : "A sustainable pace.",
    });
  }

  // ---- Readiness-style "train today?" summary item (always first) ----
  const todayRec = days[days.length - 1];
  const highFlags = actionItems.filter((a) => a.priority === "high" && a.area === "recovery").length;
  if (highFlags === 0 && form !== null && form >= -2 && (acwr === null || acwr <= 1.3)) {
    actionItems.unshift({
      priority: "medium",
      area: "training",
      text: "Green light for a quality session today",
      why: `Fresh (${form >= 0 ? "+" : ""}${form.toFixed(1)}), no recovery flags.`,
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
