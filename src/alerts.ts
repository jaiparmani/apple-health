import type { DailyMetrics, AlertPayload, IllnessSignal, RecoverySnapshot } from "./types";
import type { Trends } from "./trends";
import { detectAnomalies } from "./anomalies";
import type { GoalProgress } from "./goals";

/**
 * Generate alerts from today's data. Called after each sync and as part of
 * the morning brief. Returns an array of alert payloads, most critical first.
 */
export function generateAlerts(
  days: DailyMetrics[],
  trends: Trends,
  goals: GoalProgress[],
  lastSyncDate: string | null,
  today: string
): AlertPayload[] {
  const alerts: AlertPayload[] = [];
  if (days.length === 0) return alerts;

  const latest = days[days.length - 1];

  // Illness signal alert
  if (trends.illnessSignal && trends.illnessSignal.likelihood !== "low") {
    const ill = trends.illnessSignal;
    alerts.push({
      type: "illness",
      severity: ill.likelihood === "high" ? "critical" : "warning",
      title: ill.likelihood === "high" ? "Possible illness detected" : "Elevated illness signals",
      body: ill.detail,
      date: ill.date,
    });
  }

  // Low recovery alert
  if (trends.recovery && trends.recovery.score < 30) {
    alerts.push({
      type: "recovery",
      severity: "warning",
      title: `Recovery very low (${trends.recovery.score}/100)`,
      body: "Your body signals suggest heavy fatigue. Take it easy today — skip intensity, prioritize sleep.",
      date: trends.recovery.date,
    });
  }

  // Anomalous readings (z-score based)
  const anomalies = detectAnomalies(days);
  for (const a of anomalies.slice(0, 3)) {
    const absZ = Math.abs(a.zScore);
    if (absZ >= 2) {
      alerts.push({
        type: "anomaly",
        severity: absZ >= 3 ? "critical" : "warning",
        title: `${a.metric} is unusual`,
        body: `${a.metric} ${a.value} on ${a.date} — ${a.direction} baseline of ${a.baselineMean.toFixed(1)} by ${absZ.toFixed(1)}σ.`,
        date: a.date,
      });
    }
  }

  // High strain alert
  if (typeof latest.strain === "number" && latest.strain >= 18) {
    alerts.push({
      type: "strain",
      severity: "warning",
      title: `Very high strain today (${latest.strain.toFixed(1)}/21)`,
      body: "You've pushed hard. Prioritize recovery tonight — extra sleep, hydration, protein.",
      date: latest.date,
    });
  }

  // Stale data alert
  if (lastSyncDate && today > lastSyncDate) {
    const daysSinceSync = Math.round((Date.parse(today) - Date.parse(lastSyncDate)) / 86400000);
    if (daysSinceSync >= 3) {
      alerts.push({
        type: "staleData",
        severity: "info",
        title: `No data for ${daysSinceSync} days`,
        body: `Last sync was ${lastSyncDate}. Open the Health app and sync your Watch for fresh insights.`,
        date: today,
      });
    }
  }

  // Goal milestones
  for (const g of goals) {
    if (g.status === "achieved") {
      alerts.push({
        type: "goalMilestone",
        severity: "info",
        title: `Goal reached: ${g.goal.title}`,
        body: `You hit your target of ${g.goal.target}${g.unit ? " " + g.unit : ""}. Time to set a new one.`,
        date: today,
      });
    }
  }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return alerts;
}
