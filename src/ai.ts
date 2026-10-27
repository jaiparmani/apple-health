import type { BiologicalAgeResult, DailyMetrics, Env } from "./types";
import type { Trends } from "./trends";
import { AGGREGATIONS, QUERYABLE_METRICS, clampDateRange, runQuery, type Aggregation, type QueryResult, type QuerySpec } from "./query";

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

/**
 * Shared call into llm-gateway's /v1/json (schema-validating JSON mode).
 * Retries a couple of times: the gateway round-robins across free-tier
 * models, and an individual model occasionally fails to return clean JSON
 * even after the gateway's own internal retries — a retry from here
 * usually lands on a different, better-behaved model.
 */
async function callGateway(env: Env, messages: GatewayMessage[], expectKey: string, maxTokens: number): Promise<Record<string, unknown>> {
  let res: Response | undefined;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await env.LLM_GATEWAY.fetch(`${env.LLM_GATEWAY_URL}/v1/json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LLM_GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, expect_key: expectKey, max_tokens: maxTokens }),
    });
    if (res.ok) break;
    lastError = `${res.status} ${await res.text()}`;
  }
  if (!res || !res.ok) {
    throw new Error(`llm-gateway request failed: ${lastError}`);
  }
  const body = await res.json<{ data: Record<string, unknown> }>();
  return body.data;
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

  const data = await callGateway(env, messages, "headline", 700);
  return parseInsights(data);
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

// A plain-English description of a QueryResult reads far more reliably to
// a free-tier model than a raw JSON dump — empirically, the nested-JSON
// version made some models respond conversationally instead of with JSON,
// failing the gateway's own JSON-salvage step.
function describeResult(result: QueryResult): string {
  const { spec, sampleCount, value, bestDate, trendDirection, trendChange, note } = result;
  if (note) return `${spec.metric} from ${spec.startDate} to ${spec.endDate}: ${note}`;
  const range = `${spec.metric} from ${spec.startDate} to ${spec.endDate}, ${sampleCount} days of samples`;
  if (spec.aggregation === "trend") {
    return `${range}, latest value ${value}, change of ${trendChange} (trending ${trendDirection}).`;
  }
  if ((spec.aggregation === "min" || spec.aggregation === "max" || spec.aggregation === "latest") && bestDate) {
    return `${range}, ${spec.aggregation} value ${value} on ${bestDate}.`;
  }
  return `${range}, ${spec.aggregation} value ${value}.`;
}

export interface AskResult {
  question: string;
  spec: QuerySpec;
  result: QueryResult;
  answer: string;
}

/**
 * "Ask my health data": the model's only job is (1) picking a metric,
 * date range and aggregation from a fixed whitelist (src/query.ts), and
 * (2) turning the number WE computed into a sentence. It never computes
 * anything itself and never sees raw daily records — only the single
 * aggregated result for the query it chose. This is deliberately a two-call
 * round trip rather than one combined prompt, so step 2 cannot smuggle in a
 * number that didn't come out of runQuery().
 */
export async function answerHealthQuestion(env: Env, question: string, days: DailyMetrics[]): Promise<AskResult> {
  if (days.length === 0) throw new Error("No data yet.");

  const datasetStart = days[0].date;
  const datasetEnd = days[days.length - 1].date;
  const today = new Date().toISOString().slice(0, 10);

  const parsePrompt =
    "You translate a question about someone's personal Apple Health data into a structured query over a " +
    `fixed menu. Valid metric names (pick the single closest match, never invent one): ${QUERYABLE_METRICS.join(", ")}. ` +
    `Valid aggregations: ${AGGREGATIONS.join(", ")}. The stored dataset covers ${datasetStart} to ${datasetEnd}. ` +
    `Today's date is ${today}. Reply with ONLY a JSON object: {"metric": string, "startDate": "YYYY-MM-DD", ` +
    '"endDate": "YYYY-MM-DD", "aggregation": string}. If the question does not specify a date range, pick a ' +
    `sensible one (e.g. the trailing 30 days ending ${datasetEnd} for a "how am I doing" question, or the full ` +
    'dataset range for a "how has X changed" question). Use aggregation "trend" for change-over-time questions, ' +
    '"max"/"min" for best/worst questions, "average" otherwise.';

  const parsed = await callGateway(
    env,
    [
      { role: "system", content: parsePrompt },
      { role: "user", content: question },
    ],
    "metric",
    200
  );

  const metric = typeof parsed.metric === "string" ? parsed.metric : "";
  if (!QUERYABLE_METRICS.includes(metric)) {
    throw new Error(`Could not map that question to a known metric. Known metrics: ${QUERYABLE_METRICS.join(", ")}.`);
  }
  const aggregation: Aggregation = AGGREGATIONS.includes(parsed.aggregation as Aggregation)
    ? (parsed.aggregation as Aggregation)
    : "average";
  const { start, end } = clampDateRange(
    days,
    typeof parsed.startDate === "string" ? parsed.startDate : datasetStart,
    typeof parsed.endDate === "string" ? parsed.endDate : datasetEnd
  );

  const spec: QuerySpec = { metric, startDate: start, endDate: end, aggregation };
  const result = runQuery(days, spec);

  const explainPrompt =
    "Reply with ONLY a JSON object with one key, answer, whose value is a short string: one or two plain " +
    "sentences explaining a health statistic, using only the numbers given to you — never invent, re-derive, " +
    "or round differently. Never give medical advice, a diagnosis, or claim this is clinically validated. No " +
    "other text, no markdown, no code fences.";

  const explained = await callGateway(
    env,
    [
      { role: "system", content: explainPrompt },
      { role: "user", content: `Question: ${question}\nData: ${describeResult(result)}` },
    ],
    "answer",
    300
  );

  const rawAnswer = typeof explained.answer === "string" ? explained.answer.trim() : "";
  const answer = rawAnswer.length >= 10 && /[a-zA-Z]{3,}/.test(rawAnswer) ? rawAnswer : "Could not generate an explanation for that result.";

  return { question, spec, result, answer };
}
