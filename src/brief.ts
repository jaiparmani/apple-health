import type { AiInsights } from "./ai";
import type { ActionItem } from "./fitness";
import type { GoalProgress } from "./goals";
import type { PlanDayView } from "./plan";
import type { RecoverySnapshot, IllnessSignal, SleepAnalysis } from "./types";
import type { CoachDirective, InjuryRisk, StrainBudget, WeeklyReportCard, PersonalPattern } from "./patterns";

/**
 * The health section of the 7am Telegram brief. Rendered here, as
 * MarkdownV2, because the senders (brain-chat, or telegram-router as its
 * fallback) join each app's text as-is without re-escaping — the same
 * contract life-rpg's POST /telegram/brief follows.
 */

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

export interface BriefInput {
  today: string;
  lastDataDate: string | null;
  readiness: number | null;
  recovery: RecoverySnapshot | null;
  illnessSignal: IllnessSignal | null;
  sleepAnalysis: SleepAnalysis | null;
  review: AiInsights | null;
  session: PlanDayView | null;
  actionItems: ActionItem[];
  goals: GoalProgress[];
  dashboardUrl: string;
  coachDirective: CoachDirective | null;
  reportCard: WeeklyReportCard | null;
}

const GOAL_WORD: Record<GoalProgress["status"], string> = {
  achieved: "✅ reached",
  ahead: "ahead",
  on_track: "on track",
  behind: "behind",
  no_data: "no data",
};

function niceDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function healthBriefMessage(b: BriefInput): string | null {
  if (!b.lastDataDate) return null;
  const e = escapeMarkdown;
  const lines: string[] = [];

  const word = b.readiness === null ? null : b.readiness >= 70 ? "recovered" : b.readiness >= 45 ? "partly recovered" : "still recovering";
  lines.push(`*Health${b.readiness !== null ? ` · Readiness ${b.readiness}/100` : ""}*`);
  if (word) lines.push(e(`You're ${word}.`));
  if (b.review) lines.push(`_${e(b.review.headline)}_`);

  // Coach directive — the premium coaching line
  if (b.coachDirective) {
    const cd = b.coachDirective;
    lines.push(`*${e(cd.headline)}*`);
    lines.push(e(`Strain cap: ${cd.strainBudget.maxStrain}/21 · Zone: ${cd.strainBudget.zone}${cd.strainBudget.timeCapMin ? ` · ${cd.strainBudget.timeCapMin}min max` : ""}`));
    if (cd.injuryRisk.level !== "low") {
      lines.push(`⚠️ _${e(`Injury risk: ${cd.injuryRisk.level} (${cd.injuryRisk.score}/100)${cd.injuryRisk.factors.length ? " — " + cd.injuryRisk.factors[0].detail : ""}`)}_`);
    }
    lines.push(e(`💤 ${cd.sleepRx}`));
    if (cd.nutritionCue) lines.push(e(`🍽 ${cd.nutritionCue}`));
    if (cd.mentalNote) lines.push(`_${e(cd.mentalNote)}_`);
  } else {
    // Fallback to legacy format
    if (b.illnessSignal && b.illnessSignal.likelihood !== "low") {
      const sev = b.illnessSignal.likelihood === "high" ? "⚠️" : "🟡";
      lines.push(`${sev} _${e(`Illness likelihood: ${b.illnessSignal.likelihood} (${b.illnessSignal.score}/100). ${b.illnessSignal.detail}`)}_`);
    }

    if (b.recovery) {
      const parts: string[] = [];
      if (b.recovery.hrvZ !== null) parts.push(`HRV ${b.recovery.hrvZ > 0 ? "+" : ""}${b.recovery.hrvZ.toFixed(1)}σ`);
      if (b.recovery.rhrZ !== null) parts.push(`RHR ${b.recovery.rhrZ > 0 ? "+" : ""}${b.recovery.rhrZ.toFixed(1)}σ`);
      if (b.recovery.sleepScore !== null) parts.push(`Sleep ${b.recovery.sleepScore}/100`);
      if (parts.length) lines.push(e(`Recovery ${b.recovery.score}/100 — ${parts.join(", ")}`));
    }

    if (b.sleepAnalysis && b.sleepAnalysis.performanceScore !== null) {
      const sa = b.sleepAnalysis;
      const parts: string[] = [`perf ${sa.performanceScore}/100`];
      if (sa.debtHours !== null && sa.debtHours > 0.5) parts.push(`debt ${sa.debtHours}h`);
      if (sa.dynamicNeedHours !== null) parts.push(`need ${sa.dynamicNeedHours}h tonight`);
      lines.push(e(`Sleep: ${parts.join(" · ")}`));
    }
  }

  // Weekly report card (Monday brief)
  if (b.reportCard) {
    const rc = b.reportCard;
    lines.push("");
    lines.push(`*Weekly Report Card: ${rc.overall}*`);
    const grades = rc.domains;
    lines.push(e(`Training ${grades.training} · Recovery ${grades.recovery} · Sleep ${grades.sleep} · Activity ${grades.activity}`));
    if (rc.highlights.length) lines.push(e(`✓ ${rc.highlights[0]}`));
    if (rc.improvements.length) lines.push(e(`→ ${rc.improvements[0]}`));
  }

  if (b.session) {
    const s = b.session.adjusted ?? b.session;
    lines.push("");
    lines.push("*Today's session*");
    lines.push(s.type === "rest" ? "Rest day\\." : e(`${s.title} · ${s.minutes} min — ${s.detail}`));
    if (b.session.adjusted) lines.push(`_${e(b.session.adjusted.reason)}_`);
    if (b.session.status === "done") lines.push(e("Already done today."));
  }

  // The session block already says whether to train today; don't repeat (or
  // contradict) it with the generic "green light" item.
  const actions = b.actionItems.filter((a) => a.priority !== "low" && !/^Green light/.test(a.text)).slice(0, 2);
  if (actions.length) {
    lines.push("");
    lines.push("*Do next*");
    for (const a of actions) lines.push(`• ${e(a.text)}`);
  }

  if (b.goals.length) {
    lines.push("");
    lines.push("*Goals*");
    for (const g of b.goals.slice(0, 3)) {
      const cur = g.current === null ? "—" : g.current >= 1000 ? Math.round(g.current).toLocaleString("en-US") : String(g.current);
      lines.push(`• ${e(`${g.goal.title}: ${cur}${g.unit ? " " + g.unit : ""}, ${GOAL_WORD[g.status]}`)}`);
    }
  }

  if (b.lastDataDate < b.today) {
    lines.push("");
    lines.push(`_${e(`Data last synced ${niceDate(b.lastDataDate)}. Sync your Watch for a sharper brief.`)}_`);
  }
  if (b.dashboardUrl) lines.push(`[Open dashboard](${b.dashboardUrl.replace(/[)\\]/g, (c) => `\\${c}`)})`);
  return lines.join("\n");
}

