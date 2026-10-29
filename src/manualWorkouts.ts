import { findExercise, type MuscleId, EXERCISE_LIBRARY } from "./exerciseLibrary";
import type { WorkoutPR, MuscleBalance } from "./types";

/**
 * Manually-logged workout detail (sets/reps/weight) — stored entirely
 * separately from the Apple-derived daily records (series.json / daily
 * files), in its own file (data/manual-workouts.json). The import pipeline
 * (/ingest, /import-bulk) has no code path that reads or writes this file,
 * so a future zip re-import can never touch, merge into, or clobber it —
 * not as a side effect of careful merge-order discipline, but because
 * there is nothing here for that code to find.
 *
 * `linkedSession` is optional, date+time-level association with an
 * Apple-recorded <Workout> session (src/types.ts WorkoutSession) for the
 * same day — not a forced record-level merge, since Apple's own export
 * has no set/rep data to reconcile against. A manual entry can exist
 * standalone (e.g. the watch wasn't worn) or point at the session it
 * supplements.
 */

export interface ExerciseSet {
  reps?: number;
  weightKg?: number;
  durationMin?: number; // for time-based entries (e.g. plank, cardio)
  notes?: string;
}

export interface LoggedExercise {
  name: string; // free text; matched against the exercise library when possible
  sets: ExerciseSet[];
}

export interface LinkedSession {
  startTime: string; // ISO timestamp, matches a WorkoutSession.startTime for that date
  type: string;
}

export interface ManualWorkout {
  id: string;
  date: string; // YYYY-MM-DD
  type: string; // free text, e.g. "Gym", "Pickleball"
  durationMin?: number;
  exercises: LoggedExercise[];
  notes?: string;
  linkedSession?: LinkedSession;
  createdAt: string;
}

export interface ExerciseVolume {
  name: string;
  totalSets: number;
  totalReps: number;
  totalVolumeKg: number; // sum(weight * reps) across all sets with both present
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
}

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Per-exercise volume summary, with muscle tags resolved from the library
 * when the logged name matches a known exercise (falls back to no muscle
 * tags for a free-text name the library doesn't recognize — never guessed). */
export function summarizeExercise(exercise: LoggedExercise): ExerciseVolume {
  let totalReps = 0;
  let totalVolumeKg = 0;
  for (const s of exercise.sets) {
    if (typeof s.reps === "number") totalReps += s.reps;
    if (typeof s.reps === "number" && typeof s.weightKg === "number") totalVolumeKg += s.reps * s.weightKg;
  }
  const def = findExercise(exercise.name);
  return {
    name: exercise.name,
    totalSets: exercise.sets.length,
    totalReps,
    totalVolumeKg: round(totalVolumeKg, 1),
    primaryMuscles: def?.primary ?? [],
    secondaryMuscles: def?.secondary ?? [],
  };
}

/** Muscles touched by a workout, ranked by how many exercises hit them as
 * a primary target — drives which muscle-map regions light up strongest. */
export function workoutMuscleTargets(workout: Pick<ManualWorkout, "exercises">): { muscle: MuscleId; primaryHits: number; secondaryHits: number }[] {
  const counts = new Map<MuscleId, { primaryHits: number; secondaryHits: number }>();
  for (const ex of workout.exercises) {
    const def = findExercise(ex.name);
    if (!def) continue;
    for (const m of def.primary) {
      const c = counts.get(m) ?? { primaryHits: 0, secondaryHits: 0 };
      c.primaryHits++;
      counts.set(m, c);
    }
    for (const m of def.secondary) {
      const c = counts.get(m) ?? { primaryHits: 0, secondaryHits: 0 };
      c.secondaryHits++;
      counts.set(m, c);
    }
  }
  return [...counts.entries()]
    .map(([muscle, c]) => ({ muscle, ...c }))
    .sort((a, b) => b.primaryHits - a.primaryHits || b.secondaryHits - a.secondaryHits);
}

export function sanitizeManualWorkout(raw: unknown): Omit<ManualWorkout, "id" | "createdAt"> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
  if (typeof r.type !== "string" || !r.type.trim()) return null;

  const exercises: LoggedExercise[] = Array.isArray(r.exercises)
    ? r.exercises
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && typeof (e as Record<string, unknown>).name === "string")
        .map((e) => ({
          name: String(e.name).trim().slice(0, 100),
          sets: Array.isArray(e.sets)
            ? e.sets
                .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
                .map((s) => ({
                  reps: typeof s.reps === "number" ? s.reps : undefined,
                  weightKg: typeof s.weightKg === "number" ? s.weightKg : undefined,
                  durationMin: typeof s.durationMin === "number" ? s.durationMin : undefined,
                  notes: typeof s.notes === "string" ? s.notes.slice(0, 200) : undefined,
                }))
                .slice(0, 30)
            : [],
        }))
        .slice(0, 20)
    : [];

  const linkedSession: LinkedSession | undefined =
    typeof r.linkedSession === "object" && r.linkedSession !== null && typeof (r.linkedSession as Record<string, unknown>).startTime === "string"
      ? {
          startTime: (r.linkedSession as Record<string, unknown>).startTime as string,
          type: String((r.linkedSession as Record<string, unknown>).type ?? ""),
        }
      : undefined;

  return {
    date: r.date,
    type: r.type.trim().slice(0, 60),
    durationMin: typeof r.durationMin === "number" ? r.durationMin : undefined,
    exercises,
    notes: typeof r.notes === "string" ? r.notes.slice(0, 1000) : undefined,
    linkedSession,
  };
}

