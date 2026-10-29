import type { DailyMetrics, KnowledgeNote } from "./types";

/**
 * Personal Pattern Engine: discovers YOUR body's specific responses from
 * YOUR data. Not population averages — personal coefficients derived from
 * weeks/months of sensor readings and journal entries.
 *
 * A $1M/yr coach watches you for months and says "YOUR HRV drops 14ms
 * after 2+ drinks — that's 18 hours of impaired recovery" or "YOU need
 * 7.8 hours, not 8 — your deep sleep peaks at exactly that length". This
 * engine produces those insights deterministically, from your own data.
 */

export interface PersonalPattern {
  id: string;
  category: "recovery" | "sleep" | "training" | "lifestyle" | "performance";
  title: string;
  insight: string; // the coaching sentence
  confidence: "high" | "moderate" | "low";
  sampleSize: number;
  metric?: string;
  value?: number;
}

export interface StrainBudget {
  maxStrain: number; // 0-21 strain cap for today
  zone: "recovery" | "easy" | "moderate" | "push" | "peak";
  rationale: string;
  timeCapMin: number | null;
}

export interface InjuryRisk {
  score: number; // 0-100
  level: "low" | "moderate" | "high" | "critical";
  factors: { factor: string; contribution: number; detail: string }[];
}

export interface WeeklyReportCard {
  weekStart: string;
  overall: LetterGrade;
  domains: {
    training: LetterGrade;
    recovery: LetterGrade;
    sleep: LetterGrade;
    activity: LetterGrade;
    consistency: LetterGrade;
  };
  highlights: string[];
  improvements: string[];
}

type LetterGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "F";

export interface PerformancePrediction {
  metric: string;
  label: string;
  current: number;
  target: number;
  predictedDate: string | null;
  trajectory: "improving" | "flat" | "declining";
  ratePerMonth: number;
  detail: string;
}

export interface CoachDirective {
  headline: string;
  body: string;
  strainBudget: StrainBudget;
  injuryRisk: InjuryRisk;
  sleepRx: string;
  nutritionCue: string | null;
  mentalNote: string | null;
}

// ---- helpers ----

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function slopePerDay(points: [number, number][]): number | null {
  if (points.length < 7) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function gradeFromScore(score: number): LetterGrade {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 60) return "D";
  return "F";
}

// ---- Pattern Discovery ----

function discoverRecoveryPatterns(days: DailyMetrics[]): PersonalPattern[] {
  const patterns: PersonalPattern[] = [];
  if (days.length < 30) return patterns;

  // How long does YOUR HRV take to recover after high-strain days?
  const highStrainDays = days.filter((d, i) =>
    typeof d.strain === "number" && d.strain >= 14 && i < days.length - 3
  );
  if (highStrainDays.length >= 5) {
    const recoveryTimes: number[] = [];
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const hd of highStrainDays) {
      const baseHrv = typeof hd.hrv === "number" ? hd.hrv : null;
      if (baseHrv === null) continue;
      // Pre-strain baseline: avg of 3 days before
      const preHrvs: number[] = [];
      for (let i = 1; i <= 3; i++) {
        const pd = byDate.get(addDaysStr(hd.date, -i));
        if (pd && typeof pd.hrv === "number") preHrvs.push(pd.hrv);
      }
      if (preHrvs.length < 2) continue;
      const preBaseline = mean(preHrvs);
      // Count days until HRV returns to 90% of pre-baseline
      let recovered = false;
      for (let i = 1; i <= 5; i++) {
        const nd = byDate.get(addDaysStr(hd.date, i));
        if (nd && typeof nd.hrv === "number" && nd.hrv >= preBaseline * 0.9) {
          recoveryTimes.push(i);
          recovered = true;
          break;
        }
      }
      if (!recovered) recoveryTimes.push(5);
    }
    if (recoveryTimes.length >= 3) {
      const avgRecovery = round(mean(recoveryTimes), 1);
      patterns.push({
        id: "hrv_recovery_time",
        category: "recovery",
        title: "HRV recovery time after hard sessions",
        insight: `Your HRV typically takes ${avgRecovery} day${avgRecovery === 1 ? "" : "s"} to recover after high-strain sessions. ${avgRecovery <= 1.5 ? "You bounce back fast — your recovery system is strong." : avgRecovery <= 2.5 ? "Normal recovery window. Schedule easy days accordingly." : "Slow recovery. Space hard sessions at least 3 days apart."}`,
        confidence: recoveryTimes.length >= 8 ? "high" : "moderate",
        sampleSize: recoveryTimes.length,
        value: avgRecovery,
      });
    }
  }

  // YOUR resting HR elevation after hard training
  const rhrAfterHard: number[] = [];
  const rhrAfterEasy: number[] = [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const curr = days[i];
    if (typeof curr.restingHeartRate !== "number" || typeof prev.strain !== "number") continue;
    if (prev.strain >= 14) rhrAfterHard.push(curr.restingHeartRate);
    else if (prev.strain <= 8) rhrAfterEasy.push(curr.restingHeartRate);
  }
  if (rhrAfterHard.length >= 5 && rhrAfterEasy.length >= 5) {
    const diff = round(mean(rhrAfterHard) - mean(rhrAfterEasy), 1);
    if (Math.abs(diff) >= 1) {
      patterns.push({
        id: "rhr_strain_response",
        category: "recovery",
        title: "Resting HR response to hard training",
        insight: `Your resting HR runs ${Math.abs(diff)} bpm ${diff > 0 ? "higher" : "lower"} the morning after hard sessions vs easy days. ${diff > 3 ? "Significant cardiac stress response — don't ignore it. If RHR is up 4+, go easy." : "Normal response. Your heart adapts well to load."}`,
        confidence: rhrAfterHard.length >= 10 ? "high" : "moderate",
        sampleSize: rhrAfterHard.length + rhrAfterEasy.length,
        value: diff,
      });
    }
  }

  return patterns;
}

