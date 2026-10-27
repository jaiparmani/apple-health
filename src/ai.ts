import type { BiologicalAgeResult, DailyMetrics, Env } from "./types";
import type { Trends } from "./trends";
import { AGGREGATIONS, QUERYABLE_METRICS, clampDateRange, runQuery, type Aggregation, type QueryResult, type QuerySpec } from "./query";
import { CHART_TYPES, sanitizeChartSpec, buildChartData, type ChartData } from "./chartspec";

export interface AiInsights {
  headline: string;
  insights: string[];
  concerns: string[];
  recommendations: string[];
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
  "You are a sharp performance coach writing a briefing for one person, from a JSON snapshot of their own Apple " +
  "Health data plus metrics computed in code. Cite only numbers that are in the snapshot; never invent or re-derive one. " +
  "STYLE — crisp above all: every line is one short sentence, at most 15 words; the headline at most 18 words. Lead " +
  "with the number or the verdict, then the meaning. No filler, no hedging, no praise words (\"great\", \"amazing\", " +
  "\"keep it up\"), no exclamation points, no semicolon-chained clauses. Plain English for a non-expert: never use raw " +
  "field names (\"readiness\", not \"readinessScoreToday\") or jargon — say \"freshness\" not \"TSB\", \"fitness base\" " +
  "not \"CTL\", \"resting heart rate\" not \"RHR\" (HRV and VO2max are fine). Round like a person: whole numbers for " +
  "steps, bpm, minutes, kcal, ms; one decimal for hours, kg, VO2max. Dates as \"Mon 26 Oct\". " +
  "Read biologicalAgeInWords literally — a positive gap means OLDER than actual age. Never advise doing less activity " +
  "unless a recovery metric in the snapshot has status \"bad\".";

const OUTPUT_SHAPE =
  'Reply with ONLY a JSON object of this exact shape: {"headline": string, "insights": string[], ' +
  '"concerns": string[], "recommendations": string[]}. ' +
  '"headline": the single most decision-relevant fact right now. ' +
  '"insights": 2-4 specific observations (a trend, streak, or comparison to normal). ' +
  '"concerns": 0-2 items genuinely worth attention; empty if nothing stands out — never manufacture concern. ' +
  '"recommendations": 1-3 concrete actions with a number in each (minutes, days, times, targets), grounded in the data. ' +
  "Never diagnose or claim medical authority.";

export type ReviewDomain = "overview" | "today" | "weekly" | "longterm" | "training" | "recovery" | "activity" | "sleep" | "body" | "discoveries";

export const REVIEW_DOMAINS: ReviewDomain[] = ["overview", "today", "weekly", "longterm", "training", "recovery", "activity", "sleep", "body", "discoveries"];

const DOMAIN_FOCUS: Record<ReviewDomain, string> = {
  overview: "overall health trends across recovery, activity, and sleep — whatever in the snapshot matters most right now",
  today:
    "TODAY only: should this person train hard, train moderately, or recover today, and why — combine readiness, form (TSB), " +
    "HRV/resting-HR vs baseline, last night's sleep and recent load. The headline must be the call for today. Recommendations " +
    "are a concrete plan for today (session type, duration/intensity, bedtime) — draw on the fitness.actionItems list",
  weekly:
    "THE LAST 7 DAYS as a short weekly check-in from a coach: what went well, what slipped, and the 2-3 things to do " +
    "differently next week. Use the highlights, the day-by-day week strip and this-week-vs-last-week numbers. The headline " +
    "sums up the week in one sentence",
  longterm:
    "LONG-TERM direction over the last 12 months: which monthly trends (steps, exercise, resting HR, HRV, VO2max, weight) " +
    "are genuinely improving or declining, seasonal or weekday patterns, and what that trajectory means if it continues. " +
    "Recommendations are habits for the next 3 months",
  training:
    "training: load (acute:chronic ratio, fitness/fatigue/form), consistency (active days, weekly minutes vs 150), workout " +
    "frequency/types/volume per week, monotony, and whether load is outpacing recovery or there's room to push. Recommendations " +
    "must be a concrete training prescription for the next 7 days (sessions, durations, intensities), tied to the person's goals if given",
  recovery:
    "recovery and heart: HRV vs 60-day baseline, resting HR drift, readiness, walking HR, respiratory rate, and how recovery " +
    "responds to the days of high strain/load in the series. Flag patterns (e.g. HRV dips after hard days). Recommendations are " +
    "recovery actions (easy days, sleep timing, deload) with specific triggers",
  activity:
    "daily activity and mobility: steps, exercise minutes vs WHO 150/week, Activity Ring completion vs goals, stand hours, " +
    "walking speed/asymmetry/double support (gait as an aging marker). Recommendations are specific habit changes with numbers " +
    "(e.g. steps to add, when)",
  sleep:
    "sleep duration, consistency night to night, stages where available, sleep debt vs the target, and sleep's relationship to " +
    "next-day recovery (HRV/RHR). If there's little or no sleep data, say so plainly in the headline and recommend how to start tracking it",
  body:
    "biological age and body composition: which biological-age marker is oldest (the biggest lever), the bio-age trend, VO2max " +
    "category for age, weight/BMI/body-fat trend. Recommendations target the single oldest marker first",
  discoveries:
    "the correlations and anomalies found in this person's data: explain what each meaningful correlation suggests in plain " +
    "terms (always as correlation, never causation), which anomalies matter, and propose 1-3 self-experiments to test them",
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

  const data = await callGateway(env, messages, "headline", 900);
  return parseInsights(data);
}

export function parseInsights(data: Record<string, unknown>): AiInsights {
  const headline = typeof data.headline === "string" ? data.headline.trim() : "";
  const insights = toStringArray(data.insights);
  const concerns = toStringArray(data.concerns);
  const recommendations = toStringArray(data.recommendations);

  if (!headline || insights.length === 0) {
    throw new Error("Model did not return a usable headline/insights.");
  }

  return { headline, insights: insights.slice(0, 4), concerns: concerns.slice(0, 2), recommendations: recommendations.slice(0, 3) };
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