// ---- Critical Alert Push (Feature 2) ----

export interface CriticalAlertInput {
  illnessSignal: IllnessSignal | null;
  recovery: RecoverySnapshot | null;
  readiness: number | null;
  dashboardUrl: string;
}

export function criticalAlertMessage(a: CriticalAlertInput): string | null {
  const e = escapeMarkdown;
  const lines: string[] = [];

  if (a.illnessSignal && a.illnessSignal.likelihood === "high") {
    lines.push("⚠️ *HEALTH ALERT: Possible Illness Detected*");
    lines.push(e(`Illness likelihood: HIGH (${a.illnessSignal.score}/100)`));
    lines.push(e(a.illnessSignal.detail));
    lines.push(e("Action: Rest today. Monitor symptoms. Skip training."));
  }

  if (a.recovery && a.recovery.score < 25) {
    if (lines.length) lines.push("");
    lines.push("🔴 *RECOVERY CRITICALLY LOW*");
    lines.push(e(`Recovery score: ${a.recovery.score}/100`));
    const parts: string[] = [];
    if (a.recovery.hrvZ !== null) parts.push(`HRV ${a.recovery.hrvZ > 0 ? "+" : ""}${a.recovery.hrvZ.toFixed(1)}σ`);
    if (a.recovery.rhrZ !== null) parts.push(`RHR ${a.recovery.rhrZ > 0 ? "+" : ""}${a.recovery.rhrZ.toFixed(1)}σ`);
    if (parts.length) lines.push(e(parts.join(", ")));
    lines.push(e("Action: No training today. Prioritize sleep and hydration."));
  }

  if (lines.length === 0) return null;

  if (a.dashboardUrl) lines.push(`[Open dashboard](${a.dashboardUrl.replace(/[)\\]/g, (c) => `\\${c}`)})`);
  return lines.join("\n");
}

