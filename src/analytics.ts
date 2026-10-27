import type { BiologicalAgeResult, DailyMetrics, MarkerAgeResult, UserProfile } from "./types";

/**
 * Biological-age estimate for a personal analytics dashboard.
 *
 * This is NOT a validated clinical instrument (e.g. PhenoAge, GrimAge). It is
 * a transparent, explainable heuristic: for each fitness/recovery marker we
 * ask "at what age is this value typical?" using rough population-average
 * curves assembled from commonly cited ranges (ACSM VO2max norms, Nunan et
 * al. HRV-by-decade meta-analysis, ACE body-fat categories, general resting
 * heart rate references), then take a weighted average of those "marker
 * ages", plus small bounded adjustments for sleep/activity. The result is
 * useful for tracking YOUR OWN trend over time — it is not medical advice
 * and should not be compared across people as a diagnostic score.
 */

type Curve = [age: number, value: number][];

interface AgeCurveMarker {
  field: "restingHeartRate" | "hrv" | "vo2max" | "bodyFatPct" | "walkingSpeed";
  label: string;
  weight: number;
  curve: Curve; // sorted ascending by age
}

const RHR_CURVE: Curve = [
  [20, 64],
  [30, 65],
  [40, 67],
  [50, 69],
  [60, 71],
  [70, 74],
  [80, 77],
];

const HRV_CURVE: Curve = [
  [20, 60],
  [30, 50],
  [40, 40],
  [50, 33],
  [60, 27],
  [70, 22],
  [80, 18],
];

const VO2MAX_CURVE_MALE: Curve = [
  [20, 42],
  [30, 41],
  [40, 38],
  [50, 35],
  [60, 31],
  [70, 28],
  [80, 23],
];

const VO2MAX_CURVE_FEMALE: Curve = [
  [20, 35],
  [30, 33],
  [40, 30],
  [50, 28],
  [60, 24],
  [70, 21],
  [80, 18],
];

const BODYFAT_CURVE_MALE: Curve = [
  [20, 18],
  [30, 19],
  [40, 21],
  [50, 23],
  [60, 24],
  [70, 25],
  [80, 25],
];

const BODYFAT_CURVE_FEMALE: Curve = [
  [20, 25],
  [30, 26],
  [40, 28],
  [50, 30],
  [60, 31],
  [70, 32],
  [80, 32],
];

// Gait (walking) speed is one of the better-replicated single predictors of
// healthy aging in the geriatrics literature (e.g. Studenski et al. 2011,
// "Gait speed and survival in older adults") — faster self-paced walking
// speed tracks with younger physiological age. Figures here are a rough,
// unisex approximation of normal-population comfortable walking speed by
// age decade, in m/s.
const WALKING_SPEED_CURVE: Curve = [
  [20, 1.45],
  [30, 1.42],
  [40, 1.38],
  [50, 1.32],
  [60, 1.22],
  [70, 1.07],
  [80, 0.86],
];

function markersForSex(sex: "male" | "female"): AgeCurveMarker[] {
  return [
    { field: "vo2max", label: "VO2max (cardio fitness)", weight: 0.3, curve: sex === "male" ? VO2MAX_CURVE_MALE : VO2MAX_CURVE_FEMALE },
    { field: "walkingSpeed", label: "Walking speed (gait)", weight: 0.2, curve: WALKING_SPEED_CURVE },
    { field: "hrv", label: "Heart rate variability", weight: 0.2, curve: HRV_CURVE },
    { field: "restingHeartRate", label: "Resting heart rate", weight: 0.15, curve: RHR_CURVE },
    { field: "bodyFatPct", label: "Body fat %", weight: 0.15, curve: sex === "male" ? BODYFAT_CURVE_MALE : BODYFAT_CURVE_FEMALE },
  ];
}

