import type { AiInsights } from "./ai";
import type { ActionItem } from "./fitness";
import type { GoalProgress } from "./goals";
import type { PlanDayView } from "./plan";

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
  review: AiInsights | null;
  session: PlanDayView | null;
  actionItems: ActionItem[];
  goals: GoalProgress[];
  dashboardUrl: string;
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
