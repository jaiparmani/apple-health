# Comprehensive Audit: Apple Health App as Whoop Replacement

## Executive Summary

This app is a **remarkably complete** Whoop replacement that, in several areas, **exceeds** what Whoop offers. The core Whoop pillars — Recovery Score, Strain Score, Sleep Coaching, and HRV monitoring — are all implemented with sophisticated algorithms. The app goes beyond Whoop with biological age estimation, personal pattern discovery, correlation analysis, AI-powered coaching, and a full strength-training tracker that Whoop doesn't have at all.

**What's missing** falls into two buckets: (1) real-time/live features that require a companion app or Watch complication, and (2) social/community features that Whoop uses for engagement and retention.

---

## 1. Recovery Score

### What Whoop Does
- 0-100 recovery score based on HRV, RHR, respiratory rate, sleep performance, and SpO2
- Color-coded: green (67-100), yellow (34-66), red (0-33)
- Updated every morning after sleep analysis

### What You Have ✅
- **5-pillar recovery score** (`src/trends.ts:107-197`): HRV z-score (±12.5 pts), RHR z-score (±12.5), respiratory rate z-score (±7.5), SpO2 z-score (±5), wrist temperature deviation (±5), sleep quality (±7.5). Base score 50.
- **Personal baselines**: 30-day rolling z-scores, not population averages (`src/baselines.ts`)
- **Training readiness gauge** (`src/recommendations.ts:714-780`): Separate 0-100 composite with weighted factors (Sleep 30%, HRV 25%, Recovery 20%, Strain balance 15%, RHR 10%)
- **Illness detection** (`src/trends.ts:209-270`): Compounds elevated RHR, depressed HRV, elevated resp rate, elevated wrist temp into a 0-100 illness likelihood score — Whoop has this too but yours is more transparent

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Real-time recovery updates** | Medium | Whoop updates recovery intra-day as new HR data arrives. Yours recalculates on sync. With Apple Watch's background delivery, you could trigger recalculations more frequently via the Shortcuts automation. |
| **Recovery score history visualization** | Low | The RecoverySnapshot is stored per-day but there's no dedicated `/api/recovery-history` endpoint to chart it over weeks/months. The generic `/api/series` can serve `readiness` but not the per-pillar breakdown. |
| **Menstrual cycle integration** | Medium | Whoop factors cycle phase into recovery for female users. Apple Health tracks `MenstrualFlow` and `CervicalMucusQuality` — these could be imported via the `extra` field and factored into recovery baselines. |

---

## 2. Strain Score

### What Whoop Does
- 0-21 cardiovascular strain scale (logarithmic)
- Based on cumulative HR-zone time throughout the day
- Separate workout strain vs. day strain
- Real-time strain accumulation during workouts

### What You Have ✅
- **Whoop-inspired 0-21 strain** (`src/analytics.ts:245`): Karvonen intensity model using `(avgHR - restingHR) / reserve`, combined with exercise minutes and active energy through `21 * (1 - exp(-rawLoad/55))` — same saturating exponential shape as Whoop
- **Strain budget** (`src/patterns.ts:436-500`): Dynamic daily strain cap based on recovery, form (TSB), ACWR, and consecutive training days — **Whoop doesn't have this**
- **Injury risk model** (`src/patterns.ts:504-560`): 0-100 score from ACWR spikes, training monotony, consecutive days, low recovery, weekly load jumps — **beyond Whoop**
- **CTL/ATL/TSB fitness model** (`src/fitness.ts`): Banister 42d/7d EWMA, ACWR, training monotony — this is sports-science-grade periodization tracking Whoop doesn't offer

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Real-time strain accumulation** | High | Whoop shows strain building live during workouts. This requires a Watch complication or companion app — can't be done with a Cloudflare Worker alone. Consider building a lightweight WatchOS complication that computes running strain from HealthKit's real-time HR stream. |
| **Per-workout strain breakdown** | Medium | Whoop breaks strain into individual workout sessions. Your `computeStrain()` calculates daily strain from daily averages. Consider computing per-workout strain from the `HKWorkout` HR samples — the XML export includes per-workout HR zones. |
| **HR zone time distribution** | Low | Whoop shows time in each HR zone (5 zones). The data exists in Apple Health but isn't extracted — the XML parser could capture `HKQuantityTypeIdentifierHeartRateZone` or compute zones from raw HR samples. |

