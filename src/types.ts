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
