export interface Env {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_DATA_BRANCH: string;
  GITHUB_TOKEN: string;
  INGEST_TOKEN: string;
  LLM_GATEWAY_URL: string;
  LLM_GATEWAY_TOKEN: string;
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
  // Body
  weightKg?: number;
  bodyFatPct?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodGlucose?: number; // mg/dL
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
