import { findExercise, type MuscleId } from "./exerciseLibrary";
import type { ManualWorkout, WorkoutTemplate } from "./manualWorkouts";
import type { DailyMetrics } from "./types";

// ---- Estimated 1RM (Epley formula) ----

export interface Exercise1RM {
  exercise: string;
  current1RM: number; // kg
  previous1RM: number | null; // from prior session
  best1RM: number;
  bestDate: string;
  trend: "improving" | "plateau" | "declining";
  history: { date: string; e1rm: number; bestSetWeight: number; bestSetReps: number }[];
  weeksAtPlateau: number | null;
}

function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function computeExercise1RMs(workouts: ManualWorkout[]): Exercise1RM[] {
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  const byExercise = new Map<string, { date: string; e1rm: number; bestW: number; bestR: number }[]>();

  for (const w of sorted) {
    for (const ex of w.exercises) {
      const name = ex.name.toLowerCase();
      let bestE1RM = 0;
      let bestW = 0;
      let bestR = 0;
      for (const s of ex.sets) {
        if (typeof s.weightKg === "number" && typeof s.reps === "number" && s.weightKg > 0 && s.reps > 0) {
          const e1rm = epley1RM(s.weightKg, s.reps);
          if (e1rm > bestE1RM) {
            bestE1RM = e1rm;
            bestW = s.weightKg;
            bestR = s.reps;
          }
        }
      }
      if (bestE1RM > 0) {
        const arr = byExercise.get(name) ?? [];
        arr.push({ date: w.date, e1rm: round(bestE1RM), bestW, bestR });
        byExercise.set(name, arr);
      }
    }
  }

  const results: Exercise1RM[] = [];
  for (const [exercise, history] of byExercise) {
    if (history.length < 2) continue;
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    const best = history.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));

    // Plateau detection: 3+ sessions with <2% variation
    let weeksAtPlateau: number | null = null;
    if (history.length >= 3) {
      const recent = history.slice(-6);
      const mean = recent.reduce((a, b) => a + b.e1rm, 0) / recent.length;
      const allWithin2Pct = recent.every((p) => Math.abs(p.e1rm - mean) / mean < 0.02);
      if (allWithin2Pct && recent.length >= 3) {
        const firstDate = new Date(recent[0].date);
        const lastDate = new Date(recent[recent.length - 1].date);
        weeksAtPlateau = Math.round((lastDate.getTime() - firstDate.getTime()) / (7 * 86400000));
      }
    }

    // Trend: compare last 3 avg to prior 3 avg
    let trend: Exercise1RM["trend"] = "plateau";
    if (history.length >= 4) {
      const mid = Math.floor(history.length / 2);
      const recentAvg = history.slice(mid).reduce((a, b) => a + b.e1rm, 0) / (history.length - mid);
      const olderAvg = history.slice(0, mid).reduce((a, b) => a + b.e1rm, 0) / mid;
      const pctChange = (recentAvg - olderAvg) / olderAvg;
      if (pctChange > 0.03) trend = "improving";
      else if (pctChange < -0.03) trend = "declining";
    }

    const displayName = findExercise(exercise)?.name ?? exercise;
    results.push({
      exercise: displayName,
      current1RM: current.e1rm,
      previous1RM: previous.e1rm,
      best1RM: best.e1rm,
      bestDate: best.date,
      trend,
      history: history.map((h) => ({ date: h.date, e1rm: h.e1rm, bestSetWeight: h.bestW, bestSetReps: h.bestR })),
      weeksAtPlateau,
    });
  }

  return results.sort((a, b) => b.history.length - a.history.length);
}

// ---- Muscle recovery status ----

export interface MuscleRecoveryStatus {
  muscle: MuscleId;
  lastHitDate: string;
  hoursSinceHit: number;
  recoveryPct: number; // 0-100, estimated
  status: "fresh" | "recovered" | "recovering" | "sore";
  hitIntensity: "primary" | "secondary";
}

