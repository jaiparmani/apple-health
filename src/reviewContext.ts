import type { BiologicalAgeResult, DailyMetrics, UserKnowledge, UserProfile } from "./types";
import type { GoalProgress } from "./goals";
import type { ReviewDomain } from "./ai";
import { chronologicalAge } from "./analytics";
import { computeFitnessReport, dailyLoad, type FitnessReport } from "./fitness";
import { computeCorrelations } from "./correlations";
import { detectAnomalies } from "./anomalies";
import { computeBaselines } from "./baselines";
import { computePeriodReport } from "./report";
import { computeTrends } from "./trends";
import { computeHighlights, computeHealthScore, computeMonthly, computeWeek, computeWeekdayPattern } from "./overview";

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
  const userContext = {
    goals: knowledge?.goals || undefined,
    preferences: knowledge?.preferences || undefined,
    sleepTargetHours: sleepTarget,
    recentCheckIns: (knowledge?.notes ?? []).slice(-7),
    goalProgress: (input.goals ?? []).map((g) => ({ goal: g.goal.title, current: g.current, target: g.goal.target, deadline: g.goal.deadline, status: g.status, summary: g.summary })),
  };

  switch (domain) {
    case "overview":
      return { user: userContext, fitnessMetrics: pickMetrics(fitness), actionItems: fitness.actionItems };
    case "today":
      return {
        user: userContext,
        fitnessMetrics: pickMetrics(fitness, ["form", "acwr", "hrvVsBaseline", "rhrDrift", "daysSinceRest", "sleepDebt", "weeklyMinutes"]),
        actionItems: fitness.actionItems,
        last3Days: rows(days.slice(-3), ["hrv", "restingHeartRate", "sleepHours", "steps", "exerciseMinutes", "workoutType", "workoutMinutes"], load),
      };
    case "weekly": {
      const trends = computeTrends(days);
      return {
        user: userContext,
        healthScore: computeHealthScore(days, trends, fitness, profile, sleepTarget),
        highlights: computeHighlights(days, trends, fitness),
        thisWeekByDay: computeWeek(days, age),
        thisWeekVsLastWeek: computePeriodReport(days, "week")?.metricChanges.filter((m) => m.direction === "up" || m.direction === "down"),
        actionItems: fitness.actionItems,
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
      };
    case "recovery":
      return {
        user: userContext,
        fitnessMetrics: pickMetrics(fitness, ["hrvVsBaseline", "rhrDrift", "form", "daysSinceRest", "monotony", "sleepDebt"]),
        baselines30d: computeBaselines(days, 30).filter((b) => ["hrv", "restingHeartRate", "walkingHeartRateAvg", "respiratoryRate"].includes(b.metric as string)),
        last30Days: rows(days.slice(-30), ["hrv", "restingHeartRate", "walkingHeartRateAvg", "respiratoryRate", "sleepHours"], load),
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
        fitnessMetrics: pickMetrics(fitness, ["sleepDebt", "hrvVsBaseline", "rhrDrift"]),
        last30Nights: rows(days.slice(-30), ["sleepHours", "sleepEfficiency", "sleepCoreHours", "sleepDeepHours", "sleepRemHours", "sleepAwakeHours", "hrv", "restingHeartRate"]),
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
      };
    }
    case "discoveries": {
      const correlations = computeCorrelations(days).filter((c) => c.strength !== "negligible" && c.strength !== "insufficient_data");
      return {
        user: userContext,
        correlations,
        anomalies: detectAnomalies(days).slice(0, 10),
        weekVsPriorWeek: computePeriodReport(days, "week")?.metricChanges.filter((m) => m.direction === "up" || m.direction === "down"),
      };
    }
  }
}
