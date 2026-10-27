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
    meaning: "Your heart's beats per minute at full rest. Lower generally means a stronger, more efficient heart; a sudden rise of 3-5+ bpm over your normal flags fatigue, illness, alcohol or dehydration.",
    rules: [
      { op: "<", value: 50, status: "good", action: "Athletic range. Watch for day-to-day jumps vs your baseline rather than the absolute number." },
      { op: "<", value: 60, status: "good", action: "Strong. Maintain with 2-3 aerobic sessions a week." },
      { op: "<", value: 70, status: "ok", action: "Average. 2-3 Zone-2 sessions a week (30-45 min, conversational pace) typically lowers it 3-6 bpm over 2-3 months." },
      { op: ">=", value: 70, status: "watch", action: "Above ideal. Build aerobic base (Zone-2 cardio 3x/week), cut late alcohol/caffeine, and sleep 7+h. If it's persistently >80 at rest, mention it to a doctor." },
    ],
    fallback: "No reading yet — wear the watch overnight to get resting HR.",
  },
  hrv: {
    label: "HRV (SDNN)",
    meaning: "Heart rate variability — beat-to-beat variation, a window into nervous-system recovery. Higher vs YOUR OWN baseline = recovered; comparing absolute values with other people is meaningless.",
    rules: [
      { op: "<", value: 20, status: "watch", action: "Low. Prioritise sleep, hydration and an easy day; avoid alcohol tonight. Judge by your 7-day trend, not one reading." },
      { op: "<", value: 40, status: "ok", action: "Train as planned if it's near your normal; if it's well below your 60-day average for 3+ days, swap hard sessions for easy ones." },
      { op: ">=", value: 40, status: "good", action: "Healthy range for most adults. Keep the habits that produce it — consistent sleep and aerobic training raise it over time." },
    ],
    fallback: "No HRV readings — Apple Watch records HRV mostly during sleep and Breathe sessions.",
  },
  heartRateAvg: {
    label: "Average heart rate",
    meaning: "Mean of every heart-rate sample through the day. Mostly reflects how active you were plus background stress.",
    rules: [{ op: ">", value: 100, status: "watch", action: "High for a full-day average. If you weren't unusually active, check for illness, heat, caffeine or stress." }],
    fallback: "Context metric — read it alongside steps and exercise minutes rather than acting on it alone.",
  },
  walkingHeartRateAvg: {
    label: "Walking heart rate",
    meaning: "Average heart rate while walking. As aerobic fitness improves, the same walking pace costs fewer beats.",
    rules: [
      { op: "<", value: 95, status: "good", action: "Efficient. Keep up regular walking/aerobic work." },
      { op: ">=", value: 95, status: "ok", action: "Will drop with more easy aerobic volume — aim for 150+ min/week." },
    ],
    fallback: "Needs walking data from iPhone/Watch.",
  },
  vo2max: {
    label: "VO2max",
    meaning: "Maximum oxygen your body can use (ml/kg/min) — the single best measure of cardio fitness and one of the strongest predictors of longevity.",
    rules: [
      { op: "<", value: 35, status: "bad", action: "Low for an adult. Biggest lever available: 2-3 Zone-2 sessions + 1 interval session (4×4 min hard) per week. Expect +3-5 in 8-12 weeks." },
      { op: "<", value: 42, status: "watch", action: "Average. Add one weekly interval session (4×4 min at ~90% effort) on top of easy cardio to move up a category." },
      { op: "<", value: 50, status: "good", action: "Good. Keep 1 hard + 2-3 easy aerobic sessions a week to hold or improve it." },
      { op: ">=", value: 50, status: "good", action: "Excellent. Maintain; it declines ~10%/decade without training." },
    ],
    fallback: "Apple Watch estimates VO2max during outdoor walks/runs with GPS. Do one 20+ min brisk outdoor walk or run per week.",
  },
  respiratoryRate: {
    label: "Respiratory rate",
    meaning: "Breaths per minute during sleep. Very stable night to night — a rise of 2+ breaths/min over your normal is an early illness signal.",
    rules: [{ op: ">", value: 20, status: "watch", action: "Elevated. If it persists with high resting HR or low HRV, rest and watch for illness symptoms." }],
    fallback: "Watch for jumps vs your own normal rather than the absolute value.",
  },
  oxygenSaturation: {
    label: "Blood oxygen",
    meaning: "Share of haemoglobin carrying oxygen. 95-100% is normal at sea level.",
    rules: [
      { op: "<", value: 0.92, status: "bad", action: "Low. Re-measure sitting still; if it stays below 92%, talk to a doctor." },
      { op: "<", value: 0.95, status: "watch", action: "Slightly low — often a bad reading (loose strap, cold hands). Re-measure." },
      { op: ">=", value: 0.95, status: "good", action: "Normal. Nothing to do." },
    ],
    fallback: "Enable Blood Oxygen measurements on the Watch.",
  },
  readiness: {
    label: "Readiness",
    meaning: "0-100 recovery score: today's HRV and resting HR vs your own 30-day baseline, plus last night's sleep.",
    rules: [
      { op: ">=", value: 70, status: "good", action: "Recovered — go for your hardest planned session today." },
      { op: ">=", value: 45, status: "ok", action: "Moderately recovered. Train, but keep intensity moderate (tempo, technique, strength at RPE 7)." },
      { op: "<", value: 45, status: "bad", action: "Under-recovered. Easy movement only (walk, mobility), extra sleep tonight." },
    ],
    fallback: "Needs ~5 days of HRV/resting HR history.",
  },
  strain: {
    label: "Strain",
    meaning: "0-21 cardiovascular load for the day, from heart rate above resting, exercise minutes and active energy. Logarithmic: 14 is much harder than 7.",
    rules: [
      { op: ">=", value: 18, status: "watch", action: "All-out day. Plan a light day tomorrow and front-load sleep tonight." },
      { op: ">=", value: 14, status: "good", action: "Hard training day. Match it with good sleep; don't stack more than 2 in a row." },
      { op: ">=", value: 8, status: "good", action: "Moderate load — a solid training day." },
      { op: "<", value: 8, status: "ok", action: "Light day. Ideal for recovery; if readiness is high, you have room to train harder." },
    ],
    fallback: "Needs heart-rate data for the day.",
  },

  // ---------------- Activity ----------------
  steps: {
    label: "Steps",
    meaning: "Total daily steps — your baseline movement outside workouts. Mortality-risk benefits climb steeply up to ~7-8k/day and flatten after ~10k.",
    rules: [
      { op: ">=", value: 10000, status: "good", action: "Top tier. Maintain." },
      { op: ">=", value: 8000, status: "good", action: "In the high-benefit zone." },
      { op: ">=", value: 5000, status: "ok", action: "Add a 10-15 min walk after lunch and dinner to get past 8k." },
      { op: "<", value: 5000, status: "bad", action: "Sedentary range. Start with a fixed daily 20-min walk and take calls on your feet." },
    ],
    fallback: "Carry your phone or wear the Watch to record steps.",
  },
  activeEnergy: {
    label: "Active energy",
    meaning: "Calories burned through movement above your resting metabolism (the Move ring).",
    rules: [
      { op: ">=", value: 600, status: "good", action: "High-output day — make sure food and sleep keep up." },
      { op: ">=", value: 350, status: "good", action: "Solid daily output." },
      { op: "<", value: 350, status: "ok", action: "Low. More walking is the easiest way up; exercise adds the rest." },
    ],
    fallback: "Recorded by Apple Watch.",
  },
  exerciseMinutes: {
    label: "Exercise minutes",
    meaning: "Minutes at brisk-walk intensity or above (Exercise ring). WHO minimum is 150 min/week (~22/day); 300/week gets most of the extra benefit.",
    rules: [
      { op: ">=", value: 45, status: "good", action: "Well above the daily equivalent of WHO targets." },
      { op: ">=", value: 22, status: "good", action: "On pace for 150 min/week." },
      { op: "<", value: 22, status: "watch", action: "Below 150 min/week pace. Pick up walking pace to brisk, or add a 20-min session." },
    ],
    fallback: "Recorded by Apple Watch.",
  },
  standMinutes: {
    label: "Stand minutes",
    meaning: "Minutes spent standing. Long unbroken sitting is a risk factor independent of exercise.",
    rules: [{ op: "<", value: 60, status: "watch", action: "Stand and move for 2-3 minutes every hour you're at a desk." }],
    fallback: "Break up sitting at least once an hour.",
  },
  standHours: {
    label: "Stand hours",
    meaning: "Hours with at least 1 minute of standing (Stand ring).",
    rules: [
      { op: ">=", value: 10, status: "good", action: "Good. Keep breaking up sitting." },
      { op: "<", value: 10, status: "watch", action: "Set a 50-minute reminder to stand and walk during work hours." },
    ],
    fallback: "Recorded by Apple Watch.",
  },
  flightsClimbed: {
    label: "Flights climbed",
    meaning: "Floors climbed. Stair climbing is short, high-intensity leg and heart work.",
    rules: [
      { op: ">=", value: 10, status: "good", action: "Great incidental training." },
      { op: "<", value: 10, status: "ok", action: "Take stairs over lifts where you can — 3+ flights a few times a day adds up." },
    ],
    fallback: "Take stairs where possible.",
  },
  distanceKm: {
    label: "Walking + running distance",
    meaning: "Distance covered on foot.",
    rules: [],
    fallback: "Context for steps and workouts — trend matters more than a single day.",
  },
  workoutMinutes: {
    label: "Workout minutes",
    meaning: "Time in deliberately logged workouts (Workout app or synced apps).",
    rules: [],
    fallback: "Log sessions in the Workout app so training load and type are tracked.",
  },
  daylightMinutes: {
    label: "Time in daylight",
    meaning: "Minutes outdoors in daylight. Morning light anchors your body clock, improving sleep and mood.",
    rules: [
      { op: ">=", value: 30, status: "good", action: "Good. Morning exposure is the most valuable." },
      { op: "<", value: 30, status: "watch", action: "Get 10-20 min outside within an hour of waking." },
    ],
    fallback: "Get outside in the morning.",
  },

  // ---------------- Mobility / gait ----------------
  walkingSpeed: {
    label: "Walking speed",
    meaning: "Your habitual walking pace, measured passively. A well-replicated marker of physiological age; >1.3 m/s is strong, <1.0 m/s is a warning sign at any age.",
    rules: [
      { op: ">=", value: 1.3, status: "good", action: "Strong. Keep legs strong (2x/week squats/lunges) to hold it." },
      { op: ">=", value: 1.1, status: "ok", action: "Add lower-body strength twice a week and some deliberately brisk walks." },
      { op: "<", value: 1.1, status: "watch", action: "Slow for your age. Prioritise leg strength and brisk walking; check for pain or stiffness limiting pace." },
    ],
    fallback: "Measured by iPhone carried in a pocket.",
  },
  walkingStepLength: {
    label: "Step length",
    meaning: "Average stride length while walking. Shrinking stride over time often reflects lost hip mobility or leg strength.",
    rules: [],
    fallback: "Watch the long-term trend; hip mobility + glute strength work keeps it up.",
  },
  walkingAsymmetryPct: {
    label: "Walking asymmetry",
    meaning: "How uneven left vs right steps are. Under ~3% is typical.",
    rules: [
      { op: "<=", value: 0.03, status: "good", action: "Normal." },
      { op: ">", value: 0.03, status: "watch", action: "Elevated — check for a niggle; add single-leg strength work (split squats, single-leg RDLs)." },
    ],
    fallback: "Measured by iPhone.",
  },
  walkingDoubleSupportPct: {
    label: "Double support time",
    meaning: "Share of each step with both feet on the ground. Lower = more confident, stable gait; it rises with poor balance.",
    rules: [
      { op: "<=", value: 0.3, status: "good", action: "Stable gait." },
      { op: ">", value: 0.3, status: "watch", action: "Add balance work: single-leg stands, step-ups, a few minutes daily." },
    ],
    fallback: "Measured by iPhone.",
  },

  // ---------------- Sleep ----------------
  sleepHours: {
    label: "Sleep",
    meaning: "Total time asleep. 7-9h is where recovery, HRV, appetite control and training adaptation work best.",
    rules: [
      { op: ">=", value: 7, status: "good", action: "On target. Keep bed/wake times consistent, including weekends." },
      { op: ">=", value: 6, status: "watch", action: "Short. Move bedtime 30 min earlier; skip hard training after <6.5h." },
      { op: "<", value: 6, status: "bad", action: "Sleep-deprived. Make tonight a priority: no screens/caffeine late, bed 45-60 min earlier, easy training only." },
    ],
    fallback: "Wear the Watch to bed with Sleep Focus on to record sleep.",
  },
  sleepEfficiency: {
    label: "Sleep efficiency",
    meaning: "Time asleep ÷ time in bed. 85%+ is healthy; lower means lots of lying awake.",
    rules: [
      { op: ">=", value: 0.85, status: "good", action: "Efficient sleep." },
      { op: "<", value: 0.85, status: "watch", action: "Only go to bed when sleepy, keep the room cool/dark, and get up at the same time daily." },
    ],
    fallback: "Needs in-bed and asleep data.",
  },
  sleepDeepHours: {
    label: "Deep sleep",
    meaning: "Slow-wave sleep — physical repair and growth hormone release. Usually 13-23% of the night.",
    rules: [],
    fallback: "Increase it with consistent timing, no alcohol near bed, a cool room, and daytime exercise.",
  },
  sleepRemHours: {
    label: "REM sleep",
    meaning: "Dreaming sleep — memory and emotional processing. Concentrated in the last third of the night, so cutting sleep short hits REM hardest.",
    rules: [],
    fallback: "Protect your wake-up time; alcohol suppresses REM.",
  },

  // ---------------- Body ----------------
  weightKg: {
    label: "Weight",
    meaning: "Body weight. Day-to-day swings of 1-2 kg are water and food — only the multi-week trend means anything.",
    rules: [],
    fallback: "Weigh at the same time (morning, after the bathroom) and judge the 2-week average.",
  },
  bodyFatPct: {
    label: "Body fat",
    meaning: "Share of body weight that is fat. Smart scales are noisy — trend over months matters, not single readings.",
    rules: [],
    fallback: "Lower it with a modest calorie deficit + high protein + strength training to keep muscle.",
  },
  bloodPressureSystolic: {
    label: "Systolic BP",
    meaning: "Top blood-pressure number. <120 is normal; 130+ is elevated.",
    rules: [
      { op: "<", value: 120, status: "good", action: "Normal." },
      { op: "<", value: 130, status: "watch", action: "Elevated. Aerobic exercise, less sodium and alcohol help; re-measure weekly." },
      { op: ">=", value: 130, status: "bad", action: "High. Re-measure rested and seated; if it stays 130+, talk to a doctor." },
    ],
    fallback: "Log readings from a BP cuff.",
  },
  bloodGlucose: {
    label: "Blood glucose",
    meaning: "Blood sugar (mg/dL). Fasting 70-99 is normal.",
    rules: [
      { op: "<", value: 100, status: "good", action: "Normal fasting range." },
      { op: ">=", value: 100, status: "watch", action: "If this was fasting, a 10-min walk after meals and fewer refined carbs help; discuss persistent 100+ with a doctor." },
    ],
    fallback: "Log readings from a glucose meter or CGM.",
  },
  biologicalAge: {
    label: "Biological age",
    meaning: "Heuristic estimate from VO2max, walking speed, HRV, resting HR and body fat vs population curves. Useful for your own trend; not a clinical test.",
    rules: [
      { op: "<", value: 0, status: "good", action: "Tracking younger. The marker with the oldest 'age' in the breakdown is your best lever to go further." },
      { op: ">=", value: 0, status: "watch", action: "Check which marker has the oldest age in the breakdown below — that's where to focus (usually VO2max: add intervals + Zone-2)." },
    ],
    fallback: "Set your profile in Settings.",
  },

  // ---------------- Extras from the export ----------------
  PhysicalEffort: {
    label: "Physical effort",
    meaning: "Apple's estimate of effort in METs (multiples of resting energy). 3+ is moderate activity, 6+ vigorous.",
    rules: [],
    fallback: "Context for intensity — more minutes above 3 METs is the goal.",
  },
  HeadphoneAudioExposure: {
    label: "Headphone audio",
    meaning: "Average headphone volume (dB). Long exposure above ~80 dB risks hearing damage.",
    rules: [
      { op: "<", value: 80, status: "good", action: "Safe levels." },
      { op: ">=", value: 80, status: "watch", action: "Turn it down or limit long sessions — noise damage is cumulative and permanent." },
    ],
    fallback: "",
  },
  SixMinuteWalkTestDistance: {
    label: "Six-minute walk",
    meaning: "Apple's estimate of how far you could walk in 6 minutes — a clinical functional-capacity test. 500m+ is good for adults.",
    rules: [
      { op: ">=", value: 500, status: "good", action: "Good capacity." },
      { op: "<", value: 500, status: "watch", action: "Improve with brisk walking and leg strength." },
    ],
    fallback: "",
  },
  StairAscentSpeed: {
    label: "Stair ascent speed",
    meaning: "How fast you climb stairs (m/s) — reflects leg power, which declines with age faster than strength.",
    rules: [],
    fallback: "Keep it up with step-ups, stair climbing and jump/power work.",
  },
  StairDescentSpeed: {
    label: "Stair descent speed",
    meaning: "How fast you walk down stairs — tied to balance and eccentric leg strength.",
    rules: [],
    fallback: "Balance and slow-lowering (eccentric) leg work help.",
  },
  AppleStandHourCount: {
    label: "Stand hour count",
    meaning: "Hours with at least a minute standing.",
    rules: [],
    fallback: "Aim for 10-12.",
  },
  EnvironmentalAudioExposure: {
    label: "Environmental noise",
    meaning: "Average ambient noise (dB). Chronic noise above ~70 dB affects sleep and stress.",
    rules: [{ op: ">=", value: 80, status: "watch", action: "Loud environment — consider ear protection." }],
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