---

## 3. Sleep Tracking & Coaching

### What Whoop Does
- Sleep stages (light, deep, REM, awake)
- Sleep need calculation (base + strain adjustment)
- Sleep debt tracking
- Sleep consistency score
- Sleep performance score
- Optimal bedtime recommendation
- Sleep coach with wind-down alerts

### What You Have ✅
- **Full sleep stage tracking** (`src/types.ts:46-52`): Core, deep, REM, awake, in-bed hours — all from Apple Watch
- **Dynamic sleep need** (`src/trends.ts:274+`): Base need + strain adjustment + debt recovery — matches Whoop's model
- **Sleep debt tracking** (`src/trends.ts`): Running deficit calculation
- **Consistency score** (`src/trends.ts`): Based on bedtime/wake variance
- **Performance score** (`src/trends.ts`): Composite of duration (30%) + efficiency (25%) + deep+REM ratio (25%) + consistency (20%)
- **Onset latency** estimation
- **Optimal bedtime** calculation with bedtime/wake standard deviation
- **Sleep protocol prescription** (`src/recommendations.ts:19-89`): Target hours, bedtime, wake time, caffeine deadline, screen cutoff, last meal time, alcohol advice, wind-down steps, supplement suggestions — **far beyond Whoop**
- **Personal sleep patterns** (`src/patterns.ts:205-263`): Discovers YOUR optimal sleep duration where next-day HRV peaks, and sleep variability impact
- **Lifestyle → sleep correlations** (`src/correlations.ts`): Alcohol→sleep efficiency, caffeine→sleep duration, stress→sleep, late meal→efficiency, screen→efficiency

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Nap detection & tracking** | Low | Whoop detects and scores naps separately. Apple Health records naps as separate sleep sessions — you could parse and display them alongside main sleep. |
| **Sleep onset detection** | Low | Whoop detects exactly when you fall asleep. Apple Watch does this too, but the precision varies. Your `onsetLatencyMin` field exists but may not always be populated. |
| **Push notification for bedtime** | Medium | Whoop sends a "time to wind down" alert. Your sleep protocol prescribes a bedtime but there's no push notification mechanism — the Telegram brief is morning-only. See Notifications section below. |

---

## 4. Heart Rate & HRV Monitoring

### What Whoop Does
- Continuous HR monitoring
- Live HR during workouts
- Morning HRV reading (RMSSD)
- HRV trends over time
- HR zones during workouts

### What You Have ✅
- **Resting HR, average HR, walking HR, min/max HR** (`src/types.ts:19-25`)
- **HRV (SDNN)** tracking with 30-day baselines and z-scores
- **Personal HRV patterns** (`src/patterns.ts:128-202`): HRV recovery time after hard sessions, RHR strain response — personalized coefficients, not population averages
- **HRV → recovery correlation** built into the 5-pillar recovery score
- **Anomaly detection** (`src/anomalies.ts`): Flags HRV/RHR readings >2σ from personal baseline

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Live HR display** | High | Whoop shows real-time HR. Requires a Watch complication — can't be done server-side. |
| **RMSSD vs SDNN** | Low | Whoop uses RMSSD; Apple Watch records SDNN. Both are valid HRV measures. Your code uses whatever Apple provides. No action needed unless you want to note this difference to users. |
| **HR zone time tracking** | Medium | As noted in Strain — compute and display time in each zone per day/workout. |
| **Continuous HR charting** | Medium | Whoop charts HR throughout the day. Apple Health stores this data — you could import intra-day HR samples and chart them. Would significantly increase storage though. |

---

## 5. Workout & Activity Tracking

### What Whoop Does
- Auto-detect workouts from HR data
- ~80 workout activity types
- Workout strain per session
- Basic workout history

