import type { BodyMeasurement } from "./body";

const MAX_MEASUREMENTS = 500;

export function sanitizeMeasurement(raw: unknown): BodyMeasurement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) return null;

  const numField = (key: string, min = 0, max = 300): number | undefined => {
    const v = obj[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    return Math.max(min, Math.min(max, Math.round(v * 10) / 10));
  };

  const m: BodyMeasurement = {
    date: obj.date,
    waistCm: numField("waistCm", 30, 200),
    chestCm: numField("chestCm", 40, 200),
    hipsCm: numField("hipsCm", 40, 200),
    leftArmCm: numField("leftArmCm", 10, 80),
    rightArmCm: numField("rightArmCm", 10, 80),
    leftThighCm: numField("leftThighCm", 20, 120),
    rightThighCm: numField("rightThighCm", 20, 120),
    neckCm: numField("neckCm", 15, 80),
    shouldersCm: numField("shouldersCm", 40, 200),
    calvesLCm: numField("calvesLCm", 15, 80),
    calvesRCm: numField("calvesRCm", 15, 80),
  };

  if (m.waistCm && m.hipsCm) {
    m.waistToHipRatio = Math.round((m.waistCm / m.hipsCm) * 100) / 100;
  }

  const hasAny = Object.entries(m).some(([k, v]) => k !== "date" && v !== undefined);
  return hasAny ? m : null;
}

export function mergeMeasurements(
  existing: BodyMeasurement[],
  incoming: BodyMeasurement
): BodyMeasurement[] {
  const list = [...existing];
  const idx = list.findIndex((m) => m.date === incoming.date);
  if (idx >= 0) list[idx] = incoming;
  else list.push(incoming);
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list.slice(-MAX_MEASUREMENTS);
}
