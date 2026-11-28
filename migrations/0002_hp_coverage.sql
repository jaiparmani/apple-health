-- Days the server has received HealthPipe samples for from local midnight
-- onward (a payload's range started at or before the day's start). Only
-- these days' aggregates may overwrite existing values; a day seen only
-- partially (e.g. the oldest day of a rolling window) can only fill gaps.
CREATE TABLE IF NOT EXISTS hp_coverage (
  day TEXT PRIMARY KEY,
  covered_at TEXT NOT NULL
);