function discoverSleepPatterns(days: DailyMetrics[]): PersonalPattern[] {
  const patterns: PersonalPattern[] = [];
  if (days.length < 30) return patterns;

  // YOUR optimal sleep duration (where next-day HRV peaks)
  const sleepHrvPairs: { sleep: number; hrv: number }[] = [];
  for (let i = 0; i < days.length - 1; i++) {
    if (typeof days[i].sleepHours === "number" && typeof days[i + 1].hrv === "number") {
      sleepHrvPairs.push({ sleep: days[i].sleepHours!, hrv: days[i + 1].hrv! });
    }
  }
  if (sleepHrvPairs.length >= 20) {
    // Bucket by half-hour and find peak
    const buckets = new Map<number, number[]>();
    for (const p of sleepHrvPairs) {
      const bucket = Math.round(p.sleep * 2) / 2;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(p.hrv);
    }
    let bestBucket = 0, bestHrv = 0;
    for (const [bucket, hrvs] of buckets) {
      if (hrvs.length >= 3) {
        const avg = mean(hrvs);
        if (avg > bestHrv) { bestHrv = avg; bestBucket = bucket; }
      }
    }
    if (bestBucket > 0) {
      patterns.push({
        id: "optimal_sleep_duration",
        category: "sleep",
        title: "Your optimal sleep duration",
        insight: `Your HRV peaks at ${bestBucket}h of sleep (avg ${Math.round(bestHrv)} ms). More than ${bestBucket + 0.5}h doesn't improve recovery — it's about hitting your sweet spot, not maximizing hours.`,
        confidence: sleepHrvPairs.length >= 40 ? "high" : "moderate",
        sampleSize: sleepHrvPairs.length,
        value: bestBucket,
      });
    }
  }

  // Sleep consistency impact
  const last30 = days.slice(-30);
  const sleepHours = last30.map((d) => d.sleepHours).filter((v): v is number => typeof v === "number");
  if (sleepHours.length >= 20) {
    const cv = stddev(sleepHours) / mean(sleepHours);
    const consistencyPct = Math.round((1 - Math.min(1, cv * 5)) * 100);
    if (cv > 0.15) {
      patterns.push({
        id: "sleep_variability",
        category: "sleep",
        title: "Sleep timing variability",
        insight: `Your sleep varies by ±${round(stddev(sleepHours) * 60, 0)} minutes night to night (${consistencyPct}% consistency). ${cv > 0.2 ? "High variability. Your circadian rhythm is fighting you. Pick a bedtime and hold it within 30 minutes — even weekends." : "Moderate variability. Tightening weekends alone would improve this."}`,
        confidence: "high",
        sampleSize: sleepHours.length,
        value: consistencyPct,
      });
    }
  }

  return patterns;
}

