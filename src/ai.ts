import type { BiologicalAgeResult, DailyMetrics, Env } from "./types";
import type { Trends } from "./trends";
import { AGGREGATIONS, QUERYABLE_METRICS, clampDateRange, runQuery, type Aggregation, type QueryResult, type QuerySpec } from "./query";
import { CHART_TYPES, sanitizeChartSpec, buildChartData, type ChartData } from "./chartspec";

export interface AiInsights {
  headline: string;
  body: string;
  concern: string | null;
  // Legacy fields for cached reviews in old format
  insights?: string[];
  concerns?: string[];
  recommendations?: string[];
}

export interface GatewayMessage {
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
export async function callGateway(env: Env, messages: GatewayMessage[], expectKey: string, maxTokens: number): Promise<Record<string, unknown>> {
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

// Every domain review (overview, training, sleep, ...) shares this voice
// and output shape — only the "focus" clause changes what the model is
// asked to pay attention to within the same full snapshot.
const BASE_VOICE =
  "You are a performance coach writing a terse note from a JSON snapshot of one person's Apple Health data. " +
  "Cite only numbers in the snapshot. Never invent one. " +
  "VOICE — telegraphic. Every sentence earns its place with a specific number. " +
  "Lead with the number, then the action. 8 words per sentence max. Headline 10 words max. " +
  "Wrong: 'You should try to get more sleep.' Right: 'HRV down 12ms. Bed by 22:15, 8.2h minimum.' " +
  "Wrong: 'Take it easy today.' Right: 'Strain cap 10. Walk only, 30min max.' " +
  "Use imperatives. No filler, hedging, exclamation points. No \"Your\" to start sentences. " +
  "CONNECT — state cause then effect: 'Three hard days straight — resting HR up 4bpm. Back off or lose 2 weeks.' " +
  "Plain English: 'resting heart rate' not 'RHR', 'freshness' not 'TSB' (HRV and VO2max are fine). " +
  "Whole numbers for steps, bpm, minutes, kcal, ms. One decimal for hours, kg, VO2max. Dates as 'Mon 26 Oct'. " +
  "biologicalAgeInWords: positive gap = OLDER than actual age. " +
  "Be bold. Exact strain caps, exact bedtimes, exact session lengths. Low recovery = name what to skip and for how long.";

const OUTPUT_SHAPE =
  'Reply with ONLY a JSON object: {"headline": string, "body": string, "concern": string | null}. ' +
  '"headline": the single most actionable fact, 10 words max. Start with a number or action verb. ' +
  '"body": 2-3 sentences. Each sentence: one number, one action. No filler transitions. ' +
  '"concern": one sentence if something genuinely needs attention, otherwise null. No manufactured worry. ' +
  "No medical diagnoses.";

export type ReviewDomain = "overview" | "today" | "weekly" | "longterm" | "training" | "recovery" | "activity" | "sleep" | "body" | "discoveries";

export const REVIEW_DOMAINS: ReviewDomain[] = ["overview", "today", "weekly", "longterm", "training", "recovery", "activity", "sleep", "body", "discoveries"];

const DOMAIN_FOCUS: Record<ReviewDomain, string> = {
  overview: "the ONE thing that matters most right now. If recovery is tanked, say that — not a balanced overview. " +
    "If they're in a supercompensation window, tell them to use it. Be bold. Reference the strainBudget and injuryRisk if present",
  today:
    "TODAY's game plan. Start the headline with the strain zone (Recovery / Easy / Moderate / Push / Peak). " +
    "Give an exact strain cap, exact time cap, and what type of movement. Reference strainBudget if present. " +
    "If recovery < 40, prescribe rest with zero ambiguity. If form > +5, this is a peak day — say so. " +
    "End with tonight's sleep target and bedtime if sleepAnalysis provides them",
  weekly:
    "GRADE THE WEEK like a coach reviewing game tape. What did they nail? What did they blow? Be specific: " +
    "'3 consecutive hard days Mon-Wed with no recovery session — that's why Thursday's HRV cratered.' " +
    "Reference weeklyReportCard grades if present. Ask ONE pointed question about their routine. The headline grades the week",
  longterm:
    "TRAJECTORY: where is this body heading in 6 months if nothing changes? Which metric is the biggest lever right now? " +
    "Reference performancePredictions if present — quote the rate of change and projected date. " +
    "If VO2max is declining, that's the lead. If biological age gap is growing, that's the alarm. Be unflinching",
  training:
    "LOAD MANAGEMENT like a strength coach reviewing programming. Acute:chronic ratio, monotony, consecutive hard days, " +
    "injury risk score and its top factor. If ACWR > 1.3, this is the headline. If monotony > 2, they need hard/easy contrast. " +
    "Reference injuryRisk if present. Give a specific load prescription for next week: 'Pull back 20% — 3 sessions max, " +
    "none above strain 14'. Or 'Room to push: add a 4th session at moderate intensity'",
  recovery:
    "RECOVERY deep dive: 5-pillar breakdown (HRV z-score, RHR z-score, resp rate, SpO2, temp). Which pillar is lagging? " +
    "Connect it to a cause: 'HRV -1.2σ after 2 back-to-back heavy sessions — normal response, should rebound in 48h.' " +
    "Give an exact recovery timeline: when can they go hard again? Reference patterns if present (e.g. their personal " +
    "HRV recovery time). Sleep prescriptions with exact hours and bedtime",
  activity:
    "DAILY MOVEMENT audit. Steps vs 8000 target, exercise minutes vs 150/week, stand hours. " +
    "Walking speed is a longevity biomarker — if it's declining, flag it hard. Walking asymmetry > 3% means something's off. " +
    "Give exact step targets with timing: 'Add a 15-min walk after lunch and dinner — that's +3,000 steps'",
  sleep:
    "SLEEP COACHING: performance score, consistency score, efficiency, deep+REM ratio, sleep debt. " +
    "Connect sleep to recovery: 'Sleep efficiency 82% last night → HRV down 8ms this morning.' " +
    "Give an exact bedtime, exact target hours (from dynamic need), and one concrete habit change. " +
    "If sleep is the bottleneck, say: 'Nothing else matters until sleep is fixed'",
  body:
    "BODY COMPOSITION and biological age: which marker is aging fastest (the biggest lever)? " +
    "What's the delta between bio and chrono age, and which direction is it moving? " +
    "VO2max category for age — if it's below 'good', this is priority #1. " +
    "Give the single highest-ROI action for biological age improvement",
  discoveries:
    "PERSONAL DISCOVERIES from correlations and patterns. Reference personalPatterns if present — " +
    "these are THIS person's coefficients, not population averages. 'Each drink costs you 6ms of HRV' is gold. " +
    "Propose one N=1 experiment: what to test, how long, what to measure. Be specific",
};

function buildSnapshot(days: DailyMetrics[], trends: Trends, bioAge: BiologicalAgeResult | null) {
  const latest = days[days.length - 1];
  return {
    today: latest ?? null,
    biologicalAge: bioAge,
    biologicalAgeInWords: bioAge
      ? `Estimated biological age ${bioAge.biologicalAge} vs actual age ${bioAge.chronologicalAge}: ${Math.abs(bioAge.deltaYears)} years ${bioAge.deltaYears > 0 ? "OLDER" : "younger"} than actual age.`
      : null,
    trailing7DayAverages: trends.last7,
    priorWeekAverages: trends.prev7,
    trailing30DayAverages: trends.last30,
    personalBests: trends.bests,
    stepGoalStreakDays: trends.stepGoalStreakDays,
    readinessScoreToday: trends.readinessScore,
  };
}

/**
 * One AI review for one domain. Every domain shares the voice and output
 * shape; `context` carries the domain-specific, code-computed numbers
 * (fitness report, recent daily rows, correlations...) layered on top of
 * the common snapshot. The model never computes — it narrates these.
 */
export async function generateReview(
  env: Env,
  domain: ReviewDomain,
  days: DailyMetrics[],
  trends: Trends,
  bioAge: BiologicalAgeResult | null,
  context: Record<string, unknown> = {}
): Promise<AiInsights> {
  const snapshot = { ...buildSnapshot(days, trends, bioAge), ...context };
  const systemPrompt = `${BASE_VOICE} Focus specifically on ${DOMAIN_FOCUS[domain]} — mention other metrics only as supporting context. ${OUTPUT_SHAPE}`;
  const messages: GatewayMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Snapshot:\n${JSON.stringify(snapshot)}` },
  ];

  const data = await callGateway(env, messages, "headline", 500);
  return parseInsights(data);
}

export function parseInsights(data: Record<string, unknown>): AiInsights {
  const headline = typeof data.headline === "string" ? data.headline.trim() : "";

  // New format: body + concern
  if (typeof data.body === "string" && data.body.trim()) {
    const concern = typeof data.concern === "string" && data.concern.trim() ? data.concern.trim() : null;
    return { headline, body: data.body.trim(), concern };
  }

  // Legacy format: insights[] + concerns[] + recommendations[] → convert to body
  const insights = toStringArray(data.insights);
  const concerns = toStringArray(data.concerns);
  const recommendations = toStringArray(data.recommendations);

  if (!headline && insights.length === 0) {
    throw new Error("Model did not return a usable headline or body.");
  }

  const bodyParts = [...recommendations, ...insights];
  return {
    headline,
    body: bodyParts.join(" "),
    concern: concerns.length > 0 ? concerns[0] : null,
    insights, concerns, recommendations,
  };
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

export interface ChartFromQuestionResult {
  question: string;
  chart: ChartData;
}

/**
 * "Chart this for me": the model picks a chart type, 1-3 metrics, and a
 * date range from the same whitelist "ask my health data" uses — nothing
 * else. sanitizeChartSpec() then validates that choice against real data
 * before anything is rendered; the model never sees or supplies the
 * actual data points, and its output is never executed as code.
 */
export async function generateChartFromQuestion(env: Env, question: string, days: DailyMetrics[]): Promise<ChartFromQuestionResult> {
  if (days.length === 0) throw new Error("No data yet.");

  const datasetStart = days[0].date;
  const datasetEnd = days[days.length - 1].date;
  const today = new Date().toISOString().slice(0, 10);

  const parsePrompt =
    "You translate a request for a chart of someone's personal Apple Health data into a structured chart " +
    `spec. Valid metric names (pick 1-3, the closest matches, never invent one): ${QUERYABLE_METRICS.join(", ")}. ` +
    `Valid chart types: ${CHART_TYPES.join(", ")}. The stored dataset covers ${datasetStart} to ${datasetEnd}. ` +
    `Today's date is ${today}. Reply with ONLY a JSON object: {"title": string, "type": string, "metrics": ` +
    'string[], "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}. If no date range is specified, use a ' +
    `sensible one (e.g. the trailing 90 days ending ${datasetEnd}, or the full dataset range for a "how has X ` +
    'changed over time" request). Use "bar" for daily totals like steps or energy, "line" for trends like HRV ' +
    "or weight.";

  const parsed = await callGateway(
    env,
    [
      { role: "system", content: parsePrompt },
      { role: "user", content: question },
    ],
    "metrics",
    200
  );

  const spec = sanitizeChartSpec(days, parsed as never);
  if (!spec) {
    throw new Error(`Could not map that request to a known metric. Known metrics: ${QUERYABLE_METRICS.join(", ")}.`);
  }

  const chart = buildChartData(days, spec);
  return { question, chart };
}

/**
 * Writes next week's training plan as structured JSON. The model chooses
 * session types/durations from a fixed menu; parseAiPlan() (src/plan.ts)
 * validates the shape and the caller falls back to a code-built template
 * if it doesn't fit. Adaptation to daily recovery happens in code later,
 * not here.
 */
export async function generatePlanJson(env: Env, context: Record<string, unknown>): Promise<Record<string, unknown>> {
  const system =
    "You are a coach writing one person's training plan for the 7 days Monday to Sunday, from a JSON snapshot of " +
    "their own data (fitness metrics with status and suggested actions, goals with progress, recent weekly volume, " +
    "their weakest weekday, and their stated goals/preferences). Rules: build from their CURRENT habit — at most one " +
    "more session than their recent active days per week suggest; include at least one rest day; never two hard " +
    "sessions (intervals, long, strength) on consecutive days; target the goals that are behind first; respect stated " +
    "preferences. Session type must be one of: rest, walk, easy, zone2, intervals, strength, long, mobility. " +
    'Reply with ONLY JSON: {"rationale": string (max 25 words, plain English), "days": [7 objects in Monday-Sunday ' +
    'order, each {"type": string, "title": string (max 4 words), "minutes": number (0 for rest), "detail": string ' +
    '(max 14 words: exactly what to do)}]}. No jargon, no abbreviations.';
  return callGateway(
    env,
    [
      { role: "system", content: system },
      { role: "user", content: `Snapshot:\n${JSON.stringify(context)}` },
    ],
    "days",
    1100
  );
}
