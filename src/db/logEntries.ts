/**
 * log_entries data access (M3) — now backed by Supabase (RLS owner-only, so a user
 * only ever sees their own diary). `logFood` is the one place that resolves a chosen
 * food + measure + quantity into a snapshot row — the friction-critical save path.
 *
 * Nutrition columns are SNAPSHOTS written at log time and never recomputed (CLAUDE.md
 * rule 2). user_id is filled by the column default (auth.uid()); RLS enforces it.
 */
import { snapshotNutrition, gramsTotal } from '@/calc/logEntry';
import type { EntryStatus, FoodTable, LogEntry, MealType } from '@/types/db';

import { kindToTable, type SearchResult } from './searchSql';
import { supabase } from './supabase';

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

/** Build the snapshot row shared by insert + update. */
function snapshotRow(p: LogFoodParams) {
  const grams = gramsTotal(p.quantity, p.gramsPerUnit);
  const snap = snapshotNutrition(p.food, grams);
  return {
    log_date: p.date,
    meal_type: p.meal,
    status: p.status ?? 'logged',
    food_code: p.food.code,
    food_table: kindToTable(p.food.kind),
    food_name: p.food.name,
    measure_name: p.measureName,
    quantity: p.quantity,
    grams_total: grams,
    kcal: snap.kcal,
    protein_g: snap.protein_g,
    fat_g: snap.fat_g,
    carb_g: snap.carb_g,
    fibre_g: snap.fibre_g,
  };
}

/**
 * Resolve measure × quantity to grams, snapshot the nutrition on the per-100g basis,
 * and insert a log_entries row. Returns the new row id.
 */
export async function logFood(p: LogFoodParams): Promise<number> {
  const { data, error } = await supabase
    .from('log_entries')
    .insert(snapshotRow(p))
    .select('id')
    .single();
  if (error) throw error;
  return data.id as number;
}

/**
 * Re-snapshot an existing entry (EDIT-1…4): recompute grams + nutrition and rewrite
 * meal/date/status — so a move to another day or meal, or a quantity change, is
 * reflected everywhere. created_at is untouched; updated_at is set by a trigger.
 */
export async function updateLogEntry(id: number, p: LogFoodParams): Promise<void> {
  const { error } = await supabase.from('log_entries').update(snapshotRow(p)).eq('id', id);
  if (error) throw error;
}

/** Delete an entry (EDIT-2 / PLAN-6). */
export async function deleteLogEntry(id: number): Promise<void> {
  const { error } = await supabase.from('log_entries').delete().eq('id', id);
  if (error) throw error;
}

/** Confirm one planned entry → logged ("Ate it", PLAN-4). No-op if already logged. */
export async function confirmEntry(id: number): Promise<void> {
  const { error } = await supabase
    .from('log_entries')
    .update({ status: 'logged' })
    .eq('id', id)
    .eq('status', 'planned');
  if (error) throw error;
}

/** Confirm all planned entries in a meal → logged. Returns how many flipped. */
export async function confirmMeal(date: string, meal: MealType): Promise<number> {
  const { data, error } = await supabase
    .from('log_entries')
    .update({ status: 'logged' })
    .eq('log_date', date)
    .eq('meal_type', meal)
    .eq('status', 'planned')
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** Confirm all planned entries on a day → logged. Returns how many flipped. */
export async function confirmDay(date: string): Promise<number> {
  const { data, error } = await supabase
    .from('log_entries')
    .update({ status: 'logged' })
    .eq('log_date', date)
    .eq('status', 'planned')
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** Load a single entry for editing. */
export async function getEntry(id: number): Promise<LogEntry | null> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as LogEntry | null) ?? null;
}

/** Last N distinct foods logged, most recent first (LOG-3). */
export async function getRecentFoods(limit = 8): Promise<RecentFood[]> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('food_code, food_table, food_name, measure_name, quantity, created_at')
    .eq('status', 'logged')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const r of data ?? []) {
    const key = `${r.food_table}:${r.food_code ?? r.food_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      food_code: r.food_code,
      food_table: r.food_table,
      food_name: r.food_name,
      measure_name: r.measure_name,
      quantity: r.quantity,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** All entries for a given date, meal then time order (used by the Diary, M4). */
export async function getEntriesForDate(date: string): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('*')
    .eq('log_date', date)
    .order('meal_type', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as LogEntry[]) ?? [];
}