function discoverTrainingPatterns(days: DailyMetrics[]): PersonalPattern[] {
  const patterns: PersonalPattern[] = [];
  if (days.length < 30) return patterns;

  // Supercompensation windows: when does form (TSB) go positive after a training block?
  const last90 = days.slice(-90);
  const strainDays = last90.filter((d) => typeof d.strain === "number");
  if (strainDays.length >= 20) {
    const weeklyLoads: number[] = [];
    for (let w = 0; w < Math.min(12, Math.floor(strainDays.length / 7)); w++) {
      const week = last90.slice(w * 7, (w + 1) * 7);
      const load = week.reduce((s, d) => s + (d.strain ?? 0), 0);
      weeklyLoads.push(load);
    }
    if (weeklyLoads.length >= 4) {
      const avgLoad = mean(weeklyLoads);
      const highWeeks = weeklyLoads.filter((l) => l > avgLoad * 1.2).length;
      const lowWeeks = weeklyLoads.filter((l) => l < avgLoad * 0.8).length;
      if (highWeeks >= 1 && lowWeeks >= 1) {
        patterns.push({
          id: "load_periodization",
          category: "training",
          title: "Training load distribution",
          insight: `${highWeeks} hard week${highWeeks > 1 ? "s" : ""} and ${lowWeeks} easy week${lowWeeks > 1 ? "s" : ""} in the last ${weeklyLoads.length} weeks. ${lowWeeks / weeklyLoads.length < 0.2 ? "Not enough deload — take an easy week every 3-4 hard ones." : "Good periodization. You're cycling load properly."}`,
          confidence: weeklyLoads.length >= 8 ? "high" : "moderate",
          sampleSize: weeklyLoads.length,
        });
      }
    }
  }

  // Consecutive hard days before performance drops
  let maxConsecutiveBeforeDrop = 0;
  let consecutiveRuns: number[] = [];
  let streak = 0;
  for (let i = 1; i < days.length; i++) {
    if (typeof days[i].strain === "number" && days[i].strain! >= 12) {
      streak++;
    } else {
      if (streak >= 2) consecutiveRuns.push(streak);
      streak = 0;
    }
  }
  if (consecutiveRuns.length >= 3) {
    const avgRun = round(mean(consecutiveRuns), 1);
    patterns.push({
      id: "hard_day_ceiling",
      category: "training",
      title: "Consecutive hard day tolerance",
      insight: `You typically sustain ${avgRun} hard days in a row before your body signals rest. ${avgRun >= 4 ? "High tolerance. Still — schedule a deload after 4 consecutive hard days." : avgRun >= 3 ? "Average tolerance. Alternate hard and easy days where possible." : "Low tolerance. Never stack more than 2 hard days back to back."}`,
      confidence: consecutiveRuns.length >= 5 ? "high" : "moderate",
      sampleSize: consecutiveRuns.length,
      value: avgRun,
    });
  }

  return patterns;
}

