# apple-health

A Cloudflare Worker that:
1. Exposes a `POST /ingest` API for an Apple Shortcut to push Health data to, and a browser-side **Import Apple Health export** flow that unzips and parses a full `export.xml` client-side (no server ever sees the raw file).
2. Stores every reading as JSON directly in this GitHub repo (no database — git is the datastore, so you get a free audit trail and history).
3. Computes a running **biological age estimate** (resting heart rate, HRV, VO2max, gait speed, body fat %), a **readiness score**, weekly trends, and personal bests from ~25 tracked metrics (heart rate range, activity, mobility/gait, sleep, body).
4. Generates **AI narrative insights** via [llm-gateway](../llm-gateway), cached for an hour so reloads are instant, with a manual retry.
5. Serves a tabbed dashboard (`GET /`) — Overview, Heart & Recovery, Activity & Mobility, Sleep, Biological Age, Import & Settings.

> The biological-age number is a transparent heuristic for tracking your *own* trend over time, built from commonly cited population-average curves (ACSM VO2max norms, HRV-by-decade references, general RHR/body-fat ranges). It is **not** a clinical or diagnostic measurement (unlike validated epigenetic clocks such as PhenoAge/GrimAge) and shouldn't be used to compare across people. See `src/analytics.ts` for the exact math.

## Data layout (in this repo)

```
data/
  daily/<YYYY-MM-DD>.json   # one file per day, full merged record
  series.json                # rolling window of recent days, used by the dashboard
  profile.json                # { birthDate, sex, heightCm } — set once via the dashboard
  analytics/
    latest.json               # most recent biological-age result
    history.json               # time series of biological-age results
```

## One-time setup

```bash
cd apple-health
npm install
npx wrangler login                 # authorize Wrangler against your Cloudflare account
npx wrangler secret put INGEST_TOKEN      # pick a long random string — this is your shared app secret
npx wrangler secret put GITHUB_TOKEN      # a GitHub PAT with contents read/write on this repo
npx wrangler secret put LLM_GATEWAY_TOKEN # client token from llm-gateway, for AI insights (optional)
```

AI insights need a KV namespace for the 1-hour cache (already provisioned in `wrangler.toml` as `INSIGHTS_CACHE` — create your own with `npx wrangler kv namespace create INSIGHTS_CACHE` and swap the id if you fork this).

Generate a token for `INGEST_TOKEN`, e.g.:

```bash
openssl rand -hex 32
```

The GitHub PAT needs **Contents: read and write** permission scoped to the `apple-health` repo (fine-grained PAT recommended). Rotate it periodically from GitHub → Settings → Developer settings → Personal access tokens.

Deploy:

```bash
npm run deploy
```

Wrangler prints your Worker URL, e.g. `https://apple-health.<your-subdomain>.workers.dev`.

## Set your profile

Open the dashboard at your Worker URL, enter your `INGEST_TOKEN` when prompted, then fill in the profile form (birth date + sex) — needed once for the biological-age calculation.

## Wiring up an Apple Shortcut

Create a Shortcut that runs on a schedule (e.g. daily via Automations) or manually:

1. **Get Health Sample** actions (or **Health > Get the latest sample of**) for each metric you want to track: Resting Heart Rate, Heart Rate Variability, VO2 Max, Step Count, Active Energy, Sleep Analysis, Body Mass, Body Fat Percentage, etc.
2. Combine them into a **Dictionary** action — one key per metric. Keys are case-insensitive and flexible; the Worker recognizes common aliases, e.g.:
   - `restingHeartRate` / `rhr`
   - `hrv` / `heartRateVariability`
   - `vo2max`
   - `steps` / `stepCount`
   - `activeEnergy` / `calories`
   - `sleepHours` / `sleepDuration`
   - `weightKg` / `weight`
   - `bodyFatPct`
3. Add a **Get Contents of URL** action:
   - URL: `https://apple-health.<your-subdomain>.workers.dev/ingest`
   - Method: `POST`
   - Headers: `Authorization: Bearer <your INGEST_TOKEN>`, `Content-Type: application/json`
   - Request Body: the Dictionary from step 2 (as JSON)
4. Run it once manually to confirm you get back `{"ok": true, ...}`, then turn it into a daily Personal Automation.

## API reference

All endpoints except `GET /` require `Authorization: Bearer <INGEST_TOKEN>`.

- `POST /ingest?source=shortcut` — body: flexible JSON dict of metrics (see aliases above). Merges into today's (or `date` field's) record, re-syncs to GitHub, recomputes analytics.
- `POST /import-bulk` — body: `{ days: [...] }`, an array of daily metric dicts. Used by the dashboard's zip-import flow; merges and bulk-commits everything in one git commit.
- `GET /api/series` — the rolling daily metrics window used by the dashboard.
- `GET /api/analytics` — `{ profileSet, latest, history }`.
- `GET /api/trends` — 7/30-day averages vs. the prior week, personal bests, step-goal streak, and today's readiness score.
- `GET /api/insights` — AI-generated `{ headline, insights, concerns, recommendations }` via llm-gateway, cached 1 hour in KV. `?force=1` bypasses the cache (the dashboard's Retry button).
- `PUT /api/profile` — body: `{ birthDate: "YYYY-MM-DD", sex: "male"|"female", heightCm?: number }`.

## Local development

```bash
npm run dev
```

Wrangler will prompt for local secrets or read them from a `.dev.vars` file (gitignored):

```
INGEST_TOKEN=dev-token
GITHUB_TOKEN=ghp_xxx
```
