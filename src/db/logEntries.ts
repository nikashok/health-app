/**
 * log_entries data access (M3) — local-first (on-device SQLite is the source of truth)
 * with a one-way backup to Supabase. `logFood` is the friction-critical save path: it
 * resolves a chosen food + measure + quantity into a snapshot row.
 *
 * Every mutation runs in a transaction that also drops the row's stable `sync_uuid` into
 * the sync_outbox, so a committed local write is guaranteed to be queued for backup
 * (see sync.ts). Nutrition columns are SNAPSHOTS written at log time and never recomputed
 * (CLAUDE.md rule 2).
 */
import { snapshotNutrition, gramsTotal } from '@/calc/logEntry';
import type { EntryStatus, FoodTable, LogEntry, MealType } from '@/types/db';

import { getDatabase } from './database';
import {
  CONFIRM_DAY,
  CONFIRM_ENTRY,
  CONFIRM_MEAL,
  DELETE_LOG_ENTRY,
  GET_ENTRY,
  INSERT_LOG_ENTRY,
  LAST_ENTRY_FOR_FOOD,
  MOVE_LOG_ENTRY,
  RECENT_FOODS,
  RECENT_FOODS_FOR_MEAL,
  REVERT_TO_PLANNED,
  UPDATE_LOG_ENTRY,
} from './logEntriesSql';
import { kindToTable, type SearchResult } from './searchSql';
import { enqueue, newSyncId, scheduleDrain } from './sync';

export interface LogFoodParams {
  food: SearchResult;
  measureName: string;
  gramsPerUnit: number;
  quantity: number;
  meal: MealType;
  date: string; // YYYY-MM-DD
  status?: EntryStatus; // default 'logged' (a future date implies 'planned' — set by caller)
}

/** A recently-logged food for the quick-add list (LOG-3). */
export interface RecentFood {
  food_code: string | null;
  food_table: FoodTable;
  food_name: string;
  measure_name: string;
  quantity: number;
  /** Snapshot kcal of that last entry (display only). */
  kcal?: number;
}

/** Read the sync_uuid for a row (rows always have one after insert; old rows may not). */
async function uuidFor(id: number): Promise<string | null> {
  const row = await getDatabase().getFirstAsync<{ sync_uuid: string | null }>(
    'SELECT sync_uuid FROM log_entries WHERE id = ?',
    id
  );
  return row?.sync_uuid ?? null;
}

/**
 * Resolve measure × quantity to grams, snapshot the nutrition on the per-100g basis,
 * insert a log_entries row (with a sync_uuid), and queue it for backup. Returns the id.
 */
export async function logFood(p: LogFoodParams): Promise<number> {
  const db = getDatabase();
  const grams = gramsTotal(p.quantity, p.gramsPerUnit);
  const snap = snapshotNutrition(p.food, grams);
  const now = new Date().toISOString();
  const uuid = newSyncId();
  let id = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      INSERT_LOG_ENTRY,
      p.date,
      p.meal,
      p.status ?? 'logged',
      p.food.code,
      kindToTable(p.food.kind),
      p.food.name,
      p.measureName,
      p.quantity,
      grams,
      snap.kcal,
      snap.protein_g,
      snap.fat_g,
      snap.carb_g,
      snap.fibre_g,
      now,
      now
    );
    id = result.lastInsertRowId;
    await db.runAsync('UPDATE log_entries SET sync_uuid = ? WHERE id = ?', uuid, id);
    await enqueue(db, 'log_entries', uuid);
  });
  scheduleDrain();
  return id;
}

/**
 * Re-snapshot an existing entry (EDIT-1…4). Recomputes grams + nutrition from the
 * (possibly changed) food/measure/quantity and rewrites meal/date/status. created_at
 * is preserved by the SQL.
 */
export async function updateLogEntry(id: number, p: LogFoodParams): Promise<void> {
  const db = getDatabase();
  const grams = gramsTotal(p.quantity, p.gramsPerUnit);
  const snap = snapshotNutrition(p.food, grams);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      UPDATE_LOG_ENTRY,
      p.date,
      p.meal,
      p.status ?? 'logged',
      p.food.code,
      kindToTable(p.food.kind),
      p.food.name,
      p.measureName,
      p.quantity,
      grams,
      snap.kcal,
      snap.protein_g,
      snap.fat_g,
      snap.carb_g,
      snap.fibre_g,
      new Date().toISOString(),
      id
    );
    let uuid = await uuidFor(id);
    if (!uuid) {
      uuid = newSyncId();
      await db.runAsync('UPDATE log_entries SET sync_uuid = ? WHERE id = ?', uuid, id);
    }
    await enqueue(db, 'log_entries', uuid);
  });
  scheduleDrain();
}

