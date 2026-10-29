import { findExercise, type MuscleId } from "./exerciseLibrary";

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
