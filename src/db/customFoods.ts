/**
 * custom_foods data access (M3, CUST-1) — local-first with one-way backup to Supabase.
 * Quick-add a food the DB lacks; it becomes searchable (see search.ts) and loggable like
 * any other food. The client-generated `code` is the stable cross-store key, so pushes
 * are idempotent upserts.
 */
import type { CustomFood } from '@/types/db';

import { getDatabase } from './database';
import {
  DELETE_CUSTOM_FOOD,
  generateCustomCode,
  GET_CUSTOM_FOOD,
  INSERT_CUSTOM_FOOD,
  UPDATE_CUSTOM_FOOD,
} from './customFoodsSql';
import { enqueue, scheduleDrain } from './sync';

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

/** Insert a custom food, queue it for backup, and return its generated code. */
export async function insertCustomFood(f: NewCustomFood): Promise<string> {
  const db = getDatabase();
  const code = generateCustomCode();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
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
    await enqueue(db, 'custom_foods', code);
  });
  scheduleDrain();
  return code;
}

/** Full custom-food row (used to seed its default measure in the log picker). */
export async function getCustomFood(code: string): Promise<CustomFood | null> {
  const row = await getDatabase().getFirstAsync<CustomFood>(GET_CUSTOM_FOOD, code);
  return row ?? null;
}

/**
 * Update a custom food's details. Existing diary entries keep their nutrition SNAPSHOT
 * (CLAUDE.md rule 2) — edits here only affect future logs.
 */
export async function updateCustomFood(code: string, f: NewCustomFood): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      UPDATE_CUSTOM_FOOD,
      f.name,
      f.energy_kcal,
      f.protein_g ?? null,
      f.fat_g ?? null,
      f.carb_g ?? null,
      f.fibre_g ?? null,
      f.sodium_mg ?? null,
      f.default_measure_name ?? null,
      f.default_grams_per_unit ?? null,
      new Date().toISOString(),
      code
    );
    await enqueue(db, 'custom_foods', code);
  });
  scheduleDrain();
}

/** Delete a custom food. Past diary entries that referenced it keep their snapshot rows. */
export async function deleteCustomFood(code: string): Promise<void> {
  const db = getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(DELETE_CUSTOM_FOOD, code);
    await enqueue(db, 'custom_foods', code); // drain sees row gone → deletes remotely
  });
  scheduleDrain();
}
