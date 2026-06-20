/**
 * custom_foods write/read SQL (M3, CUST-1). Shared with the headless verifier.
 * Custom foods are shaped like the shared core columns so search/logging treat them
 * like any DB food (CUST-2).
 */

export const INSERT_CUSTOM_FOOD = `
  INSERT INTO custom_foods (
    code, name, energy_kcal, protein_g, fat_g, carb_g, fibre_g, sodium_mg,
    default_measure_name, default_grams_per_unit, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const INSERT_CUSTOM_FOOD_PARAMS = [
  'code',
  'name',
  'energy_kcal',
  'protein_g',
  'fat_g',
  'carb_g',
  'fibre_g',
  'sodium_mg',
  'default_measure_name',
  'default_grams_per_unit',
  'created_at',
  'updated_at',
] as const;

export const GET_CUSTOM_FOOD = `SELECT * FROM custom_foods WHERE code = ?`;

/** Generate a unique custom-food code, e.g. "CUST-LZ4F9-K2". Single-user, so a
 *  timestamp + small random suffix is collision-safe enough. */
export function generateCustomCode(now = Date.now(), rand = Math.random()): string {
  const ts = now.toString(36).toUpperCase();
  const suffix = Math.floor(rand * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0');
  return `CUST-${ts}-${suffix}`;
}
