import type { DailyMetrics, UserProfile, BiologicalAgeResult, MuscleBalance } from "./types";
import type { ManualWorkout } from "./manualWorkouts";
import type { MuscleId } from "./exerciseLibrary";
import { findExercise } from "./exerciseLibrary";

// ---- Body Composition ----

export interface BodyComposition {
  currentWeight: number | null;
  weightTrend: "losing" | "gaining" | "stable" | "unknown";
  weight7dAvg: number | null;
  weight30dAvg: number | null;
  weightDelta30d: number | null;
  bodyFatPct: number | null;
  estimatedLeanMass: number | null;
  estimatedFatMass: number | null;
  bmi: number | null;
  bmiCategory: string;
  idealWeightRange: { low: number; high: number } | null;
  weightHistory: { date: string; weight: number }[];
  bodyFatHistory: { date: string; pct: number }[];
}

export function computeBodyComposition(
  days: DailyMetrics[],
  profile: UserProfile | null
): BodyComposition {
  const withWeight = days.filter((d) => typeof d.weightKg === "number");
  const withBf = days.filter((d) => typeof d.bodyFatPct === "number");
  const current = withWeight.length ? withWeight[withWeight.length - 1].weightKg! : null;

  const last7w = withWeight.slice(-7).map((d) => d.weightKg!);
  const last30w = withWeight.slice(-30).map((d) => d.weightKg!);
  const weight7dAvg = last7w.length >= 3 ? avg(last7w) : null;
  const weight30dAvg = last30w.length >= 5 ? avg(last30w) : null;

  const prior30 = withWeight.slice(-60, -30).map((d) => d.weightKg!);
  const priorAvg = prior30.length >= 5 ? avg(prior30) : null;
  const weightDelta30d = weight30dAvg !== null && priorAvg !== null ? weight30dAvg - priorAvg : null;

  let weightTrend: BodyComposition["weightTrend"] = "unknown";
  if (weightDelta30d !== null) {
    if (weightDelta30d < -0.5) weightTrend = "losing";
    else if (weightDelta30d > 0.5) weightTrend = "gaining";
    else weightTrend = "stable";
  }

  const bodyFatPct = withBf.length ? withBf[withBf.length - 1].bodyFatPct! : null;
  const estimatedLeanMass = current !== null && bodyFatPct !== null ? current * (1 - bodyFatPct) : null;
  const estimatedFatMass = current !== null && bodyFatPct !== null ? current * bodyFatPct : null;

  const heightM = profile?.heightCm ? profile.heightCm / 100 : null;
  const bmi = current !== null && heightM ? current / (heightM * heightM) : null;
  let bmiCategory = "Unknown";
  if (bmi !== null) {
    if (bmi < 18.5) bmiCategory = "Underweight";
    else if (bmi < 25) bmiCategory = "Normal";
    else if (bmi < 30) bmiCategory = "Overweight";
    else bmiCategory = "Obese";
  }

  let idealWeightRange: BodyComposition["idealWeightRange"] = null;
  if (heightM) {
    idealWeightRange = {
      low: Math.round(18.5 * heightM * heightM * 10) / 10,
      high: Math.round(24.9 * heightM * heightM * 10) / 10,
    };
  }

  return {
    currentWeight: current,
    weightTrend,
    weight7dAvg: weight7dAvg !== null ? Math.round(weight7dAvg * 10) / 10 : null,
    weight30dAvg: weight30dAvg !== null ? Math.round(weight30dAvg * 10) / 10 : null,
    weightDelta30d: weightDelta30d !== null ? Math.round(weightDelta30d * 10) / 10 : null,
    bodyFatPct,
    estimatedLeanMass: estimatedLeanMass !== null ? Math.round(estimatedLeanMass * 10) / 10 : null,
    estimatedFatMass: estimatedFatMass !== null ? Math.round(estimatedFatMass * 10) / 10 : null,
    bmi: bmi !== null ? Math.round(bmi * 10) / 10 : null,
    bmiCategory,
    idealWeightRange,
    weightHistory: withWeight.slice(-90).map((d) => ({ date: d.date, weight: d.weightKg! })),
    bodyFatHistory: withBf.slice(-90).map((d) => ({ date: d.date, pct: d.bodyFatPct! })),
  };
}

// ---- Muscle Volume Map ----

export interface MuscleVolumeMap {
  muscle: MuscleId;
  displayName: string;
  volumeLast7: number; // total sets
  volumeLast30: number;
  volumeTrend: "growing" | "maintaining" | "declining" | "untrained";
  weeklyAvgSets: number;
  optimalRange: { min: number; max: number };
  status: "overtrained" | "optimal" | "undertrained" | "neglected";
}

