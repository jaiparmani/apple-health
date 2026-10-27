import type { DailyMetrics } from "./types";

// Apple Shortcuts can only build simple dictionaries, so the ingest endpoint
// accepts a loose, case-insensitive set of aliases for each metric rather
// than requiring an exact schema from the Shortcut author.
const ALIASES: Record<keyof Omit<DailyMetrics, "date" | "receivedAt" | "source">, string[]> = {
  restingHeartRate: ["restingheartrate", "resting_heart_rate", "rhr"],
  heartRateAvg: ["heartrateavg", "heart_rate_avg", "avgheartrate", "heartrate"],
  heartRateMin: ["heartratemin", "heart_rate_min", "minheartrate"],
  heartRateMax: ["heartratemax", "heart_rate_max", "maxheartrate"],
  walkingHeartRateAvg: ["walkingheartrateaverage", "walking_heart_rate_avg", "walkingheartrate"],
  hrv: ["hrv", "heartratevariability", "heart_rate_variability", "hrvsdnn"],
  respiratoryRate: ["respiratoryrate", "respiratory_rate"],
  oxygenSaturation: ["oxygensaturation", "oxygen_saturation", "spo2", "bloodoxygen"],
  bodyTemperature: ["bodytemperature", "body_temperature", "temperature"],
  vo2max: ["vo2max", "vo2_max", "cardiofitness"],
  steps: ["steps", "stepcount", "step_count"],
  activeEnergy: ["activeenergy", "active_energy", "activeenergyburned", "calories"],
  basalEnergy: ["basalenergy", "basal_energy", "basalenergyburned", "restingcalories"],
  exerciseMinutes: ["exerciseminutes", "exercise_minutes", "exercisetime"],
  standMinutes: ["standminutes", "stand_minutes", "standtime", "applestandtime"],
  flightsClimbed: ["flightsclimbed", "flights_climbed"],
  distanceKm: ["distancekm", "distance_km", "distancewalkingrunning", "distance"],
  distanceCyclingKm: ["distancecyclingkm", "distance_cycling_km", "distancecycling"],
  daylightMinutes: ["daylightminutes", "daylight_minutes", "timeindaylight"],
  mindfulMinutes: ["mindfulminutes", "mindful_minutes", "mindfulsession"],
  walkingSpeed: ["walkingspeed", "walking_speed"],
  walkingStepLength: ["walkingsteplength", "walking_step_length"],
  walkingAsymmetryPct: ["walkingasymmetrypct", "walking_asymmetry_pct", "walkingasymmetrypercentage"],
  walkingDoubleSupportPct: ["walkingdoublesupportpct", "walking_double_support_pct", "walkingdoublesupportpercentage"],
  sleepHours: ["sleephours", "sleep_hours", "sleepduration", "timeasleep"],
  sleepEfficiency: ["sleepefficiency", "sleep_efficiency"],
  weightKg: ["weightkg", "weight_kg", "bodymass", "weight"],
  bodyFatPct: ["bodyfatpct", "body_fat_pct", "bodyfatpercentage"],
  bloodPressureSystolic: ["bloodpressuresystolic", "systolic", "bpsystolic"],
  bloodPressureDiastolic: ["bloodpressurediastolic", "diastolic", "bpdiastolic"],
  bloodGlucose: ["bloodglucose", "blood_glucose", "glucose"],
};

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function normalizePayload(raw: unknown, source?: string): DailyMetrics {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  // Build a lowercased, punctuation-stripped lookup of the incoming keys.
  const lookup: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    lookup[k.toLowerCase().replace(/[\s_-]/g, "")] = v;
  }

  const date =
    (typeof obj.date === "string" && obj.date) ||
    new Date().toISOString().slice(0, 10);

  const metrics: DailyMetrics = {
    date,
    receivedAt: new Date().toISOString(),
    source,
  };

  for (const [field, aliases] of Object.entries(ALIASES) as [keyof DailyMetrics, string[]][]) {
    for (const alias of aliases) {
      const key = alias.replace(/[\s_-]/g, "");
      if (key in lookup) {
        const num = toNumber(lookup[key]);
        if (num !== undefined) {
          (metrics as unknown as Record<string, unknown>)[field] = num;
          break;
        }
      }
    }
  }

  // Sleep efficiency and oxygen saturation sometimes arrive as 0-100 percent
  // from Shortcuts; normalize to 0-1 for consistent math downstream.
  if (metrics.sleepEfficiency !== undefined && metrics.sleepEfficiency > 1) {
    metrics.sleepEfficiency = metrics.sleepEfficiency / 100;
  }
  if (metrics.oxygenSaturation !== undefined && metrics.oxygenSaturation > 1) {
    metrics.oxygenSaturation = metrics.oxygenSaturation / 100;
  }
  if (metrics.walkingAsymmetryPct !== undefined && metrics.walkingAsymmetryPct > 1) {
    metrics.walkingAsymmetryPct = metrics.walkingAsymmetryPct / 100;
  }
  if (metrics.walkingDoubleSupportPct !== undefined && metrics.walkingDoubleSupportPct > 1) {
    metrics.walkingDoubleSupportPct = metrics.walkingDoubleSupportPct / 100;
  }

  return metrics;
}

// Merge a newly ingested payload into an existing day's record, preferring
// the new values but keeping anything the new payload didn't provide.
export function mergeDaily(existing: DailyMetrics | null, incoming: DailyMetrics): DailyMetrics {
  if (!existing) return incoming;
  const merged: DailyMetrics = { ...existing, ...incoming };
  for (const key of Object.keys(existing) as (keyof DailyMetrics)[]) {
    if (incoming[key] === undefined && existing[key] !== undefined) {
      (merged as unknown as Record<string, unknown>)[key] = existing[key];
    }
  }
  return merged;
}