// ---- Workout volume tracking over time ----

export interface ExerciseVolumeHistory {
  exercise: string;
  dataPoints: { date: string; totalVolume: number; maxWeight: number; totalReps: number }[];
}

export function exerciseVolumeHistory(workouts: ManualWorkout[], exerciseName: string): ExerciseVolumeHistory {
  const points: ExerciseVolumeHistory["dataPoints"] = [];
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    for (const ex of w.exercises) {
      if (ex.name.toLowerCase() !== exerciseName.toLowerCase()) continue;
      let totalVolume = 0;
      let maxWeight = 0;
      let totalReps = 0;
      for (const s of ex.sets) {
        if (typeof s.reps === "number") totalReps += s.reps;
        if (typeof s.weightKg === "number") maxWeight = Math.max(maxWeight, s.weightKg);
        if (typeof s.reps === "number" && typeof s.weightKg === "number") totalVolume += s.reps * s.weightKg;
      }
      points.push({ date: w.date, totalVolume: round(totalVolume, 1), maxWeight, totalReps });
    }
  }
  return { exercise: exerciseName, dataPoints: points };
}

// ---- Personal records ----

export function computePRs(workouts: ManualWorkout[]): WorkoutPR[] {
  const prs: WorkoutPR[] = [];
  const bestWeight = new Map<string, { value: number; date: string }>();
  const bestVolume = new Map<string, { value: number; date: string }>();
  const bestReps = new Map<string, { value: number; date: string }>();

  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const name = ex.name.toLowerCase();
      for (const s of ex.sets) {
        if (typeof s.weightKg === "number" && s.weightKg > 0) {
          const prev = bestWeight.get(name);
          if (!prev || s.weightKg > prev.value) {
            bestWeight.set(name, { value: s.weightKg, date: w.date });
          }
        }
        if (typeof s.reps === "number" && typeof s.weightKg === "number") {
          const vol = s.reps * s.weightKg;
          const prev = bestVolume.get(name);
          if (!prev || vol > prev.value) {
            bestVolume.set(name, { value: round(vol, 1), date: w.date });
          }
        }
        if (typeof s.reps === "number") {
          const prev = bestReps.get(name);
          if (!prev || s.reps > prev.value) {
            bestReps.set(name, { value: s.reps, date: w.date });
          }
        }
      }
    }
  }

  for (const [exercise, best] of bestWeight) {
    prs.push({ exercise, metric: "weight", value: best.value, date: best.date, previousBest: null });
  }
  for (const [exercise, best] of bestVolume) {
    prs.push({ exercise, metric: "volume", value: best.value, date: best.date, previousBest: null });
  }
  for (const [exercise, best] of bestReps) {
    prs.push({ exercise, metric: "reps", value: best.value, date: best.date, previousBest: null });
  }

  return prs.sort((a, b) => b.date.localeCompare(a.date));
}

// ---- Muscle balance analysis ----

const MUSCLE_CATEGORY: Record<string, MuscleBalance["category"]> = {
  chest: "push", front_delt: "push", triceps: "push",
  upper_back: "pull", lats: "pull", rear_delt: "pull", biceps: "pull", forearms: "pull",
  quads: "legs", hamstrings: "legs", glutes: "legs", calves: "legs", hip_flexors: "legs",
  abs: "core", obliques: "core", lower_back: "core",
};

export function computeMuscleBalance(workouts: ManualWorkout[]): MuscleBalance[] {
  const now = workouts.length ? workouts[workouts.length - 1].date : "";
  const thirtyAgo = addDaysStr(now, -30);
  const sevenAgo = addDaysStr(now, -7);
  const last30 = workouts.filter((w) => w.date > thirtyAgo);
  const last7 = workouts.filter((w) => w.date > sevenAgo);

  const counts = new Map<string, { hitsLast30: number; hitsLast7: number }>();

  for (const w of last30) {
    for (const ex of w.exercises) {
      const def = findExercise(ex.name);
      if (!def) continue;
      const muscles = [...def.primary, ...def.secondary];
      for (const m of muscles) {
        const c = counts.get(m) ?? { hitsLast30: 0, hitsLast7: 0 };
        c.hitsLast30++;
        if (w.date > sevenAgo) c.hitsLast7++;
        counts.set(m, c);
      }
    }
  }

  return [...counts.entries()]
    .map(([muscle, c]) => ({
      muscle,
      hitsLast30: c.hitsLast30,
      hitsLast7: c.hitsLast7,
      category: MUSCLE_CATEGORY[muscle] ?? "core" as MuscleBalance["category"],
    }))
    .sort((a, b) => b.hitsLast30 - a.hitsLast30);
}