const MUSCLE_RECOVERY_HOURS: Record<string, number> = {
  // Large muscles recover slower
  quads: 72, hamstrings: 72, glutes: 72, lats: 72, chest: 72,
  // Medium muscles
  shoulders: 60, lower_back: 60, traps: 60,
  // Small muscles recover faster
  biceps: 48, triceps: 48, abs: 48, obliques: 48, forearms: 48, calves: 48,
};

export function computeMuscleRecovery(
  workouts: ManualWorkout[],
  now: string,
  recoveryScore: number | null
): MuscleRecoveryStatus[] {
  const nowMs = new Date(now + "T12:00:00Z").getTime();
  const muscleHits = new Map<MuscleId, { date: string; intensity: "primary" | "secondary" }>();

  // Find most recent hit per muscle
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const def = findExercise(ex.name);
      if (!def) continue;
      for (const m of def.primary) {
        if (!muscleHits.has(m)) muscleHits.set(m, { date: w.date, intensity: "primary" });
      }
      for (const m of def.secondary) {
        if (!muscleHits.has(m)) muscleHits.set(m, { date: w.date, intensity: "secondary" });
      }
    }
  }

  // Recovery modifier based on overall recovery score
  const recoveryMod = recoveryScore !== null ? (recoveryScore >= 70 ? 0.85 : recoveryScore >= 45 ? 1.0 : 1.3) : 1.0;

  const results: MuscleRecoveryStatus[] = [];
  for (const [muscle, hit] of muscleHits) {
    const hitMs = new Date(hit.date + "T12:00:00Z").getTime();
    const hoursSince = (nowMs - hitMs) / 3600000;
    const baseRecoveryH = (MUSCLE_RECOVERY_HOURS[muscle] ?? 60) * recoveryMod;
    const intensityMod = hit.intensity === "secondary" ? 0.6 : 1.0;
    const effectiveRecoveryH = baseRecoveryH * intensityMod;
    const recoveryPct = Math.min(100, Math.round((hoursSince / effectiveRecoveryH) * 100));

    let status: MuscleRecoveryStatus["status"];
    if (hoursSince > effectiveRecoveryH * 2) status = "fresh";
    else if (recoveryPct >= 90) status = "recovered";
    else if (recoveryPct >= 50) status = "recovering";
    else status = "sore";

    results.push({ muscle, lastHitDate: hit.date, hoursSinceHit: Math.round(hoursSince), recoveryPct, status, hitIntensity: hit.intensity });
  }

  return results.sort((a, b) => a.recoveryPct - b.recoveryPct);
}

// ---- Session prescriber ----

export interface SessionPrescription {
  type: "strength" | "cardio" | "mobility" | "rest";
  title: string;
  reasoning: string;
  targetMuscles: MuscleId[];
  avoidMuscles: MuscleId[];
  durationMin: number;
  intensityZone: "easy" | "moderate" | "hard";
  suggestedTemplate: { id: string; name: string } | null;
  exercises: { name: string; sets: number; reps: number; notes?: string }[];
}

