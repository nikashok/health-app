/**
 * Insights data access (M5) — now backed by Supabase. Only 'logged' rows count as
 * intake (CLAUDE.md rule 3); planned rows are excluded here. The ranges are small
 * (≤30 days), so we fetch the rows and aggregate client-side rather than via an RPC.
 * The rollup math lives in src/calc/insights.
 */
import type { MealType } from '@/types/db';

import { supabase } from './supabase';

/** date → consumed kcal for each day with logged data in [start, end]. */
export async function getDailyKcal(
  start: string,
  end: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('log_date, kcal')
    .eq('status', 'logged')
    .gte('log_date', start)
    .lte('log_date', end);
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const r of data ?? []) map[r.log_date] = (map[r.log_date] ?? 0) + (r.kcal ?? 0);
  return map;
}

/** meal → consumed kcal for one date (today's per-meal split). */
export async function getMealKcal(date: string): Promise<Record<MealType, number>> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('meal_type, kcal')
    .eq('status', 'logged')
    .eq('log_date', date);
  if (error) throw error;
  const out: Record<MealType, number> = { breakfast: 0, lunch: 0, snack: 0, dinner: 0 };
  for (const r of data ?? []) out[r.meal_type as MealType] += r.kcal ?? 0;
  return out;
}

/** True once the user has logged anything (new-user gate). */
export async function hasAnyLogged(): Promise<boolean> {
  const { count, error } = await supabase
    .from('log_entries')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'logged');
  if (error) throw error;
  return (count ?? 0) > 0;
}
