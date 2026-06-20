/**
 * Logging math (M3, PRD §8) — the per-100g basis, the only trustworthy one.
 *
 *   grams_total = quantity × grams_per_unit
 *   value       = per100g × grams_total / 100      (kcal and every macro)
 *
 * Hard rule (CLAUDE.md): never compute from the serving_* columns. These results are
 * snapshotted into a log_entries row at save time and never recomputed afterwards.
 *
 * Pure + deterministic so it is unit-tested (logEntry.test.ts) and verified headlessly.
 */

/** Per-100g nutrition of a food (from foods / cooked_foods / custom_foods). */
export interface Per100g {
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fibre_g: number | null;
}

/** The snapshot written into a log_entries row. kcal is always present. */
export interface NutritionSnapshot {
  kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fibre_g: number | null;
}

/** Round to 1 decimal place (the precision the source data supports). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Resolve a chosen measure × quantity to grams. */
export function gramsTotal(quantity: number, gramsPerUnit: number): number {
  return round1(quantity * gramsPerUnit);
}

/**
 * Scale per-100g nutrition to `grams`. A null macro stays null (unknown, not zero);
 * kcal coerces a missing energy to 0 so the NOT NULL column is always satisfiable.
 */
export function snapshotNutrition(food: Per100g, grams: number): NutritionSnapshot {
  const scale = grams / 100;
  const macro = (n: number | null) => (n == null ? null : round1(n * scale));
  return {
    kcal: round1((food.energy_kcal ?? 0) * scale),
    protein_g: macro(food.protein_g),
    fat_g: macro(food.fat_g),
    carb_g: macro(food.carb_g),
    fibre_g: macro(food.fibre_g),
  };
}
