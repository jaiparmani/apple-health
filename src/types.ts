export interface Env {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_DATA_BRANCH: string;
  GITHUB_TOKEN: string;
  INGEST_TOKEN: string;
}

export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  restingHeartRate?: number; // bpm
  hrv?: number; // ms, SDNN or rMSSD
  vo2max?: number; // ml/kg/min
  steps?: number;
  activeEnergy?: number; // kcal
  exerciseMinutes?: number;
  sleepHours?: number;
  sleepEfficiency?: number; // 0-1
  weightKg?: number;
  bodyFatPct?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodGlucose?: number; // mg/dL
  respiratoryRate?: number;
  oxygenSaturation?: number; // 0-1
  bodyTemperature?: number; // celsius
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