const OPTIMAL_WEEKLY_SETS: Record<string, { min: number; max: number }> = {
  chest: { min: 10, max: 20 }, lats: { min: 10, max: 20 },
  shoulders: { min: 8, max: 16 }, quads: { min: 10, max: 20 },
  hamstrings: { min: 8, max: 16 }, glutes: { min: 8, max: 16 },
  biceps: { min: 6, max: 14 }, triceps: { min: 6, max: 14 },
  abs: { min: 6, max: 14 }, calves: { min: 8, max: 16 },
  traps: { min: 6, max: 12 }, lower_back: { min: 4, max: 10 },
  forearms: { min: 4, max: 10 }, obliques: { min: 4, max: 10 },
};

export function computeMuscleVolumeMap(workouts: ManualWorkout[]): MuscleVolumeMap[] {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const volumeByMuscle = new Map<MuscleId, { last7: number; last30: number }>();
  const allMuscles: MuscleId[] = [
    "chest", "shoulders", "biceps", "triceps", "forearms",
    "abs", "obliques", "lats", "traps", "lower_back",
    "glutes", "quads", "hamstrings", "calves",
  ];
  for (const m of allMuscles) volumeByMuscle.set(m, { last7: 0, last30: 0 });

  for (const w of workouts) {
    if (w.date < d30) continue;
    for (const ex of w.exercises) {
      const def = findExercise(ex.name);
      if (!def) continue;
      const sets = ex.sets.length;
      for (const m of def.primary) {
        const v = volumeByMuscle.get(m);
        if (v) {
          v.last30 += sets;
          if (w.date >= d7) v.last7 += sets;
        }
      }
      for (const m of def.secondary) {
        const v = volumeByMuscle.get(m);
        if (v) {
          v.last30 += Math.round(sets * 0.5);
          if (w.date >= d7) v.last7 += Math.round(sets * 0.5);
        }
      }
    }
  }

  return allMuscles.map((muscle) => {
    const v = volumeByMuscle.get(muscle)!;
    const weeksInMonth = 4.3;
    const weeklyAvgSets = Math.round((v.last30 / weeksInMonth) * 10) / 10;
    const optimal = OPTIMAL_WEEKLY_SETS[muscle] ?? { min: 6, max: 14 };

    let status: MuscleVolumeMap["status"] = "optimal";
    if (weeklyAvgSets === 0) status = "neglected";
    else if (weeklyAvgSets < optimal.min) status = "undertrained";
    else if (weeklyAvgSets > optimal.max) status = "overtrained";

    const prior7 = v.last30 - v.last7;
    const weeklyPrior = prior7 / (30 / 7 - 1);
    let volumeTrend: MuscleVolumeMap["volumeTrend"] = "untrained";
    if (v.last30 > 0) {
      const change = v.last7 - weeklyPrior;
      if (change > 2) volumeTrend = "growing";
      else if (change < -2) volumeTrend = "declining";
      else volumeTrend = "maintaining";
    }

    return {
      muscle,
      displayName: muscle.replace("_", " "),
      volumeLast7: v.last7,
      volumeLast30: v.last30,
      volumeTrend,
      weeklyAvgSets,
      optimalRange: optimal,
      status,
    };
  });
}

// ---- Body Symmetry ----

export interface BodySymmetry {
  pushPullRatio: number | null; // ideal ~1.0
  upperLowerRatio: number | null; // ideal ~0.6-0.8
  anteriorPosteriorRatio: number | null;
  imbalances: { area: string; description: string; severity: "mild" | "moderate" | "severe" }[];
  overallScore: number; // 0-100
}

