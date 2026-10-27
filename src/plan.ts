import type { DailyMetrics } from "./types";
import type { FitnessReport } from "./fitness";
import type { GoalProgress } from "./goals";

/**
 * The adaptive weekly plan. A plan is written once per week (Monday-Sunday)
 * — by the AI when it can, by buildTemplatePlan() when it can't — and
 * stored. Everything "adaptive" then happens here in code, every time the
 * plan is read:
 *   - today's hard session is swapped for recovery when your body says so
 *   - past days are marked done (from your actual data, or a manual tick),
 *     missed, or rest
 */

export const SESSION_TYPES = ["rest", "walk", "easy", "zone2", "intervals", "strength", "long", "mobility"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];
const HARD: SessionType[] = ["intervals", "long", "strength"];

export interface PlannedDay {
  date: string;
  type: SessionType;
  title: string;
  minutes: number;
  detail: string;
}

export interface StoredPlan {
  weekStart: string; // Monday
  generatedAt: string;
  source: "ai" | "template";
  rationale: string;
  days: PlannedDay[];
  done: string[]; // dates ticked by hand
}

export type DayStatus = "done" | "missed" | "rest" | "today" | "upcoming";

export interface PlanDayView extends PlannedDay {
  weekday: string;
  status: DayStatus;
  actualMinutes: number | null;
  autoDetected: boolean; // done because the data shows it, not a tick
  adjusted: { type: SessionType; title: string; minutes: number; detail: string; reason: string } | null;
}

export interface PlanView {
  weekStart: string;
  generatedAt: string;
  source: "ai" | "template";
  rationale: string;
  days: PlanDayView[];
  completed: number;
  planned: number; // non-rest sessions up to and including today
  today: PlanDayView | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  return addDays(date, -((dow + 6) % 7));
}

export function isSessionType(v: unknown): v is SessionType {
  return typeof v === "string" && (SESSION_TYPES as readonly string[]).includes(v);
}

/**
 * Code-only fallback plan: 3-5 sessions depending on how consistent you've
 * been (never more than one step up from current habit), intervals only
 * when VO2max needs work, strength twice a week, and a walk on your
 * least-active weekday.
 */
export function buildTemplatePlan(weekStart: string, fitness: FitnessReport, goals: GoalProgress[], lowestWeekday: string | null): StoredPlan {
  const active28 = (fitness.metrics.find((m) => m.key === "consistency")?.value as number | null) ?? 0;
  const vo2Status = fitness.metrics.find((m) => m.key === "vo2Category")?.status;
  const needsCardio = vo2Status === "watch" || vo2Status === "bad" || goals.some((g) => g.goal.metric === "vo2max" && g.status !== "achieved");
  const sessions = active28 < 10 ? 3 : active28 < 16 ? 4 : 5;

  const S = {
    strength: { type: "strength" as const, title: "Strength", minutes: 40, detail: "Squats, push-ups, rows, lunges. 3 sets of 8-12." },
    intervals: { type: "intervals" as const, title: "Intervals", minutes: 30, detail: "Warm up 8 min, then 4×4 min hard, 3 min easy." },
    zone2: { type: "zone2" as const, title: "Easy cardio", minutes: 40, detail: "Steady pace where you can still talk." },
    long: { type: "long" as const, title: "Long easy session", minutes: 60, detail: "Walk, ride or jog at an easy pace." },
    walk: { type: "walk" as const, title: "Brisk walk", minutes: 30, detail: "Brisk pace, phone in pocket." },
    rest: { type: "rest" as const, title: "Rest", minutes: 0, detail: "Light stretching only." },
    mobility: { type: "mobility" as const, title: "Mobility", minutes: 15, detail: "Hips, hamstrings, upper back." },
  };
  // Mon..Sun skeletons by session count.
  const layouts: Record<number, (keyof typeof S)[]> = {
    3: ["strength", "walk", needsCardio ? "intervals" : "zone2", "rest", "mobility", "walk", "long"],
    4: ["strength", "walk", needsCardio ? "intervals" : "zone2", "rest", "strength", "walk", "long"],
    5: ["strength", "zone2", needsCardio ? "intervals" : "zone2", "rest", "strength", "zone2", "long"],
  };
  const layout = [...layouts[sessions]];
  // Your least-active weekday never gets a rest day: it gets a walk.
  if (lowestWeekday) {
    const idx = WEEKDAYS.indexOf(lowestWeekday);
    if (idx >= 0 && layout[idx] === "rest") {
      const swapIdx = layout.indexOf("walk");
      layout[idx] = "walk";
      if (swapIdx >= 0 && swapIdx !== idx) layout[swapIdx] = "rest";
    }
  }
  return {
    weekStart,
    generatedAt: new Date().toISOString(),
    source: "template",
    rationale: `${sessions} sessions: one step up from your ${active28} active days in the last 4 weeks.${needsCardio ? " Intervals weekly to lift VO2max." : ""}`,
    days: layout.map((k, i) => ({ date: addDays(weekStart, i), ...S[k] })),
    done: [],
  };
}

