import type { BiologicalAgeResult, DailyMetrics, Env, UserProfile } from "./types";
import { getJson, putJson } from "./github";
import { mergeDaily, normalizePayload } from "./normalize";
import { estimateBiologicalAge } from "./analytics";
import { renderDashboard } from "./dashboard";

const SERIES_PATH = "data/series.json";
const PROFILE_PATH = "data/profile.json";
const HISTORY_PATH = "data/analytics/history.json";
const LATEST_PATH = "data/analytics/latest.json";
const MAX_SERIES_DAYS = 4000; // ~11 years, enough headroom for a full Apple Health export backfill
const MAX_HISTORY_ENTRIES = 4000;
const ANALYTICS_WINDOW_DAYS = 7;

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
      if (req.method === "GET" && url.pathname === "/api/series") return await handleGetSeries(req, env);
      if (req.method === "GET" && url.pathname === "/api/analytics") return await handleGetAnalytics(req, env);
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
