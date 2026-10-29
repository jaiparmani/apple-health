import type { BiologicalAgeResult, DailyMetrics, UserKnowledge, UserProfile } from "./types";
import type { GoalProgress } from "./goals";
import type { ReviewDomain } from "./ai";
import { chronologicalAge } from "./analytics";
import { computeFitnessReport, dailyLoad, computeLoadSeries, type FitnessReport } from "./fitness";
import { computeCorrelations, computeJournalCorrelations } from "./correlations";
import { detectAnomalies } from "./anomalies";
import { computeBaselines } from "./baselines";
import { computePeriodReport } from "./report";
import { computeTrends } from "./trends";
import { computeHighlights, computeHealthScore, computeMonthly, computeWeek, computeWeekdayPattern } from "./overview";
import { discoverPatterns, computeStrainBudget, computeInjuryRisk, computeWeeklyReportCard, computePerformancePredictions, buildCoachDirective } from "./patterns";

/**
 * Builds the domain-specific half of an AI review's snapshot — the numbers
 * the model is allowed to cite for that domain. Kept compact (only the
 * fields relevant to the domain, recent windows only) because free-tier
 * models get noticeably worse at following the output contract as the
 * prompt grows.
 */

type Row = Record<string, string | number>;

function rows(days: DailyMetrics[], fields: (keyof DailyMetrics)[], extra?: (d: DailyMetrics) => Row): Row[] {
  return days
    .map((d) => {
      const r: Row = { date: d.date };
      for (const f of fields) {
        const v = d[f];
        if (typeof v === "number") r[f] = Math.round(v * 100) / 100;
        else if (typeof v === "string" && f !== "date") r[f] = v;
      }
      return extra ? { ...r, ...extra(d) } : r;
    })
    .filter((r) => Object.keys(r).length > 1);
}

function pickMetrics(report: FitnessReport, keys?: string[]) {
  return report.metrics
    .filter((m) => !keys || keys.includes(m.key))
    .map((m) => ({ metric: m.label, value: m.display, status: m.status, whatToDo: m.action }));
}

export interface ReviewInputs {
  days: DailyMetrics[];
  profile: UserProfile | null;
  knowledge: UserKnowledge | null;
  bioHistory: BiologicalAgeResult[];
  goals?: GoalProgress[];
}