function discoverLifestylePatterns(days: DailyMetrics[], notes: KnowledgeNote[]): PersonalPattern[] {
  const patterns: PersonalPattern[] = [];
  if (notes.length < 10) return patterns;

  const dayByDate = new Map(days.map((d) => [d.date, d]));

  // YOUR alcohol → HRV impact (quantified per drink)
  const alcoholNotes = notes.filter((n) => typeof n.alcoholDrinks === "number");
  if (alcoholNotes.length >= 10) {
    const zeroDrinkHrvs: number[] = [];
    const drinkHrvs: { drinks: number; hrv: number }[] = [];
    for (const note of alcoholNotes) {
      const nextDay = dayByDate.get(addDaysStr(note.date, 1));
      if (!nextDay || typeof nextDay.hrv !== "number") continue;
      if (note.alcoholDrinks === 0) {
        zeroDrinkHrvs.push(nextDay.hrv);
      } else {
        drinkHrvs.push({ drinks: note.alcoholDrinks!, hrv: nextDay.hrv });
      }
    }
    if (zeroDrinkHrvs.length >= 5 && drinkHrvs.length >= 5) {
      const baselineHrv = mean(zeroDrinkHrvs);
      const avgDrinkHrv = mean(drinkHrvs.map((d) => d.hrv));
      const drop = round(baselineHrv - avgDrinkHrv, 1);
      const avgDrinks = mean(drinkHrvs.map((d) => d.drinks));
      const dropPerDrink = avgDrinks > 0 ? round(drop / avgDrinks, 1) : 0;
      if (drop > 2) {
        patterns.push({
          id: "alcohol_hrv_impact",
          category: "lifestyle",
          title: "Alcohol's impact on YOUR recovery",
          insight: `Each drink costs you ~${Math.abs(dropPerDrink)} ms of HRV the next morning (${Math.round(baselineHrv)} ms sober → ${Math.round(avgDrinkHrv)} ms after drinking). ${drop > 10 ? "You're highly alcohol-sensitive. Even 1-2 drinks measurably impair recovery." : "Moderate sensitivity. Keep it under 2 drinks if you're training the next day."}`,
          confidence: drinkHrvs.length >= 15 ? "high" : "moderate",
          sampleSize: zeroDrinkHrvs.length + drinkHrvs.length,
          value: dropPerDrink,
        });
      }
    }
  }

  // Stress → sleep impact
  const stressNotes = notes.filter((n) => typeof n.stress === "number");
  if (stressNotes.length >= 10) {
    const lowStressSleep: number[] = [];
    const highStressSleep: number[] = [];
    for (const note of stressNotes) {
      const day = dayByDate.get(note.date);
      if (!day || typeof day.sleepHours !== "number") continue;
      if (note.stress! <= 4) lowStressSleep.push(day.sleepHours);
      else if (note.stress! >= 7) highStressSleep.push(day.sleepHours);
    }
    if (lowStressSleep.length >= 5 && highStressSleep.length >= 5) {
      const diff = round(mean(lowStressSleep) - mean(highStressSleep), 1);
      if (diff > 0.2) {
        patterns.push({
          id: "stress_sleep_impact",
          category: "lifestyle",
          title: "How stress affects YOUR sleep",
          insight: `High-stress days cost you ${round(diff * 60, 0)} minutes of sleep (${round(mean(lowStressSleep), 1)}h calm → ${round(mean(highStressSleep), 1)}h stressed). ${diff > 0.5 ? "Major impact. On stressful days, add 30min wind-down: walk, breathe, no screens." : "Mild impact. Your sleep is fairly stress-resilient."}`,
          confidence: lowStressSleep.length + highStressSleep.length >= 20 ? "high" : "moderate",
          sampleSize: lowStressSleep.length + highStressSleep.length,
          value: diff,
        });
      }
    }
  }

  // Late meal → sleep efficiency
  const lateMealNotes = notes.filter((n) => typeof n.lateMeal === "boolean");
  if (lateMealNotes.length >= 10) {
    const noLateEffs: number[] = [];
    const lateEffs: number[] = [];
    for (const note of lateMealNotes) {
      const day = dayByDate.get(note.date);
      if (!day || typeof day.sleepEfficiency !== "number") continue;
      if (note.lateMeal) lateEffs.push(day.sleepEfficiency);
      else noLateEffs.push(day.sleepEfficiency);
    }
    if (noLateEffs.length >= 5 && lateEffs.length >= 5) {
      const diff = round((mean(noLateEffs) - mean(lateEffs)) * 100, 1);
      if (diff > 1) {
        patterns.push({
          id: "late_meal_impact",
          category: "lifestyle",
          title: "Late eating's impact on YOUR sleep",
          insight: `Eating late drops your sleep efficiency by ${diff}% (${round(mean(noLateEffs) * 100, 0)}% → ${round(mean(lateEffs) * 100, 0)}%). ${diff > 3 ? "Your body needs 3+ hours between last bite and bed." : "Minor but real. Aim for 2h minimum before bed."}`,
          confidence: noLateEffs.length + lateEffs.length >= 20 ? "high" : "moderate",
          sampleSize: noLateEffs.length + lateEffs.length,
          value: diff,
        });
      }
    }
  }

  return patterns;
}

export function discoverPatterns(days: DailyMetrics[], notes: KnowledgeNote[]): PersonalPattern[] {
  return [
    ...discoverRecoveryPatterns(days),
    ...discoverSleepPatterns(days),
    ...discoverTrainingPatterns(days),
    ...discoverLifestylePatterns(days, notes),
  ].sort((a, b) => {
    const conf = { high: 0, moderate: 1, low: 2 };
    return conf[a.confidence] - conf[b.confidence] || b.sampleSize - a.sampleSize;
  });
}

// ---- Strain Budget ----