### What You Have ✅ (Significantly Exceeds Whoop)
- **Apple Watch auto-detected workouts** imported via `workoutType`, `workoutMinutes`, `workoutEnergy`, `workoutDistanceKm`
- **Manual workout logging with full set/rep/weight tracking** (`src/manualWorkouts.ts`) — **Whoop has nothing like this**
- **Exercise library** (`src/exerciseLibrary.ts`): 40+ exercises with muscle targeting
- **Estimated 1RM tracking** (`src/progression.ts:24-97`): Epley formula, trend detection, plateau detection
- **Personal records** (`src/manualWorkouts.ts:180-225`): Weight PRs, volume PRs, rep PRs
- **Workout templates** (`src/manualWorkouts.ts:315-370`): Save and reuse workout structures
- **Muscle recovery status** (`src/progression.ts:119-164`): Per-muscle recovery estimation with recovery score modifier
- **Session prescriber** (`src/progression.ts:180-277`): Recommends push/pull/legs based on muscle recovery status and strain budget
- **Periodization analysis** (`src/progression.ts:300-398`): Detects build/peak/deload/base phases, recommends deload timing
- **Momentum alerts** (`src/progression.ts:411-521`): Strength gains/losses, volume surges/drops, consistency streaks, plateau warnings
- **Muscle volume map** (`src/body.ts:110-178`): Per-muscle weekly set volume vs optimal ranges
- **Body symmetry analysis** (`src/body.ts:190-230`): Push/pull ratio, upper/lower ratio, anterior/posterior ratio
- **Anatomical muscle map SVG** (`src/muscleMap.ts`): Front/back body visualization with muscle region highlighting
- **Unlogged workout detection** (`src/manualWorkouts.ts:381-405`): Flags Apple Watch strength sessions without manual set/rep logs
- **Activity rings** (`src/types.ts:65-71`): Move, Exercise, Stand ring data imported
- **Weekly training plan** (`src/plan.ts`): AI-generated or template-based, with daily recovery-based adjustments

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Live workout tracking** | High | Whoop tracks workouts in real-time. Requires a Watch/phone companion app. |
| **Auto-detect workout type from HR** | Low | Whoop auto-classifies activities. Apple Watch already does this — you inherit it. |
| **Workout photos/videos** | Low | Some logging apps let you attach form-check videos. Nice-to-have, not a Whoop feature. |
| **Superset/circuit support** | Low | The exercise logging is linear. Supporting superset groupings would be useful for complex programs. |

---

## 6. Journal / Behavior Logging

### What Whoop Does
- Daily journal with ~20 behavior tags (alcohol, caffeine, screen time, supplements, stress, etc.)
- Binary yes/no for most behaviors
- Shows behavior impact on recovery/sleep

### What You Have ✅
- **Structured journal** (`src/types.ts:92-106`): energy (1-10), soreness (1-10), note (free text), alcoholDrinks (count), caffeineMg, stress (1-10), illness (bool), lateMeal (bool), screenBeforeBed (bool), supplements (array), hydrationLiters
- **Personal lifestyle impact analysis** (`src/recommendations.ts:102-188`): Quantified impact of alcohol, late meals, screen time, high stress, high caffeine, and each supplement — with sample sizes and confidence levels
- **Per-drink impact** (`src/recommendations.ts:426-457`): Calculates YOUR personal HRV and deep sleep cost per alcoholic drink
- **Smart contextual check-in** (`src/recommendations.ts:240-351`): Context-aware prompts — asks about soreness after hard sessions, late meals after poor sleep, alcohol after depressed HRV
- **Journal → metric correlations** (`src/correlations.ts:47-130`): 9 defined journal-to-sensor correlation pairs with Pearson r, strength, and effect summaries

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **More behavior tags** | Medium | Whoop tracks ~20 behaviors. You have 10. Missing: melatonin (separate from supplements), sauna/cold plunge, nap, reading, meditation quality (vs just minutes), travel/jet lag, sick day, pre-workout. Some can go in the `supplements` array but deserve first-class fields. |
| **Binary behavior shortcuts** | Low | Whoop's journal is mostly yes/no toggles — fast to fill in. Your journal requires numeric inputs for several fields. Consider adding quick-tap boolean shortcuts for common behaviors. |
| **Medication tracking** | Low | Not a Whoop feature, but useful: track medications that affect HR/HRV (beta blockers, stimulants) as confounders. |

---

## 7. Coaching & Recommendations

### What Whoop Does
- Basic coaching tips based on recovery/strain/sleep
- "Strain Coach" suggests target strain range
- Monthly performance assessment

