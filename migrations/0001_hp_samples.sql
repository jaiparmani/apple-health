-- HealthPipe raw HealthKit samples, one row per HealthKit UUID.
-- `day` is the local day the sample is aggregated into (sleep: wake day).
CREATE TABLE IF NOT EXISTS hp_samples (
  uuid TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  t TEXT NOT NULL,
  s INTEGER NOT NULL,
  e INTEGER NOT NULL,
  v REAL,
  n TEXT,
  src TEXT,
  w INTEGER,
  d TEXT
);
CREATE INDEX IF NOT EXISTS hp_samples_day ON hp_samples(day);
