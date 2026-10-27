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

1. ✅ **Workout session parsing** — `<Workout>` elements into daily
   `workoutCount`/`workoutMinutes`/`workoutEnergy`/`workoutDistanceKm` plus
   most-common-type, surfaced on the Activity tab (`src/dashboard.ts`,
   `healthProcessWorkoutLine`).
2. ✅ **Personal baseline layer** — `src/baselines.ts`: rolling 7/30/90-day
   mean/median/stddev/percentile range per metric, least-squares trend
   direction, and a z-score for today vs. baseline, with explicit
   sample-sufficiency flags (≥5 samples and ≥40% window coverage). Exposed
   via `GET /api/baselines`, surfaced on the Import & Settings tab.
3. ✅ **Data coverage engine** — `src/coverage.ts`: per-metric coverage
   discovered dynamically (not hardcoded) from whatever fields actually
   appear in the data, with first/last-seen dates and staleness. Exposed
   via `GET /api/coverage`, surfaced on the Import & Settings tab.
4. ✅ **"Ask my health data"** — `src/query.ts` (whitelisted metric/date
   range/aggregation, deterministic math) + `src/ai.ts`'s
   `answerHealthQuestion()` (two-call round trip: model picks the query
   spec, we compute it, model turns the number into a sentence — it never
   sees raw records or does arithmetic). `POST /api/ask`, box on the
   Overview tab. Note from wiring this up: a raw JSON dump as context
   confuses some free-tier models into chatting instead of returning JSON;
   a plain-English description of the result works far more reliably.
5. ✅ **Correlation discovery + anomaly detection** — `src/correlations.ts`
   (Pearson r over a fixed, hand-picked set of physiologically plausible
   pairs, not a brute-force scan — min 14 samples, min |r| 0.25 to be
   "reportable", everything else explicitly "negligible" or
   "insufficient_data") and `src/anomalies.ts` (rule-based z-score
   deviation from a personal baseline computed from days strictly before
   each candidate day — no LLM, so no invented explanations). `GET
   /api/discoveries`, surfaced on the Overview tab. Against the real
   dataset it currently reports no strong correlations and no recent
   anomalies — correctly honest, not manufactured.

6. ✅ **Weekly/monthly reports** — `src/report.ts`: a 7- or 28-day period
   vs. the immediately preceding period of the same length, per-metric %
   change with a real-move threshold (ignores <3% as noise), reusing the
   anomaly/correlation layers rather than recomputing anything. `GET
   /api/report?period=week|month`, Week/Month toggle on the Overview tab.
7. ✅ **Automated test suite** — `vitest` + `npm test`, 49 tests across
   every analytics module (`baselines`, `coverage`, `correlations`,
   `anomalies`, `query`, `analytics`, `normalize`, `report`). Includes
   regression guards for bugs actually hit earlier in this project (the
   RHR curve divide-by-zero, the `\d`-escaping parser bug's class of
   issue via the biological-age clamp test).

8. ✅ **Data export** — `src/export.ts`: CSV with dynamically discovered
   columns (same approach as coverage.ts), `extra` bag flattened into its
   own `extra.<key>` columns rather than dropped. `GET /api/export`,
   "Download CSV" button on Import & Settings. Verified: all 2,111 real
   days export correctly.
9. ✅ **Navigation IA cleanup** — Overview had accumulated AI Insights,
   Ask-my-data, the Report, and Discoveries on top of hero/stats/bests.
   Split into dedicated "AI Analyst" and "Discoveries" tabs (pure markup
   move, no logic change). Now 9 tabs total.

10. ✅ **Personal health knowledge base** — `KnowledgeNote`/`UserKnowledge`
    in `src/types.ts`, stored at `data/knowledge.json`. Goals, preferences,
    sleep target, and dated self-reported check-ins (energy/soreness 1-10,
    free text), explicitly never fed into any score. `GET`/`PUT
    /api/knowledge`, `POST`/`DELETE /api/knowledge/notes`, "Goals & notes"
    card on Import & Settings. Verified live end to end.

11. ✅ **Personal experiments tracking** — `src/experiments.ts`:
    before/after comparison (baseline = same-length period immediately
    before the experiment start), adherence check-ins capped at 100%, a
    fixed confounder caveat on every result — never implies causation.
    CRUD via `/api/experiments` (+ `/api/experiments/adherence`),
    "Experiments" card on the Discoveries tab. Caught a real `\'`/`\\'`
    escaping bug while wiring the two onclick handlers (same class as the
    earlier `\d`/`\n` bugs) — fixed before deploy, by actually rendering
    and `node --check`ing the compiled script rather than eyeballing it.

Every item from the original mission brief's analytics/AI/reporting scope
now has a real, working foundation (full list above). What's genuinely
still open:

- **AI-generated chart specs from natural language** — the one AI
  capability from the original brief not yet built. Would extend the
  "ask my health data" pattern: model picks a chart type + metric(s) +
  date range from a whitelist, the app renders it with the existing
  Chart.js infrastructure, never executes generated code.
- **Workout `<Route>`/GPS data, ECG, and `<ActivitySummary>` Activity
  Ring data** — `<Workout>` sessions are parsed, but not these related
  export elements.
- ✅ **Multi-day/overnight sleep splitting — fixed.** Sleep records
  starting at 18:00 or later are now attributed to the following
  calendar day (the wake date), matching Apple Health's own convention,
  instead of splitting one night across two dates. Requires a re-import
  to apply to already-stored historical data.
- Experiments and knowledge-base notes have no UI test coverage beyond
  the deterministic computation layer (`experiments.ts` itself is
  tested; the dashboard wiring around it is only manually verified).
