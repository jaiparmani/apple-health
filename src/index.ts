import type { BiologicalAgeResult, DailyMetrics, Env, KnowledgeNote, UserKnowledge, UserProfile, AlertPayload } from "./types";
import { bulkCommit, getJson, putJson, type BulkFile } from "./github";
import { mergeDaily, normalizePayload } from "./normalize";
import { chronologicalAge, computeStrain, estimateBiologicalAge } from "./analytics";
import { computeTrends } from "./trends";
import { computeBaselines } from "./baselines";
import { computeCoverage } from "./coverage";
import { computeCorrelations, computeJournalCorrelations } from "./correlations";
import { detectAnomalies } from "./anomalies";
import { computePeriodReport, type ReportPeriod } from "./report";
import { toCsv } from "./export";
import { computeExperimentResult, type Experiment } from "./experiments";
import { generateReview, generatePlanJson, answerHealthQuestion, generateChartFromQuestion, REVIEW_DOMAINS, type AiInsights, type ReviewDomain } from "./ai";
import { computeGoalProgress, currentValue, isGoalMetric, GOAL_METRICS, type Goal, type GoalProgress } from "./goals";
import { buildTemplatePlan, mondayOf, parseAiPlan, viewPlan, type PlanView, type StoredPlan } from "./plan";
import { computeWeekdayPattern } from "./overview";
import { healthBriefMessage } from "./brief";
import { buildReviewContext } from "./reviewContext";
import { computeFitnessReport } from "./fitness";
import { computeOverview } from "./overview";
import { sanitizeManualWorkout, computePRs, computeMuscleBalance, computeWorkoutFrequency, type ManualWorkout } from "./manualWorkouts";
import { renderDashboard } from "./dashboard";
import { generateAlerts } from "./alerts";

const SERIES_PATH = "data/series.json";
const PROFILE_PATH = "data/profile.json";
const HISTORY_PATH = "data/analytics/history.json";
const LATEST_PATH = "data/analytics/latest.json";
const KNOWLEDGE_PATH = "data/knowledge.json";
const MAX_KNOWLEDGE_NOTES = 2000;
const EXPERIMENTS_PATH = "data/experiments.json";
const GOALS_PATH = "data/goals.json";
const PLAN_PATH = "data/plan.json";
const WORKOUTS_PATH = "data/manual-workouts.json";
const MAX_GOALS = 10;
const MAX_SERIES_DAYS = 4000; // ~11 years, enough headroom for a full Apple Health export backfill
const MAX_HISTORY_ENTRIES = 4000;
const ANALYTICS_WINDOW_DAYS = 7;
function insightsCacheKey(domain: ReviewDomain): string {
  // v4: crisper voice. v3: plainer voice + weekly/longterm domains. v2: snapshots carry domain-specific computed context (fitness
  // report, recent rows...) — don't serve reviews generated without it.
  return `insights:v6:${domain}`;
}
// Kept in KV well past "fresh" so a flaky llm-gateway call can fall back to
// the last good review (flagged stale) instead of an empty error card.
const INSIGHTS_KEEP_SECONDS = 7 * 24 * 60 * 60;

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
}

