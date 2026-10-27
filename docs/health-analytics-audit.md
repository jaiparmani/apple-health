# Health Analytics Audit — 2026-10-27

Honest snapshot of what this app actually is today, against the "world-class
AI health intelligence platform" brief. This is a from-scratch personal
project (Cloudflare Worker + GitHub-as-datastore, ~2,000 LOC), not a legacy
codebase with broken flows — so most of the audit below is a gap list
against the brief, not a list of bugs to fix.

## Architecture today

- **Backend**: single Cloudflare Worker (`src/index.ts`), no database —
  daily JSON files committed to the `jaiparmani/apple-health` GitHub repo via
  the Git Data API (`src/github.ts`), a KV namespace used only for a 1h AI
  insights cache.
- **Import**: Apple Health `export.zip` is unzipped and parsed **entirely in
  the browser** (`fflate` + a line-by-line regex scan of `export.xml`), so
  the raw export never leaves the user's device — only small per-day JSON
  summaries get POSTed to `/import-bulk`. No server-side parsing exists.
- **Analytics**: `src/analytics.ts` (biological-age heuristic, Tanaka max-HR,
  WHOOP-style Strain), `src/trends.ts` (7/30-day averages, personal bests,
  readiness score, step streak). All deterministic, computed server-side on
  each request from the stored daily records — not cached, not versioned.
- **AI**: `src/ai.ts` calls a sibling project, `llm-gateway`, which
  round-robins free-tier LLM provider keys. One capability exists: a daily
  insights card (headline/insights/concerns/recommendations), KV-cached for
  1h with a manual retry. Just fixed this session (service-binding fix,
  cross-worker fetch was being blocked by Cloudflare).
- **Frontend**: one large server-rendered HTML+JS page (`src/dashboard.ts`),
  dark themed, 7 tabs, Chart.js charts, a generic "Everything Else" view for
  unrecognized HealthKit record types.

## What's genuinely working end to end

- Apple Shortcut → `/ingest` → GitHub-stored daily record (small continuous
  updates).
- Browser `export.zip` → parsed → `/import-bulk` → GitHub (bulk historical
  backfill). Verified against the user's real 2,111-day export.
- Generic capture: any `HKQuantityTypeIdentifier`/`HKCategoryTypeIdentifier`
  not explicitly mapped lands in a per-day `extra` bag instead of being
  dropped.
- Sleep stage breakdown, biological-age estimate, WHOOP-style Strain,
  readiness score, AI daily insights (just verified live).

## Critical gaps vs. the brief

1. **No workout/`<Workout>` parsing at all.** Only `<Record>` elements are
   parsed. Workout sessions, HR zones, workout-specific energy/distance,
   and Activity Ring data are entirely unmodeled. This is the single
   biggest missing data type and the first thing being addressed in this
   pass.
2. **No analytics versioning.** Formulas in `analytics.ts`/`trends.ts` are
   plain functions with no version tag — a future formula change would
   silently reinterpret historical data with no way to tell old vs new.
3. **No personal-baseline statistics layer.** Trends are simple period
   averages, not rolling baselines with percentile ranges, variation
   measures, or explicit confidence/sample-sufficiency flags.
4. **No "Ask my health data" NL query interface, no correlation discovery,
   no anomaly explanations, no personal experiments tracking.** Only the
   single daily-insights AI capability exists.
5. **No data-quality/coverage engine.** Missing days are just missing —
   there's no first-class signal distinguishing "no device worn" from
   "metric not available on this device" from "import gap."
6. **No server-side ZIP/XML hardening.** The browser parser has no explicit
   decompression-bomb guard, no path-traversal concern (nothing is
   extracted to disk — it's parsed in-memory in the browser), but also no
   malformed-record recovery reporting back to the user (parse failures are
   silently skipped).
7. **No automated tests.** Everything has been verified by hand (synthetic
   unit scripts in the scratchpad, manual browser checks against prod) —
   there is no `test/` directory or CI.
8. **No multi-user auth model** — by design, this is a single-user app
   gated by one shared bearer token (`INGEST_TOKEN`). Appropriate for a
   personal tool; flagged here only so it's explicit, not accidental.
9. **GitHub repo is still public** (user needs to flip this manually —
   fine-grained PAT used here lacks the Administration scope required).

## Prioritized plan (executing incrementally, not all at once)

This is explicitly being worked as a multi-session project, per prior
direction. Order of attack:

1. **Workout session parsing** (this pass) — `<Workout>` elements into daily
   `workoutCount`/`workoutMinutes`/`workoutEnergy`/`workoutDistanceKm` plus
   per-type breakdown, surfaced in the Activity tab.
2. **Personal baseline layer** — rolling 7/30/90-day mean/median/percentile
   per metric with explicit sample-sufficiency flags, replacing population
   reference curves wherever a personal baseline is more honest than a
   population one (readiness/strain already do this for HRV/RHR; extend to
   more metrics).
3. **Data coverage view** — per-metric history length, last-seen date, and
   day-level completeness, surfaced in the Data tab.
4. **"Ask my health data"** — a constrained NL query tool: the LLM only
   picks a metric + date range + aggregation from a fixed menu; all math
   happens in `trends.ts`/new query code, never in the model.
5. **Correlation discovery + anomaly explanations** — built on top of (2)
   and (3), gated by minimum sample size, explicitly labeled
   correlation-not-causation.

Everything below that in the original brief (experiments tracking, AI chart
generation, exports, a full navigation IA with Reports/Discoveries pages) is
real, valuable scope but is being sequenced after the above, since those
depend on the baseline/coverage layer existing first.
