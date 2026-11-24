import type { DailyMetrics, Env } from "./types";
import type { ManualWorkout } from "./manualWorkouts";
import { callGateway } from "./ai";
import { computeStrain } from "./analytics";
import { buildVerdictSnapshot } from "./verdict";

/**
 * One workout, judged: how it compared to your previous sessions of the same
 * kind, whether it fit how recovered you were that morning, and the 2-3
 * concrete changes that would make the next one better. Code assembles the
 * comparison numbers; the model only narrates them.
 */

export type WorkoutRating = "strong" | "solid" | "light" | "overdid";
const RATINGS: WorkoutRating[] = ["strong", "solid", "light", "overdid"];

export interface WorkoutAnalysis {
  date: string;
  workoutId: string | null;
  title: string;
  rating: WorkoutRating;
  headline: string;
  summary: string;
  wentWell: string[];
  improve: string[];
  nextTime: string;
  source: "ai" | "rules";
}

const r = (v: number | null | undefined, dp = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

function setVolume(w: ManualWorkout): number {
  let v = 0;
  for (const e of w.exercises) for (const s of e.sets) v += (s.reps ?? 0) * (s.weightKg ?? 0);
  return v;
}

function bestSet(sets: ManualWorkout["exercises"][number]["sets"]) {
  let best: { reps: number; weightKg: number; e1rm: number } | null = null;
  for (const s of sets) {
    const reps = s.reps ?? 0;
    const w = s.weightKg ?? 0;
    const e1rm = w > 0 ? w * (1 + reps / 30) : reps;
    if (!best || e1rm > best.e1rm) best = { reps, weightKg: w, e1rm };
  }
  return best ? { reps: best.reps, weightKg: best.weightKg, est1RM: r(best.e1rm, 1) } : null;
}

/** Normalise "Traditional Strength Training" / "Gym" / "strength" etc. into one bucket for comparisons. */
function typeKey(t: string | undefined | null): string {
  const s = (t ?? "").toLowerCase();
  if (/strength|gym|weight|lift|push|pull|leg|upper|lower|chest|back|shoulder|arm/.test(s)) return "strength";
  if (/pickle|tennis|badminton|squash|paddle|racquet/.test(s)) return "racquet";
  if (/run/.test(s)) return "running";
  if (/walk|hik/.test(s)) return "walking";
  if (/cycl|bike/.test(s)) return "cycling";
  return s || "workout";
}

export interface WorkoutContext {
  date: string;
  title: string;
  kind: string;
  watch: Record<string, unknown> | null;
  logged: Record<string, unknown> | null;
  morningRecovery: Record<string, unknown> | null;
  previousSameKind: Record<string, unknown>[];
  exerciseProgress: Record<string, unknown>[];
}

export function buildWorkoutContext(
  days: DailyMetrics[],
  workouts: ManualWorkout[],
  date: string,
  workoutId: string | null,
  age: number | null
): WorkoutContext | null {
  const day = days.find((d) => d.date === date) ?? null;
  const logged = workoutId ? workouts.find((w) => w.id === workoutId) ?? null : workouts.find((w) => w.date === date) ?? null;
  if (!logged && !(day && (day.workoutCount || day.workoutMinutes))) return null;

  const kind = typeKey(logged?.type ?? day?.workoutType);
  const title = logged?.type || day?.workoutType || "Workout";

  const sessions = (day?.workoutStrains ?? []).filter((s) => !logged || typeKey(s.type) === kind || kind === "workout");
  const zoneMin = (d: DailyMetrics) => ({
    zone2: r(d.hrZone2Min), zone3: r(d.hrZone3Min), zone4: r(d.hrZone4Min), zone5: r(d.hrZone5Min),
  });
  const watch = day && (day.workoutMinutes || sessions.length)
    ? {
        sessions: sessions.map((s) => ({ type: s.type, minutes: r(s.minutes), strain: r(s.strain, 1), avgHR: r(s.avgHR) })),
        totalMinutes: r(day.workoutMinutes),
        workoutKcal: r(day.workoutEnergy),
        dayStrain: r(day.strain ?? computeStrain(day, age), 1),
        maxHR: r(day.heartRateMax),
        hrZoneMinutesWholeDay: zoneMin(day),
      }
    : null;

  const loggedView = logged
    ? {
        type: logged.type,
        durationMin: logged.durationMin ?? null,
        notes: logged.notes ?? null,
        totalSets: logged.exercises.reduce((a, e) => a + e.sets.length, 0),
        volumeKg: r(setVolume(logged)),
        exercises: logged.exercises.map((e) => ({
          name: e.name,
          sets: e.sets.map((s) => `${s.reps ?? "?"}${s.weightKg ? `×${s.weightKg}kg` : ""}`).join(", ") || "no sets logged",
        })),
      }
    : null;

  const snap = day ? buildVerdictSnapshot(days, date, false, age, []) : null;
  const morningRecovery = snap
    ? {
        sleepHours: snap.day.sleepHours ?? null,
        hrv: snap.day.hrv ?? null,
        usualHrv: snap.baseline7.hrv,
        restingHeartRate: snap.day.restingHeartRate ?? null,
        usualRestingHeartRate: snap.baseline7.restingHeartRate,
        recoveryScore: snap.recoveryScore,
        consecutiveHardDaysIncludingThis: snap.consecutiveHardDays,
        whatBodyCalledFor: snap.ruleCall,
      }
    : null;

  // Previous sessions of the same kind, newest first.
  const prevDays = days
    .filter((d) => d.date < date && (d.workoutMinutes ?? 0) > 0 && typeKey(d.workoutType) === kind)
    .slice(-5)
    .reverse()
    .map((d) => {
      const s = (d.workoutStrains ?? []).filter((x) => typeKey(x.type) === kind);
      return {
        date: d.date,
        minutes: r(s.length ? s.reduce((a, x) => a + x.minutes, 0) : d.workoutMinutes),
        strain: r(s.length ? Math.max(...s.map((x) => x.strain)) : d.strain ?? computeStrain(d, age), 1),
        avgHR: r(mean(s.map((x) => x.avgHR).filter((x): x is number => typeof x === "number"))),
        kcal: r(d.workoutEnergy),
      };
    });
  const prevLogged = workouts
    .filter((w) => w.date < date && typeKey(w.type) === kind && w.id !== logged?.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)
    .map((w) => ({ date: w.date, sets: w.exercises.reduce((a, e) => a + e.sets.length, 0), volumeKg: r(setVolume(w)), durationMin: w.durationMin ?? null }));
  const previousSameKind = prevDays.length || prevLogged.length ? [...prevDays.map((p) => ({ watch: p })), ...prevLogged.map((p) => ({ logged: p }))] : [];

  // Per-exercise: this session's best set vs the last time that exercise was done.
  const exerciseProgress = logged
    ? logged.exercises
        .filter((e) => e.sets.length > 0)
        .map((e) => {
          const prev = workouts
            .filter((w) => w.date < date)
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((w) => ({ date: w.date, ex: w.exercises.find((x) => x.name.toLowerCase() === e.name.toLowerCase() && x.sets.length > 0) }))
            .find((x) => x.ex);
          return {
            exercise: e.name,
            today: bestSet(e.sets),
            todaySets: e.sets.length,
            lastTime: prev?.ex ? { date: prev.date, best: bestSet(prev.ex.sets), sets: prev.ex.sets.length } : null,
          };
        })
    : [];

  return { date, title, kind, watch, logged: loggedView, morningRecovery, previousSameKind, exerciseProgress };
}

export function ruleWorkoutAnalysis(c: WorkoutContext, workoutId: string | null): WorkoutAnalysis {
  const called = c.morningRecovery?.whatBodyCalledFor as string | undefined;
  const strain = (c.watch?.dayStrain as number | null) ?? null;
  const prevStrain = mean(
    c.previousSameKind.map((p) => (p.watch as { strain?: number } | undefined)?.strain).filter((x): x is number => typeof x === "number")
  );
  let rating: WorkoutRating = "solid";
  if ((called === "rest" || called === "easy") && strain != null && strain >= 14) rating = "overdid";
  else if (prevStrain != null && strain != null && strain < prevStrain * 0.75) rating = "light";
  else if (prevStrain != null && strain != null && strain > prevStrain * 1.1) rating = "strong";

  const improve: string[] = [];
  for (const e of c.exerciseProgress) {
    const t = (e.today as { est1RM?: number } | null)?.est1RM;
    const l = ((e.lastTime as { best?: { est1RM?: number } } | null)?.best)?.est1RM;
    if (t != null && l != null && t <= l) improve.push(`${e.exercise}: add 1 rep or 2.5 kg next time`);
  }
  if (c.logged && (c.logged.totalSets as number) === 0) improve.push("Log sets with reps and weight to track progress");
  if (!improve.length) improve.push(rating === "light" ? "Add one working set per main lift" : "Repeat this, adding a little load");

  return {
    date: c.date,
    workoutId,
    title: c.title,
    rating,
    headline: { strong: "Strong session, above your usual", solid: "Solid session, on par", light: "Lighter than your usual", overdid: "Hard session on a low-recovery day" }[rating],
    summary: strain != null ? `Day strain ${strain}${prevStrain != null ? ` vs ${r(prevStrain, 1)} for your last sessions` : ""}.` : "Session logged.",
    wentWell: [],
    improve: improve.slice(0, 3),
    nextTime: rating === "overdid" ? "Match intensity to recovery: go easy when HRV is down." : "Beat one number from today.",
    source: "rules",
  };
}

const PROMPT =
  "You are a strength and conditioning coach reviewing ONE workout from a JSON snapshot of someone's Apple Watch data and gym log. " +
  "Use only numbers in the snapshot; never invent one. " +
  "Judge it against previousSameKind (their own last sessions of this type) and exerciseProgress (best set today vs last time, with est1RM). " +
  "Judge it against morningRecovery: hard session when whatBodyCalledFor is rest/easy = overdid; easy session when recovered = missed opportunity. " +
  "rating: strong (beat their usual) | solid (on par) | light (below usual) | overdid (too hard for recovery). " +
  "improve = 2-3 SPECIFIC changes for next time with numbers, e.g. 'Bench: 3x8 at 62.5kg (+2.5kg)', 'Keep heart rate under 150 for 40min', " +
  "'Log weights for each set'. If sets have no weight logged, say to log it. " +
  "Reply with ONLY JSON: {\"rating\": string, \"headline\": string (max 9 words), \"summary\": string (max 2 sentences, numbers), " +
  "\"wentWell\": string[] (0-2 items, max 10 words each), \"improve\": string[] (2-3 items, max 12 words each), " +
  "\"nextTime\": string (one imperative sentence: the single thing to do differently next session)}. " +
  "Plain English, no medical diagnoses, no exclamation points.";

export function parseWorkoutAnalysis(data: Record<string, unknown>, c: WorkoutContext, workoutId: string | null): WorkoutAnalysis | null {
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");
  const arr = (v: unknown, n: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 120)).slice(0, n) : [];
  const rating = RATINGS.includes(data.rating as WorkoutRating) ? (data.rating as WorkoutRating) : null;
  const headline = str(data.headline, 100);
  const improve = arr(data.improve, 3);
  if (!rating || !headline || !improve.length) return null;
  return {
    date: c.date,
    workoutId,
    title: c.title,
    rating,
    headline,
    summary: str(data.summary, 360),
    wentWell: arr(data.wentWell, 2),
    improve,
    nextTime: str(data.nextTime, 200) || improve[0],
    source: "ai",
  };
}

export async function analyzeWorkout(env: Env, c: WorkoutContext, workoutId: string | null): Promise<WorkoutAnalysis> {
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return ruleWorkoutAnalysis(c, workoutId);
  try {
    const data = await callGateway(
      env,
      [
        { role: "system", content: PROMPT },
        { role: "user", content: `Snapshot:\n${JSON.stringify(c)}` },
      ],
      "rating",
      600
    );
    return parseWorkoutAnalysis(data, c, workoutId) ?? ruleWorkoutAnalysis(c, workoutId);
  } catch {
    return ruleWorkoutAnalysis(c, workoutId);
  }
}

export function workoutSignature(c: WorkoutContext): string {
  const text = JSON.stringify(c);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `w1:${(h >>> 0).toString(36)}`;
}