export function prescribeSession(
  muscleRecovery: MuscleRecoveryStatus[],
  strainBudget: { maxStrain: number; zone: string },
  templates: { id: string; name: string; type: string; exercises: { name: string; defaultSets: number; defaultReps: number }[] }[],
  daysSinceRest: number,
  recentWorkoutTypes: string[]
): SessionPrescription {
  // Rest day if strain budget says recovery/easy or 5+ consecutive days
  if (strainBudget.zone === "recovery" || daysSinceRest >= 5) {
    return {
      type: "rest",
      title: daysSinceRest >= 5 ? "Rest day — consecutive day limit" : "Active recovery",
      reasoning: daysSinceRest >= 5
        ? `${daysSinceRest} consecutive training days. Your body needs a full rest day to adapt.`
        : "Recovery score is low. Light movement only — walk, stretch, or foam roll.",
      targetMuscles: [],
      avoidMuscles: muscleRecovery.filter((m) => m.status === "sore").map((m) => m.muscle),
      durationMin: daysSinceRest >= 5 ? 0 : 20,
      intensityZone: "easy",
      suggestedTemplate: null,
      exercises: daysSinceRest >= 5 ? [] : [
        { name: "Walking", sets: 1, reps: 1, notes: "15-20 min easy pace" },
        { name: "Foam rolling", sets: 1, reps: 1, notes: "Focus on sore areas" },
      ],
    };
  }

  // Find fresh + recovered muscles
  const freshMuscles = muscleRecovery.filter((m) => m.status === "fresh" || m.status === "recovered").map((m) => m.muscle);
  const soreMuscles = muscleRecovery.filter((m) => m.status === "sore").map((m) => m.muscle);
  const allMuscles: MuscleId[] = ["chest", "shoulders", "biceps", "triceps", "lats", "traps", "lower_back", "quads", "hamstrings", "glutes", "calves", "abs", "obliques", "forearms"];
  const neverHit = allMuscles.filter((m) => !muscleRecovery.some((mr) => mr.muscle === m));
  const available = [...new Set([...freshMuscles, ...neverHit])];

  // Determine push/pull/legs/upper/lower based on what's available
  const pushMuscles: MuscleId[] = ["chest", "shoulders", "triceps"];
  const pullMuscles: MuscleId[] = ["lats", "traps", "biceps", "forearms"];
  const legMuscles: MuscleId[] = ["quads", "hamstrings", "glutes", "calves"];

  const pushReady = pushMuscles.filter((m) => available.includes(m)).length;
  const pullReady = pullMuscles.filter((m) => available.includes(m)).length;
  const legReady = legMuscles.filter((m) => available.includes(m)).length;

  // Pick the category with most fresh muscles, avoiding recent repeats
  const recentLower = recentWorkoutTypes.slice(0, 2);
  type Split = { name: string; muscles: MuscleId[]; ready: number };
  const splits: Split[] = [
    { name: "Push", muscles: pushMuscles, ready: pushReady },
    { name: "Pull", muscles: pullMuscles, ready: pullReady },
    { name: "Legs", muscles: legMuscles, ready: legReady },
  ];

  // Deprioritize recently done splits
  splits.sort((a, b) => {
    const aRecent = recentLower.some((t) => t.toLowerCase().includes(a.name.toLowerCase())) ? -2 : 0;
    const bRecent = recentLower.some((t) => t.toLowerCase().includes(b.name.toLowerCase())) ? -2 : 0;
    return (b.ready + bRecent) - (a.ready + aRecent);
  });

  const chosen = splits[0];
  const targetMuscles = chosen.muscles.filter((m) => available.includes(m));

  // Intensity based on strain budget
  const intensityZone: SessionPrescription["intensityZone"] =
    strainBudget.zone === "peak" || strainBudget.zone === "push" ? "hard" :
    strainBudget.zone === "easy" ? "easy" : "moderate";

  const durationMin = strainBudget.maxStrain <= 8 ? 30 : strainBudget.maxStrain <= 14 ? 45 : 60;

  // Match to a template if possible
  const matchedTemplate = templates.find((t) => {
    const tName = t.name.toLowerCase();
    return tName.includes(chosen.name.toLowerCase()) || tName.includes(chosen.name.toLowerCase().slice(0, 3));
  });

  // Build exercise list from template or defaults
  let exercises: SessionPrescription["exercises"] = [];
  if (matchedTemplate) {
    const setMod = intensityZone === "easy" ? 0.7 : intensityZone === "hard" ? 1.0 : 0.85;
    exercises = matchedTemplate.exercises.map((e) => ({
      name: e.name,
      sets: Math.max(2, Math.round(e.defaultSets * setMod)),
      reps: e.defaultReps,
    }));
  }

  return {
    type: "strength",
    title: `${chosen.name} day — ${intensityZone} intensity`,
    reasoning: `${targetMuscles.length} of ${chosen.muscles.length} ${chosen.name.toLowerCase()} muscles are recovered.${soreMuscles.length ? ` Avoiding ${soreMuscles.length} sore muscle(s).` : ""} Strain budget: ${strainBudget.maxStrain}/21.`,
    targetMuscles,
    avoidMuscles: soreMuscles,
    durationMin,
    intensityZone,
    suggestedTemplate: matchedTemplate ? { id: matchedTemplate.id, name: matchedTemplate.name } : null,
    exercises,
  };
}

