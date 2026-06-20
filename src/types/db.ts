/**
 * Row types for the data model (PRD §7). Reference tables (foods, cooked_foods) are
 * read-only; the rest are user tables created by the M0 migration.
 */

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type EntryStatus = 'planned' | 'logged';
export type FoodTable = 'foods' | 'cooked_foods' | 'custom';
export type TargetsSource = 'computed' | 'manual';

/** IFCT 2017 raw ingredient (bundled, read-only). */
export interface Food {
  code: string;
  name: string;
  common_name: string | null;
  scientific_name: string | null;
  group_code: string | null;
  food_group: string | null;
  energy_kcal: number | null;
  energy_kj: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fibre_g: number | null;
  water_g: number | null;
  ash_g: number | null;
  regions: string | null;
  qa_note: string | null;
}

/** INDB 2024 cooked dish (bundled, read-only). qa_note flags an unreliable serving. */
export interface CookedFood {
  food_code: string;
  food_name: string;
  primarysource: string | null;
  energy_kcal: number | null;
  energy_kj: number | null;
  carb_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  freesugar_g: number | null;
  fibre_g: number | null;
  sodium_mg: number | null;
  servings_unit: string | null;
  unit_serving_energy_kcal: number | null;
  qa_note: string | null;
}

export interface UserProfile {
  id: 1;
  sex: string | null;
  age: number | null;
  dob: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: string | null;
  goal: string | null;
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carb_g: number | null;
  target_fat_g: number | null;
  targets_source: TargetsSource | null;
  created_at: string | null;
  updated_at: string | null;
}

/** A diary row. Nutrition fields are snapshots written at log time (never recomputed). */
export interface LogEntry {
  id: number;
  log_date: string; // YYYY-MM-DD (future allowed for planning)
  meal_type: MealType;
  status: EntryStatus;
  food_code: string | null;
  food_table: FoodTable;
  food_name: string;
  measure_name: string;
  quantity: number;
  grams_total: number;
  kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fibre_g: number | null;
  created_at: string;
  updated_at: string;
}

export interface CustomFood {
  code: string;
  name: string;
  energy_kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  fibre_g: number | null;
  sodium_mg: number | null;
  default_measure_name: string | null;
  default_grams_per_unit: number | null;
  created_at: string;
  updated_at: string;
}

/** food_code IS NULL => global household measure available to any food. */
export interface Measure {
  id: number;
  food_code: string | null;
  food_table: FoodTable | null;
  measure_name: string;
  grams_per_unit: number;
  is_default: number; // 0 | 1
}
