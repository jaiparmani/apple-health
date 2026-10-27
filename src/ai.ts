import type { BiologicalAgeResult, DailyMetrics, Env } from "./types";
import type { Trends } from "./trends";

export interface AiInsights {
  headline: string;
  insights: string[];
  concerns: string[];
  recommendations: string[];
}

interface GatewayMessage {
  role: "system" | "user";
  content: string;
}

const SYSTEM_PROMPT =
  "You are a sharp, encouraging personal health analyst looking at one person's own Apple Health data. " +
  "You are given a JSON snapshot: their biological-age estimate, trailing 7/30-day averages vs the prior " +
  "week, personal bests, and a recovery/readiness score. Every number is something their own device " +
  "actually recorded — never invent a number that is not in the snapshot. " +
  'Reply with ONLY a JSON object of this exact shape: {"headline": string, "insights": string[], ' +
  '"concerns": string[], "recommendations": string[]}. ' +
  '"headline" is one sharp sentence: the single most useful thing to notice right now. ' +
  '"insights" is 2-5 short, specific, encouraging observations about real trends in the data (e.g. a ' +
  "metric improving or a streak). " +
  '"concerns" is 0-3 short items flagging anything genuinely worth attention (a metric worsening, an ' +
  "outlier, low recovery) — leave this empty if nothing stands out, never manufacture concern. " +
  '"recommendations" is 1-3 concrete, specific, achievable next actions grounded in the data (not generic ' +
  'advice like "eat healthy"). Never give medical diagnoses or claim this is medical advice.';

function buildSnapshot(days: DailyMetrics[], trends: Trends, bioAge: BiologicalAgeResult | null) {
  const latest = days[days.length - 1];
  return {
    today: latest ?? null,
    biologicalAge: bioAge,
    trailing7DayAverages: trends.last7,
    priorWeekAverages: trends.prev7,
    trailing30DayAverages: trends.last30,
    personalBests: trends.bests,
    stepGoalStreakDays: trends.stepGoalStreakDays,
    readinessScoreToday: trends.readinessScore,
  };
}

export async function generateInsights(
  env: Env,
  days: DailyMetrics[],
  trends: Trends,
  bioAge: BiologicalAgeResult | null
): Promise<AiInsights> {
  const snapshot = buildSnapshot(days, trends, bioAge);
  const messages: GatewayMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Snapshot:\n${JSON.stringify(snapshot, null, 2)}` },
  ];

  const res = await fetch(`${env.LLM_GATEWAY_URL}/v1/json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LLM_GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, expect_key: "headline", max_tokens: 700 }),
  });

  if (!res.ok) {
    throw new Error(`llm-gateway request failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json<{ data: Record<string, unknown> }>();
  return parseInsights(body.data);
}

function parseInsights(data: Record<string, unknown>): AiInsights {
  const headline = typeof data.headline === "string" ? data.headline.trim() : "";
  const insights = toStringArray(data.insights);
  const concerns = toStringArray(data.concerns);
  const recommendations = toStringArray(data.recommendations);

  if (!headline || insights.length === 0) {
    throw new Error("Model did not return a usable headline/insights.");
  }

  return { headline, insights: insights.slice(0, 5), concerns: concerns.slice(0, 3), recommendations: recommendations.slice(0, 3) };
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
