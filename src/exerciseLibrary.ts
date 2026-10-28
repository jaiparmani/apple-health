/**
 * A curated exercise library for the manual workout logger: searchable by
 * name, each entry tagged with the muscle groups it targets so the UI can
 * drive autocomplete suggestions and highlight the muscle map. Muscle ids
 * match the regions defined in src/muscleMap.ts — adding an exercise here
 * never requires touching the SVG, and vice versa, as long as both use the
 * same vocabulary.
 */

export type MuscleId =
  | "chest"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "lats"
  | "traps"
  | "lower_back"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "calves";

export type ExerciseCategory = "chest" | "back" | "shoulders" | "arms" | "legs" | "core" | "cardio";

export interface ExerciseDef {
  name: string;
  category: ExerciseCategory;
  primary: MuscleId[];
  secondary: MuscleId[];
  equipment?: string;
}

export const EXERCISE_LIBRARY: ExerciseDef[] = [
  // Chest
  { name: "Bench Press", category: "chest", primary: ["chest"], secondary: ["triceps", "shoulders"], equipment: "barbell" },
  { name: "Incline Bench Press", category: "chest", primary: ["chest", "shoulders"], secondary: ["triceps"], equipment: "barbell" },
  { name: "Dumbbell Bench Press", category: "chest", primary: ["chest"], secondary: ["triceps", "shoulders"], equipment: "dumbbell" },
  { name: "Dumbbell Fly", category: "chest", primary: ["chest"], secondary: ["shoulders"], equipment: "dumbbell" },
  { name: "Push-Up", category: "chest", primary: ["chest"], secondary: ["triceps", "shoulders", "abs"], equipment: "bodyweight" },
  { name: "Cable Crossover", category: "chest", primary: ["chest"], secondary: ["shoulders"], equipment: "cable" },
  { name: "Dips", category: "chest", primary: ["chest", "triceps"], secondary: ["shoulders"], equipment: "bodyweight" },

  // Back
  { name: "Deadlift", category: "back", primary: ["lower_back", "hamstrings", "glutes"], secondary: ["lats", "traps", "forearms"], equipment: "barbell" },
  { name: "Romanian Deadlift", category: "back", primary: ["hamstrings", "glutes"], secondary: ["lower_back"], equipment: "barbell" },
  { name: "Barbell Row", category: "back", primary: ["lats", "traps"], secondary: ["biceps", "lower_back"], equipment: "barbell" },
  { name: "Pull-Up", category: "back", primary: ["lats"], secondary: ["biceps", "forearms"], equipment: "bodyweight" },
  { name: "Chin-Up", category: "back", primary: ["lats", "biceps"], secondary: ["forearms"], equipment: "bodyweight" },
  { name: "Lat Pulldown", category: "back", primary: ["lats"], secondary: ["biceps"], equipment: "cable" },
  { name: "Seated Cable Row", category: "back", primary: ["lats", "traps"], secondary: ["biceps"], equipment: "cable" },
  { name: "T-Bar Row", category: "back", primary: ["lats", "traps"], secondary: ["biceps", "lower_back"], equipment: "barbell" },

  // Shoulders
  { name: "Overhead Press", category: "shoulders", primary: ["shoulders"], secondary: ["triceps", "abs"], equipment: "barbell" },
  { name: "Arnold Press", category: "shoulders", primary: ["shoulders"], secondary: ["triceps"], equipment: "dumbbell" },
  { name: "Lateral Raise", category: "shoulders", primary: ["shoulders"], secondary: [], equipment: "dumbbell" },
  { name: "Front Raise", category: "shoulders", primary: ["shoulders"], secondary: [], equipment: "dumbbell" },
  { name: "Rear Delt Fly", category: "shoulders", primary: ["shoulders"], secondary: ["traps"], equipment: "dumbbell" },
  { name: "Shrug", category: "shoulders", primary: ["traps"], secondary: ["forearms"], equipment: "barbell" },

  // Arms
  { name: "Barbell Curl", category: "arms", primary: ["biceps"], secondary: ["forearms"], equipment: "barbell" },
  { name: "Dumbbell Curl", category: "arms", primary: ["biceps"], secondary: ["forearms"], equipment: "dumbbell" },
  { name: "Hammer Curl", category: "arms", primary: ["biceps", "forearms"], secondary: [], equipment: "dumbbell" },
  { name: "Preacher Curl", category: "arms", primary: ["biceps"], secondary: ["forearms"], equipment: "barbell" },
  { name: "Tricep Pushdown", category: "arms", primary: ["triceps"], secondary: [], equipment: "cable" },
  { name: "Skull Crusher", category: "arms", primary: ["triceps"], secondary: [], equipment: "barbell" },
  { name: "Close-Grip Bench Press", category: "arms", primary: ["triceps", "chest"], secondary: ["shoulders"], equipment: "barbell" },
  { name: "Overhead Tricep Extension", category: "arms", primary: ["triceps"], secondary: [], equipment: "dumbbell" },

  // Legs
  { name: "Squat", category: "legs", primary: ["quads", "glutes"], secondary: ["hamstrings", "lower_back"], equipment: "barbell" },
  { name: "Front Squat", category: "legs", primary: ["quads"], secondary: ["glutes", "abs"], equipment: "barbell" },
  { name: "Leg Press", category: "legs", primary: ["quads", "glutes"], secondary: ["hamstrings"], equipment: "machine" },
  { name: "Lunges", category: "legs", primary: ["quads", "glutes"], secondary: ["hamstrings"], equipment: "dumbbell" },
  { name: "Leg Curl", category: "legs", primary: ["hamstrings"], secondary: [], equipment: "machine" },
  { name: "Leg Extension", category: "legs", primary: ["quads"], secondary: [], equipment: "machine" },
  { name: "Calf Raise", category: "legs", primary: ["calves"], secondary: [], equipment: "machine" },
  { name: "Hip Thrust", category: "legs", primary: ["glutes"], secondary: ["hamstrings"], equipment: "barbell" },

  // Core
  { name: "Plank", category: "core", primary: ["abs"], secondary: ["obliques", "lower_back"], equipment: "bodyweight" },
  { name: "Crunch", category: "core", primary: ["abs"], secondary: [], equipment: "bodyweight" },
  { name: "Russian Twist", category: "core", primary: ["obliques"], secondary: ["abs"], equipment: "bodyweight" },
  { name: "Hanging Leg Raise", category: "core", primary: ["abs"], secondary: ["forearms"], equipment: "bodyweight" },
  { name: "Cable Woodchopper", category: "core", primary: ["obliques"], secondary: ["abs"], equipment: "cable" },

  // Cardio / sport (no set/rep structure, but still logged)
  { name: "Pickleball", category: "cardio", primary: ["quads", "calves", "shoulders"], secondary: ["glutes", "forearms"], equipment: "sport" },
  { name: "Running", category: "cardio", primary: ["quads", "hamstrings", "calves"], secondary: ["glutes"], equipment: "none" },
  { name: "Cycling", category: "cardio", primary: ["quads", "hamstrings"], secondary: ["calves"], equipment: "bike" },
  { name: "Rowing", category: "cardio", primary: ["lats", "quads"], secondary: ["biceps", "shoulders"], equipment: "machine" },
  { name: "Swimming", category: "cardio", primary: ["lats", "shoulders"], secondary: ["chest", "quads"], equipment: "none" },
];

/** Case-insensitive prefix/substring match, ranked: prefix matches first. */
export function searchExercises(query: string, limit = 8): ExerciseDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: ExerciseDef[] = [];
  const contains: ExerciseDef[] = [];
  for (const ex of EXERCISE_LIBRARY) {
    const name = ex.name.toLowerCase();
    if (name.startsWith(q)) starts.push(ex);
    else if (name.includes(q)) contains.push(ex);
  }
  return [...starts, ...contains].slice(0, limit);
}

export function findExercise(name: string): ExerciseDef | null {
  const q = name.trim().toLowerCase();
  return EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === q) ?? null;
}
