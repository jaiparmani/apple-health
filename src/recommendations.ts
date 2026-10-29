import type { DailyMetrics, KnowledgeNote, SleepAnalysis } from "./types";
import type { MuscleRecoveryStatus } from "./progression";

// ---- Sleep protocol prescription ----

export interface SleepProtocol {
  targetHours: number;
  bedtime: string; // "22:15"
  wakeTime: string; // "06:30"
  caffeineDeadline: string; // "14:00"
  screenCutoff: string; // "21:15"
  lastMealBy: string; // "20:15"
  alcoholAdvice: string | null;
  windDownSteps: string[];
  supplementSuggestion: string | null;
  reasoning: string;
}

export function prescribeSleepProtocol(
  sleepAnalysis: SleepAnalysis | null,
  days: DailyMetrics[],
  notes: KnowledgeNote[],
  sleepTarget: number,
  tomorrowHard: boolean
): SleepProtocol {
  const avgSleep = sleepAnalysis?.avgHours ?? avgOf(days.slice(-14), "sleepHours");
  const dynamicNeed = sleepAnalysis?.dynamicNeedHours ?? sleepTarget;
  const debt = sleepAnalysis?.debtHours ?? 0;
  const optBedtime = sleepAnalysis?.optimalBedtime ?? "22:30";

  // Adjust target up if debt or tomorrow is hard
  let targetHours = dynamicNeed;
  if (debt > 1) targetHours = Math.min(targetHours + 0.5, 9.5);
  if (tomorrowHard) targetHours = Math.min(targetHours + 0.3, 9.5);
  targetHours = Math.round(targetHours * 2) / 2; // round to 0.5

  // Parse optimal bedtime and compute wake time
  const [bedH, bedM] = optBedtime.split(":").map(Number);
  const bedMin = bedH * 60 + bedM;
  const wakeMin = bedMin + targetHours * 60;
  const wakeH = Math.floor((wakeMin % 1440) / 60);
  const wakeM = Math.round(wakeMin % 60);

  // Caffeine deadline: 8h before bed (personal caffeine half-life ~5-6h, needs 2 half-lives)
  const caffDeadline = minutesToTime(bedMin - 480);

  // Screen cutoff: 60min before bed
  const screenCutoff = minutesToTime(bedMin - 60);

  // Last meal: 2-3h before bed
  const lastMeal = minutesToTime(bedMin - 120);

  // Alcohol advice based on personal data
  const alcoholAdvice = computeAlcoholAdvice(days, notes);

  // Wind-down steps
  const windDownSteps: string[] = [];
  const consistency = sleepAnalysis?.consistencyScore ?? null;

  if (consistency !== null && consistency < 70) {
    windDownSteps.push(`Set an alarm for ${minutesToTime(bedMin - 30)} to start winding down — your bedtime consistency is ${consistency}/100`);
  }
  windDownSteps.push(`Dim lights and stop screens by ${minutesToTime(bedMin - 60)}`);
  if (debt > 1.5) windDownSteps.push("Sleep debt is high — prioritize getting to bed on time tonight");
  windDownSteps.push(`Target lights-out by ${optBedtime}`);
  if (tomorrowHard) windDownSteps.push("Tomorrow's session is demanding — sleep is your best performance enhancer tonight");

  // Supplement suggestion based on what they've used and results
  const supplementSuggestion = computeSupplementSuggestion(notes, days);

  const reasons: string[] = [];
  if (debt > 0.5) reasons.push(`${debt.toFixed(1)}h sleep debt`);
  if (tomorrowHard) reasons.push("hard session tomorrow");
  if (avgSleep !== null && avgSleep < sleepTarget - 0.5) reasons.push(`averaging ${avgSleep.toFixed(1)}h vs ${sleepTarget}h target`);
  const reasoning = reasons.length ? `Adjusted for: ${reasons.join(", ")}.` : "On track — maintain your current routine.";

  return {
    targetHours,
    bedtime: optBedtime,
    wakeTime: `${String(wakeH).padStart(2, "0")}:${String(wakeM).padStart(2, "0")}`,
    caffeineDeadline: caffDeadline,
    screenCutoff,
    lastMealBy: lastMeal,
    alcoholAdvice,
    windDownSteps,
    supplementSuggestion,
    reasoning,
  };
}