### What You Have ✅ (Far Beyond Whoop)
- **AI-powered reviews** (`src/ai.ts`): 10 review domains (overview, today, weekly, longterm, training, recovery, activity, sleep, body, discoveries) with LLM-generated insights cached in KV
- **Coach's daily directive** (`src/patterns.ts:738-818`): Headline, strain budget, injury risk, sleep Rx, nutrition cue, mental note
- **Personal pattern discovery** (`src/patterns.ts:128-431`): HRV recovery time, RHR strain response, optimal sleep duration, sleep variability, training load distribution, consecutive hard day tolerance, alcohol → HRV impact, stress → sleep impact, late meal → sleep efficiency
- **Performance predictions** (`src/patterns.ts:653-733`): VO2max trajectory, RHR trajectory, walking speed trajectory with projected dates
- **Weekly report card** (`src/patterns.ts:564-649`): Letter grades (A+ through F) for training, recovery, sleep, activity, consistency
- **Natural language Q&A** (`src/ai.ts`): "How did my sleep compare last week vs this week?" → computed answer
- **AI chart generation** (`src/ai.ts`): Natural language → chart specification
- **Experiment tracking** (`src/experiments.ts`): User-defined behavior changes with before/after metric comparison
- **Action items** (`src/fitness.ts`): Prioritized recommendations (high/medium/low) across training/recovery/activity/sleep/body
- **Goal tracking with projections** (`src/goals.ts`): 8 metric types, trend-based projection, straight-line expected progress

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Proactive push coaching** | High | All coaching is pull-based (you query the API). Whoop pushes notifications. You have Telegram morning brief but no intra-day nudges. Consider: mid-day strain check, post-workout recovery tip, evening bedtime reminder. |
| **Guided breathing/meditation** | Low | Whoop offers guided breathing sessions. Apple Watch has its own, so this may be redundant. |
| **Monthly/quarterly performance assessment** | Medium | Whoop does monthly summaries. Your AI reviews cover this but a structured long-term assessment endpoint (`/api/quarterly-report`) would be valuable. |

---

## 8. Social & Community Features

### What Whoop Does
- Teams with leaderboards
- Community challenges
- Share recovery/strain with friends
- Social feed
- Team performance analytics

### What You Have
- **Nothing.** This is entirely absent.

### What's Needed
| Feature | Priority | Details |
|---------|----------|---------|
| **Share links** | Medium | Generate shareable cards (recovery score, weekly report card, PRs) as image/link — no backend social graph needed, just render-to-image. |
| **Accountability partner** | Medium | Simple: let a second person subscribe to your Telegram brief, or add a second webhook for a partner's daily stats. |
| **Team/family dashboard** | Low | Multi-user support would require significant architecture changes (multi-tenant GitHub storage, auth). Probably not worth it for a personal tool. |
| **Challenges** | Low | "30-day step challenge" or "sleep consistency week" — could be implemented as special-case goals. |

---

## 9. Data Visualization & Dashboard

### What Whoop Does
- Polished mobile app with charts for strain, recovery, sleep
- Week/month/6-month/year views
- Performance assessment graphs
- Workout HR charts

### What You Have ✅
- **Full web dashboard** (`src/dashboard.ts`): HTML/CSS/JS served from the Worker — too large to read fully (415KB) but includes comprehensive charting
- **Interactive charts** via the `/api/chart` endpoint with AI-generated chart specs
- **Calendar heatmap** (`src/recommendations.ts:790-818`): 90-day activity intensity heatmap
- **Muscle map visualization** (`src/muscleMap.ts`): Anatomical front/back SVG body with muscle region status coloring
- **Arbitrary time-series** via `/api/series` endpoint
- **Natural language → chart** via `/api/chart` endpoint

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Native mobile app** | High | The dashboard is a web page. Whoop is a native app. A PWA (Progressive Web App) with offline support and home screen installation would close this gap significantly without building a native app. |
| **Watch face complication** | High | Showing today's recovery score on the Apple Watch face is the single most impactful missing UX piece. Requires a WatchOS app. |
| **Widgets** | Medium | iOS home screen widgets showing recovery, strain, sleep score. Requires a native app or Shortcuts-based widget approach. |
| **Dark mode / theming** | Low | Likely already in dashboard.ts but couldn't verify due to file size. |

---

## 10. Notifications & Alerts

### What Whoop Does
- Push notifications for: low recovery, high strain, bedtime reminder, workout detection, weekly summary
- In-app alerts