function isAuthed(req: Request, env: Env): boolean {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return !!env.INGEST_TOKEN && token === env.INGEST_TOKEN;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function dayPath(date: string): string {
  return `data/daily/${date}.json`;
}

async function recomputeAnalytics(env: Env, series: DailyMetrics[]): Promise<BiologicalAgeResult | null> {
  const { data: profile } = await getJson<UserProfile>(env, PROFILE_PATH);
  if (!profile || series.length === 0) return null;

  const latestDate = series[series.length - 1].date;
  const windowDays = series.slice(-ANALYTICS_WINDOW_DAYS);
  const result = estimateBiologicalAge(windowDays, profile, latestDate);

  const { data: historyData, sha: historySha } = await getJson<{ entries: BiologicalAgeResult[] }>(env, HISTORY_PATH);
  const entries = historyData?.entries ?? [];
  const existingIdx = entries.findIndex((e) => e.date === result.date);
  if (existingIdx >= 0) entries[existingIdx] = result;
  else entries.push(result);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = entries.slice(-MAX_HISTORY_ENTRIES);

  // HISTORY_PATH grows without bound (up to MAX_HISTORY_ENTRIES) and can
  // cross the Contents API's ~1MB inline-content ceiling the same way
  // SERIES_PATH did — write it via the Git Data API instead, which has no
  // such limit.
  await bulkCommit(env, [{ path: HISTORY_PATH, content: JSON.stringify({ entries: trimmed }, null, 2) }], `analytics: update ${result.date}`);
  const { sha: latestSha } = await getJson<BiologicalAgeResult>(env, LATEST_PATH);
  await putJson(env, LATEST_PATH, result, `analytics: latest ${result.date}`, latestSha);

  return result;
}

async function handleIngest(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const source = new URL(req.url).searchParams.get("source") || "shortcut";
  const incoming = normalizePayload(body, source);

  const { data: existingDay, sha: daySha } = await getJson<DailyMetrics>(env, dayPath(incoming.date));
  const mergedDay = mergeDaily(existingDay, incoming);
  await putJson(env, dayPath(incoming.date), mergedDay, `health: ${incoming.date} from ${source}`, daySha);

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  const idx = days.findIndex((d) => d.date === mergedDay.date);
  if (idx >= 0) days[idx] = mergedDay;
  else days.push(mergedDay);
  days.sort((a, b) => a.date.localeCompare(b.date));
  const trimmedDays = days.slice(-MAX_SERIES_DAYS);
  // series.json is the biggest file in the store and grows every ingest —
  // it has already crossed the Contents API's ~1MB inline-content ceiling
  // once (silently truncated reads until fixed in github.ts). Write it via
  // the Git Data API, which has no such limit, not the Contents API PUT.
  await bulkCommit(env, [{ path: SERIES_PATH, content: JSON.stringify({ days: trimmedDays }, null, 2) }], `series: update ${mergedDay.date}`);

  const analytics = await recomputeAnalytics(env, trimmedDays);

  return json({ ok: true, date: mergedDay.date, metrics: mergedDay, analytics });
}

/**
 * Bulk import endpoint for the dashboard's "Import Apple Health export"
 * button: the browser unzips export.xml, aggregates it into one record per
 * day client-side, and posts the whole array here. We merge it into the
 * series, recompute biological-age history for every day, and push
 * everything in ONE git commit (via the Git Data API) instead of one
 * contents-API write per day — a historical export can be thousands of days.
 */
async function handleImportBulk(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();

  let body: { days?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (!Array.isArray(body.days) || body.days.length === 0) {
    return json({ error: "body.days must be a non-empty array" }, 400);
  }

  const source = "health-export-import";
  const incomingDays = body.days.map((d) => normalizePayload(d, source));

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const byDate = new Map(seriesData?.days.map((d) => [d.date, d]) ?? []);
  for (const incoming of incomingDays) {
    byDate.set(incoming.date, mergeDaily(byDate.get(incoming.date) ?? null, incoming));
  }
  const mergedDays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SERIES_DAYS);

  const { data: profile } = await getJson<UserProfile>(env, PROFILE_PATH);
  let historyEntries: BiologicalAgeResult[] = [];
  if (profile) {
    for (let i = 0; i < mergedDays.length; i++) {
      const window = mergedDays.slice(Math.max(0, i - ANALYTICS_WINDOW_DAYS + 1), i + 1);
      const result = estimateBiologicalAge(window, profile, mergedDays[i].date);
      if (result.markers.length > 0) historyEntries.push(result);
    }
    historyEntries = historyEntries.slice(-MAX_HISTORY_ENTRIES);
  }
  const latest = historyEntries[historyEntries.length - 1] ?? null;

  const files: BulkFile[] = incomingDays.map((d) => ({
    path: dayPath(d.date),
    content: JSON.stringify(byDate.get(d.date), null, 2),
  }));
  files.push({ path: SERIES_PATH, content: JSON.stringify({ days: mergedDays }, null, 2) });
  if (profile) {
    files.push({ path: HISTORY_PATH, content: JSON.stringify({ entries: historyEntries }, null, 2) });
    files.push({ path: LATEST_PATH, content: JSON.stringify(latest, null, 2) });
  }

  await bulkCommit(
    env,
    files,
    `Import Apple Health export: ${incomingDays.length} days (${incomingDays[0].date} to ${incomingDays[incomingDays.length - 1].date})`
  );
  return json({ ok: true, daysImported: incomingDays.length, totalDays: mergedDays.length, latest });
}

async function handleGetSeries(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  return json(data ?? { days: [] });
}

async function handleGetAnalytics(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data: profile } = await getJson<UserProfile>(env, PROFILE_PATH);
  const { data: latest } = await getJson<BiologicalAgeResult>(env, LATEST_PATH);
  const { data: history } = await getJson<{ entries: BiologicalAgeResult[] }>(env, HISTORY_PATH);
  return json({ profileSet: !!profile, latest, history: history?.entries ?? [] });
}

async function handleGetTrends(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const [{ data: seriesData }, { data: profile }, { data: knowledge }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
  ]);
  const days = seriesData?.days ?? [];
  const age = profile ? chronologicalAge(profile.birthDate, new Date().toISOString().slice(0, 10)) : null;
  const strain7 = days.slice(-7).map((d) => ({ date: d.date, strain: d.strain ?? computeStrain(d, age) }));
  const today = days[days.length - 1];
  const todayStrain = today ? (today.strain ?? computeStrain(today, age)) : null;
  const sleepTarget = knowledge?.sleepTargetHours ?? 7.5;
  return json({ ...computeTrends(days, sleepTarget), todayStrain, strain7 });
}

interface InsightsCacheEntry {
  generatedAt: string;
  dataVersion?: string; // reviewVersion() when written
  insights: AiInsights;
}

/** Today's date where the user lives — plans and briefs are about *their* day, not UTC's. */
function localToday(env: Env): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: env.TIMEZONE || "Asia/Kolkata" }).format(new Date());
}

async function loadGoalProgress(env: Env, days: DailyMetrics[]): Promise<GoalProgress[]> {
  const { data } = await getJson<{ goals: Goal[] }>(env, GOALS_PATH);
  const today = localToday(env);
  return (data?.goals ?? []).map((g) => computeGoalProgress(days, g, today));
}

type ReviewResult = InsightsCacheEntry & { cached: boolean; stale?: boolean; refreshing?: boolean };