/** Validates an AI-written plan; returns null if it doesn't fit the contract. */
export function parseAiPlan(data: Record<string, unknown>, weekStart: string): StoredPlan | null {
  const rawDays = Array.isArray(data.days) ? data.days : null;
  if (!rawDays || rawDays.length !== 7) return null;
  const days: PlannedDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = rawDays[i] as Record<string, unknown>;
    if (!d || !isSessionType(d.type)) return null;
    const minutes = typeof d.minutes === "number" ? Math.max(0, Math.min(180, Math.round(d.minutes))) : 0;
    days.push({
      date: addDays(weekStart, i),
      type: d.type,
      title: typeof d.title === "string" && d.title.trim() ? d.title.trim().slice(0, 40) : d.type,
      minutes: d.type === "rest" ? 0 : minutes,
      detail: typeof d.detail === "string" ? d.detail.trim().slice(0, 160) : "",
    });
  }
  return {
    weekStart,
    generatedAt: new Date().toISOString(),
    source: "ai",
    rationale: typeof data.rationale === "string" ? data.rationale.trim().slice(0, 300) : "",
    days,
    done: [],
  };
}

export interface RecoverySignal {
  readiness: number | null;
  highRecoveryFlag: string | null; // the reason text of a high-priority recovery action item
}

/** Builds what the UI and the morning brief show: statuses + today's adjustment. */
export function viewPlan(plan: StoredPlan, days: DailyMetrics[], today: string, recovery: RecoverySignal): PlanView {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const views: PlanDayView[] = plan.days.map((p, i) => {
    const rec = byDate.get(p.date);
    const actual = rec ? Math.max(rec.exerciseMinutes ?? 0, rec.workoutMinutes ?? 0) : null;
    const ticked = plan.done.includes(p.date);
    const autoDone = p.type !== "rest" && actual !== null && p.minutes > 0 && actual >= p.minutes * 0.7;

    let status: DayStatus;
    if (ticked || autoDone) status = "done";
    else if (p.type === "rest") status = "rest";
    else if (p.date === today) status = "today";
    else if (p.date < today) status = "missed";
    else status = "upcoming";

    let adjusted: PlanDayView["adjusted"] = null;
    if (p.date === today && status === "today" && HARD.includes(p.type)) {
      const lowReadiness = recovery.readiness !== null && recovery.readiness < 45;
      if (lowReadiness || recovery.highRecoveryFlag) {
        adjusted = {
          type: "walk",
          title: "Recovery walk",
          minutes: 25,
          detail: "Easy pace. Do today's planned session later this week.",
          reason: lowReadiness ? `Readiness ${recovery.readiness}: swapped for recovery.` : `Swapped for recovery: ${recovery.highRecoveryFlag}`,
        };
      }
    }
    return { ...p, weekday: WEEKDAYS[i], status, actualMinutes: actual, autoDetected: autoDone && !ticked, adjusted };
  });

  const upToToday = views.filter((v) => v.date <= today && v.type !== "rest");
  return {
    weekStart: plan.weekStart,
    generatedAt: plan.generatedAt,
    source: plan.source,
    rationale: plan.rationale,
    days: views,
    completed: upToToday.filter((v) => v.status === "done").length,
    planned: upToToday.length,
    today: views.find((v) => v.date === today) ?? null,
  };
}