export function buildReviewContext(domain: ReviewDomain, input: ReviewInputs): Record<string, unknown> {
  const { days, profile, knowledge } = input;
  if (days.length === 0) return {};
  const asOf = days[days.length - 1].date;
  const age = profile ? chronologicalAge(profile.birthDate, asOf) : null;
  const sleepTarget = knowledge?.sleepTargetHours ?? 7.5;
  const fitness = computeFitnessReport(days, profile, sleepTarget);
  const load = (d: DailyMetrics): Row => ({ load: dailyLoad(d, age) });
  const notes = knowledge?.notes ?? [];
  const userContext = {
    goals: knowledge?.goals || undefined,
    preferences: knowledge?.preferences || undefined,
    sleepTargetHours: sleepTarget,
    recentCheckIns: notes.slice(-7),
    goalProgress: (input.goals ?? []).map((g) => ({ goal: g.goal.title, current: g.current, target: g.goal.target, deadline: g.goal.deadline, status: g.status, summary: g.summary })),
  };

  // Coaching context shared across domains
  const series = computeLoadSeries(days, age);
  const last7Loads = series.slice(-7).map((p) => p.load);
  const last28Loads = series.slice(-28).map((p) => p.load);
  const meanArr = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  const sdArr = (v: number[]) => {
    if (v.length < 2) return 0;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  };
  const acuteLd = meanArr(last7Loads);
  const chronicLd = meanArr(last28Loads);
  const acwr = acuteLd !== null && chronicLd !== null && chronicLd > 0.5 ? acuteLd / chronicLd : null;
  const mono = last7Loads.length >= 7 && sdArr(last7Loads) > 0 ? meanArr(last7Loads)! / sdArr(last7Loads) : null;
  const lastPt = series[series.length - 1];
  const form = lastPt?.form ?? null;
  let daysSinceRest = 0;
  for (let i = series.length - 1; i >= 0 && series[i].load >= 8; i--) daysSinceRest++;
  const trends = computeTrends(days, sleepTarget);

  const strainBudget = computeStrainBudget(days, trends.readinessScore, trends.recovery?.score ?? null, acwr, form, daysSinceRest);
  const injuryRisk = computeInjuryRisk(acwr, mono, daysSinceRest, trends.recovery?.score ?? null, null);
  const personalPatterns = discoverPatterns(days, notes).slice(0, 5);
  const reportCard = computeWeeklyReportCard(days, sleepTarget);
  const predictions = computePerformancePredictions(days).slice(0, 3);

  switch (domain) {
    case "overview":
      return { user: userContext, fitnessMetrics: pickMetrics(fitness), actionItems: fitness.actionItems, strainBudget, injuryRisk, personalPatterns };
    case "today":
      return {
        user: userContext,
        fitnessMetrics: pickMetrics(fitness, ["form", "acwr", "hrvVsBaseline", "rhrDrift", "daysSinceRest", "sleepDebt", "weeklyMinutes", "sleepPerformance", "sleepNeed", "illnessLikelihood"]),
        actionItems: fitness.actionItems,
        strainBudget,
        injuryRisk,
        last3Days: rows(days.slice(-3), ["hrv", "restingHeartRate", "sleepHours", "steps", "exerciseMinutes", "workoutType", "workoutMinutes"], load),
      };
    case "weekly": {
      return {
        user: userContext,
        healthScore: computeHealthScore(days, trends, fitness, profile, sleepTarget),
        highlights: computeHighlights(days, trends, fitness),
        thisWeekByDay: computeWeek(days, age),
        thisWeekVsLastWeek: computePeriodReport(days, "week")?.metricChanges.filter((m) => m.direction === "up" || m.direction === "down"),
        actionItems: fitness.actionItems,
        weeklyReportCard: reportCard,
      };
    }
    case "longterm": {
      const hist = input.bioHistory;
      const bioByMonth = new Map<string, number>();
      for (const h of hist) bioByMonth.set(h.date.slice(0, 7), h.deltaYears);
      return {
        user: userContext,
        monthlyAverages: computeMonthly(days, 12),
        bioAgeDeltaByMonth: [...bioByMonth.entries()].slice(-12).map(([month, deltaYears]) => ({ month, deltaYears })),
        weekdayPattern12Weeks: computeWeekdayPattern(days),
        fitnessMetrics: pickMetrics(fitness, ["fitness", "vo2Category", "vo2Trend", "consistency", "weightTrend"]),
        performancePredictions: predictions,
      };
    }
    case "training":
      return {
        user: userContext,
        fitnessMetrics: pickMetrics(fitness),
        actionItems: fitness.actionItems,
        weeklyTotals: fitness.weekly,
        fitnessFatigueForm: fitness.loadSeries.slice(-28).filter((_, i, a) => i % 7 === 6 || i === a.length - 1),
        last28Days: rows(days.slice(-28), ["exerciseMinutes", "activeEnergy", "workoutType", "workoutMinutes", "workoutDistanceKm", "heartRateMax"], load),
        strainBudget,
        injuryRisk,
      };
    case "recovery":
      return {
        user: userContext,
        fitnessMetrics: pickMetrics(fitness, ["hrvVsBaseline", "rhrDrift", "form", "daysSinceRest", "monotony", "sleepDebt", "sleepPerformance", "illnessLikelihood"]),
        baselines30d: computeBaselines(days, 30).filter((b) => ["hrv", "restingHeartRate", "walkingHeartRateAvg", "respiratoryRate"].includes(b.metric as string)),
        last30Days: rows(days.slice(-30), ["hrv", "restingHeartRate", "walkingHeartRateAvg", "respiratoryRate", "sleepHours"], load),
        personalPatterns: personalPatterns.filter((p) => p.category === "recovery"),
      };
    case "activity":
      return {
        user: userContext,
        fitnessMetrics: pickMetrics(fitness, ["weeklyMinutes", "consistency", "steps7", "standHours", "gaitSpeed", "gaitAsymmetry"]),
        weeklyTotals: fitness.weekly,
        last30Days: rows(days.slice(-30), [
          "steps",
          "exerciseMinutes",
          "exerciseMinutesGoal",
          "activeEnergy",
          "activeEnergyGoal",
          "standHours",
          "standHoursGoal",
          "flightsClimbed",
          "walkingSpeed",
          "walkingAsymmetryPct",
        ]),
      };
    case "sleep": {
      const sleepDays = days.slice(-30).filter((d) => typeof d.sleepHours === "number");
      return {
        user: userContext,
        nightsWithSleepDataLast30: sleepDays.length,
        fitnessMetrics: pickMetrics(fitness, ["sleepDebt", "sleepPerformance", "sleepConsistency", "sleepNeed", "sleepLatency", "hrvVsBaseline", "rhrDrift"]),
        last30Nights: rows(days.slice(-30), ["sleepHours", "sleepEfficiency", "sleepCoreHours", "sleepDeepHours", "sleepRemHours", "sleepAwakeHours", "hrv", "restingHeartRate"]),
        personalPatterns: personalPatterns.filter((p) => p.category === "sleep"),
        sleepAnalysis: trends.sleepAnalysis,
      };
    }
    case "body": {
      const hist = input.bioHistory;
      return {
        user: userContext,
        profile: profile ? { age, sex: profile.sex, heightCm: profile.heightCm } : null,
        fitnessMetrics: pickMetrics(fitness, ["vo2Category", "vo2Trend", "bmi", "weightTrend", "gaitSpeed"]),
        bioAgeHistoryWeekly: hist.slice(-180).filter((_, i, a) => (a.length - 1 - i) % 7 === 0).map((h) => ({ date: h.date, biologicalAge: h.biologicalAge, deltaYears: h.deltaYears })),
        bodyReadings: rows(days.slice(-90), ["weightKg", "bodyFatPct", "vo2max"]),
        performancePredictions: predictions,
      };
    }
    case "discoveries": {
      const correlations = computeCorrelations(days).filter((c) => c.strength !== "negligible" && c.strength !== "insufficient_data");
      const journalCorrelations = computeJournalCorrelations(days, notes).filter((c) => c.strength !== "negligible");
      return {
        user: userContext,
        correlations,
        journalCorrelations: journalCorrelations.slice(0, 5),
        anomalies: detectAnomalies(days).slice(0, 10),
        personalPatterns,
        weekVsPriorWeek: computePeriodReport(days, "week")?.metricChanges.filter((m) => m.direction === "up" || m.direction === "down"),
      };
    }
  }
}
