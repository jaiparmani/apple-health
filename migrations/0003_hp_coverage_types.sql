-- Coverage is per data type: a workouts-only job covering a day says
-- nothing about that day's steps. Replaces the per-day hp_coverage.
CREATE TABLE IF NOT EXISTS hp_coverage_types (
  day TEXT NOT NULL,
  t TEXT NOT NULL,
  covered_at TEXT NOT NULL,
  PRIMARY KEY (day, t)
);
DROP TABLE IF EXISTS hp_coverage;