// ---- Lifestyle impact scores ----

export interface LifestyleImpact {
  factor: string;
  icon: string;
  sampleSize: number;
  impacts: { metric: string; delta: number; unit: string; direction: "better" | "worse" | "neutral" }[];
  recommendation: string;
  confidence: "high" | "medium" | "low";
}

export function computeLifestyleImpacts(days: DailyMetrics[], notes: KnowledgeNote[]): LifestyleImpact[] {
  const results: LifestyleImpact[] = [];
  const noteMap = new Map<string, KnowledgeNote>();
  for (const n of notes) noteMap.set(n.date, n);

  // Alcohol impact
  const alcoholResult = computeFactorImpact(days, noteMap, (n) => (n.alcoholDrinks ?? 0) > 0, "Alcohol");
  if (alcoholResult) {
    const perDrink = computePerDrinkImpact(days, noteMap);
    results.push({
      factor: "Alcohol",
      icon: "🍷",
      sampleSize: alcoholResult.sampleSize,
      impacts: alcoholResult.impacts,
      recommendation: perDrink
        ? `Each drink costs you ~${Math.abs(perDrink.hrvDelta).toFixed(1)}ms HRV and ~${Math.abs(perDrink.deepSleepDelta).toFixed(0)}min deep sleep. ${alcoholResult.sampleSize >= 10 ? "This is your personal coefficient." : ""}`
        : alcoholResult.impacts.length ? `Alcohol nights show ${alcoholResult.impacts[0].delta > 0 ? "better" : "worse"} ${alcoholResult.impacts[0].metric} by ${Math.abs(alcoholResult.impacts[0].delta).toFixed(1)}${alcoholResult.impacts[0].unit}.` : "Not enough data yet.",
      confidence: alcoholResult.sampleSize >= 10 ? "high" : alcoholResult.sampleSize >= 5 ? "medium" : "low",
    });
  }

  // Late meal impact
  const lateMealResult = computeFactorImpact(days, noteMap, (n) => n.lateMeal === true, "Late meal");
  if (lateMealResult) {
    results.push({
      factor: "Late meal",
      icon: "🍽️",
      sampleSize: lateMealResult.sampleSize,
      impacts: lateMealResult.impacts,
      recommendation: lateMealResult.impacts.some((i) => i.direction === "worse")
        ? `Eating within 2h of bed reduces your sleep quality. Stop eating by ${minutesToTime(22 * 60 - 120)} on training days.`
        : "Late meals don't seem to affect your metrics significantly.",
      confidence: lateMealResult.sampleSize >= 8 ? "high" : lateMealResult.sampleSize >= 4 ? "medium" : "low",
    });
  }

  // Screen before bed
  const screenResult = computeFactorImpact(days, noteMap, (n) => n.screenBeforeBed === true, "Screen before bed");
  if (screenResult) {
    results.push({
      factor: "Screen before bed",
      icon: "📱",
      sampleSize: screenResult.sampleSize,
      impacts: screenResult.impacts,
      recommendation: screenResult.impacts.some((i) => i.direction === "worse")
        ? "Screens before bed are measurably hurting your sleep. Use night mode or stop 60min before bed."
        : "Screen time before bed isn't showing a clear negative pattern for you.",
      confidence: screenResult.sampleSize >= 8 ? "high" : screenResult.sampleSize >= 4 ? "medium" : "low",
    });
  }

  // High stress days
  const stressResult = computeFactorImpact(days, noteMap, (n) => (n.stress ?? 0) >= 7, "High stress");
  if (stressResult) {
    results.push({
      factor: "High stress",
      icon: "😰",
      sampleSize: stressResult.sampleSize,
      impacts: stressResult.impacts,
      recommendation: stressResult.impacts.some((i) => i.metric === "HRV" && i.direction === "worse")
        ? `High-stress days drop your HRV by ~${Math.abs(stressResult.impacts.find((i) => i.metric === "HRV")?.delta ?? 0).toFixed(1)}ms. Consider active recovery or meditation on stressed days.`
        : "Stress doesn't seem to significantly impact your recovery metrics.",
      confidence: stressResult.sampleSize >= 8 ? "high" : stressResult.sampleSize >= 4 ? "medium" : "low",
    });
  }

  // Caffeine impact (high vs low days)
  const caffResult = computeFactorImpact(days, noteMap, (n) => (n.caffeineMg ?? 0) > 200, "High caffeine (>200mg)");
  if (caffResult) {
    results.push({
      factor: "High caffeine",
      icon: "☕",
      sampleSize: caffResult.sampleSize,
      impacts: caffResult.impacts,
      recommendation: caffResult.impacts.some((i) => i.metric.includes("Sleep") && i.direction === "worse")
        ? "High caffeine days show worse sleep. Keep it under 200mg and none after 2pm."
        : "Your caffeine intake doesn't show a measurable sleep impact at current levels.",
      confidence: caffResult.sampleSize >= 8 ? "high" : caffResult.sampleSize >= 4 ? "medium" : "low",
    });
  }

  // Supplement effects
  const suppResult = computeSupplementImpacts(days, noteMap);
  results.push(...suppResult);

  return results.filter((r) => r.sampleSize >= 3);
}