/**
 * AI reviews are written AHEAD of time, not on page open:
 *   - warmAllReviews() runs right after every sync and after the 07:00
 *     morning-brief call (no cron of our own: the account is at the free
 *     plan's 5-cron limit), rewriting any review whose inputs changed;
 *   - opening the dashboard always gets the cached review instantly; if it
 *     is out of date, it is refreshed in the background (ctx.waitUntil) and
 *     the page picks up the new one a minute later.
 * "Out of date" = the data changed since it was written (DATA_VERSION_KEY,
 * bumped on every sync), the day changed, or it's older than 6 hours.
 * Entries are kept a week, so a failed rewrite never empties a card.
 */
const DATA_VERSION_KEY = "data:version";
const REVIEW_MAX_AGE_SECONDS = 6 * 60 * 60;
const REVIEW_LOCK_SECONDS = 120;

async function reviewVersion(env: Env): Promise<string> {
  const data = (await env.INSIGHTS_CACHE.get(DATA_VERSION_KEY)) ?? "none";
  return `${localToday(env)}|${data}`;
}

async function bumpDataVersion(env: Env): Promise<void> {
  await env.INSIGHTS_CACHE.put(DATA_VERSION_KEY, new Date().toISOString());
}

function isOutOfDate(entry: InsightsCacheEntry, version: string): boolean {
  const age = (Date.now() - Date.parse(entry.generatedAt)) / 1000;
  return entry.dataVersion !== version || age > REVIEW_MAX_AGE_SECONDS;
}

interface AiInputs {
  days: DailyMetrics[];
  profile: UserProfile | null;
  latest: BiologicalAgeResult | null;
  knowledge: UserKnowledge | null;
  bioHistory: BiologicalAgeResult[];
  goals: GoalProgress[];
}

async function loadAiInputs(env: Env): Promise<AiInputs> {
  const [{ data: seriesData }, { data: profile }, { data: latest }, { data: knowledge }, { data: history }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
    getJson<BiologicalAgeResult>(env, LATEST_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
    getJson<{ entries: BiologicalAgeResult[] }>(env, HISTORY_PATH),
  ]);
  const days = seriesData?.days ?? [];
  return { days, profile, latest, knowledge, bioHistory: history?.entries ?? [], goals: await loadGoalProgress(env, days) };
}

/** Writes one review from already-loaded inputs and stores it. Throws on failure. */
async function writeReview(env: Env, domain: ReviewDomain, inputs: AiInputs, version: string): Promise<InsightsCacheEntry> {
  const { days, profile, latest, knowledge, bioHistory, goals } = inputs;
  const context = buildReviewContext(domain, { days, profile, knowledge, bioHistory, goals });
  const insights = await generateReview(env, domain, days, computeTrends(days), profile ? latest : null, context);
  const entry: InsightsCacheEntry = { generatedAt: new Date().toISOString(), dataVersion: version, insights };
  await env.INSIGHTS_CACHE.put(insightsCacheKey(domain), JSON.stringify(entry), { expirationTtl: INSIGHTS_KEEP_SECONDS });
  return entry;
}

/** A short KV lock so a page load and the cron don't write the same review at once. */
async function tryLock(env: Env, domain: ReviewDomain): Promise<boolean> {
  const key = `lock:review:${domain}`;
  if (await env.INSIGHTS_CACHE.get(key)) return false;
  await env.INSIGHTS_CACHE.put(key, "1", { expirationTtl: REVIEW_LOCK_SECONDS });
  return true;
}

async function refreshReview(env: Env, domain: ReviewDomain, inputs?: AiInputs): Promise<void> {
  if (!(await tryLock(env, domain))) return;
  try {
    const version = await reviewVersion(env);
    await writeReview(env, domain, inputs ?? (await loadAiInputs(env)), version);
  } catch {
    // keep the previous review; the next warm-up tries again
  } finally {
    await env.INSIGHTS_CACHE.delete(`lock:review:${domain}`);
  }
}

/**
 * Pre-writes every out-of-date review (and makes sure this week's plan
 * exists), loading the data once. Run after syncs and the morning brief.
 */
async function warmAllReviews(env: Env): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const out = { written: [] as string[], skipped: [] as string[], failed: [] as string[] };
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return out;
  const inputs = await loadAiInputs(env);
  if (inputs.days.length === 0) return out;
  const version = await reviewVersion(env);

  const todo: ReviewDomain[] = [];
  for (const domain of REVIEW_DOMAINS) {
    const cached = await env.INSIGHTS_CACHE.get<InsightsCacheEntry>(insightsCacheKey(domain), "json");
    if (cached && !isOutOfDate(cached, version)) out.skipped.push(domain);
    else todo.push(domain);
  }
  // Three at a time: fast enough, gentle on the free-tier gateway.
  for (let i = 0; i < todo.length; i += 3) {
    await Promise.all(
      todo.slice(i, i + 3).map(async (domain) => {
        if (!(await tryLock(env, domain))) return out.skipped.push(domain);
        try {
          await writeReview(env, domain, inputs, version);
          out.written.push(domain);
        } catch {
          out.failed.push(domain);
        } finally {
          await env.INSIGHTS_CACHE.delete(`lock:review:${domain}`);
        }
      })
    );
  }
  await loadPlan(env).catch(() => null);
  return out;
}

/**
 * Cached review, instantly. Out of date → served anyway and refreshed in the
 * background (when a ctx is given). Nothing cached yet, or force → written
 * now. Shared by the dashboard and the morning brief.
 */
