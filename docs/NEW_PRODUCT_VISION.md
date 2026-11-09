# New Product Vision

## Philosophy
The app does the complexity. The user experiences the simplicity.

Open the app. Understand your health in 5 seconds:
1. How am I doing?
2. What needs attention?
3. What should I do today?

## Design Principles
- **Progressive disclosure**: Surface → Explore → Deep dive
- **Verdicts upfront**: The app interprets, the user reads the verdict
- **Visual-first**: SVG rings, arcs, and animations instead of text and cards
- **Personal baselines**: Compare to YOUR averages, not population norms
- **Minimal surface**: 4 navigation destinations, not 20 sections

## Today Screen (Default)
1. **Health verdict ring** — single dominant visual, tap to explain
2. **Three pillars** — Activity / Sleep / Recovery as mini gauges
3. **Daily pulse** — lifestyle check-in orbs (existing, refined)
4. **Today's focus** — max 3 data-grounded recommendations
5. **Nothing else** — everything else lives behind taps or in other tabs

## Navigation (4 tabs)
1. **Today** — verdict + pillars + focus
2. **Health** — category drill-downs (Sleep, Heart, Activity, Recovery, Body)
3. **Trends** — weekly/monthly/yearly views, heatmaps, milestones
4. **AI** — insights, discoveries, ask, experiments

## AI Insight Format
Every insight follows: VERDICT → EVIDENCE → ACTION → CONFIDENCE
- Default shows verdict + action only
- Tap "Why?" reveals evidence
- Tap "Explore" opens full analysis

## What Changes
- Collapse 20 sections into 4 clean tabs
- Remove verbose text blocks — replace with structured verdicts
- Remove redundant metric presentations
- Remove "extra" dump of every metric
- Promote personal baselines as the primary comparison
- All detail screens use the 3-level progressive disclosure pattern

## What's Preserved
- Every health metric remains accessible in Health drill-downs
- All API endpoints unchanged
- Workout logging system intact
- AI review pipeline unchanged (presentation reformatted)
- Knowledge notes / pulse orbs system kept
- Experiment tracking kept
- Body analysis / muscle map kept (moved to Health → Body)