export function computeBodySymmetry(muscleVolume: MuscleVolumeMap[]): BodySymmetry {
  const vol = (m: string) => muscleVolume.find((v) => v.muscle === m)?.volumeLast30 ?? 0;

  const pushVol = vol("chest") + vol("shoulders") + vol("triceps");
  const pullVol = vol("lats") + vol("traps") + vol("biceps") + vol("lower_back");
  const upperVol = pushVol + pullVol;
  const lowerVol = vol("quads") + vol("hamstrings") + vol("glutes") + vol("calves");
  const anteriorVol = vol("chest") + vol("quads") + vol("abs") + vol("shoulders");
  const posteriorVol = vol("lats") + vol("hamstrings") + vol("glutes") + vol("lower_back") + vol("traps");

  const pushPullRatio = pullVol > 0 ? Math.round((pushVol / pullVol) * 100) / 100 : null;
  const upperLowerRatio = lowerVol > 0 ? Math.round((upperVol / lowerVol) * 100) / 100 : null;
  const anteriorPosteriorRatio = posteriorVol > 0 ? Math.round((anteriorVol / posteriorVol) * 100) / 100 : null;

  const imbalances: BodySymmetry["imbalances"] = [];

  if (pushPullRatio !== null) {
    if (pushPullRatio > 1.5) imbalances.push({ area: "Push/Pull", description: `Push:Pull ratio is ${pushPullRatio} — add more rowing and pulling movements`, severity: pushPullRatio > 2 ? "severe" : "moderate" });
    else if (pushPullRatio < 0.7) imbalances.push({ area: "Push/Pull", description: `Pull-dominant (${pushPullRatio}) — add more pressing`, severity: "mild" });
  }

  if (upperLowerRatio !== null) {
    if (upperLowerRatio > 1.5) imbalances.push({ area: "Upper/Lower", description: `Upper body dominant (${upperLowerRatio}) — prioritize legs`, severity: upperLowerRatio > 2 ? "severe" : "moderate" });
    else if (upperLowerRatio < 0.4) imbalances.push({ area: "Upper/Lower", description: `Lower body dominant (${upperLowerRatio}) — add more upper body`, severity: "mild" });
  }

  const neglected = muscleVolume.filter((m) => m.status === "neglected" && m.volumeLast30 === 0);
  if (neglected.length > 3) {
    imbalances.push({ area: "Coverage", description: `${neglected.length} muscle groups untrained: ${neglected.map((m) => m.displayName).join(", ")}`, severity: neglected.length > 5 ? "severe" : "moderate" });
  }

  if (vol("quads") > 0 && vol("hamstrings") === 0) {
    imbalances.push({ area: "Quad/Ham", description: "Training quads but not hamstrings — ACL injury risk", severity: "severe" });
  }

  let score = 100;
  imbalances.forEach((i) => { score -= i.severity === "severe" ? 25 : i.severity === "moderate" ? 15 : 5; });
  score = Math.max(0, Math.min(100, score));

  return { pushPullRatio, upperLowerRatio, anteriorPosteriorRatio, imbalances, overallScore: score };
}

// ---- Body Score (composite) ----

export interface BodyScore {
  total: number; // 0-100
  components: { name: string; score: number; maxScore: number; detail: string }[];
  label: string;
}

export function computeBodyScore(
  composition: BodyComposition,
  symmetry: BodySymmetry,
  bioAge: BiologicalAgeResult | null,
  days: DailyMetrics[],
  profile: UserProfile | null
): BodyScore {
  const components: BodyScore["components"] = [];

  // Weight stability (0-20)
  if (composition.bmi !== null) {
    const bmiScore = composition.bmi >= 18.5 && composition.bmi <= 24.9 ? 20
      : composition.bmi >= 17 && composition.bmi <= 27 ? 14
      : composition.bmi >= 15 && composition.bmi <= 30 ? 8 : 4;
    components.push({ name: "BMI", score: bmiScore, maxScore: 20, detail: `${composition.bmi} (${composition.bmiCategory})` });
  }

  // Body fat (0-20)
  if (composition.bodyFatPct !== null) {
    const isMale = profile?.sex === "male";
    const bf = composition.bodyFatPct * 100;
    const optimalLow = isMale ? 10 : 18;
    const optimalHigh = isMale ? 20 : 28;
    const bfScore = bf >= optimalLow && bf <= optimalHigh ? 20
      : bf >= optimalLow - 3 && bf <= optimalHigh + 5 ? 14
      : 6;
    components.push({ name: "Body fat", score: bfScore, maxScore: 20, detail: `${(bf).toFixed(1)}%` });
  }

  // Muscle balance (0-20)
  components.push({ name: "Symmetry", score: Math.round(symmetry.overallScore / 5), maxScore: 20, detail: `${symmetry.overallScore}/100` });

  // Cardio fitness via VO2max (0-20)
  const recentVo2 = days.slice(-30).filter((d) => typeof d.vo2max === "number").map((d) => d.vo2max!);
  if (recentVo2.length) {
    const vo2 = recentVo2[recentVo2.length - 1];
    const vo2Score = vo2 >= 50 ? 20 : vo2 >= 42 ? 16 : vo2 >= 35 ? 12 : vo2 >= 28 ? 8 : 4;
    components.push({ name: "VO2max", score: vo2Score, maxScore: 20, detail: `${vo2.toFixed(1)} ml/kg/min` });
  }

  // Biological age gap (0-20)
  if (bioAge) {
    const gap = bioAge.deltaYears;
    const ageScore = gap <= -3 ? 20 : gap <= -1 ? 16 : gap <= 1 ? 12 : gap <= 3 ? 8 : 4;
    components.push({ name: "Body age", score: ageScore, maxScore: 20, detail: `${gap > 0 ? "+" : ""}${gap.toFixed(1)} years` });
  }

  const totalPossible = components.reduce((a, c) => a + c.maxScore, 0) || 100;
  const totalScore = components.reduce((a, c) => a + c.score, 0);
  const normalized = Math.round((totalScore / totalPossible) * 100);

  const label = normalized >= 85 ? "Elite" : normalized >= 70 ? "Strong" : normalized >= 50 ? "Average" : "Needs work";

  return { total: normalized, components, label };
}