async function getReview(env: Env, domain: ReviewDomain, opts: { force?: boolean; ctx?: ExecutionContext } = {}): Promise<ReviewResult | { error: string; status: number }> {
  const cached = await env.INSIGHTS_CACHE.get<InsightsCacheEntry>(insightsCacheKey(domain), "json");
  const version = await reviewVersion(env);
  if (cached && !opts.force) {
    const outOfDate = isOutOfDate(cached, version);
    if (outOfDate && opts.ctx) opts.ctx.waitUntil(refreshReview(env, domain));
    return { ...cached, cached: true, refreshing: outOfDate && !!opts.ctx };
  }
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return { error: "AI insights not configured", status: 503 };
  const inputs = await loadAiInputs(env);
  if (inputs.days.length === 0) return { error: "no data yet", status: 400 };
  try {
    return { ...(await writeReview(env, domain, inputs, version)), cached: false };
  } catch (err) {
    if (cached) return { ...cached, cached: true, stale: true };
    throw err;
  }
}

async function handleGetInsights(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const domainParam = url.searchParams.get("domain");
  const domain: ReviewDomain = REVIEW_DOMAINS.includes(domainParam as ReviewDomain) ? (domainParam as ReviewDomain) : "overview";
  const result = await getReview(env, domain, { force, ctx });
  if ("error" in result) return json({ error: result.error }, result.status);
  return json(result);
}

// ---------------- goals ----------------

async function handleGetGoals(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  return json({
    progress: await loadGoalProgress(env, days),
    metrics: Object.entries(GOAL_METRICS).map(([key, d]) => ({ key, label: d.label, unit: d.unit, current: currentValue(days, key as Goal["metric"]) })),
  });
}

async function handlePostGoal(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  let body: Partial<Goal>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (!isGoalMetric(body.metric)) return json({ error: `metric must be one of: ${Object.keys(GOAL_METRICS).join(", ")}` }, 400);
  if (typeof body.target !== "number" || !Number.isFinite(body.target)) return json({ error: "target (number) is required" }, 400);
  if (typeof body.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) return json({ error: "deadline (YYYY-MM-DD) is required" }, 400);
  const today = localToday(env);
  if (body.deadline <= today) return json({ error: "deadline must be in the future" }, 400);

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const def = GOAL_METRICS[body.metric];
  const goal: Goal = {
    id: crypto.randomUUID(),
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : `${def.label} ${body.target}${def.unit ? " " + def.unit : ""}`,
    metric: body.metric,
    target: body.target,
    deadline: body.deadline,
    startDate: today,
    startValue: currentValue(seriesData?.days ?? [], body.metric),
  };
  const { data: existing, sha } = await getJson<{ goals: Goal[] }>(env, GOALS_PATH);
  const goals = [...(existing?.goals ?? []), goal].slice(-MAX_GOALS);
  await putJson(env, GOALS_PATH, { goals }, `goals: add "${goal.title}"`, sha);
  await bumpDataVersion(env);
  return json({ ok: true, goal });
}

async function handleDeleteGoal(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "?id= is required" }, 400);
  const { data: existing, sha } = await getJson<{ goals: Goal[] }>(env, GOALS_PATH);
  const goals = (existing?.goals ?? []).filter((g) => g.id !== id);
  await putJson(env, GOALS_PATH, { goals }, `goals: delete ${id}`, sha);
  await bumpDataVersion(env);
  return json({ ok: true });
}

// ---------------- adaptive weekly plan ----------------

/**
 * Returns this week's plan as a view (statuses + today's adjustment),
 * writing a new plan first when there is none for the current week or
 * `regenerate` is set. The AI writes it when it can; buildTemplatePlan()
 * covers a gateway failure or an answer that doesn't fit the contract.
 */
async function loadPlan(env: Env, regenerate = false): Promise<PlanView | null> {
  const [{ data: seriesData }, { data: profile }, { data: knowledge }, { data: stored, sha }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
    getJson<StoredPlan>(env, PLAN_PATH),
  ]);
  const days = seriesData?.days ?? [];
  if (days.length === 0) return null;
  const today = localToday(env);
  const weekStart = mondayOf(today);
  const fitness = computeFitnessReport(days, profile, knowledge?.sleepTargetHours ?? 7.5);
  const goals = await loadGoalProgress(env, days);

  let plan = stored;
  if (!plan || plan.weekStart !== weekStart || regenerate) {
    const pattern = computeWeekdayPattern(days).filter((p) => p.avgSteps !== null);
    const lowest = pattern.length ? [...pattern].sort((a, b) => (a.avgSteps as number) - (b.avgSteps as number))[0].weekday : null;
    let next: StoredPlan | null = null;
    if (env.LLM_GATEWAY_URL && env.LLM_GATEWAY_TOKEN) {
      try {
        const raw = await generatePlanJson(env, {
          weekStarting: weekStart,
          user: { goals: knowledge?.goals || undefined, preferences: knowledge?.preferences || undefined },
          goalProgress: goals.map((g) => ({ goal: g.goal.title, current: g.current, target: g.goal.target, deadline: g.goal.deadline, status: g.status })),
          fitnessMetrics: fitness.metrics.map((m) => ({ metric: m.label, value: m.display, status: m.status, whatToDo: m.action })),
          actionItems: fitness.actionItems,
          lastWeeks: fitness.weekly.slice(-4),
          leastActiveWeekday: lowest,
        });
        next = parseAiPlan(raw, weekStart);
      } catch {
        next = null;
      }
    }
    plan = next ?? buildTemplatePlan(weekStart, fitness, goals, lowest);
    await putJson(env, PLAN_PATH, plan, `plan: week of ${weekStart} (${plan.source})`, sha);
  }

  const trends = computeTrends(days);
  const recoveryFlag = fitness.actionItems.find((a) => a.priority === "high" && a.area === "recovery");
  return viewPlan(plan, days, today, { readiness: trends.readinessScore, highRecoveryFlag: recoveryFlag ? recoveryFlag.why : null });
}