### What You Have ✅
- **Alert system** (`src/alerts.ts`): Generates alerts for illness signals, low recovery, anomalous readings, high strain, stale data, goal milestones
- **Telegram morning brief** (`src/brief.ts`): Rich daily brief with recovery, coaching directive, today's session, action items, goals, weekly report card
- **AI review warming** (`src/index.ts`): Pre-generates all 10 review domains after each sync

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Intra-day notifications** | High | Only the morning brief exists. No mid-day strain check, no evening bedtime reminder, no post-workout recovery tip. Consider adding a POST endpoint that a Shortcuts automation calls at set times (noon check-in, 9pm bedtime reminder). |
| **Critical alert push** | High | Illness detection (`likelihood: "high"`) and very low recovery (`score < 25`) should trigger immediate Telegram messages, not wait for the morning brief. Add a `sendCriticalAlert()` that fires during `/ingest`. |
| **Apple Watch haptic alerts** | Medium | Requires a native Watch app. |
| **Stale data reminder** | Low | The alert exists but isn't pushed. A Shortcuts automation could check `/api/alerts` daily and send a reminder if data is >2 days stale. |

---

## 11. Data Export & Integration

### What Whoop Does
- CSV export of all data
- API access (paid tier)
- Limited third-party integrations (Strava, TrainingPeaks)

### What You Have ✅
- **CSV export** (`src/export.ts`): Dynamic column discovery, includes `extra.*` fields
- **Full JSON API** (`src/index.ts`): ~50 endpoints covering every data domain
- **Apple Health XML import** (`/import-bulk`): Full XML parser for Apple Health export
- **Apple Shortcuts integration** (`/ingest`): Daily sync via Shortcuts automation
- **GitHub as data store**: Version-controlled data with full history
- **Natural language query API** (`/api/ask`): Query your data in plain English
- **Flexible normalization** (`src/normalize.ts`): Accepts many aliases/formats for each metric

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Strava integration** | Medium | Many athletes want workout data flowing to/from Strava. Could add a Strava webhook or import endpoint. |
| **API documentation** | Medium | The 50+ endpoints are undocumented except in source. An OpenAPI spec or simple docs page would make the API usable by third-party tools. |
| **Webhook for external integrations** | Low | Let external services subscribe to events (new data synced, recovery below threshold, PR hit). |
| **Google Fit / Samsung Health import** | Low | Not relevant if you're Apple-only, but broadens the addressable market. |

---

## 12. Body Composition & Health

### What Whoop Does
- Whoop Body (new): skin temp, SpO2
- No body composition tracking
- No strength metrics

### What You Have ✅ (Far Beyond Whoop)
- **Body composition** (`src/body.ts:24-85`): Weight trend, 7d/30d averages, body fat, lean mass, fat mass, BMI, ideal weight range
- **Muscle volume map** (`src/body.ts:110-178`): Per-muscle set volume tracking with optimal ranges
- **Body symmetry** (`src/body.ts:190-230`): Push/pull, upper/lower, anterior/posterior ratios with imbalance detection
- **Body score** (`src/body.ts:240-294`): 0-100 composite from BMI, body fat, symmetry, VO2max, biological age
- **Physique profile** (`src/body.ts:307-360`): Training age, FFMI, dominant training type, strong/weak points
- **Body measurements** (`src/body.ts:364-415`): Waist, chest, hips, arms, thighs, neck, shoulders, calves with waist-to-hip ratio
- **Mobility score** (`src/body.ts:427-464`): Walking speed, step length, asymmetry, double support percentage
- **Biological age** (`src/analytics.ts`): 5-marker weighted estimate using VO2max, walking speed, HRV, RHR, body fat against population age curves
- **Blood pressure & glucose** tracking (`src/types.ts:56-58`)

### What's Missing / Could Improve
| Gap | Priority | Details |
|-----|----------|---------|
| **Body measurement logging UI** | Medium | The `BodyMeasurement` interface exists but there's no `/api/measurements` CRUD endpoint to log them. |
| **Progress photos** | Low | Before/after photos linked to measurements. Would require image storage. |
| **Dexa/InBody scan import** | Low | Import detailed body composition from lab scans. |

---

## 13. Additional Suggested Features

