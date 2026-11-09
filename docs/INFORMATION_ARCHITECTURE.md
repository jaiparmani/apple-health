# Information Architecture

## Navigation: 4 Primary Tabs

### 1. TODAY (default)
- Health verdict (readiness ring + AI one-liner)
- Three pillars: Activity, Sleep, Recovery (tap → Level 2)
- Daily pulse orbs (lifestyle logging)
- Today's focus (max 3 AI recommendations)

### 2. HEALTH (drill-down categories)
Sub-categories, each with Level 1 → 2 → 3 pattern:

**Sleep**
- L1: Duration ring + quality indicator
- L2: Stages, consistency, trend, personal baseline
- L3: Charts (7d/30d/90d), raw data, AI interpretation

**Heart & Recovery**
- L1: HRV + RHR status indicators
- L2: VO2 max trend, HR zones, recovery factors
- L3: Full charts, correlation analysis, historical comparison

**Activity**
- L1: Activity rings (Move/Exercise/Stand)
- L2: Steps, workouts, active energy, consistency
- L3: Workout history, exercise progression, muscle map

**Body**
- L1: Weight trend + body score
- L2: Composition, mobility metrics, symmetry
- L3: Full body analysis, muscle volume, bio age

### 3. TRENDS
- Weekly recap (auto-generated story card)
- Monthly overview (long-view metrics)
- Heatmap (selectable metric, multi-year)
- Then vs now comparison
- Milestones & personal records
- Streak tracking

### 4. AI
- Today's insights (structured verdict format)
- Patterns & discoveries
- Ask AI (free-form questions)
- Experiments (self-tracking A/B tests)

## Progressive Disclosure Pattern
Every visualization supports three levels:

**Level 1 — Glance** (visible by default)
Minimal visual: a ring, an arc, a number with color-coded status.

**Level 2 — Explore** (tap to reveal)
Supporting metrics, personal baseline comparison, recent trend, one-liner meaning.

**Level 3 — Deep Dive** (full detail screen)
Charts with time range selectors, raw values, AI interpretation, correlations, best/worst.

## Data Flow
```
Apple Health → iOS Shortcut → /ingest → GitHub JSON → /api/series
                                                    → /api/analytics
                                                    → /api/trends
                                                    → /api/fitness
                                                    → /api/baselines
                                                    → /api/premium
                                                    → LLM Gateway → /api/insights
```
