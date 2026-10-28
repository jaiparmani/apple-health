/**
 * "What does this number mean, and what do I do about it?" for every metric
 * the dashboard shows. Pure data, so it's unit-testable here AND serialised
 * straight into the dashboard page (no duplicated copy client-side).
 *
 * Each rule is checked in order; the first whose condition matches the
 * current value supplies the status + action. `fallback` covers a value no
 * rule matched (or a missing value).
 */

export type GuideStatus = "good" | "ok" | "watch" | "bad";

export interface GuideRule {
  op: "<" | "<=" | ">" | ">=";
  value: number;
  status: GuideStatus;
  action: string;
}

export interface MetricGuideEntry {
  label: string;
  meaning: string;
  rules: GuideRule[];
  fallback: string;
}

export const METRIC_GUIDE: Record<string, MetricGuideEntry> = {
  // ---------------- Heart & recovery ----------------
  restingHeartRate: {
    label: "Resting heart rate",
    meaning: "Heartbeats per minute at rest. Lower usually means a fitter heart. A jump of 3-5 bpm signals stress or illness.",
    rules: [
      { op: "<", value: 50, status: "good", action: "Athlete range. Watch for sudden jumps, not the number." },
      { op: "<", value: 60, status: "good", action: "Strong. Keep 2-3 cardio sessions a week." },
      { op: "<", value: 70, status: "ok", action: "Average. Easy cardio 3x a week drops it 3-6 bpm in 3 months." },
      { op: ">=", value: 70, status: "watch", action: "High. Add easy cardio 3x a week; cut late caffeine and alcohol." },
    ],
    fallback: "Wear your Watch to bed to record it.",
  },
  hrv: {
    label: "HRV",
    meaning: "Variation between heartbeats. Higher than your normal means recovered. Only compare it to yourself.",
    rules: [
      { op: "<", value: 20, status: "watch", action: "Low. Sleep early, hydrate, keep today easy." },
      { op: "<", value: 40, status: "ok", action: "Train as planned. If low for 3+ days, go easy." },
      { op: ">=", value: 40, status: "good", action: "Healthy. Steady sleep and cardio keep it here." },
    ],
    fallback: "Your Watch records HRV mostly while you sleep.",
  },
  heartRateAvg: {
    label: "Average heart rate",
    meaning: "Mean of all heart-rate readings today. Mostly tracks how active you were.",
    rules: [{ op: ">", value: 100, status: "watch", action: "High for a whole day. Check for illness, heat or stress." }],
    fallback: "Read it alongside steps and exercise.",
  },
  walkingHeartRateAvg: {
    label: "Walking heart rate",
    meaning: "Heart rate while walking. It drops as you get fitter.",
    rules: [
      { op: "<", value: 95, status: "good", action: "Efficient. Keep walking daily." },
      { op: ">=", value: 95, status: "ok", action: "Drops with 150+ minutes of easy cardio a week." },
    ],
    fallback: "Needs walking data from your iPhone or Watch.",
  },
  vo2max: {
    label: "VO2max",
    meaning: "How much oxygen your body can use. The best single measure of cardio fitness and longevity.",
    rules: [
      { op: "<", value: 35, status: "bad", action: "Low. Add 2 easy cardio sessions and 1 interval session a week." },
      { op: "<", value: 42, status: "watch", action: "Average. One weekly 4×4-minute interval session moves it up." },
      { op: "<", value: 50, status: "good", action: "Good. Keep 1 hard and 2 easy cardio sessions a week." },
      { op: ">=", value: 50, status: "good", action: "Excellent. Keep training; it drops ~10% a decade without it." },
    ],
    fallback: "Do a 20-minute brisk outdoor walk or run weekly to get readings.",
  },
  respiratoryRate: {
    label: "Breathing rate",
    meaning: "Breaths per minute while asleep. A rise of 2+ is an early illness sign.",
    rules: [{ op: ">", value: 20, status: "watch", action: "High. Rest if your heart rate is also up." }],
    fallback: "Watch for jumps against your normal.",
  },
  oxygenSaturation: {
    label: "Blood oxygen",
    meaning: "How much oxygen your blood carries. 95-100% is normal.",
    rules: [
      { op: "<", value: 0.92, status: "bad", action: "Low. Re-measure at rest. If still under 92%, see a doctor." },
      { op: "<", value: 0.95, status: "watch", action: "Slightly low, often a bad reading. Re-measure." },
      { op: ">=", value: 0.95, status: "good", action: "Normal." },
    ],
    fallback: "Turn on Blood Oxygen on your Watch.",
  },
  readiness: {
    label: "Readiness",
    meaning: "0-100. Today's HRV, resting heart rate and sleep vs your 30-day normal.",
    rules: [
      { op: ">=", value: 70, status: "good", action: "Recovered. Do your hardest session today." },
      { op: ">=", value: 45, status: "ok", action: "Train, but keep it moderate." },
      { op: "<", value: 45, status: "bad", action: "Recover. Walk or stretch, and sleep early." },
    ],
    fallback: "Needs about 5 days of heart data.",
  },
  strain: {
    label: "Strain",
    meaning: "0-21 load on your heart today. 14 is far harder than 7.",
    rules: [
      { op: ">=", value: 18, status: "watch", action: "All-out day. Go light tomorrow." },
      { op: ">=", value: 14, status: "good", action: "Hard day. Sleep well; avoid 3 in a row." },
      { op: ">=", value: 8, status: "good", action: "Solid training day." },
      { op: "<", value: 8, status: "ok", action: "Light day. Room to push if you're recovered." },
    ],
    fallback: "Needs heart-rate data for the day.",
  },

  // ---------------- Activity ----------------
  steps: {
    label: "Steps",
    meaning: "Everyday movement. Health benefits climb to ~8,000 a day, then level off.",
    rules: [
      { op: ">=", value: 10000, status: "good", action: "Top tier. Keep it up." },
      { op: ">=", value: 8000, status: "good", action: "In the high-benefit zone." },
      { op: ">=", value: 5000, status: "ok", action: "Walk 10 minutes after lunch and dinner." },
      { op: "<", value: 5000, status: "bad", action: "Too little. Add a daily 20-minute walk." },
    ],
    fallback: "Carry your phone or wear your Watch.",
  },
  activeEnergy: {
    label: "Active calories",
    meaning: "Calories burned by moving (your Move ring).",
    rules: [
      { op: ">=", value: 600, status: "good", action: "Big day. Eat and sleep enough to match." },
      { op: ">=", value: 350, status: "good", action: "Solid output." },
      { op: "<", value: 350, status: "ok", action: "Low. Walking is the easiest way up." },
    ],
    fallback: "Recorded by your Watch.",
  },
  exerciseMinutes: {
    label: "Exercise minutes",
    meaning: "Minutes at brisk-walk effort or harder. Target: 150 a week (~22 a day).",
    rules: [
      { op: ">=", value: 45, status: "good", action: "Well above target." },
      { op: ">=", value: 22, status: "good", action: "On pace for 150 a week." },
      { op: "<", value: 22, status: "watch", action: "Behind pace. Walk faster or add a 20-minute session." },
    ],
    fallback: "Recorded by your Watch.",
  },
  standMinutes: {
    label: "Stand minutes",
    meaning: "Time on your feet. Long sitting is a risk even if you exercise.",
    rules: [{ op: "<", value: 60, status: "watch", action: "Stand and move 2-3 minutes every hour." }],
    fallback: "Break up sitting every hour.",
  },
  standHours: {
    label: "Stand hours",
    meaning: "Hours with at least a minute of standing.",
    rules: [
      { op: ">=", value: 10, status: "good", action: "Good." },
      { op: "<", value: 10, status: "watch", action: "Set a 50-minute stand reminder at work." },
    ],
    fallback: "Recorded by your Watch.",
  },
  flightsClimbed: {
    label: "Flights climbed",
    meaning: "Floors climbed. Short, hard work for legs and heart.",
    rules: [
      { op: ">=", value: 10, status: "good", action: "Great bonus training." },
      { op: "<", value: 10, status: "ok", action: "Take the stairs when you can." },
    ],
    fallback: "Take the stairs when you can.",
  },
  distanceKm: {
    label: "Distance",
    meaning: "Distance walked and run.",
    rules: [],
    fallback: "The trend matters more than any one day.",
  },
  workoutMinutes: {
    label: "Workout minutes",
    meaning: "Time in logged workouts.",
    rules: [],
    fallback: "Log sessions in the Workout app to track training.",
  },
  daylightMinutes: {
    label: "Daylight",
    meaning: "Time outside in daylight. Morning light improves sleep and mood.",
    rules: [
      { op: ">=", value: 30, status: "good", action: "Good. Mornings count most." },
      { op: "<", value: 30, status: "watch", action: "Get 10-20 minutes outside within an hour of waking." },
    ],
    fallback: "Get outside in the morning.",
  },

  // ---------------- Mobility / gait ----------------
  walkingSpeed: {
    label: "Walking speed",
    meaning: "Your everyday pace. A strong marker of physical age. Above 1.3 m/s is strong.",
    rules: [
      { op: ">=", value: 1.3, status: "good", action: "Strong. Strength-train legs twice a week to keep it." },
      { op: ">=", value: 1.1, status: "ok", action: "Add leg strength twice a week and some brisk walks." },
      { op: "<", value: 1.1, status: "watch", action: "Slow. Prioritise leg strength and brisk walking." },
    ],
    fallback: "Measured by your iPhone in a pocket.",
  },
  walkingStepLength: {
    label: "Step length",
    meaning: "Average stride. A shrinking stride often means stiff hips or weak legs.",
    rules: [],
    fallback: "Hip mobility and glute work keep it long.",
  },
  walkingAsymmetryPct: {
    label: "Walking asymmetry",
    meaning: "How uneven your left and right steps are. Under 3% is normal.",
    rules: [
      { op: "<=", value: 0.03, status: "good", action: "Normal." },
      { op: ">", value: 0.03, status: "watch", action: "Uneven. Check for a niggle; add single-leg exercises." },
    ],
    fallback: "Measured by your iPhone.",
  },
  walkingDoubleSupportPct: {
    label: "Double support",
    meaning: "Time with both feet on the ground. Lower means steadier balance.",
    rules: [
      { op: "<=", value: 0.3, status: "good", action: "Steady." },
      { op: ">", value: 0.3, status: "watch", action: "Practise balance: single-leg stands, a few minutes daily." },
    ],
    fallback: "Measured by your iPhone.",
  },

  // ---------------- Sleep ----------------
  sleepHours: {
    label: "Sleep",
    meaning: "Time asleep. 7-9 hours is where recovery works best.",
    rules: [
      { op: ">=", value: 7, status: "good", action: "On target. Keep the same bedtime, weekends too." },
      { op: ">=", value: 6, status: "watch", action: "Short. Go to bed 30 minutes earlier." },
      { op: "<", value: 6, status: "bad", action: "Too little. Bed 45-60 minutes earlier; train easy." },
    ],
    fallback: "Wear your Watch to bed with Sleep Focus on.",
  },
  sleepEfficiency: {
    label: "Sleep efficiency",
    meaning: "Time asleep vs time in bed. 85%+ is healthy.",
    rules: [
      { op: ">=", value: 0.85, status: "good", action: "Efficient." },
      { op: "<", value: 0.85, status: "watch", action: "Go to bed only when sleepy; keep the room cool and dark." },
    ],
    fallback: "Needs in-bed and asleep data.",
  },
  sleepDeepHours: {
    label: "Deep sleep",
    meaning: "Physical repair sleep. Usually 13-23% of the night.",
    rules: [],
    fallback: "Helped by steady bedtimes, no late alcohol, a cool room.",
  },
  sleepRemHours: {
    label: "REM sleep",
    meaning: "Dream sleep, for memory and mood. Mostly late in the night.",
    rules: [],
    fallback: "Protect your wake-up time; alcohol cuts REM.",
  },

  // ---------------- Body ----------------
  weightKg: {
    label: "Weight",
    meaning: "Daily swings of 1-2 kg are water. Only the 2-week trend counts.",
    rules: [],
    fallback: "Weigh each morning; judge the 2-week average.",
  },
  bodyFatPct: {
    label: "Body fat",
    meaning: "Share of weight that is fat. Scales are noisy; watch the monthly trend.",
    rules: [],
    fallback: "Lower it with a small calorie deficit, high protein and strength training.",
  },
  bloodPressureSystolic: {
    label: "Blood pressure (top)",
    meaning: "Under 120 is normal. 130+ is high.",
    rules: [
      { op: "<", value: 120, status: "good", action: "Normal." },
      { op: "<", value: 130, status: "watch", action: "Elevated. More cardio, less salt and alcohol." },
      { op: ">=", value: 130, status: "bad", action: "High. Re-measure seated; if still 130+, see a doctor." },
    ],
    fallback: "Log readings from a blood-pressure cuff.",
  },
  bloodGlucose: {
    label: "Blood glucose",
    meaning: "Blood sugar. 70-99 mg/dL fasting is normal.",
    rules: [
      { op: "<", value: 100, status: "good", action: "Normal." },
      { op: ">=", value: 100, status: "watch", action: "Walk 10 minutes after meals. See a doctor if it stays 100+." },
    ],
    fallback: "Log readings from a meter or CGM.",
  },
  biologicalAge: {
    label: "Biological age",
    meaning: "An estimate from VO2max, walking speed, HRV, resting heart rate and body fat. Track your trend; it isn't a clinical test.",
    rules: [
      { op: "<", value: 0, status: "good", action: "Younger than your years. Work on your oldest marker next." },
      { op: ">=", value: 0, status: "watch", action: "See which marker is oldest on the Biological Age tab. Start there." },
    ],
    fallback: "Add your birth date in Settings.",
  },

  // ---------------- Extras from the export ----------------
  PhysicalEffort: {
    label: "Physical effort",
    meaning: "Effort in METs. 3+ is moderate, 6+ is vigorous.",
    rules: [],
    fallback: "More minutes above 3 METs is the goal.",
  },
  HeadphoneAudioExposure: {
    label: "Headphone volume",
    meaning: "Average headphone level. Long listening above 80 dB damages hearing.",
    rules: [
      { op: "<", value: 80, status: "good", action: "Safe." },
      { op: ">=", value: 80, status: "watch", action: "Turn it down; hearing damage is permanent." },
    ],
    fallback: "",
  },
  SixMinuteWalkTestDistance: {
    label: "Six-minute walk",
    meaning: "How far you could walk in 6 minutes. 500 m+ is good.",
    rules: [
      { op: ">=", value: 500, status: "good", action: "Good." },
      { op: "<", value: 500, status: "watch", action: "Build it with brisk walks and leg strength." },
    ],
    fallback: "",
  },
  StairAscentSpeed: {
    label: "Stair climbing speed",
    meaning: "How fast you climb stairs. Reflects leg power.",
    rules: [],
    fallback: "Step-ups and stair climbs keep it up.",
  },
  StairDescentSpeed: {
    label: "Stair descent speed",
    meaning: "How fast you go down stairs. Reflects balance.",
    rules: [],
    fallback: "Balance and slow-lowering leg work help.",
  },
  AppleStandHourCount: {
    label: "Stand hours",
    meaning: "Hours with at least a minute standing.",
    rules: [],
    fallback: "Aim for 10-12.",
  },
  EnvironmentalAudioExposure: {
    label: "Noise around you",
    meaning: "Average ambient noise. Constant noise above ~70 dB hurts sleep and stress.",
    rules: [{ op: ">=", value: 80, status: "watch", action: "Loud. Consider ear protection." }],
    fallback: "",
  },
};