export function computeStrainBudget(
  days: DailyMetrics[],
  readiness: number | null,
  recoveryScore: number | null,
  acwr: number | null,
  form: number | null,
  daysSinceRest: number
): StrainBudget {
  let maxStrain = 15; // default moderate
  let zone = "moderate" as StrainBudget["zone"];
  const reasons: string[] = [];

  // Recovery-based cap
  if (recoveryScore !== null) {
    if (recoveryScore < 25) {
      maxStrain = Math.min(maxStrain, 6);
      zone = "recovery";
      reasons.push(`Recovery ${recoveryScore}/100 — body is depleted`);
    } else if (recoveryScore < 45) {
      maxStrain = Math.min(maxStrain, 10);
      zone = "easy";
      reasons.push(`Recovery ${recoveryScore}/100 — not fully restored`);
    } else if (recoveryScore >= 75) {
      maxStrain = 19;
      zone = "push";
      reasons.push(`Recovery ${recoveryScore}/100 — primed for intensity`);
    }
  }

  // Form-based adjustment
  if (form !== null) {
    if (form > 5) {
      maxStrain = Math.min(21, maxStrain + 2);
      if (zone === "push") zone = "peak";
      reasons.push(`Form +${form.toFixed(1)} — supercompensation window`);
    } else if (form < -8) {
      maxStrain = Math.min(maxStrain, 8);
      if (zone !== "recovery") zone = "easy";
      reasons.push(`Form ${form.toFixed(1)} — deep fatigue`);
    }
  }

  // ACWR spike protection
  if (acwr !== null && acwr > 1.4) {
    maxStrain = Math.min(maxStrain, 10);
    reasons.push(`Load ratio ${acwr.toFixed(2)} — spike risk`);
  }

  // Consecutive day protection
  if (daysSinceRest >= 5) {
    maxStrain = Math.min(maxStrain, 8);
    if (zone !== "recovery") zone = "easy";
    reasons.push(`${daysSinceRest} days without rest`);
  }

  // Time cap estimate: strain 10 ≈ 30min moderate, strain 15 ≈ 50min, strain 19 ≈ 70min
  const timeCapMin = maxStrain <= 6 ? 20 : maxStrain <= 10 ? 35 : maxStrain <= 15 ? 50 : maxStrain <= 19 ? 70 : null;

  return {
    maxStrain: round(maxStrain, 0),
    zone,
    rationale: reasons.length ? reasons.join(". ") + "." : "Baseline capacity — no strong signals.",
    timeCapMin,
  };
}

// ---- Injury Risk ----

export function computeInjuryRisk(
  acwr: number | null,
  monotony: number | null,
  daysSinceRest: number,
  recoveryScore: number | null,
  weeklyLoadChange: number | null
): InjuryRisk {
  const factors: InjuryRisk["factors"] = [];
  let score = 0;

  // ACWR spike
  if (acwr !== null) {
    if (acwr > 1.5) {
      const contrib = Math.min(35, (acwr - 1.0) * 40);
      score += contrib;
      factors.push({ factor: "Load spike", contribution: round(contrib, 0), detail: `Acute:chronic ratio ${acwr.toFixed(2)} — above 1.5 is the danger zone.` });
    } else if (acwr > 1.3) {
      const contrib = (acwr - 1.0) * 20;
      score += contrib;
      factors.push({ factor: "Load ramp", contribution: round(contrib, 0), detail: `Acute:chronic ratio ${acwr.toFixed(2)} — ramping fast.` });
    }
  }

  // Training monotony
  if (monotony !== null && monotony > 1.8) {
    const contrib = Math.min(20, (monotony - 1.5) * 20);
    score += contrib;
    factors.push({ factor: "Training monotony", contribution: round(contrib, 0), detail: `Monotony score ${monotony.toFixed(2)} — every day is the same intensity.` });
  }

  // Consecutive hard days
  if (daysSinceRest >= 5) {
    const contrib = Math.min(25, (daysSinceRest - 3) * 8);
    score += contrib;
    factors.push({ factor: "No rest days", contribution: round(contrib, 0), detail: `${daysSinceRest} consecutive days without adequate rest.` });
  }

  // Low recovery
  if (recoveryScore !== null && recoveryScore < 35) {
    const contrib = Math.min(20, (50 - recoveryScore) * 0.5);
    score += contrib;
    factors.push({ factor: "Poor recovery", contribution: round(contrib, 0), detail: `Recovery score ${recoveryScore}/100 — training on empty.` });
  }

  // Weekly load jump
  if (weeklyLoadChange !== null && weeklyLoadChange > 30) {
    const contrib = Math.min(15, (weeklyLoadChange - 20) * 0.5);
    score += contrib;
    factors.push({ factor: "Weekly load jump", contribution: round(contrib, 0), detail: `Week-over-week load up ${weeklyLoadChange.toFixed(0)}%.` });
  }

  score = Math.round(Math.min(100, score));
  const level = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 25 ? "moderate" : "low";

  factors.sort((a, b) => b.contribution - a.contribution);
  return { score, level, factors };
}