// Inverse-interpolate: given a marker value, find the age at which the
// reference curve predicts that value. Extrapolates linearly past the
// curve's ends, clamped to +/- 15 years beyond the nearest control point.
function ageForValue(curve: Curve, value: number): number {
  const n = curve.length;
  const increasing = curve[n - 1][1] >= curve[0][1];

  for (let i = 0; i < n - 1; i++) {
    const [age0, v0] = curve[i];
    const [age1, v1] = curve[i + 1];
    const inRange = increasing ? value >= v0 && value <= v1 : value <= v0 && value >= v1;
    if (inRange && v1 !== v0) {
      const t = (value - v0) / (v1 - v0);
      return age0 + t * (age1 - age0);
    }
  }

  // Out of range: extrapolate off whichever end is closer, capped. Skip
  // forward/backward past any zero-delta segment to avoid dividing by zero.
  const belowStart = increasing ? value < curve[0][1] : value > curve[0][1];
  if (belowStart) {
    const [age0, v0] = curve[0];
    let j = 1;
    while (j < n - 1 && curve[j][1] === v0) j++;
    const [age1, v1] = curve[j];
    const slope = (age1 - age0) / (v1 - v0);
    const age = age0 + (value - v0) * slope;
    return Math.max(age, age0 - 15);
  } else {
    const [ageN, vN] = curve[n - 1];
    let j = n - 2;
    while (j > 0 && curve[j][1] === vN) j--;
    const [ageN1, vN1] = curve[j];
    const slope = (ageN - ageN1) / (vN - vN1);
    const age = ageN + (value - vN) * slope;
    return Math.min(age, ageN + 15);
  }
}

export function chronologicalAge(birthDate: string, asOf: string): number {
  const birth = new Date(birthDate);
  const ref = new Date(asOf);
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthdayThisYear =
    ref.getUTCMonth() > birth.getUTCMonth() ||
    (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Computes a biological-age estimate from a window of recent daily metrics
 * (averaged, to smooth day-to-day noise) and the user's profile.
 */
export function estimateBiologicalAge(recent: DailyMetrics[], profile: UserProfile, asOf: string): BiologicalAgeResult {
  const age = chronologicalAge(profile.birthDate, asOf);
  const markers: MarkerAgeResult[] = [];

  for (const m of markersForSex(profile.sex)) {
    const values = recent.map((d) => d[m.field]).filter((v): v is number => typeof v === "number");
    if (values.length === 0) continue;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    markers.push({ marker: m.label, value: avg, markerAge: ageForValue(m.curve, avg), weight: m.weight });
  }

  let biologicalAge = age;
  if (markers.length > 0) {
    const totalWeight = markers.reduce((a, m) => a + m.weight, 0);
    const weightedAge = markers.reduce((a, m) => a + m.markerAge * m.weight, 0) / totalWeight;
    biologicalAge = weightedAge;
  }

  // Bounded lifestyle modifiers: sleep and daily steps nudge the estimate
  // by at most +/-1 year each, rather than pretending to map to an "age".
  const sleepValues = recent.map((d) => d.sleepHours).filter((v): v is number => typeof v === "number");
  if (sleepValues.length > 0) {
    const avgSleep = sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length;
    const deviation = Math.max(0, 7.5 - avgSleep); // short sleep ages you; oversleep ignored
    biologicalAge += Math.min(1, deviation * 0.4);
  }

  const stepValues = recent.map((d) => d.steps).filter((v): v is number => typeof v === "number");
  if (stepValues.length > 0) {
    const avgSteps = stepValues.reduce((a, b) => a + b, 0) / stepValues.length;
    const shortfall = Math.max(0, 8000 - avgSteps) / 8000; // 0..1
    biologicalAge += Math.min(1, shortfall);
  }

  // Never let the estimate drift more than 15 years from chronological age;
  // beyond that the curves are extrapolating too far to be meaningful.
  const clamped = Math.min(age + 15, Math.max(age - 15, biologicalAge));

  return {
    date: asOf,
    chronologicalAge: age,
    biologicalAge: Math.round(clamped * 10) / 10,
    deltaYears: Math.round((clamped - age) * 10) / 10,
    markers,
  };
}

export interface TrendPoint {
  date: string;
  value: number;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