// ---- Periodization intelligence ----

export interface TrainingBlock {
  weekStart: string;
  weekEnd: string;
  totalVolume: number; // kg
  totalSets: number;
  totalSessions: number;
  avgIntensity: number; // avg weight across sets
  phase: "build" | "peak" | "deload" | "base";
}

export interface PeriodizationAnalysis {
  blocks: TrainingBlock[];
  currentPhase: string;
  weeksInPhase: number;
  needsDeload: boolean;
  deloadReason: string | null;
  suggestion: string;
}

export function analyzePeriodization(workouts: ManualWorkout[], monotony: number | null): PeriodizationAnalysis {
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 4) {
    return { blocks: [], currentPhase: "insufficient data", weeksInPhase: 0, needsDeload: false, deloadReason: null, suggestion: "Log more workouts for periodization analysis." };
  }

  // Group by week
  const weekMap = new Map<string, ManualWorkout[]>();
  for (const w of sorted) {
    const wk = mondayOf(w.date);
    const arr = weekMap.get(wk) ?? [];
    arr.push(w);
    weekMap.set(wk, arr);
  }

  const blocks: TrainingBlock[] = [];
  for (const [weekStart, wks] of weekMap) {
    let totalVol = 0;
    let totalSets = 0;
    let totalWeight = 0;
    let weightCount = 0;
    for (const w of wks) {
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          totalSets++;
          if (typeof s.weightKg === "number" && typeof s.reps === "number") {
            totalVol += s.weightKg * s.reps;
            totalWeight += s.weightKg;
            weightCount++;
          }
        }
      }
    }
    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 6);
    blocks.push({
      weekStart,
      weekEnd: endDate.toISOString().slice(0, 10),
      totalVolume: round(totalVol),
      totalSets,
      totalSessions: wks.length,
      avgIntensity: weightCount > 0 ? round(totalWeight / weightCount) : 0,
      phase: "base", // determined below
    });
  }

  // Label phases based on volume trajectory
  if (blocks.length >= 3) {
    const maxVol = Math.max(...blocks.map((b) => b.totalVolume));
    for (const b of blocks) {
      const ratio = maxVol > 0 ? b.totalVolume / maxVol : 0;
      if (ratio < 0.5) b.phase = "deload";
      else if (ratio >= 0.85) b.phase = "peak";
      else if (blocks.indexOf(b) > 0 && b.totalVolume > blocks[blocks.indexOf(b) - 1].totalVolume) b.phase = "build";
      else b.phase = "base";
    }
  }

  const current = blocks[blocks.length - 1];
  let weeksInPhase = 1;
  for (let i = blocks.length - 2; i >= 0; i--) {
    if (blocks[i].phase === current.phase) weeksInPhase++;
    else break;
  }

  // Deload detection
  let needsDeload = false;
  let deloadReason: string | null = null;

  // No deload in 4+ weeks of building/peak
  const recentPhases = blocks.slice(-4).map((b) => b.phase);
  const noRecentDeload = !recentPhases.includes("deload");
  if (noRecentDeload && blocks.length >= 4) {
    const buildOrPeakCount = recentPhases.filter((p) => p === "build" || p === "peak").length;
    if (buildOrPeakCount >= 3) {
      needsDeload = true;
      deloadReason = `${buildOrPeakCount} weeks of high-volume training without a deload.`;
    }
  }

  // High monotony
  if (monotony !== null && monotony > 2.0) {
    needsDeload = true;
    deloadReason = `Training monotony is ${monotony.toFixed(1)} (>2.0). Vary load or take a deload.`;
  }

  let suggestion = "";
  if (needsDeload) {
    suggestion = "Schedule a deload week: reduce volume by 40-50%, keep intensity similar. Your body adapts during recovery, not during training.";
  } else if (current.phase === "deload") {
    suggestion = "Good — you're in a deload phase. Next week, ramp back up to build volume.";
  } else if (current.phase === "build") {
    suggestion = `Week ${weeksInPhase} of building. Add 5-10% volume this week if recovery allows.`;
  } else {
    suggestion = "Maintain current training load. Consider a slight volume increase next week.";
  }

  return { blocks, currentPhase: current.phase, weeksInPhase, needsDeload, deloadReason, suggestion };
}

