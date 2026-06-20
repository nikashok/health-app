/**
 * Insights data access (M5). Thin queries; the rollup math lives in src/calc/insights.
 */
import type { MealType } from '@/types/db';

import { getDatabase } from './database';
import { ANY_LOGGED, DAILY_KCAL_RANGE, MEAL_KCAL_FOR_DATE } from './insightsSql';

/** date → consumed kcal for each day with logged data in [start, end]. */
export async function getDailyKcal(
  start: string,
  end: string
): Promise<Record<string, number>> {
  const rows = await getDatabase().getAllAsync<{ date: string; kcal: number }>(
    DAILY_KCAL_RANGE,
    start,
    end
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.date] = r.kcal ?? 0;
  return map;
}

/** meal → consumed kcal for one date (today's per-meal split). */
export async function getMealKcal(date: string): Promise<Record<MealType, number>> {
  const rows = await getDatabase().getAllAsync<{ meal_type: MealType; kcal: number }>(
    MEAL_KCAL_FOR_DATE,
    date
  );
  const out: Record<MealType, number> = { breakfast: 0, lunch: 0, snack: 0, dinner: 0 };
  for (const r of rows) out[r.meal_type] = r.kcal ?? 0;
  return out;
}

/** True once the user has logged anything (new-user gate). */
export async function hasAnyLogged(): Promise<boolean> {
  const row = await getDatabase().getFirstAsync<{ has: number }>(ANY_LOGGED);
  return !!row && row.has === 1;
}