async function handleGetPlan(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const view = await loadPlan(env, req.method === "POST");
  return view ? json(view) : json({ error: "no data yet" }, 400);
}

async function handleTogglePlanDone(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return json({ error: "?date= is required" }, 400);
  const { data: plan, sha } = await getJson<StoredPlan>(env, PLAN_PATH);
  if (!plan || !plan.days.some((d) => d.date === date)) return json({ error: "no plan for that date" }, 404);
  plan.done = plan.done.includes(date) ? plan.done.filter((d) => d !== date) : [...plan.done, date].sort();
  await putJson(env, PLAN_PATH, plan, `plan: ${plan.done.includes(date) ? "done" : "undo"} ${date}`, sha);
  return json({ ok: true, view: await loadPlan(env) });
}

// ---------------- morning brief ----------------

/**
 * POST /telegram/brief — the health section of the 7am Telegram message.
 * Called by brain-chat (or telegram-router, its fallback) over a service
 * binding, exactly like life-rpg's endpoint of the same name: bearer token
 * in, { text } (MarkdownV2) out, null text when there's nothing to say.
 * Accepts BRIEF_TOKEN (the token those workers hold) or INGEST_TOKEN.
 */
async function handleTelegramBrief(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const ok = !!token && (token === env.BRIEF_TOKEN || token === env.INGEST_TOKEN);
  if (!ok) return unauthorized();

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  if (days.length === 0) return json({ text: null });
  const { data: profile } = await getJson<UserProfile>(env, PROFILE_PATH);

  const [plan, goals, review] = await Promise.all([
    loadPlan(env).catch(() => null),
    loadGoalProgress(env, days),
    // A new day makes yesterday's "today" review out of date: write it now
    // (well inside the caller's 60s budget) rather than send a stale call.
    (async () => {
      const cached = await env.INSIGHTS_CACHE.get<InsightsCacheEntry>(insightsCacheKey("today"), "json");
      const force = !cached || isOutOfDate(cached, await reviewVersion(env));
      return getReview(env, "today", { force });
    })().catch(() => null),
  ]);
  const fitness = computeFitnessReport(days, profile, 7.5);
  const trends = computeTrends(days, 7.5);
  const text = healthBriefMessage({
    today: localToday(env),
    lastDataDate: days[days.length - 1].date,
    readiness: trends.readinessScore,
    recovery: trends.recovery,
    illnessSignal: trends.illnessSignal,
    sleepAnalysis: trends.sleepAnalysis,
    review: review && !("error" in review) ? review.insights : null,
    session: plan?.today ?? null,
    actionItems: fitness.actionItems,
    goals,
    dashboardUrl: env.PUBLIC_URL || "",
  });
  // The 7am call doubles as the daily warm-up: pre-write every other review
  // so the dashboard opens ready.
  ctx.waitUntil(warmAllReviews(env).catch(() => undefined));
  return json({ text });
}

/**
 * Training & fitness metrics (load, form, consistency, VO2max class...) and
 * the prioritised action-item list, all computed in code — see src/fitness.ts.
 */
async function handleGetFitness(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const [{ data: seriesData }, { data: profile }, { data: knowledge }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
  ]);
  return json(computeFitnessReport(seriesData?.days ?? [], profile, knowledge?.sleepTargetHours ?? 7.5));
}

/**
 * Everything the Overview page needs beyond /api/trends: health score,
 * highlights feed, this-week strip, weekday pattern, 12-month trends and
 * 30-day sparklines. See src/overview.ts.
 */
async function handleGetOverview(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const [{ data: seriesData }, { data: profile }, { data: knowledge }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
  ]);
  const days = seriesData?.days ?? [];
  const sleepTarget = knowledge?.sleepTargetHours ?? 7.5;
  const fitness = computeFitnessReport(days, profile, sleepTarget);
  return json(computeOverview(days, computeTrends(days), fitness, profile, sleepTarget));
}

async function handleGetDiscoveries(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const [{ data: seriesData }, { data: knowledge }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
  ]);
  const days = seriesData?.days ?? [];
  const notes = knowledge?.notes ?? [];
  return json({
    correlations: computeCorrelations(days),
    journalCorrelations: computeJournalCorrelations(days, notes),
    anomalies: detectAnomalies(days),
  });
}

async function handleExport(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  const csv = toCsv(days);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="health-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

async function handleGetReport(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period");
  const period: ReportPeriod = periodParam === "month" ? "month" : "week";
  const endDate = url.searchParams.get("end") || undefined;

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  const report = computePeriodReport(days, period, endDate);
  if (!report) return json({ error: "no data yet" }, 400);
  return json(report);
}

async function handleAsk(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return json({ error: "AI is not configured" }, 503);

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return json({ error: "body.question (string) is required" }, 400);
  }

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];

  try {
    const result = await answerHealthQuestion(env, body.question.trim(), days);
    return json(result);
  } catch (err) {
    return json({ error: (err as Error).message }, 422);
  }
}