// ---- Evening Telegram Brief (Feature 3) ----

export interface EveningBriefInput {
  today: string;
  lastDataDate: string | null;
  sleepProtocol: { targetHours: number; bedtime: string; wakeTime: string; caffeineDeadline: string; screenCutoff: string; lastMealBy: string; windDownSteps: string[]; reasoning: string } | null;
  session: PlanDayView | null;
  smartCheckIn: { question: string; field: string }[];
  readiness: number | null;
  todayStrain: number | null;
  dashboardUrl: string;
}

export function eveningBriefMessage(b: EveningBriefInput): string | null {
  if (!b.lastDataDate) return null;
  const e = escapeMarkdown;
  const lines: string[] = [];

  lines.push("*Evening Check\\-in*");

  if (b.todayStrain !== null) {
    lines.push(e(`Today's strain: ${b.todayStrain.toFixed(1)}/21`));
  }

  if (b.sleepProtocol) {
    const sp = b.sleepProtocol;
    lines.push("");
    lines.push("*Tonight's Sleep Rx*");
    lines.push(e(`🛏 Bedtime: ${sp.bedtime} → Wake: ${sp.wakeTime} (${sp.targetHours}h)`));
    lines.push(e(`📱 Screens off by ${sp.screenCutoff}`));
    lines.push(e(`🍽 Last meal by ${sp.lastMealBy}`));
    if (sp.windDownSteps.length > 0) {
      lines.push(e(`💡 ${sp.windDownSteps[0]}`));
    }
  }

  if (b.session) {
    const s = b.session;
    lines.push("");
    lines.push("*Tomorrow's Session*");
    if (s.type === "rest") {
      lines.push(e("Rest day planned. Recovery is the goal."));
    } else {
      lines.push(e(`${s.title} · ${s.minutes} min — ${s.detail}`));
    }
  }

  if (b.smartCheckIn.length > 0) {
    lines.push("");
    lines.push("*Quick Journal*");
    for (const q of b.smartCheckIn.slice(0, 2)) {
      lines.push(`• _${e(q.question)}_`);
    }
  }

  if (b.dashboardUrl) lines.push(`[Log in dashboard](${b.dashboardUrl.replace(/[)\\]/g, (c) => `\\${c}`)})`);
  return lines.join("\n");
}

// ---- Noon Check-in (Feature 4) ----

export interface NoonCheckInInput {
  today: string;
  currentStrain: number | null;
  strainBudget: { maxStrain: number; zone: string } | null;
  steps: number | null;
  stepGoal: number;
  exerciseMinutes: number | null;
  hydrationReminder: boolean;
  readiness: number | null;
}

export function noonCheckInMessage(b: NoonCheckInInput): string | null {
  const e = escapeMarkdown;
  const lines: string[] = [];

  lines.push("*Midday Check\\-in*");

  if (b.readiness !== null) {
    const emoji = b.readiness >= 70 ? "🟢" : b.readiness >= 45 ? "🟡" : "🔴";
    lines.push(`${emoji} ${e(`Readiness: ${b.readiness}/100`)}`);
  }

  if (b.currentStrain !== null) {
    lines.push(e(`Strain so far: ${b.currentStrain.toFixed(1)}/21`));
    if (b.strainBudget) {
      const remaining = Math.max(0, b.strainBudget.maxStrain - b.currentStrain);
      lines.push(e(`Budget remaining: ${remaining.toFixed(1)} (${b.strainBudget.zone} zone)`));
    }
  }

  if (b.steps !== null) {
    const pct = Math.round((b.steps / b.stepGoal) * 100);
    lines.push(e(`Steps: ${b.steps.toLocaleString("en-US")} / ${b.stepGoal.toLocaleString("en-US")} (${pct}%)`));
  }

  if (b.exerciseMinutes !== null && b.exerciseMinutes > 0) {
    lines.push(e(`Active minutes: ${Math.round(b.exerciseMinutes)}`));
  }

  if (b.hydrationReminder) {
    lines.push("");
    lines.push(e("💧 Hydration check — have you had enough water today?"));
  }

  return lines.length > 1 ? lines.join("\n") : null;
}