// ---- Physique Estimator ----

export interface PhysiqueProfile {
  dominantType: string;
  description: string;
  strongPoints: string[];
  weakPoints: string[];
  trainingAge: { months: number; label: string };
  estimatedFFMI: number | null; // Fat-Free Mass Index
}

export function estimatePhysique(
  composition: BodyComposition,
  muscleVolume: MuscleVolumeMap[],
  workouts: ManualWorkout[],
  profile: UserProfile | null
): PhysiqueProfile {
  const strongMuscles = muscleVolume.filter((m) => m.status === "optimal" || m.weeklyAvgSets >= (OPTIMAL_WEEKLY_SETS[m.muscle]?.min ?? 6));
  const weakMuscles = muscleVolume.filter((m) => m.status === "neglected" || m.status === "undertrained");

  // Training age from workout history
  const dates = workouts.map((w) => w.date).sort();
  const firstDate = dates.length ? new Date(dates[0]) : new Date();
  const months = Math.round((Date.now() - firstDate.getTime()) / (30.44 * 86400000));
  const trainingLabel = months < 6 ? "Beginner" : months < 18 ? "Intermediate" : months < 36 ? "Advanced" : "Experienced";

  // FFMI: lean mass / height^2 (in kg/m^2)
  let estimatedFFMI: number | null = null;
  if (composition.estimatedLeanMass !== null && profile?.heightCm) {
    const hm = profile.heightCm / 100;
    estimatedFFMI = Math.round((composition.estimatedLeanMass / (hm * hm)) * 10) / 10;
  }

  // Determine dominant type from training patterns
  const upper = muscleVolume.filter((m) => ["chest", "shoulders", "biceps", "triceps", "lats", "traps"].includes(m.muscle));
  const lower = muscleVolume.filter((m) => ["quads", "hamstrings", "glutes", "calves"].includes(m.muscle));
  const upperVol = upper.reduce((a, m) => a + m.volumeLast30, 0);
  const lowerVol = lower.reduce((a, m) => a + m.volumeLast30, 0);
  const totalVol = upperVol + lowerVol;

  let dominantType = "Balanced";
  let description = "Well-rounded training approach across all muscle groups.";
  if (totalVol === 0) {
    dominantType = "Getting started";
    description = "No strength training data yet. Start logging workouts to build your physique profile.";
  } else if (upperVol > lowerVol * 2) {
    dominantType = "Upper body focus";
    description = "Your training heavily favors upper body. Consider adding more leg work for a balanced physique.";
  } else if (lowerVol > upperVol * 2) {
    dominantType = "Lower body focus";
    description = "Strong legs emphasis. Add more upper body pressing and pulling for balance.";
  } else if (muscleVolume.some((m) => m.muscle === "chest" && m.weeklyAvgSets > 15)) {
    dominantType = "Chest-dominant";
    description = "Heavy chest focus — classic bro split. Watch your shoulder health and add back work.";
  }

  return {
    dominantType,
    description,
    strongPoints: strongMuscles.slice(0, 5).map((m) => m.displayName),
    weakPoints: weakMuscles.slice(0, 5).map((m) => m.displayName),
    trainingAge: { months, label: trainingLabel },
    estimatedFFMI,
  };
}

// ---- Body Measurements ----

export interface BodyMeasurement {
  date: string;
  waistCm?: number;
  chestCm?: number;
  hipsCm?: number;
  leftArmCm?: number;
  rightArmCm?: number;
  leftThighCm?: number;
  rightThighCm?: number;
  neckCm?: number;
  shouldersCm?: number;
  calvesLCm?: number;
  calvesRCm?: number;
  waistToHipRatio?: number;
}