async function handleChart(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return json({ error: "AI is not configured" }, 503);

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return json({ error: "body.question (string) is required" }, 400);
  }

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];

  try {
    const result = await generateChartFromQuestion(env, body.question.trim(), days);
    return json(result);
  } catch (err) {
    return json({ error: (err as Error).message }, 422);
  }
}

const BASELINE_WINDOWS = [7, 30, 90];

async function handleGetBaselines(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  const windows: Record<string, ReturnType<typeof computeBaselines>> = {};
  for (const w of BASELINE_WINDOWS) windows[String(w)] = computeBaselines(days, w);
  return json({ windows });
}

async function handleGetCoverage(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  return json(computeCoverage(days));
}

async function handleGetKnowledge(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data } = await getJson<UserKnowledge>(env, KNOWLEDGE_PATH);
  return json(data ?? { notes: [] });
}

async function handlePutKnowledge(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  let body: Partial<Pick<UserKnowledge, "goals" | "preferences" | "sleepTargetHours">>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const { data: existing, sha } = await getJson<UserKnowledge>(env, KNOWLEDGE_PATH);
  const updated: UserKnowledge = {
    notes: existing?.notes ?? [],
    goals: typeof body.goals === "string" ? body.goals : existing?.goals,
    preferences: typeof body.preferences === "string" ? body.preferences : existing?.preferences,
    sleepTargetHours: typeof body.sleepTargetHours === "number" ? body.sleepTargetHours : existing?.sleepTargetHours,
  };
  await putJson(env, KNOWLEDGE_PATH, updated, "knowledge: update goals/preferences", sha);
  return json({ ok: true, knowledge: updated });
}

async function handlePostKnowledgeNote(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  let body: Partial<KnowledgeNote>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return json({ error: "body.date (YYYY-MM-DD) is required" }, 400);
  }
  const note: KnowledgeNote = {
    date: body.date,
    energy: typeof body.energy === "number" ? Math.max(1, Math.min(10, body.energy)) : undefined,
    soreness: typeof body.soreness === "number" ? Math.max(1, Math.min(10, body.soreness)) : undefined,
    note: typeof body.note === "string" ? body.note.slice(0, 2000) : undefined,
    alcoholDrinks: typeof body.alcoholDrinks === "number" ? Math.max(0, Math.round(body.alcoholDrinks)) : undefined,
    caffeineMg: typeof body.caffeineMg === "number" ? Math.max(0, Math.round(body.caffeineMg)) : undefined,
    stress: typeof body.stress === "number" ? Math.max(1, Math.min(10, body.stress)) : undefined,
    illness: typeof body.illness === "boolean" ? body.illness : undefined,
    lateMeal: typeof body.lateMeal === "boolean" ? body.lateMeal : undefined,
    screenBeforeBed: typeof body.screenBeforeBed === "boolean" ? body.screenBeforeBed : undefined,
    supplements: Array.isArray(body.supplements) ? body.supplements.filter((s: unknown) => typeof s === "string").slice(0, 10).map((s: string) => s.slice(0, 60)) : undefined,
    hydrationLiters: typeof body.hydrationLiters === "number" ? Math.max(0, Math.round(body.hydrationLiters * 10) / 10) : undefined,
  };

  const { data: existing, sha } = await getJson<UserKnowledge>(env, KNOWLEDGE_PATH);
  const notes = existing?.notes ?? [];
  const idx = notes.findIndex((n) => n.date === note.date);
  if (idx >= 0) notes[idx] = note;
  else notes.push(note);
  notes.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = notes.slice(-MAX_KNOWLEDGE_NOTES);

  const updated: UserKnowledge = { ...existing, notes: trimmed };
  await putJson(env, KNOWLEDGE_PATH, updated, `knowledge: note for ${note.date}`, sha);
  return json({ ok: true, note });
}

async function handleDeleteKnowledgeNote(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return json({ error: "?date=YYYY-MM-DD is required" }, 400);

  const { data: existing, sha } = await getJson<UserKnowledge>(env, KNOWLEDGE_PATH);
  const notes = (existing?.notes ?? []).filter((n) => n.date !== date);
  const updated: UserKnowledge = { ...existing, notes };
  await putJson(env, KNOWLEDGE_PATH, updated, `knowledge: delete note for ${date}`, sha);
  return json({ ok: true });
}

async function handleGetExperiments(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const [{ data: expData }, { data: seriesData }] = await Promise.all([
    getJson<{ experiments: Experiment[] }>(env, EXPERIMENTS_PATH),
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
  ]);
  const experiments = expData?.experiments ?? [];
  const days = seriesData?.days ?? [];
  return json({ results: experiments.map((e) => computeExperimentResult(days, e)) });
}

