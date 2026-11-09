# Current Product Audit

## Architecture
- **Platform**: Cloudflare Workers (Wrangler deploy)
- **Single-file UI**: `src/dashboard.ts` (8,357 lines) — renders full HTML/CSS/JS
- **Backend**: `src/index.ts` (~1,600 lines) — API routes, GitHub data storage, AI review pipeline
- **Data source**: Apple Health export → iOS Shortcut → `/ingest` endpoint → GitHub repo JSON files
- **AI pipeline**: LLM Gateway (Cloudflare service binding) with KV-cached reviews (1-hour TTL)
- **Auth**: Bearer token (localStorage)

## Navigation Structure
Two primary views with sub-navigation:

### Home (Dashboard)
- Overview (hero ring, dash row, pulse orbs, coach line)
- Coach (AI-generated directive)
- Goals & activity
- Heart & recovery
- Sleep
- Training
- Activity
- Records
- Weekly story

### Explore
- Ask AI (free-form chat)
- Discoveries (AI pattern detection)
- Workouts (manual logger + templates)
- Body analysis (muscle map, body composition)
- Bio age
- Long view (monthly trends)
- Day explorer
- All metrics
- Insights (strain vs recovery scatter, workout types, seasonal)
- Extra (overflow metrics)
- Settings

## Health Metrics Captured (DailyMetrics)
### Heart & Recovery
restingHeartRate, heartRateAvg, heartRateMin, heartRateMax, walkingHeartRateAvg, hrv (SDNN), respiratoryRate, oxygenSaturation, bodyTemperature, vo2max

### Activity
steps, activeEnergy, basalEnergy, exerciseMinutes, standMinutes, flightsClimbed, distanceKm, distanceCyclingKm, daylightMinutes, mindfulMinutes

### HR Zones
hrZone1Min through hrZone5Min

### Mobility / Gait
walkingSpeed, walkingStepLength, walkingAsymmetryPct, walkingDoubleSupportPct

### Sleep
sleepHours, sleepEfficiency, sleepCoreHours, sleepDeepHours, sleepRemHours, sleepAwakeHours, sleepInBedHours

### Body
weightKg, bodyFatPct, bloodPressureSystolic/Diastolic, bloodGlucose

### Derived
strain (0-21 WHOOP-style), workoutCount/Minutes/Energy/DistanceKm/Type/Strains, activity ring goals

### Extra
Catch-all `extra` field for every other HealthKit type (nothing silently dropped)

## Existing Visualizations
- **Hero ring**: 150px SVG recovery/readiness score (0-100)
- **Dash row**: 3 mini gauges (Activity rings, Sleep arc, Strain ring)
- **Pulse orbs**: 6 tap-to-log lifestyle inputs (alcohol, caffeine, water, energy, stress, soreness)
- **Activity rings**: Apple-style 3-ring (Move/Exercise/Stand)
- **Sleep arch**: Horizontal stage bar (core/deep/REM/awake)
- **Body silhouette**: Interactive front/back muscle map with volume highlighting
- **Body score ring**: Animated gradient ring
- **Heatmap**: GitHub-style year grid (selectable metric)
- **Sparklines**: Inline SVG trend lines in stat cells
- **Chart.js charts**: HR trends, weight, sleep, strain vs recovery scatter, workout types
- **Metric detail sheets**: Full-screen slide-up with chart, histogram, best/worst, correlations

## AI Features
- 8 review domains: today, weekly, longterm, training, recovery, activity, sleep, discoveries
- Ask AI: Free-form question → LLM with health context
- Chart generation: AI-powered chart spec → Chart.js render
- Coach: Daily AI directive (one action)
- Experiments: A/B self-tracking with before/after analysis
- Alerts: Anomaly detection with urgency levels
- Recommendations: Sleep protocol, lifestyle impacts, recovery countdowns

## Key Issues (matching user's complaints)
1. **20+ sections** all visible under Home — massive scroll
2. **Two views** but Home alone has 9 sub-sections, Explore has 11
3. **Verbose AI reviews** rendered as paragraph text
4. **Duplicate presentations**: recovery shown in hero ring, readiness ring, recovery breakdown, quick stats, verdict detail
5. **Every metric treated equally**: quick stats grid shows everything simultaneously
6. **Heavy text**: guides, actions, meanings under every metric
7. **Many card types**: workout cards, fitness cards, story cards, recap cards, etc.
8. **User must interpret numbers**: raw values without personal baseline context