/** Move an entry (meal/date/status only); its nutrition snapshot is kept as logged. */
export async function moveLogEntry(
  id: number,
  p: { meal: MealType; date: string; status: EntryStatus }
): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(MOVE_LOG_ENTRY, p.date, p.meal, p.status, new Date().toISOString(), id);
    const uuid = await uuidFor(id);
    if (uuid) await enqueue(db, 'log_entries', uuid);
  });
  scheduleDrain();
}

/** Delete an entry (EDIT-2 / PLAN-6). The drain sees the row gone and deletes it remotely. */
export async function deleteLogEntry(id: number): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    const uuid = await uuidFor(id);
    await db.runAsync(DELETE_LOG_ENTRY, id);
    if (uuid) await enqueue(db, 'log_entries', uuid);
  });
  scheduleDrain();
}

/**
 * Confirm one planned entry → logged ("Ate it", PLAN-4). No-op if already logged.
 * Returns the ids that flipped (for Undo).
 */
export async function confirmEntry(id: number): Promise<number[]> {
  const db = getDatabase();
  let flipped: number[] = [];
  await db.withTransactionAsync(async () => {
    const was = await db.getFirstAsync<{ status: string }>('SELECT status FROM log_entries WHERE id = ?', id);
    await db.runAsync(CONFIRM_ENTRY, new Date().toISOString(), id);
    flipped = was?.status === 'planned' ? [id] : [];
    const uuid = await uuidFor(id);
    if (uuid) await enqueue(db, 'log_entries', uuid);
  });
  scheduleDrain();
  return flipped;
}

/** Confirm all planned entries in a meal → logged. Returns the ids that flipped. */
export async function confirmMeal(date: string, meal: MealType): Promise<number[]> {
  const db = getDatabase();
  let flipped: number[] = [];
  await db.withTransactionAsync(async () => {
    const affected = await db.getAllAsync<{ id: number; sync_uuid: string | null }>(
      "SELECT id, sync_uuid FROM log_entries WHERE log_date = ? AND meal_type = ? AND status = 'planned'",
      date,
      meal
    );
    await db.runAsync(CONFIRM_MEAL, new Date().toISOString(), date, meal);
    flipped = affected.map((a) => a.id);
    for (const a of affected) if (a.sync_uuid) await enqueue(db, 'log_entries', a.sync_uuid);
  });
  scheduleDrain();
  return flipped;
}

/** Confirm all planned entries on a day → logged. Returns the ids that flipped. */
export async function confirmDay(date: string): Promise<number[]> {
  const db = getDatabase();
  let flipped: number[] = [];
  await db.withTransactionAsync(async () => {
    const affected = await db.getAllAsync<{ id: number; sync_uuid: string | null }>(
      "SELECT id, sync_uuid FROM log_entries WHERE log_date = ? AND status = 'planned'",
      date
    );
    await db.runAsync(CONFIRM_DAY, new Date().toISOString(), date);
    flipped = affected.map((a) => a.id);
    for (const a of affected) if (a.sync_uuid) await enqueue(db, 'log_entries', a.sync_uuid);
  });
  scheduleDrain();
  return flipped;
}

/** Undo a confirm: put just-confirmed entries back to planned (and queue the backup). */
export async function revertToPlanned(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(REVERT_TO_PLANNED(ids.length), new Date().toISOString(), ...ids);
    for (const id of ids) {
      const uuid = await uuidFor(id);
      if (uuid) await enqueue(db, 'log_entries', uuid);
    }
  });
  scheduleDrain();
}

/** Load a single entry for editing. */
export async function getEntry(id: number): Promise<LogEntry | null> {
  const row = await getDatabase().getFirstAsync<LogEntry>(GET_ENTRY, id);
  return row ?? null;
}

/** Last N distinct foods logged, most recent first (LOG-3). */
export function getRecentFoods(limit = 8): Promise<RecentFood[]> {
  return getDatabase().getAllAsync<RecentFood>(RECENT_FOODS, limit);
}

/** Recents for a meal: what you usually have at it first, topped up by recency. */
export function getRecentFoodsForMeal(
  meal: MealType,
  sinceISO: string,
  limit = 10
): Promise<RecentFood[]> {
  return getDatabase().getAllAsync<RecentFood>(RECENT_FOODS_FOR_MEAL, meal, sinceISO, limit);
}

/** The measure and quantity a food was last logged with, if ever. */
export async function getLastPortion(
  table: FoodTable,
  code: string
): Promise<{ measure_name: string; quantity: number } | null> {
  const row = await getDatabase().getFirstAsync<{ measure_name: string; quantity: number }>(
    LAST_ENTRY_FOR_FOOD,
    table,
    code
  );
  return row ?? null;
}

/** All entries for a given date, meal then time order (used by the Diary, M4). */
export function getEntriesForDate(date: string): Promise<LogEntry[]> {
  return getDatabase().getAllAsync<LogEntry>(
    `SELECT * FROM log_entries WHERE log_date = ? ORDER BY meal_type, created_at`,
    date
  );
}
