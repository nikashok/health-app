/**
 * custom_foods data access (M3, CUST-1) — now backed by Supabase (RLS owner-only, so
 * each user's custom foods are private and sync across their devices). Quick-add a
 * food the DB lacks; it becomes searchable (see search.ts) and loggable like any other.
 */
import type { CustomFood } from '@/types/db';

import { generateCustomCode } from './customFoodsSql';
import { supabase } from './supabase';

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

/** Insert a custom food; returns its generated code (unique per user). user_id is
 *  filled by the column default (auth.uid()) and enforced by RLS. */
export async function insertCustomFood(f: NewCustomFood): Promise<string> {
  const code = generateCustomCode();
  const { error } = await supabase.from('custom_foods').insert({
    code,
    name: f.name,
    energy_kcal: f.energy_kcal,
    protein_g: f.protein_g ?? null,
    fat_g: f.fat_g ?? null,
    carb_g: f.carb_g ?? null,
    fibre_g: f.fibre_g ?? null,
    sodium_mg: f.sodium_mg ?? null,
    default_measure_name: f.default_measure_name ?? null,
    default_grams_per_unit: f.default_grams_per_unit ?? null,
  });
  if (error) throw error;
  return code;
}

/** Full custom-food row (used to seed its default measure in the log picker). */
export async function getCustomFood(code: string): Promise<CustomFood | null> {
  const { data, error } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return (data as CustomFood | null) ?? null;
}

/**
 * Update a custom food's details. Note: existing diary entries keep their
 * nutrition SNAPSHOT (CLAUDE.md rule 2) — edits here only affect future logs.
 */
export async function updateCustomFood(code: string, f: NewCustomFood): Promise<void> {
  const { error } = await supabase
    .from('custom_foods')
    .update({
      name: f.name,
      energy_kcal: f.energy_kcal,
      protein_g: f.protein_g ?? null,
      fat_g: f.fat_g ?? null,
      carb_g: f.carb_g ?? null,
      fibre_g: f.fibre_g ?? null,
      sodium_mg: f.sodium_mg ?? null,
      default_measure_name: f.default_measure_name ?? null,
      default_grams_per_unit: f.default_grams_per_unit ?? null,
    })
    .eq('code', code);
  if (error) throw error;
}

/** Delete a custom food. Past diary entries that referenced it keep their snapshot
 *  rows (they store name + nutrition), so the diary is unaffected. */
export async function deleteCustomFood(code: string): Promise<void> {
  const { error } = await supabase.from('custom_foods').delete().eq('code', code);
  if (error) throw error;
}
