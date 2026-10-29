export interface Env {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_DATA_BRANCH: string;
  GITHUB_TOKEN: string;
  INGEST_TOKEN: string;
  LLM_GATEWAY_URL: string;
  LLM_GATEWAY_TOKEN: string;
  LLM_GATEWAY: Fetcher;
  INSIGHTS_CACHE: KVNamespace;
  TIMEZONE?: string; // IANA zone the user lives in, e.g. "Asia/Kolkata"
  PUBLIC_URL?: string; // dashboard link for the morning brief
  BRIEF_TOKEN?: string; // bearer token brain-chat / telegram-router use for POST /telegram/brief
}

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  // Heart & recovery
  restingHeartRate?: number; // bpm
  heartRateAvg?: number; // bpm, mean of all HR samples that day
  heartRateMin?: number;
  heartRateMax?: number;
  walkingHeartRateAvg?: number; // bpm
  hrv?: number; // ms, SDNN
  respiratoryRate?: number; // breaths/min
  oxygenSaturation?: number; // 0-1
  bodyTemperature?: number; // celsius
  vo2max?: number; // ml/kg/min
  // Activity
  steps?: number;
  activeEnergy?: number; // kcal
  basalEnergy?: number; // kcal
  exerciseMinutes?: number;
  standMinutes?: number;
  flightsClimbed?: number;
  distanceKm?: number; // walking + running
  distanceCyclingKm?: number;
  daylightMinutes?: number;
  mindfulMinutes?: number;
  // HR zone time (minutes in each zone)
  hrZone1Min?: number; // zone 1: <60% max HR (very light)
  hrZone2Min?: number; // zone 2: 60-70% max HR (light/fat burn)
  hrZone3Min?: number; // zone 3: 70-80% max HR (aerobic)
  hrZone4Min?: number; // zone 4: 80-90% max HR (threshold)
  hrZone5Min?: number; // zone 5: >90% max HR (max effort)
  // Mobility / gait (strong aging biomarkers)
  walkingSpeed?: number; // m/s
  walkingStepLength?: number; // cm
  walkingAsymmetryPct?: number; // 0-1, lower is better
  walkingDoubleSupportPct?: number; // 0-1, lower is better
  // Sleep
  sleepHours?: number;
  sleepEfficiency?: number; // 0-1
  sleepCoreHours?: number;
  sleepDeepHours?: number;
  sleepRemHours?: number;
  sleepAwakeHours?: number;
  sleepInBedHours?: number;
  // Body
  weightKg?: number;
  bodyFatPct?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodGlucose?: number; // mg/dL
  // WHOOP-style daily load
  strain?: number; // 0-21, cardiovascular load for the day from HR-zone time
  // Workout sessions (from <Workout> elements, distinct from <Record>)
  workoutCount?: number;
  workoutMinutes?: number;
  workoutEnergy?: number; // kcal
  workoutDistanceKm?: number;
  workoutType?: string; // most common HKWorkoutActivityType that day
  workoutStrains?: { type: string; strain: number; minutes: number; avgHR?: number }[];
  // Activity Rings (from <ActivitySummary> elements, distinct from <Record>)
  activeEnergyGoal?: number; // kcal, the Move ring's goal that day
  exerciseMinutesGoal?: number; // the Exercise ring's goal that day
  standHours?: number; // hours with >=1 min standing (the Stand ring's actual)
  standHoursGoal?: number; // the Stand ring's goal that day
  // Every other HealthKit quantity/category type the export contains, so
  // nothing from "Export All Health Data" is ever silently dropped. Keyed by
  // the HK identifier with its HKQuantityTypeIdentifier/HKCategoryTypeIdentifier
  // prefix stripped (e.g. "PhysicalEffort", "UVExposure", "NumberOfTimesFallen").
  extra?: Record<string, number>;
  receivedAt: string; // ISO timestamp of ingest
  source?: string;
}

export interface UserProfile {
  birthDate: string; // YYYY-MM-DD
  sex: "male" | "female";
  heightCm?: number;
}

// User-entered context, kept explicitly separate from sensor data: this is
// what the PERSON says about themself (goals, how they felt), never
// something a device measured, and never fed into the biological-age or
// baseline math — only surfaced as context (e.g. to the AI, or to the
// person themselves).
export interface KnowledgeNote {
  date: string; // YYYY-MM-DD
  energy?: number; // 1-10, self-reported
  soreness?: number; // 1-10, self-reported
  note?: string;
  // Structured journal fields (Whoop-style)
  alcoholDrinks?: number; // 0+
  caffeineMg?: number; // approximate mg
  stress?: number; // 1-10
  illness?: boolean;
  lateMeal?: boolean; // ate within 2h of bed
  screenBeforeBed?: boolean;
  supplements?: string[]; // e.g. ["melatonin", "magnesium", "creatine"]
  hydrationLiters?: number;
  sauna?: boolean;
  coldPlunge?: boolean;
  nap?: boolean;
  napMinutes?: number;
  travel?: boolean;
  meditation?: boolean;
  meditationMinutes?: number;
  preWorkout?: boolean;
}

export interface RecoverySnapshot {
  date: string;
  score: number; // 0-100
  hrvZ: number | null;
  rhrZ: number | null;
  respRateZ: number | null;
  spo2Z: number | null;
  tempDeviationC: number | null;
  sleepScore: number | null;
}

export interface IllnessSignal {
  date: string;
  likelihood: "low" | "moderate" | "high";
  score: number; // 0-100
  signals: {
    rhrElevated: boolean;
    hrvDepressed: boolean;
    tempElevated: boolean;
    respRateElevated: boolean;
  };
  detail: string;
}

export interface SleepAnalysis {
  avgHours: number | null;
  dynamicNeedHours: number | null;
  debtHours: number | null;
  consistencyScore: number | null; // 0-100
  performanceScore: number | null; // 0-100
  onsetLatencyMin: number | null;
  optimalBedtime: string | null; // "22:30"
  bedtimeStddevMin: number | null;
  wakeStddevMin: number | null;
}

export interface WorkoutPR {
  exercise: string;
  metric: "weight" | "volume" | "reps";
  value: number;
  date: string;
  previousBest: number | null;
}

export interface MuscleBalance {
  muscle: string;
  hitsLast30: number;
  hitsLast7: number;
  category: "push" | "pull" | "legs" | "core" | "cardio";
}

export interface AlertPayload {
  type: "anomaly" | "illness" | "recovery" | "strain" | "staleData" | "goalMilestone";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  date: string;
}

export interface UserKnowledge {
  goals?: string;
  preferences?: string;
  sleepTargetHours?: number;
  stepGoal?: number;
  notes: KnowledgeNote[];
}

export interface CoachSnapshot {
  directive: import("./patterns").CoachDirective;
  patterns: import("./patterns").PersonalPattern[];
  reportCard: import("./patterns").WeeklyReportCard | null;
  predictions: import("./patterns").PerformancePrediction[];
}

export interface MarkerAgeResult {
  marker: string;
  value: number;
  markerAge: number;
  weight: number;
}

export interface BiologicalAgeResult {
  date: string;
  chronologicalAge: number;
  biologicalAge: number;
  deltaYears: number; // biologicalAge - chronologicalAge
  markers: MarkerAgeResult[];
}