async function handlePostExperiment(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  let body: Partial<Experiment>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (typeof body.title !== "string" || !body.title.trim()) return json({ error: "body.title is required" }, 400);
  if (typeof body.metric !== "string") return json({ error: "body.metric is required" }, 400);
  if (typeof body.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) {
    return json({ error: "body.startDate (YYYY-MM-DD) is required" }, 400);
  }

  const experiment: Experiment = {
    id: crypto.randomUUID(),
    title: body.title.trim().slice(0, 200),
    metric: body.metric,
    startDate: body.startDate,
    adherenceDates: [],
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined,
  };

  const { data: existing, sha } = await getJson<{ experiments: Experiment[] }>(env, EXPERIMENTS_PATH);
  const experiments = [...(existing?.experiments ?? []), experiment];
  await putJson(env, EXPERIMENTS_PATH, { experiments }, `experiments: add "${experiment.title}"`, sha);
  return json({ ok: true, experiment });
}

async function handlePostExperimentAdherence(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const date = url.searchParams.get("date");
  if (!id || !date) return json({ error: "?id= and ?date= are required" }, 400);

  const { data: existing, sha } = await getJson<{ experiments: Experiment[] }>(env, EXPERIMENTS_PATH);
  const experiments = existing?.experiments ?? [];
  const exp = experiments.find((e) => e.id === id);
  if (!exp) return json({ error: "experiment not found" }, 404);

  // Toggle: if already logged, remove; otherwise add.
  const idx = exp.adherenceDates.indexOf(date);
  if (idx >= 0) exp.adherenceDates.splice(idx, 1);
  else exp.adherenceDates.push(date);
  exp.adherenceDates.sort();

  await putJson(env, EXPERIMENTS_PATH, { experiments }, `experiments: adherence for ${id} on ${date}`, sha);
  return json({ ok: true, experiment: exp });
}

async function handleDeleteExperiment(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "?id= is required" }, 400);

  const { data: existing, sha } = await getJson<{ experiments: Experiment[] }>(env, EXPERIMENTS_PATH);
  const experiments = (existing?.experiments ?? []).filter((e) => e.id !== id);
  await putJson(env, EXPERIMENTS_PATH, { experiments }, `experiments: delete ${id}`, sha);
  return json({ ok: true });
}

// ---------------- manual workouts ----------------

async function handleGetWorkouts(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const dateFilter = new URL(req.url).searchParams.get("date");
  const { data } = await getJson<{ workouts: ManualWorkout[] }>(env, WORKOUTS_PATH);
  let workouts = data?.workouts ?? [];
  if (dateFilter) workouts = workouts.filter((w) => w.date === dateFilter);
  workouts.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return json({ workouts });
}

async function handleGetWorkoutAnalytics(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const { data } = await getJson<{ workouts: ManualWorkout[] }>(env, WORKOUTS_PATH);
  const workouts = data?.workouts ?? [];
  return json({
    prs: computePRs(workouts),
    muscleBalance: computeMuscleBalance(workouts),
    frequency: computeWorkoutFrequency(workouts),
  });
}

async function handlePostWorkout(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const sanitized = sanitizeManualWorkout(body);
  if (!sanitized) return json({ error: "invalid workout: date (YYYY-MM-DD), type (string), and exercises are required" }, 400);

  const { data: existing, sha } = await getJson<{ workouts: ManualWorkout[] }>(env, WORKOUTS_PATH);
  const workouts = existing?.workouts ?? [];
  const existingId = typeof (body as Record<string, unknown>).id === "string" ? (body as Record<string, unknown>).id as string : null;

  const workout: ManualWorkout = {
    ...sanitized,
    id: existingId && workouts.some((w) => w.id === existingId) ? existingId : crypto.randomUUID(),
    createdAt: existingId && workouts.some((w) => w.id === existingId)
      ? workouts.find((w) => w.id === existingId)!.createdAt
      : new Date().toISOString(),
  };

  const idx = workouts.findIndex((w) => w.id === workout.id);
  if (idx >= 0) workouts[idx] = workout;
  else workouts.push(workout);

  await putJson(env, WORKOUTS_PATH, { workouts }, `workouts: ${idx >= 0 ? "update" : "add"} ${workout.date} ${workout.type}`, sha);
  await bumpDataVersion(env);
  return json({ ok: true, workout });
}

async function handleDeleteWorkout(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "?id= is required" }, 400);
  const { data: existing, sha } = await getJson<{ workouts: ManualWorkout[] }>(env, WORKOUTS_PATH);
  const workouts = (existing?.workouts ?? []).filter((w) => w.id !== id);
  await putJson(env, WORKOUTS_PATH, { workouts }, `workouts: delete ${id}`, sha);
  await bumpDataVersion(env);
  return json({ ok: true });
}

async function handleGetAlerts(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const [{ data: seriesData }, { data: knowledge }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
  ]);
  const days = seriesData?.days ?? [];
  const today = localToday(env);
  const sleepTarget = knowledge?.sleepTargetHours ?? 7.5;
  const trends = computeTrends(days, sleepTarget);
  const goals = await loadGoalProgress(env, days);
  const lastSyncDate = days.length ? days[days.length - 1].date : null;
  return json({ alerts: generateAlerts(days, trends, goals, lastSyncDate, today) });
}

