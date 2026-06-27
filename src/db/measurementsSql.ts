/**
 * body_measurements SQL (daily weight + waist). One row per day, keyed by date.
 */

export const GET_MEASUREMENT = `SELECT * FROM body_measurements WHERE measured_on = ?`;

/** Upsert a day's measurement. created_at is set once and preserved; updated_at advances. */
export const UPSERT_MEASUREMENT = `
  INSERT INTO body_measurements (measured_on, weight_kg, waist_cm, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(measured_on) DO UPDATE SET
    weight_kg  = excluded.weight_kg,
    waist_cm   = excluded.waist_cm,
    updated_at = excluded.updated_at`;

/** Most recent measurements, newest first (for a short history/trend). */
export const RECENT_MEASUREMENTS = `
  SELECT * FROM body_measurements
   WHERE weight_kg IS NOT NULL OR waist_cm IS NOT NULL
   ORDER BY measured_on DESC
   LIMIT ?`;

/** All measurements, oldest first (for lifetime sparklines). */
export const ALL_MEASUREMENTS_ASC = `
  SELECT * FROM body_measurements
   WHERE weight_kg IS NOT NULL OR waist_cm IS NOT NULL
   ORDER BY measured_on ASC`;