// ---- Momentum alerts ----

export interface MomentumAlert {
  type: "strength_gain" | "strength_loss" | "volume_surge" | "volume_drop" | "consistency_streak" | "consistency_break" | "plateau_warning";
  severity: "positive" | "warning" | "info";
  title: string;
  detail: string;
  metric?: string;
  value?: number;
}

export function detectMomentumAlerts(
  workouts: ManualWorkout[],
  exercise1RMs: Exercise1RM[],
  periodization: PeriodizationAnalysis
): MomentumAlert[] {
  const alerts: MomentumAlert[] = [];

  // Strength gains/losses
  for (const e of exercise1RMs) {
    if (e.history.length < 3) continue;
    if (e.trend === "improving" && e.previous1RM !== null) {
      const gain = e.current1RM - e.previous1RM;
      if (gain > 0) {
        alerts.push({
          type: "strength_gain",
          severity: "positive",
          title: `${e.exercise} getting stronger`,
          detail: `Estimated 1RM up ${round(gain)}kg to ${round(e.current1RM)}kg.`,
          metric: e.exercise,
          value: gain,
        });
      }
    }
    if (e.trend === "declining" && e.previous1RM !== null) {
      const loss = e.previous1RM - e.current1RM;
      if (loss > 0) {
        alerts.push({
          type: "strength_loss",
          severity: "warning",
          title: `${e.exercise} declining`,
          detail: `Estimated 1RM down ${round(loss)}kg to ${round(e.current1RM)}kg. Consider backing off intensity.`,
          metric: e.exercise,
          value: -loss,
        });
      }
    }
    if (e.weeksAtPlateau !== null && e.weeksAtPlateau >= 3) {
      alerts.push({
        type: "plateau_warning",
        severity: "warning",
        title: `${e.exercise} plateau`,
        detail: `${e.weeksAtPlateau} weeks at ~${round(e.current1RM)}kg. Try varying rep ranges, adding pauses, or changing grip.`,
        metric: e.exercise,
      });
    }
  }

  // Volume trends
  if (periodization.blocks.length >= 3) {
    const last = periodization.blocks[periodization.blocks.length - 1];
    const prev = periodization.blocks[periodization.blocks.length - 2];
    if (prev.totalVolume > 0) {
      const pct = (last.totalVolume - prev.totalVolume) / prev.totalVolume;
      if (pct > 0.2) {
        alerts.push({
          type: "volume_surge",
          severity: "warning",
          title: "Volume spike this week",
          detail: `Total volume up ${Math.round(pct * 100)}% vs last week. Sharp jumps increase injury risk.`,
          value: pct,
        });
      }
      if (pct < -0.3 && last.phase !== "deload") {
        alerts.push({
          type: "volume_drop",
          severity: "info",
          title: "Volume dropped significantly",
          detail: `Total volume down ${Math.round(Math.abs(pct) * 100)}% vs last week.`,
          value: pct,
        });
      }
    }
  }

  // Consistency
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length >= 7) {
    const weekDates = new Set<string>();
    const now = sorted[0].date;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      weekDates.add(d.toISOString().slice(0, 10));
    }
    const thisWeekCount = sorted.filter((w) => weekDates.has(w.date)).length;
    if (thisWeekCount >= 4) {
      alerts.push({
        type: "consistency_streak",
        severity: "positive",
        title: "Strong consistency",
        detail: `${thisWeekCount} sessions this week. Keep it up.`,
        value: thisWeekCount,
      });
    }
  }

  // Deload needed
  if (periodization.needsDeload) {
    alerts.push({
      type: "plateau_warning",
      severity: "warning",
      title: "Deload recommended",
      detail: periodization.deloadReason ?? "Extended high-volume block without recovery.",
    });
  }

  return alerts.sort((a, b) => {
    const order = { warning: 0, positive: 1, info: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });
}

// ---- Helpers ----

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}
