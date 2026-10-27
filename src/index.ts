import type { BiologicalAgeResult, DailyMetrics, Env, UserProfile } from "./types";
import { bulkCommit, getJson, putJson, type BulkFile } from "./github";
import { mergeDaily, normalizePayload } from "./normalize";
import { chronologicalAge, computeStrain, estimateBiologicalAge } from "./analytics";
import { computeTrends } from "./trends";
import { computeBaselines } from "./baselines";
import { computeCoverage } from "./coverage";
import { generateInsights, answerHealthQuestion, type AiInsights } from "./ai";
import { renderDashboard } from "./dashboard";

const SERIES_PATH = "data/series.json";
const PROFILE_PATH = "data/profile.json";
const HISTORY_PATH = "data/analytics/history.json";
const LATEST_PATH = "data/analytics/latest.json";
const MAX_SERIES_DAYS = 4000; // ~11 years, enough headroom for a full Apple Health export backfill
const MAX_HISTORY_ENTRIES = 4000;
const ANALYTICS_WINDOW_DAYS = 7;
const INSIGHTS_CACHE_KEY = "insights:v1";
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

  await putJson(env, HISTORY_PATH, { entries: trimmed }, `analytics: update ${result.date}`, historySha);
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

  const { data: seriesData, sha: seriesSha } = await getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH);
  const days = seriesData?.days ?? [];
  const idx = days.findIndex((d) => d.date === mergedDay.date);
  if (idx >= 0) days[idx] = mergedDay;
  else days.push(mergedDay);
  days.sort((a, b) => a.date.localeCompare(b.date));
  const trimmedDays = days.slice(-MAX_SERIES_DAYS);
  await putJson(env, SERIES_PATH, { days: trimmedDays }, `series: update ${mergedDay.date}`, seriesSha);

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
 * AI-generated narrative insights, cached in KV for an hour so the dashboard
 * doesn't pay for (or wait on) an LLM call on every reload. `?force=1` (the
 * dashboard's Retry button) bypasses the cache and regenerates immediately.
 */
async function handleGetInsights(req: Request, env: Env): Promise<Response> {
  if (!isAuthed(req, env)) return unauthorized();
  const force = new URL(req.url).searchParams.get("force") === "1";

  if (!force) {
    const cached = await env.INSIGHTS_CACHE.get<InsightsCacheEntry>(INSIGHTS_CACHE_KEY, "json");
    if (cached) return json({ ...cached, cached: true });
  }

  const [{ data: seriesData }, { data: profile }, { data: latest }] = await Promise.all([
    getJson<{ days: DailyMetrics[] }>(env, SERIES_PATH),
    getJson<UserProfile>(env, PROFILE_PATH),
    getJson<BiologicalAgeResult>(env, LATEST_PATH),
  ]);
  const days = seriesData?.days ?? [];
  if (days.length === 0) return json({ error: "no data yet" }, 400);
  if (!env.LLM_GATEWAY_URL || !env.LLM_GATEWAY_TOKEN) return json({ error: "AI insights not configured" }, 503);

  const trends = computeTrends(days);
  const insights = await generateInsights(env, days, trends, profile ? latest : null);
  const entry: InsightsCacheEntry = { generatedAt: new Date().toISOString(), insights };
  await env.INSIGHTS_CACHE.put(INSIGHTS_CACHE_KEY, JSON.stringify(entry), { expirationTtl: INSIGHTS_CACHE_TTL_SECONDS });

  return json({ ...entry, cached: false });
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
      if (req.method === "GET" && url.pathname === "/api/baselines") return await handleGetBaselines(req, env);
      if (req.method === "GET" && url.pathname === "/api/coverage") return await handleGetCoverage(req, env);
      if (req.method === "POST" && url.pathname === "/api/ask") return await handleAsk(req, env);
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