export function analyzeMeasurements(measurements: BodyMeasurement[]): {
  latest: BodyMeasurement | null;
  changes30d: Record<string, number>;
  waistToHipRatio: number | null;
  waistToHipCategory: string;
} {
  if (measurements.length === 0) return { latest: null, changes30d: {}, waistToHipRatio: null, waistToHipCategory: "Unknown" };

  const sorted = [...measurements].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];

  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const prior = sorted.filter((m) => m.date <= d30);
  const priorM = prior.length ? prior[prior.length - 1] : null;

  const changes30d: Record<string, number> = {};
  if (priorM) {
    const keys: (keyof BodyMeasurement)[] = ["waistCm", "chestCm", "hipsCm", "leftArmCm", "rightArmCm", "leftThighCm", "rightThighCm", "neckCm", "shouldersCm"];
    for (const k of keys) {
      if (typeof latest[k] === "number" && typeof priorM[k] === "number") {
        changes30d[k] = Math.round(((latest[k] as number) - (priorM[k] as number)) * 10) / 10;
      }
    }
  }

  let waistToHipRatio: number | null = null;
  let waistToHipCategory = "Unknown";
  if (latest.waistCm && latest.hipsCm) {
    waistToHipRatio = Math.round((latest.waistCm / latest.hipsCm) * 100) / 100;
    if (waistToHipRatio < 0.85) waistToHipCategory = "Low risk";
    else if (waistToHipRatio < 0.95) waistToHipCategory = "Moderate risk";
    else waistToHipCategory = "High risk";
  }

  return { latest, changes30d, waistToHipRatio, waistToHipCategory };
}

// ---- Mobility Score ----

export interface MobilityScore {
  total: number; // 0-100
  walkingSpeed: { value: number | null; percentile: string };
  stepLength: { value: number | null; percentile: string };
  asymmetry: { value: number | null; status: string };
  doubleSupport: { value: number | null; status: string };
}

export function computeMobilityScore(days: DailyMetrics[]): MobilityScore {
  const recent = days.slice(-14);
  const walkSpeeds = recent.map((d) => d.walkingSpeed).filter((v): v is number => typeof v === "number");
  const stepLens = recent.map((d) => d.walkingStepLength).filter((v): v is number => typeof v === "number");
  const asyms = recent.map((d) => d.walkingAsymmetryPct).filter((v): v is number => typeof v === "number");
  const dblSups = recent.map((d) => d.walkingDoubleSupportPct).filter((v): v is number => typeof v === "number");

  const avgSpeed = walkSpeeds.length ? avg(walkSpeeds) : null;
  const avgStep = stepLens.length ? avg(stepLens) : null;
  const avgAsym = asyms.length ? avg(asyms) : null;
  const avgDblSup = dblSups.length ? avg(dblSups) : null;

  let score = 50;
  if (avgSpeed !== null) score += avgSpeed > 1.4 ? 15 : avgSpeed > 1.2 ? 10 : avgSpeed > 1.0 ? 5 : 0;
  if (avgStep !== null) score += avgStep > 75 ? 10 : avgStep > 65 ? 5 : 0;
  if (avgAsym !== null) score += avgAsym < 0.05 ? 15 : avgAsym < 0.1 ? 10 : avgAsym < 0.15 ? 5 : -5;
  if (avgDblSup !== null) score += avgDblSup < 0.25 ? 10 : avgDblSup < 0.3 ? 5 : 0;

  return {
    total: Math.max(0, Math.min(100, score)),
    walkingSpeed: {
      value: avgSpeed !== null ? Math.round(avgSpeed * 100) / 100 : null,
      percentile: avgSpeed !== null ? (avgSpeed > 1.4 ? "Excellent" : avgSpeed > 1.2 ? "Good" : avgSpeed > 1.0 ? "Average" : "Below avg") : "No data",
    },
    stepLength: {
      value: avgStep !== null ? Math.round(avgStep) : null,
      percentile: avgStep !== null ? (avgStep > 75 ? "Long stride" : avgStep > 65 ? "Normal" : "Short stride") : "No data",
    },
    asymmetry: {
      value: avgAsym !== null ? Math.round(avgAsym * 1000) / 10 : null,
      status: avgAsym !== null ? (avgAsym < 0.05 ? "Symmetrical" : avgAsym < 0.1 ? "Slight asymmetry" : "Notable asymmetry") : "No data",
    },
    doubleSupport: {
      value: avgDblSup !== null ? Math.round(avgDblSup * 1000) / 10 : null,
      status: avgDblSup !== null ? (avgDblSup < 0.25 ? "Excellent balance" : avgDblSup < 0.3 ? "Good" : "Needs work") : "No data",
    },
  };
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