// ---- Recovery countdown ----

export interface RecoveryCountdown {
  muscle: string;
  hoursUntilRecovered: number;
  hoursUntilFresh: number;
  readyTime: string; // ISO datetime
  freshTime: string;
  currentPct: number;
}

export function computeRecoveryCountdowns(
  muscleRecovery: MuscleRecoveryStatus[],
  nowISO: string
): RecoveryCountdown[] {
  const now = new Date(nowISO + "T12:00:00Z");
  return muscleRecovery
    .filter((m) => m.status === "sore" || m.status === "recovering")
    .map((m) => {
      const recoveryH = m.recoveryPct > 0 ? (m.hoursSinceHit / m.recoveryPct) * 100 : m.hoursSinceHit + 72;
      const hoursUntilRecovered = Math.max(0, recoveryH * 0.9 - m.hoursSinceHit);
      const hoursUntilFresh = Math.max(0, recoveryH * 1.5 - m.hoursSinceHit);

      const readyTime = new Date(now.getTime() + hoursUntilRecovered * 3600000);
      const freshTime = new Date(now.getTime() + hoursUntilFresh * 3600000);

      return {
        muscle: m.muscle.replace("_", " "),
        hoursUntilRecovered: Math.round(hoursUntilRecovered),
        hoursUntilFresh: Math.round(hoursUntilFresh),
        readyTime: readyTime.toISOString(),
        freshTime: freshTime.toISOString(),
        currentPct: m.recoveryPct,
      };
    })
    .sort((a, b) => a.hoursUntilRecovered - b.hoursUntilRecovered);
}

// ---- Smart contextual check-in ----

export interface SmartCheckInPrompt {
  question: string;
  field: string; // maps to KnowledgeNote field
  type: "number" | "boolean" | "text";
  min?: number;
  max?: number;
  reason: string;
  priority: number;
}

