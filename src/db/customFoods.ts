/**
 * custom_foods data access (M3, CUST-1). Quick-add a food the DB lacks; it becomes
 * searchable and loggable like any other food.
 */
import type { CustomFood } from '@/types/db';

import { getDatabase } from './database';
import {
  generateCustomCode,
  GET_CUSTOM_FOOD,
  INSERT_CUSTOM_FOOD,
} from './customFoodsSql';

export interface NewCustomFood {
  name: string;
  energy_kcal: number; // required (CUST-1)
  protein_g?: number | null;
  fat_g?: number | null;
  carb_g?: number | null;
  fibre_g?: number | null;
  sodium_mg?: number | null;
  default_measure_name?: string | null;
  default_grams_per_unit?: number | null;
}

/** Insert a custom food; returns its generated code. */
export async function insertCustomFood(f: NewCustomFood): Promise<string> {
  const db = getDatabase();
  const code = generateCustomCode();
  const now = new Date().toISOString();
  await db.runAsync(
    INSERT_CUSTOM_FOOD,
    code,
    f.name,
    f.energy_kcal,
    f.protein_g ?? null,
    f.fat_g ?? null,
    f.carb_g ?? null,
    f.fibre_g ?? null,
    f.sodium_mg ?? null,
    f.default_measure_name ?? null,
    f.default_grams_per_unit ?? null,
    now,
    now
  );
  return code;
}

/** Full custom-food row (used to seed its default measure in the log picker). */
export async function getCustomFood(code: string): Promise<CustomFood | null> {
  const row = await getDatabase().getFirstAsync<CustomFood>(GET_CUSTOM_FOOD, code);
  return row ?? null;
}