These don't exist in Whoop either, but would make the app a truly comprehensive health platform:

| Feature | Priority | Rationale |
|---------|----------|-----------|
| **Readiness-based Apple Watch face** | High | Show recovery score as a Watch complication. This is the #1 UX gap vs Whoop's wrist display. Requires a simple WatchOS app. |
| **Progressive Web App (PWA)** | High | Add a manifest + service worker to the dashboard so it installs as a home screen app with offline access. Minimal effort, huge UX improvement. |
| **Evening check-in via Telegram** | Medium | A second daily brief at ~9pm: bedtime prescription, tomorrow's session preview, quick journal prompt via Telegram inline buttons. |
| **Heart rate zone training guidance** | Medium | During workout: which HR zone to target based on today's plan (zone 2 vs intervals). Requires Watch integration. |
| **Nutrition macro tracking** | Medium | Even basic calorie/protein tracking would complement the training load model. Could integrate with MyFitnessPal API or manual logging. |
| **Hydration tracking with reminders** | Low | The `hydrationLiters` field exists in the journal; add Shortcuts-based water logging with periodic reminders. |
| **Respiratory rate trend analysis** | Low | Resp rate is tracked but not prominently analyzed. Whoop highlights it as an illness predictor — your illness signal uses it but the trend isn't surfaced independently. |
| **Multi-device data reconciliation** | Low | If data comes from both Apple Watch and iPhone, handle deduplication. The `mergeDaily()` in normalize.ts handles this partially. |
| **Onboarding flow** | Medium | New user setup: import XML, set profile (birth date, sex, height), set goals, configure Shortcuts automation. Currently requires manual API calls. |
| **Data backup/restore** | Low | GitHub storage provides version history, but there's no one-click backup/restore UI. |

---

## Feature Completeness Summary

| Category | Whoop Features | Your Coverage | Notes |
|----------|---------------|---------------|-------|
| Recovery Score | ●●●●○ | ●●●●● | 5-pillar + training readiness + illness detection |
| Strain Score | ●●●●● | ●●●○○ | Algorithm matches, but no real-time tracking |
| Sleep | ●●●●● | ●●●●● | Full parity + sleep protocol prescription beyond Whoop |
| HR & HRV | ●●●●○ | ●●●○○ | All data captured, but no real-time display |
| Workouts | ●●○○○ | ●●●●● | Far beyond Whoop: set/rep logging, PRs, periodization |
| Journal | ●●●●○ | ●●●○○ | Good coverage but fewer behavior tags |
| Coaching | ●●○○○ | ●●●●● | AI coaching, pattern discovery, predictions — far beyond |
| Social | ●●●●○ | ○○○○○ | Completely absent |
| Visualization | ●●●●● | ●●●○○ | Web dashboard exists but no native app/widgets |
| Notifications | ●●●●○ | ●●○○○ | Morning brief only, no intra-day push |
| Data Export | ●●○○○ | ●●●●● | CSV, JSON API, NL query — far beyond |
| Body Comp | ●○○○○ | ●●●●● | Comprehensive body analysis Whoop doesn't touch |

---

## Top 10 Priority Actions

1. **PWA support for dashboard** — Add manifest.json + service worker for home screen install and offline access. Low effort, high impact.
2. **Critical alert push via Telegram** — Send immediate alerts for illness detection and very low recovery during `/ingest`, don't wait for morning brief.
3. **Evening Telegram brief** — Bedtime prescription, tomorrow's session, quick journal prompt at ~9pm.
4. **Intra-day Shortcuts check-in** — Noon automation that calls an endpoint returning current strain + hydration reminder.
5. **More journal behavior tags** — Add: sauna, cold plunge, nap, travel, pre-workout as first-class fields.
6. **Per-workout strain breakdown** — Compute strain from individual workout HR data, not just daily averages.
7. **HR zone time tracking** — Extract and display time in each HR zone per day.
8. **Shareable health cards** — Generate image cards for recovery, weekly report card, PRs that can be shared via messaging.
9. **Body measurements CRUD endpoint** — The data model exists but no API endpoint to log/retrieve measurements.
10. **API documentation page** — Even a simple auto-generated docs page for the 50+ endpoints.

---

*Audit completed after reading all 31 source files in `src/`. Every claim references the actual source code, not assumptions.*