// ---- Workout frequency by type over time ----

export interface WorkoutFrequency {
  type: string;
  countLast30: number;
  countPrev30: number;
  change: number; // countLast30 - countPrev30
}

export function computeWorkoutFrequency(workouts: ManualWorkout[]): WorkoutFrequency[] {
  if (workouts.length === 0) return [];
  const latest = workouts[workouts.length - 1].date;
  const thirtyAgo = addDaysStr(latest, -30);
  const sixtyAgo = addDaysStr(latest, -60);

  const last30 = workouts.filter((w) => w.date > thirtyAgo);
  const prev30 = workouts.filter((w) => w.date > sixtyAgo && w.date <= thirtyAgo);

  const types = new Map<string, { countLast30: number; countPrev30: number }>();
  for (const w of last30) {
    const t = w.type.toLowerCase();
    const c = types.get(t) ?? { countLast30: 0, countPrev30: 0 };
    c.countLast30++;
    types.set(t, c);
  }
  for (const w of prev30) {
    const t = w.type.toLowerCase();
    const c = types.get(t) ?? { countLast30: 0, countPrev30: 0 };
    c.countPrev30++;
    types.set(t, c);
  }

  return [...types.entries()]
    .map(([type, c]) => ({ type, ...c, change: c.countLast30 - c.countPrev30 }))
    .sort((a, b) => b.countLast30 - a.countLast30);
}

function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ---- Workout templates ----

export interface TemplateExercise {
  name: string;
  defaultSets: number;
  defaultReps: number;
  defaultWeightKg?: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string; // e.g. "Push Day", "Pull Day A"
  type: string; // e.g. "Gym", "Strength"
  exercises: TemplateExercise[];
  notes?: string;
  createdAt: string;
  lastUsed?: string;
  useCount: number;
}

export function sanitizeTemplate(raw: unknown): Omit<WorkoutTemplate, "id" | "createdAt" | "useCount"> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  if (typeof r.type !== "string" || !r.type.trim()) return null;

  const exercises: TemplateExercise[] = Array.isArray(r.exercises)
    ? r.exercises
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && typeof (e as Record<string, unknown>).name === "string")
        .map((e) => ({
          name: String(e.name).trim().slice(0, 100),
          defaultSets: typeof e.defaultSets === "number" ? Math.max(1, Math.min(e.defaultSets, 20)) : 3,
          defaultReps: typeof e.defaultReps === "number" ? Math.max(1, Math.min(e.defaultReps, 100)) : 10,
          defaultWeightKg: typeof e.defaultWeightKg === "number" && e.defaultWeightKg > 0 ? e.defaultWeightKg : undefined,
        }))
        .slice(0, 20)
    : [];

  if (exercises.length === 0) return null;

  return {
    name: r.name.trim().slice(0, 80),
    type: r.type.trim().slice(0, 60),
    exercises,
    notes: typeof r.notes === "string" ? r.notes.slice(0, 500) : undefined,
    lastUsed: typeof r.lastUsed === "string" ? r.lastUsed : undefined,
  };
}

export function templateToWorkoutExercises(template: WorkoutTemplate): LoggedExercise[] {
  return template.exercises.map((te) => ({
    name: te.name,
    sets: Array.from({ length: te.defaultSets }, () => ({
      reps: te.defaultReps,
      weightKg: te.defaultWeightKg,
    })),
  }));
}

// ---- Unlogged workout detection ----

export interface UnloggedSession {
  date: string;
  workoutType: string;
  durationMin: number | null;
  activeEnergy: number | null;
}

export function findUnloggedStrengthSessions(
  days: { date: string; workoutType?: string; workoutMinutes?: number; activeEnergy?: number }[],
  loggedWorkouts: ManualWorkout[],
  lookbackDays = 7
): UnloggedSession[] {
  const loggedDates = new Set(loggedWorkouts.map((w) => w.date));
  const strengthTypes = ["traditionalstrengthtraining", "functionalstrengthtraining", "coretraining", "highintensityintervaltraining", "crosstraining"];
  const recent = days.slice(-lookbackDays);
  const result: UnloggedSession[] = [];

  for (const d of recent) {
    if (!d.workoutType || loggedDates.has(d.date)) continue;
    const types = d.workoutType.toLowerCase().split(",").map((t) => t.trim());
    const hasStrength = types.some((t) => strengthTypes.includes(t));
    if (hasStrength) {
      result.push({
        date: d.date,
        workoutType: d.workoutType,
        durationMin: d.workoutMinutes ? Math.round(d.workoutMinutes) : null,
        activeEnergy: d.activeEnergy ? Math.round(d.activeEnergy) : null,
      });
    }
  }
  return result.sort((a, b) => b.date.localeCompare(a.date));
}
