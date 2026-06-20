/**
 * log_entries data access (M3). `logFood` is the one place that resolves a chosen
 * food + measure + quantity into a snapshot row — the friction-critical save path.
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
  RECENT_FOODS,
  UPDATE_LOG_ENTRY,
} from './logEntriesSql';
import { kindToTable, type SearchResult } from './searchSql';

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
}

/**
 * Resolve measure × quantity to grams, snapshot the nutrition on the per-100g basis,
 * and insert a log_entries row. Returns the new row id.
 */
export async function logFood(p: LogFoodParams): Promise<number> {
  const db = getDatabase();
  const grams = gramsTotal(p.quantity, p.gramsPerUnit);
  const snap = snapshotNutrition(p.food, grams);
  const now = new Date().toISOString();
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
  return result.lastInsertRowId;
}

/**
 * Re-snapshot an existing entry (EDIT-1…4). Recomputes grams + nutrition from the
 * (possibly changed) food/measure/quantity and rewrites meal/date/status — so a move
 * to another day or meal, or a quantity change, is reflected everywhere. created_at
 * is preserved by the SQL.
 */
export async function updateLogEntry(id: number, p: LogFoodParams): Promise<void> {
  const db = getDatabase();
  const grams = gramsTotal(p.quantity, p.gramsPerUnit);
  const snap = snapshotNutrition(p.food, grams);
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
}

/** Delete an entry (EDIT-2 / PLAN-6). */
export async function deleteLogEntry(id: number): Promise<void> {
  await getDatabase().runAsync(DELETE_LOG_ENTRY, id);
}

/** Confirm one planned entry → logged ("Ate it", PLAN-4). No-op if already logged. */
export async function confirmEntry(id: number): Promise<void> {
  await getDatabase().runAsync(CONFIRM_ENTRY, new Date().toISOString(), id);
}

/** Confirm all planned entries in a meal → logged. Returns how many flipped. */
export async function confirmMeal(date: string, meal: MealType): Promise<number> {
  const r = await getDatabase().runAsync(CONFIRM_MEAL, new Date().toISOString(), date, meal);
  return r.changes;
}

/** Confirm all planned entries on a day → logged. Returns how many flipped. */
export async function confirmDay(date: string): Promise<number> {
  const r = await getDatabase().runAsync(CONFIRM_DAY, new Date().toISOString(), date);
  return r.changes;
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

/** All entries for a given date, meal then time order (used by the Diary, M4). */
export function getEntriesForDate(date: string): Promise<LogEntry[]> {
  return getDatabase().getAllAsync<LogEntry>(
    `SELECT * FROM log_entries WHERE log_date = ? ORDER BY meal_type, created_at`,
    date
  );
}
