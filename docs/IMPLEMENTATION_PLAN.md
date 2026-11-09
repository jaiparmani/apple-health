# Implementation Plan

## Phase 1: Redesign Today Screen
- Simplify to: verdict ring → three pillars → pulse orbs → today's focus
- Remove all collapsed sections from home view
- Refine hero ring interaction (tap → structured explain card)
- Today's Focus: max 3 AI-driven recommendations with verdict/action format
- Staggered entry animations (already started)

## Phase 2: New Navigation (4 tabs)
- Replace 2-tab (Dashboard/Explore) with 4-tab (Today/Health/Trends/AI)
- Today: minimal overview
- Health: category drill-downs with progressive disclosure
- Trends: heatmaps, milestones, long-view, weekly story
- AI: insights, discoveries, ask, experiments

## Phase 3: Health Category Screens
- Build reusable metric card component with L1/L2/L3 levels
- Sleep detail screen
- Heart & Recovery detail screen
- Activity detail screen
- Body detail screen
- Each uses existing metric-sheet slide-up for L3

## Phase 4: Rework AI Presentation
- Convert verbose AI reviews to structured format: Verdict → Evidence → Action → Confidence
- Default: show only verdict pill + action line
- Tap "Why?" → evidence list
- Tap "Explore" → full AI text
- Prioritize insights by deviation magnitude and actionability

## Phase 5: Trend Visualizations
- Consolidate weekly story, heatmap, records, milestones into Trends tab
- Add then-vs-now comparison cards
- Weekly recap with sparklines

## Phase 6: Polish & Performance
- Reduce-motion media query support
- Test missing-data states
- Light/dark mode (currently dark-only — keep dark-only per existing design)
- Verify all existing integrations still work
- Performance audit on animations

## Implementation Notes
- All changes in `src/dashboard.ts` (single-file architecture)
- No backend API changes needed
- Existing data fetching/rendering functions are reused, just re-organized
- Progressive disclosure wraps existing render functions, doesn't replace them