// ---- Weekly Report Card ----

export function computeWeeklyReportCard(days: DailyMetrics[], sleepTarget = 7.5): WeeklyReportCard | null {
  if (days.length < 14) return null;
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const weekStart = last7[0]?.date ?? "";

  const highlights: string[] = [];
  const improvements: string[] = [];

  // Training grade: based on activity minutes, consistency, load management
  const exerciseMins = last7.reduce((s, d) => s + (d.exerciseMinutes ?? 0), 0);
  const activeDays = last7.filter((d) => (d.exerciseMinutes ?? 0) >= 20 || (d.workoutCount ?? 0) > 0).length;
  const trainingScore = Math.min(100,
    (Math.min(1, exerciseMins / 150) * 40) +
    (Math.min(1, activeDays / 4) * 30) +
    (activeDays >= 1 && activeDays <= 6 ? 30 : 15)
  );
  if (exerciseMins >= 200) highlights.push(`${Math.round(exerciseMins)} exercise minutes — well above the 150 target`);
  if (exerciseMins < 90) improvements.push(`Only ${Math.round(exerciseMins)} exercise minutes — aim for 150+`);

  // Recovery grade: HRV stability, RHR stability, no red flags
  const hrvs = last7.map((d) => d.hrv).filter((v): v is number => typeof v === "number");
  const rhrs = last7.map((d) => d.restingHeartRate).filter((v): v is number => typeof v === "number");
  const prevHrvs = prev7.map((d) => d.hrv).filter((v): v is number => typeof v === "number");
  let recoveryScore = 70; // baseline
  if (hrvs.length >= 3 && prevHrvs.length >= 3) {
    const hrvChange = mean(hrvs) - mean(prevHrvs);
    recoveryScore += Math.min(15, Math.max(-15, hrvChange * 1.5));
    if (hrvChange > 3) highlights.push(`HRV up ${round(hrvChange, 0)} ms vs last week`);
    if (hrvChange < -5) improvements.push(`HRV dropped ${round(Math.abs(hrvChange), 0)} ms — recovery is slipping`);
  }
  if (hrvs.length >= 4) {
    const cv = stddev(hrvs) / mean(hrvs);
    recoveryScore += cv < 0.1 ? 15 : cv < 0.2 ? 5 : -5;
  }
  recoveryScore = Math.max(0, Math.min(100, recoveryScore));

  // Sleep grade
  const sleepHrs = last7.map((d) => d.sleepHours).filter((v): v is number => typeof v === "number");
  let sleepScore = 60;
  if (sleepHrs.length >= 4) {
    const avgSleep = mean(sleepHrs);
    const targetPct = Math.min(1, avgSleep / sleepTarget);
    sleepScore = Math.round(targetPct * 50 + (1 - Math.min(1, stddev(sleepHrs) / 1.5)) * 30 + (sleepHrs.length / 7) * 20);
    if (avgSleep >= sleepTarget) highlights.push(`Averaged ${round(avgSleep, 1)}h sleep — hitting your ${sleepTarget}h target`);
    if (avgSleep < sleepTarget - 0.5) improvements.push(`${round(avgSleep, 1)}h avg sleep — ${round((sleepTarget - avgSleep) * 60, 0)} min short per night`);
  }
  sleepScore = Math.max(0, Math.min(100, sleepScore));

  // Activity grade
  const steps = last7.map((d) => d.steps).filter((v): v is number => typeof v === "number");
  const avgSteps = steps.length ? mean(steps) : 0;
  const standHrs = last7.map((d) => d.standHours).filter((v): v is number => typeof v === "number");
  const activityScore = Math.min(100,
    (Math.min(1, avgSteps / 8000) * 50) +
    (standHrs.length ? Math.min(1, mean(standHrs) / 10) * 25 : 12) +
    (steps.length >= 5 ? 25 : steps.length * 5)
  );
  if (avgSteps >= 10000) highlights.push(`${Math.round(avgSteps).toLocaleString()} steps/day average`);
  if (avgSteps < 5000 && steps.length >= 3) improvements.push(`${Math.round(avgSteps).toLocaleString()} steps/day — add post-meal walks`);

  // Consistency grade: did you show up regularly?
  const consistencyScore = Math.min(100,
    (activeDays / 7) * 50 +
    (sleepHrs.length / 7) * 25 +
    (steps.length / 7) * 25
  );

  const overallScore = Math.round(
    trainingScore * 0.25 + recoveryScore * 0.2 + sleepScore * 0.25 + activityScore * 0.15 + consistencyScore * 0.15
  );

  return {
    weekStart,
    overall: gradeFromScore(overallScore),
    domains: {
      training: gradeFromScore(trainingScore),
      recovery: gradeFromScore(recoveryScore),
      sleep: gradeFromScore(sleepScore),
      activity: gradeFromScore(activityScore),
      consistency: gradeFromScore(consistencyScore),
    },
    highlights: highlights.slice(0, 3),
    improvements: improvements.slice(0, 3),
  };
}