async function handlePutProfile(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  let body: Partial<UserProfile>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (!body.birthDate || (body.sex !== "male" && body.sex !== "female")) {
    return json({ error: "birthDate (YYYY-MM-DD) and sex ('male'|'female') are required" }, 400);
  }
  const profile: UserProfile = { birthDate: body.birthDate, sex: body.sex, heightCm: body.heightCm };
  const { sha } = await getJson<UserProfile>(env, PROFILE_PATH);
  await putJson(env, PROFILE_PATH, profile, "profile: update", sha);

  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  if (seriesData?.days.length) await recomputeAnalytics(env, seriesData.days);

  return json({ ok: true, profile });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && (url.pathname === "/ingest" || url.pathname === "/import-bulk")) {
        const res = url.pathname === "/ingest" ? await handleIngest(req, env) : await handleImportBulk(req, env);
        // New data: mark every review out of date and rewrite them now, so the
        // dashboard already has them by the time it's opened.
        if (res.ok) ctx.waitUntil(bumpDataVersion(env).then(() => warmAllReviews(env)).catch(() => undefined));
        return res;
      }
      if (req.method === "POST" && url.pathname === "/api/warm") {
        if (!isAuthed(req, env)) return unauthorized();
        return json(await warmAllReviews(env));
      }
      if (req.method === "GET" && url.pathname === "/api/series") return await handleGetSeries(req, env);
      if (req.method === "GET" && url.pathname === "/api/analytics") return await handleGetAnalytics(req, env);
      if (req.method === "GET" && url.pathname === "/api/trends") return await handleGetTrends(req, env);
      if (req.method === "GET" && url.pathname === "/api/insights") return await handleGetInsights(req, env, ctx);
      if (req.method === "POST" && url.pathname === "/telegram/brief") return await handleTelegramBrief(req, env, ctx);
      if (req.method === "GET" && url.pathname === "/api/goals") return await handleGetGoals(req, env);
      if (req.method === "POST" && url.pathname === "/api/goals") return await handlePostGoal(req, env);
      if (req.method === "DELETE" && url.pathname === "/api/goals") return await handleDeleteGoal(req, env);
      if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/plan") return await handleGetPlan(req, env);
      if (req.method === "POST" && url.pathname === "/api/plan/done") return await handleTogglePlanDone(req, env);
      if (req.method === "GET" && url.pathname === "/api/overview") return await handleGetOverview(req, env);
      if (req.method === "GET" && url.pathname === "/api/fitness") return await handleGetFitness(req, env);
      if (req.method === "GET" && url.pathname === "/api/baselines") return await handleGetBaselines(req, env);
      if (req.method === "GET" && url.pathname === "/api/coverage") return await handleGetCoverage(req, env);
      if (req.method === "POST" && url.pathname === "/api/ask") return await handleAsk(req, env);
      if (req.method === "POST" && url.pathname === "/api/chart") return await handleChart(req, env);
      if (req.method === "GET" && url.pathname === "/api/discoveries") return await handleGetDiscoveries(req, env);
      if (req.method === "GET" && url.pathname === "/api/report") return await handleGetReport(req, env);
      if (req.method === "GET" && url.pathname === "/api/export") return await handleExport(req, env);
      if (req.method === "GET" && url.pathname === "/api/knowledge") return await handleGetKnowledge(req, env);
      if (req.method === "PUT" && url.pathname === "/api/knowledge") return await handlePutKnowledge(req, env);
      if (req.method === "POST" && url.pathname === "/api/knowledge/notes") return await handlePostKnowledgeNote(req, env);
      if (req.method === "DELETE" && url.pathname === "/api/knowledge/notes") return await handleDeleteKnowledgeNote(req, env);
      if (req.method === "GET" && url.pathname === "/api/experiments") return await handleGetExperiments(req, env);
      if (req.method === "POST" && url.pathname === "/api/experiments") return await handlePostExperiment(req, env);
      if (req.method === "POST" && url.pathname === "/api/experiments/adherence") return await handlePostExperimentAdherence(req, env);
      if (req.method === "DELETE" && url.pathname === "/api/experiments") return await handleDeleteExperiment(req, env);
      if (req.method === "GET" && url.pathname === "/api/workouts") return await handleGetWorkouts(req, env);
      if (req.method === "GET" && url.pathname === "/api/workouts/analytics") return await handleGetWorkoutAnalytics(req, env);
      if (req.method === "POST" && url.pathname === "/api/workouts") return await handlePostWorkout(req, env);
      if (req.method === "DELETE" && url.pathname === "/api/workouts") return await handleDeleteWorkout(req, env);
      if (req.method === "GET" && url.pathname === "/api/alerts") return await handleGetAlerts(req, env);
      if (req.method === "PUT" && url.pathname === "/api/profile") return await handlePutProfile(req, env);
      if (req.method === "GET" && url.pathname === "/manifest.json") {
        return new Response(JSON.stringify({
          name: "Health Dashboard",
          short_name: "Health",
          start_url: "/",
          display: "standalone",
          background_color: "#0a0a0a",
          theme_color: "#0a0a0a",
          icons: [{ src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⌁</text></svg>", sizes: "any", type: "image/svg+xml" }]
        }), { headers: { "Content-Type": "application/manifest+json" } });
      }
      if (req.method === "GET" && url.pathname === "/sw.js") {
        return new Response(
          "self.addEventListener('install',e=>self.skipWaiting());" +
          "self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));" +
          "self.addEventListener('fetch',e=>{});",
          { headers: { "Content-Type": "application/javascript" } }
        );
      }
      if (req.method === "GET" && url.pathname === "/") {
        return new Response(renderDashboard(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: "internal error", detail: (err as Error).message }, 500);
    }
  },
};
