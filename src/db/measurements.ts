/**
 * Daily body-measurement data access (weight + waist) — local-first with one-way backup
 * to Supabase. One row per day; saving the same day upserts (so "log once a day" is a
 * simple overwrite). The date is the stable cross-store key for backup.
 */
import type { BodyMeasurement } from '@/types/db';

import { getDatabase } from './database';
import {
  GET_MEASUREMENT,
  RECENT_MEASUREMENTS,
  UPSERT_MEASUREMENT,
} from './measurementsSql';
import { enqueue, scheduleDrain } from './sync';

export interface MeasurementInput {
  weight_kg: number | null;
  waist_cm: number | null;
}

/** This day's measurement, or null if none recorded yet. */
export async function getMeasurement(date: string): Promise<BodyMeasurement | null> {
  const row = await getDatabase().getFirstAsync<BodyMeasurement>(GET_MEASUREMENT, date);
  return row ?? null;
}

/** Upsert a day's weight + waist and queue it for backup. */
export async function saveMeasurement(date: string, m: MeasurementInput): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      UPSERT_MEASUREMENT,
      date,
      m.weight_kg,
      m.waist_cm,
      now, // created_at (ignored by ON CONFLICT update)
      now // updated_at
    );
    await enqueue(db, 'body_measurements', date);
  });
  scheduleDrain();
}

/** Recent measurements, newest first (for a short history). */
export function getRecentMeasurements(limit = 14): Promise<BodyMeasurement[]> {
  return getDatabase().getAllAsync<BodyMeasurement>(RECENT_MEASUREMENTS, limit);
}