export interface GuideResult {
  meaning: string;
  status: GuideStatus | null;
  action: string;
}

function matches(rule: GuideRule, v: number): boolean {
  switch (rule.op) {
    case "<":
      return v < rule.value;
    case "<=":
      return v <= rule.value;
    case ">":
      return v > rule.value;
    case ">=":
      return v >= rule.value;
  }
}

export function guideFor(key: string, value: number | null | undefined): GuideResult | null {
  const entry = METRIC_GUIDE[key];
  if (!entry) return null;
  if (typeof value === "number" && !Number.isNaN(value)) {
    const rule = entry.rules.find((r) => matches(r, value));
    if (rule) return { meaning: entry.meaning, status: rule.status, action: rule.action };
  }
  return { meaning: entry.meaning, status: null, action: entry.fallback };
}

/**
 * How each metric is displayed on its detail page: unit, decimals, whether
 * it's stored as a 0-1 fraction (shown as %), and which direction is better
 * (null = neither, e.g. weight). Serialised into the dashboard with
 * METRIC_GUIDE.
 */
export interface MetricFormat {
  unit: string;
  dp: number;
  pct?: boolean;
  better: "up" | "down" | null;
}

export const METRIC_FORMAT: Record<string, MetricFormat> = {
  restingHeartRate: { unit: "bpm", dp: 0, better: "down" },
  hrv: { unit: "ms", dp: 0, better: "up" },
  heartRateAvg: { unit: "bpm", dp: 0, better: null },
  walkingHeartRateAvg: { unit: "bpm", dp: 0, better: "down" },
  vo2max: { unit: "ml/kg/min", dp: 1, better: "up" },
  respiratoryRate: { unit: "/min", dp: 1, better: null },
  oxygenSaturation: { unit: "%", dp: 1, pct: true, better: "up" },
  steps: { unit: "", dp: 0, better: "up" },
  activeEnergy: { unit: "kcal", dp: 0, better: "up" },
  exerciseMinutes: { unit: "min", dp: 0, better: "up" },
  standMinutes: { unit: "min", dp: 0, better: "up" },
  standHours: { unit: "h", dp: 0, better: "up" },
  flightsClimbed: { unit: "", dp: 0, better: "up" },
  distanceKm: { unit: "km", dp: 1, better: "up" },
  workoutMinutes: { unit: "min", dp: 0, better: "up" },
  daylightMinutes: { unit: "min", dp: 0, better: "up" },
  walkingSpeed: { unit: "m/s", dp: 2, better: "up" },
  walkingStepLength: { unit: "cm", dp: 1, better: "up" },
  walkingAsymmetryPct: { unit: "%", dp: 1, pct: true, better: "down" },
  walkingDoubleSupportPct: { unit: "%", dp: 1, pct: true, better: "down" },
  sleepHours: { unit: "h", dp: 1, better: "up" },
  sleepEfficiency: { unit: "%", dp: 0, pct: true, better: "up" },
  sleepDeepHours: { unit: "h", dp: 1, better: "up" },
  sleepRemHours: { unit: "h", dp: 1, better: "up" },
  weightKg: { unit: "kg", dp: 1, better: null },
  bodyFatPct: { unit: "%", dp: 1, better: "down" },
  bloodPressureSystolic: { unit: "mmHg", dp: 0, better: "down" },
  bloodGlucose: { unit: "mg/dL", dp: 0, better: "down" },
};