// ---- Performance Predictions ----

export function computePerformancePredictions(days: DailyMetrics[]): PerformancePrediction[] {
  const predictions: PerformancePrediction[] = [];
  if (days.length < 60) return predictions;

  const last90 = days.slice(-90);

  // VO2max projection
  const vo2Points: [number, number][] = [];
  last90.forEach((d, i) => { if (typeof d.vo2max === "number") vo2Points.push([i, d.vo2max]); });
  const vo2Slope = slopePerDay(vo2Points);
  const latestVo2 = vo2Points.length ? vo2Points[vo2Points.length - 1][1] : null;
  if (vo2Slope !== null && latestVo2 !== null) {
    const perMonth = vo2Slope * 30;
    const trajectory = perMonth > 0.1 ? "improving" : perMonth < -0.1 ? "declining" : "flat";
    const target = latestVo2 + 2;
    const daysToTarget = perMonth > 0.05 ? Math.round(2 / (vo2Slope)) : null;
    predictions.push({
      metric: "vo2max",
      label: "VO2max",
      current: round(latestVo2, 1),
      target: round(target, 1),
      predictedDate: daysToTarget && daysToTarget > 0 && daysToTarget < 365
        ? addDaysStr(days[days.length - 1].date, daysToTarget)
        : null,
      trajectory,
      ratePerMonth: round(perMonth, 2),
      detail: trajectory === "improving"
        ? `Gaining ${perMonth.toFixed(2)} ml/kg/min per month. ${daysToTarget && daysToTarget < 365 ? `At this rate, you'll hit ${target.toFixed(1)} by ${addDaysStr(days[days.length - 1].date, daysToTarget)}.` : "Keep the trajectory going."}`
        : trajectory === "declining"
          ? `Losing ${Math.abs(perMonth).toFixed(2)} /month. Add 2 steady cardio sessions per week to reverse this.`
          : "Flat. Add intervals to move the needle.",
    });
  }

  // RHR trajectory (lower is better)
  const rhrPoints: [number, number][] = [];
  last90.forEach((d, i) => { if (typeof d.restingHeartRate === "number") rhrPoints.push([i, d.restingHeartRate]); });
  const rhrSlope = slopePerDay(rhrPoints);
  const latestRhr = rhrPoints.length ? rhrPoints[rhrPoints.length - 1][1] : null;
  if (rhrSlope !== null && latestRhr !== null) {
    const perMonth = rhrSlope * 30;
    predictions.push({
      metric: "restingHeartRate",
      label: "Resting heart rate",
      current: round(latestRhr, 0),
      target: Math.max(45, latestRhr - 3),
      predictedDate: rhrSlope < -0.03 ? addDaysStr(days[days.length - 1].date, Math.round(3 / Math.abs(rhrSlope))) : null,
      trajectory: perMonth < -0.3 ? "improving" : perMonth > 0.3 ? "declining" : "flat",
      ratePerMonth: round(perMonth, 1),
      detail: perMonth < -0.3
        ? `Dropping ${Math.abs(perMonth).toFixed(1)} bpm/month. Your heart is getting more efficient.`
        : perMonth > 0.3
          ? `Rising ${perMonth.toFixed(1)} bpm/month. Check recovery, stress, or training load.`
          : "Stable. Consistent cardio and sleep keep this steady.",
    });
  }

  // Walking speed trajectory
  const wsPoints: [number, number][] = [];
  last90.forEach((d, i) => { if (typeof d.walkingSpeed === "number") wsPoints.push([i, d.walkingSpeed]); });
  const wsSlope = slopePerDay(wsPoints);
  const latestWs = wsPoints.length ? wsPoints[wsPoints.length - 1][1] : null;
  if (wsSlope !== null && latestWs !== null) {
    const perMonth = wsSlope * 30;
    predictions.push({
      metric: "walkingSpeed",
      label: "Walking speed",
      current: round(latestWs, 2),
      target: round(Math.max(latestWs, 1.3), 2),
      predictedDate: null,
      trajectory: perMonth > 0.005 ? "improving" : perMonth < -0.005 ? "declining" : "flat",
      ratePerMonth: round(perMonth, 3),
      detail: perMonth < -0.005
        ? `Declining ${Math.abs(perMonth * 100).toFixed(1)} cm/s per month. This is an aging marker — prioritize leg strength.`
        : latestWs >= 1.3
          ? "Strong pace. Maintain with regular walks and leg training."
          : "Building. Add brisk walks and squats.",
    });
  }

  return predictions;
}

