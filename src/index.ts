import type { BiologicalAgeResult, DailyMetrics, Env, KnowledgeNote, UserKnowledge, UserProfile } from "./types";
import { bulkCommit, getJson, putJson, type BulkFile } from "./github";
import { mergeDaily, normalizePayload } from "./normalize";
import { chronologicalAge, computeStrain, estimateBiologicalAge } from "./analytics";
import { computeTrends } from "./trends";
import { computeBaselines } from "./baselines";
import { computeCoverage } from "./coverage";
import { computeCorrelations } from "./correlations";
import { detectAnomalies } from "./anomalies";
import { computePeriodReport, type ReportPeriod } from "./report";
import { toCsv } from "./export";
import { computeExperimentResult, type Experiment } from "./experiments";
import { generateReview, answerHealthQuestion, generateChartFromQuestion, REVIEW_DOMAINS, type AiInsights, type ReviewDomain } from "./ai";
import { buildReviewContext } from "./reviewContext";
import { computeFitnessReport } from "./fitness";
import { computeOverview } from "./overview";
import { renderDashboard } from "./dashboard";

const SERIES_PATH = "data/series.json";
const PROFILE_PATH = "data/profile.json";
const HISTORY_PATH = "data/analytics/history.json";
const LATEST_PATH = "data/analytics/latest.json";
const KNOWLEDGE_PATH = "data/knowledge.json";
const MAX_KNOWLEDGE_NOTES = 2000;
const EXPERIMENTS_PATH = "data/experiments.json";
const MAX_SERIES_DAYS = 4000; // ~11 years, enough headroom for a full Apple Health export backfill
const MAX_HISTORY_ENTRIES = 4000;
const ANALYTICS_WINDOW_DAYS = 7;
function insightsCacheKey(domain: ReviewDomain): string {
  // v3: plainer voice + weekly/longterm domains. v2: snapshots carry domain-specific computed context (fitness
  // report, recent rows...) — don't serve reviews generated without it.
  return `insights:v3:${domain}`;
}
const INSIGHTS_CACHE_TTL_SECONDS = 60 * 60; // 1 hour

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
  const [{ data: seriesData }, { data: profile }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
  ]);
  const days = seriesData?.days ?? [];
  const age = profile ? chronologicalAge(profile.birthDate, new Date().toISOString().slice(0, 10)) : null;
  const strain7 = days.slice(-7).map((d) => ({ date: d.date, strain: d.strain ?? computeStrain(d, age) }));
  const today = days[days.length - 1];
  const todayStrain = today ? (today.strain ?? computeStrain(today, age)) : null;
  return json({ ...computeTrends(days), todayStrain, strain7 });
}

interface InsightsCacheEntry {
  generatedAt: string;
  insights: AiInsights;
}

/**
 * AI-generated narrative review for one domain (overview/today/training/
 * recovery/activity/sleep/body/discoveries),
 * cached in KV for an hour per domain so the dashboard doesn't pay for (or
 * wait on) an LLM call on every reload. `?force=1` (the dashboard's Retry
 * button) bypasses the cache and regenerates immediately. Same caching
 * architecture for every domain — only the cache key and the model's
 * system-prompt focus differ.
 */
async function handleGetInsights(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const domainParam = url.searchParams.get("domain");
  const domain: ReviewDomain = REVIEW_DOMAINS.includes(domainParam as ReviewDomain) ? (domainParam as ReviewDomain) : "overview";
  const cacheKey = insightsCacheKey(domain);

  if (!force) {
    const cached = await env.INSIGHTS_CACHE.get<InsightsCacheEntry>(cacheKey, "json");
    if (cached) return json({ ...cached, cached: true });
  }

  const [{ data: seriesData }, { data: profile }, { data: latest }, { data: knowledge }, history] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
    getJson<BiologicalAgeResult>(env, LATEST_PATH),
    getJson<UserKnowledge>(env, KNOWLEDGE_PATH),
    domain === "body" || domain === "longterm" ? getJson<{ entries: BiologicalAgeResult[] }>(env, HISTORY_PATH) : Promise.resolve({ data: null }),
  ]);
  const days = seriesData?.days ?? [];
  if (days.length === 0) return json({ error: "no data yet" }, 400);
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return json({ error: "AI insights not configured" }, 503);

  const trends = computeTrends(days);
  const context = buildReviewContext(domain, { days, profile, knowledge, bioHistory: history.data?.entries ?? [] });
  const insights = await generateReview(env, domain, days, trends, profile ? latest : null, context);
  const entry: InsightsCacheEntry = { generatedAt: new Date().toISOString(), insights };
  await env.INSIGHTS_CACHE.put(cacheKey, JSON.stringify(entry), { expirationTtl: INSIGHTS_CACHE_TTL_SECONDS });

  return json({ ...entry, cached: false });
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
  const { data: seriesData } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  return json({
    correlations: computeCorrelations(days),
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
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/ingest") return await handleIngest(req, env);
      if (req.method === "POST" && url.pathname === "/import-bulk") return await handleImportBulk(req, env);
      if (req.method === "GET" && url.pathname === "/api/series") return await handleGetSeries(req, env);
      if (req.method === "GET" && url.pathname === "/api/analytics") return await handleGetAnalytics(req, env);
      if (req.method === "GET" && url.pathname === "/api/trends") return await handleGetTrends(req, env);
      if (req.method === "GET" && url.pathname === "/api/insights") return await handleGetInsights(req, env);
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
      if (req.method === "PUT" && url.pathname === "/api/profile") return await handlePutProfile(req, env);
      if (req.method === "GET" && url.pathname === "/") {
        return new Response(renderDashboard(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: "internal error", detail: (err as Error).message }, 500);
    }
  },
};