export function generateSmartCheckIn(
  days: DailyMetrics[],
  notes: KnowledgeNote[],
  workouts: { date: string; type: string; exercises: { name: string }[] }[],
  today: string
): SmartCheckInPrompt[] {
  const prompts: SmartCheckInPrompt[] = [];
  const yesterday = addDays(today, -1);
  const yesterdayDay = days.find((d) => d.date === yesterday);
  const todayNote = notes.find((n) => n.date === today);
  const yesterdayNote = notes.find((n) => n.date === yesterday);
  const recentWorkout = workouts.find((w) => w.date === yesterday || w.date === today);

  // Already checked in today? Fewer prompts
  if (todayNote && todayNote.energy && todayNote.soreness) return [];

  // After a hard session: ask about soreness
  if (recentWorkout && recentWorkout.exercises.length >= 3) {
    if (!todayNote?.soreness) {
      prompts.push({
        question: `You did ${recentWorkout.type} (${recentWorkout.exercises.length} exercises) ${recentWorkout.date === today ? "today" : "yesterday"}. How sore are you?`,
        field: "soreness",
        type: "number",
        min: 1,
        max: 10,
        reason: "Tracks recovery from your last session",
        priority: 10,
      });
    }
  }

  // After poor sleep: ask about contributing factors
  if (yesterdayDay && typeof yesterdayDay.sleepHours === "number" && yesterdayDay.sleepHours < 6) {
    if (!yesterdayNote?.lateMeal && yesterdayNote?.lateMeal === undefined) {
      prompts.push({
        question: `You only slept ${yesterdayDay.sleepHours.toFixed(1)}h last night. Did you eat a late meal?`,
        field: "lateMeal",
        type: "boolean",
        reason: "Helps identify what's disrupting your sleep",
        priority: 8,
      });
    }
    if (!yesterdayNote?.screenBeforeBed && yesterdayNote?.screenBeforeBed === undefined) {
      prompts.push({
        question: "Were you on screens right before bed?",
        field: "screenBeforeBed",
        type: "boolean",
        reason: "Screen light suppresses melatonin",
        priority: 7,
      });
    }
  }

  // If HRV is depressed: ask about stress and alcohol
  if (yesterdayDay && typeof yesterdayDay.hrv === "number") {
    const recentHRVs = days.slice(-30).filter((d) => typeof d.hrv === "number").map((d) => d.hrv!);
    const avgHRV = recentHRVs.length ? recentHRVs.reduce((a, b) => a + b, 0) / recentHRVs.length : null;
    if (avgHRV !== null && yesterdayDay.hrv < avgHRV * 0.85) {
      if (yesterdayNote?.alcoholDrinks === undefined) {
        prompts.push({
          question: `Your HRV was ${Math.round(yesterdayDay.hrv)}ms — ${Math.round(((avgHRV - yesterdayDay.hrv) / avgHRV) * 100)}% below average. Did you drink alcohol?`,
          field: "alcoholDrinks",
          type: "number",
          min: 0,
          max: 20,
          reason: "Alcohol is the #1 HRV suppressant — quantifying your intake helps personalize advice",
          priority: 9,
        });
      }
      if (yesterdayNote?.stress === undefined) {
        prompts.push({
          question: "How stressed were you yesterday? (1 = calm, 10 = very stressed)",
          field: "stress",
          type: "number",
          min: 1,
          max: 10,
          reason: "Stress impacts HRV and recovery",
          priority: 6,
        });
      }
    }
  }

  // Always ask energy if not logged
  if (!todayNote?.energy) {
    prompts.push({
      question: "How's your energy right now? (1 = exhausted, 10 = great)",
      field: "energy",
      type: "number",
      min: 1,
      max: 10,
      reason: "Subjective energy + objective data = better recommendations",
      priority: 5,
    });
  }

  // Rest day: ask about hydration
  const todayWorkout = workouts.find((w) => w.date === today);
  if (!todayWorkout && !todayNote) {
    prompts.push({
      question: "Rest day. Roughly how much water have you had today? (liters)",
      field: "hydrationLiters",
      type: "number",
      min: 0,
      max: 10,
      reason: "Hydration affects recovery speed",
      priority: 3,
    });
  }

  return prompts.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

// ---- Helpers ----

function avgOf(days: DailyMetrics[], field: keyof DailyMetrics): number | null {
  const vals = days.filter((d) => typeof d[field] === "number").map((d) => d[field] as number);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

interface FactorImpactResult {
  sampleSize: number;
  impacts: { metric: string; delta: number; unit: string; direction: "better" | "worse" | "neutral" }[];
}

function computeFactorImpact(
  days: DailyMetrics[],
  noteMap: Map<string, KnowledgeNote>,
  predicate: (n: KnowledgeNote) => boolean,
  _label: string
): FactorImpactResult | null {
  const withFactor: DailyMetrics[] = [];
  const withoutFactor: DailyMetrics[] = [];

  for (const d of days) {
    const note = noteMap.get(d.date);
    if (!note) continue;
    if (predicate(note)) withFactor.push(d);
    else withoutFactor.push(d);
  }

  if (withFactor.length < 3 || withoutFactor.length < 3) return null;

  const impacts: FactorImpactResult["impacts"] = [];
  const metrics: { key: keyof DailyMetrics; label: string; unit: string; higherBetter: boolean }[] = [
    { key: "hrv", label: "HRV", unit: "ms", higherBetter: true },
    { key: "restingHeartRate", label: "Resting HR", unit: "bpm", higherBetter: false },
    { key: "sleepHours", label: "Sleep hours", unit: "h", higherBetter: true },
    { key: "sleepDeepHours", label: "Deep sleep", unit: "h", higherBetter: true },
    { key: "sleepEfficiency", label: "Sleep efficiency", unit: "%", higherBetter: true },
  ];

  for (const m of metrics) {
    const withVals = withFactor.map((d) => d[m.key]).filter((v): v is number => typeof v === "number");
    const withoutVals = withoutFactor.map((d) => d[m.key]).filter((v): v is number => typeof v === "number");
    if (withVals.length < 3 || withoutVals.length < 3) continue;

    const withAvg = withVals.reduce((a, b) => a + b, 0) / withVals.length;
    const withoutAvg = withoutVals.reduce((a, b) => a + b, 0) / withoutVals.length;
    const delta = withAvg - withoutAvg;
    if (Math.abs(delta) < 0.01) continue;

    const unit = m.key === "sleepEfficiency" ? "%" : m.unit;
    const displayDelta = m.key === "sleepEfficiency" ? delta * 100 : delta;
    const direction: "better" | "worse" | "neutral" =
      Math.abs(displayDelta) < (m.key === "sleepEfficiency" ? 1 : 0.5) ? "neutral" :
      (m.higherBetter ? displayDelta > 0 : displayDelta < 0) ? "better" : "worse";

    impacts.push({ metric: m.label, delta: Math.round(displayDelta * 10) / 10, unit, direction });
  }

  return { sampleSize: withFactor.length, impacts };
}

function computePerDrinkImpact(
  days: DailyMetrics[],
  noteMap: Map<string, KnowledgeNote>
): { hrvDelta: number; deepSleepDelta: number } | null {
  const points: { drinks: number; hrv: number; deep: number }[] = [];
  for (const d of days) {
    const note = noteMap.get(d.date);
    if (!note || note.alcoholDrinks === undefined || typeof d.hrv !== "number") continue;
    points.push({
      drinks: note.alcoholDrinks,
      hrv: d.hrv,
      deep: typeof d.sleepDeepHours === "number" ? d.sleepDeepHours * 60 : 0,
    });
  }
  if (points.length < 5) return null;

  const zeroDrinks = points.filter((p) => p.drinks === 0);
  const withDrinks = points.filter((p) => p.drinks > 0);
  if (zeroDrinks.length < 3 || withDrinks.length < 3) return null;

  const baseHRV = zeroDrinks.reduce((a, b) => a + b.hrv, 0) / zeroDrinks.length;
  const baseDeep = zeroDrinks.reduce((a, b) => a + b.deep, 0) / zeroDrinks.length;

  const totalDrinks = withDrinks.reduce((a, b) => a + b.drinks, 0);
  const totalHRVDiff = withDrinks.reduce((a, b) => a + (b.hrv - baseHRV), 0);
  const totalDeepDiff = withDrinks.reduce((a, b) => a + (b.deep - baseDeep), 0);

  return {
    hrvDelta: totalHRVDiff / totalDrinks,
    deepSleepDelta: totalDeepDiff / totalDrinks,
  };
}

function computeAlcoholAdvice(days: DailyMetrics[], notes: KnowledgeNote[]): string | null {
  const noteMap = new Map<string, KnowledgeNote>();
  for (const n of notes) noteMap.set(n.date, n);
  const impact = computePerDrinkImpact(days, noteMap);
  if (!impact) return null;
  if (Math.abs(impact.hrvDelta) < 1 && Math.abs(impact.deepSleepDelta) < 5) {
    return "Your data doesn't show a strong alcohol→recovery link at your current intake. Still, zero is optimal.";
  }
  return `Each drink costs ~${Math.abs(impact.hrvDelta).toFixed(1)}ms HRV and ~${Math.abs(impact.deepSleepDelta).toFixed(0)}min deep sleep. Skip alcohol tonight for best recovery.`;
}

function computeSupplementSuggestion(notes: KnowledgeNote[], days: DailyMetrics[]): string | null {
  const suppDays = notes.filter((n) => n.supplements && n.supplements.length > 0);
  if (suppDays.length < 5) return null;

  const magDays = suppDays.filter((n) => n.supplements!.some((s) => s.toLowerCase().includes("magnesium")));
  if (magDays.length >= 3) {
    const magSleep = magDays.map((n) => {
      const d = days.find((d2) => d2.date === n.date);
      return d?.sleepDeepHours;
    }).filter((v): v is number => typeof v === "number");

    const noMagSleep = notes.filter((n) => !n.supplements?.some((s) => s.toLowerCase().includes("magnesium")))
      .map((n) => days.find((d2) => d2.date === n.date)?.sleepDeepHours)
      .filter((v): v is number => typeof v === "number");

    if (magSleep.length >= 3 && noMagSleep.length >= 3) {
      const magAvg = magSleep.reduce((a, b) => a + b, 0) / magSleep.length;
      const noMagAvg = noMagSleep.reduce((a, b) => a + b, 0) / noMagSleep.length;
      const diff = (magAvg - noMagAvg) * 60;
      if (diff > 5) return `Magnesium nights show +${Math.round(diff)}min deep sleep. Keep taking it.`;
    }
  }
  return null;
}

function computeSupplementImpacts(
  days: DailyMetrics[],
  noteMap: Map<string, KnowledgeNote>
): LifestyleImpact[] {
  const suppCounts = new Map<string, number>();
  for (const [, note] of noteMap) {
    if (note.supplements) {
      for (const s of note.supplements) {
        const key = s.toLowerCase().trim();
        suppCounts.set(key, (suppCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const results: LifestyleImpact[] = [];
  for (const [supp, count] of suppCounts) {
    if (count < 3) continue;
    const result = computeFactorImpact(
      days, noteMap,
      (n) => (n.supplements ?? []).some((s) => s.toLowerCase().trim() === supp),
      supp
    );
    if (result && result.impacts.length > 0) {
      results.push({
        factor: supp.charAt(0).toUpperCase() + supp.slice(1),
        icon: "💊",
        sampleSize: result.sampleSize,
        impacts: result.impacts,
        recommendation: result.impacts.some((i) => i.direction === "better")
          ? `${supp.charAt(0).toUpperCase() + supp.slice(1)} shows a positive effect on your ${result.impacts.find((i) => i.direction === "better")!.metric}. Keep using it.`
          : "No clear benefit detected yet. Keep logging for more data.",
        confidence: result.sampleSize >= 10 ? "high" : result.sampleSize >= 5 ? "medium" : "low",
      });
    }
  }
  return results;
}