// ---- Coach's Daily Directive ----

export function buildCoachDirective(
  days: DailyMetrics[],
  notes: KnowledgeNote[],
  readiness: number | null,
  recoveryScore: number | null,
  sleepAnalysis: { dynamicNeedHours: number | null; optimalBedtime: string | null; performanceScore: number | null } | null,
  acwr: number | null,
  form: number | null,
  monotony: number | null,
  daysSinceRest: number,
  sleepTarget: number
): CoachDirective {
  const strainBudget = computeStrainBudget(days, readiness, recoveryScore, acwr, form, daysSinceRest);
  const injuryRisk = computeInjuryRisk(acwr, monotony, daysSinceRest, recoveryScore, null);

  const today = days.length ? days[days.length - 1] : null;
  const todayNote = notes.length ? notes.find((n) => n.date === today?.date) : null;

  // Headline
  let headline: string;
  if (strainBudget.zone === "peak") {
    headline = "Peak day. You're primed — push hard if you want it.";
  } else if (strainBudget.zone === "push") {
    headline = "Green light for intensity. Your body is ready.";
  } else if (strainBudget.zone === "moderate") {
    headline = "Steady day. Train moderate, don't go hero.";
  } else if (strainBudget.zone === "easy") {
    headline = "Easy day. Light movement only — walk, stretch, breathe.";
  } else {
    headline = "Recovery day. No training. Rest is the work today.";
  }

  // Body
  const bodyParts: string[] = [];
  bodyParts.push(`Strain cap: ${strainBudget.maxStrain}/21.`);
  if (strainBudget.timeCapMin) bodyParts.push(`Keep sessions under ${strainBudget.timeCapMin} minutes.`);
  if (recoveryScore !== null) bodyParts.push(`Recovery: ${recoveryScore}/100.`);
  if (form !== null) bodyParts.push(`Form: ${form > 0 ? "+" : ""}${form.toFixed(1)}.`);
  if (injuryRisk.level !== "low") {
    bodyParts.push(`Injury risk: ${injuryRisk.level} (${injuryRisk.score}/100).`);
    if (injuryRisk.factors.length) bodyParts.push(injuryRisk.factors[0].detail);
  }

  // Sleep Rx
  let sleepRx: string;
  if (sleepAnalysis?.dynamicNeedHours) {
    sleepRx = `Target ${sleepAnalysis.dynamicNeedHours}h tonight.`;
    if (sleepAnalysis.optimalBedtime) sleepRx += ` Bed by ${sleepAnalysis.optimalBedtime}.`;
    if (sleepAnalysis.performanceScore !== null && sleepAnalysis.performanceScore < 60) {
      sleepRx += " Sleep has been poor — make tonight non-negotiable.";
    }
  } else {
    sleepRx = `Target ${sleepTarget}h. Keep your bedtime within 30 minutes of your usual.`;
  }

  // Nutrition cue (based on today's training zone)
  let nutritionCue: string | null = null;
  if (strainBudget.zone === "push" || strainBudget.zone === "peak") {
    nutritionCue = "Fuel up: extra carbs 2h before training, protein within 30 min after. Stay hydrated — 0.5L extra today.";
  } else if (strainBudget.zone === "recovery") {
    nutritionCue = "Recovery nutrition: high-protein meals, anti-inflammatory foods, extra water. Skip alcohol tonight.";
  }

  // Mental note
  let mentalNote: string | null = null;
  if (todayNote?.stress && todayNote.stress >= 7) {
    mentalNote = "High stress logged. Training can help — but keep it easy. A hard session on a stressed body backfires.";
  } else if (daysSinceRest >= 5) {
    mentalNote = "You've been pushing. It's normal to want to keep going — but rest IS the stimulus. The adaptation happens while you recover.";
  }

  return {
    headline,
    body: bodyParts.join(" "),
    strainBudget,
    injuryRisk,
    sleepRx,
    nutritionCue,
    mentalNote,
  };
}
