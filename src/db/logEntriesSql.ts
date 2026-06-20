/**
 * log_entries write + recents SQL (M3). Shared with the headless verifier.
 *
 * Each row is a self-contained snapshot (PRD §7): the nutrition columns are computed
 * once at save time and never recomputed from food_code.
 */

export const INSERT_LOG_ENTRY = `
  INSERT INTO log_entries (
    log_date, meal_type, status, food_code, food_table, food_name,
    measure_name, quantity, grams_total, kcal, protein_g, fat_g, carb_g, fibre_g,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Param order for INSERT_LOG_ENTRY. */
export const INSERT_LOG_ENTRY_PARAMS = [
  'log_date',
  'meal_type',
  'status',
  'food_code',
  'food_table',
  'food_name',
  'measure_name',
  'quantity',
  'grams_total',
  'kcal',
  'protein_g',
  'fat_g',
  'carb_g',
  'fibre_g',
  'created_at',
  'updated_at',
] as const;

export const GET_ENTRY = `SELECT * FROM log_entries WHERE id = ?`;

/**
 * Re-snapshot an existing entry (EDIT-1…4). All mutable fields are rewritten,
 * including food (a dish change), measure/quantity/grams, the recomputed nutrition
 * snapshot, and the meal/date (a move). created_at is preserved; updated_at advances.
 */
export const UPDATE_LOG_ENTRY = `
  UPDATE log_entries SET
    log_date = ?, meal_type = ?, status = ?, food_code = ?, food_table = ?,
    food_name = ?, measure_name = ?, quantity = ?, grams_total = ?, kcal = ?,
    protein_g = ?, fat_g = ?, carb_g = ?, fibre_g = ?, updated_at = ?
  WHERE id = ?`;

export const DELETE_LOG_ENTRY = `DELETE FROM log_entries WHERE id = ?`;

// ---- Confirm a plan ("Ate it"): planned -> logged (M6, PLAN-4) -----------
// Each only flips status='planned' rows, so confirming is idempotent and never
// touches already-logged intake. updated_at advances; the snapshot is unchanged.
export const CONFIRM_ENTRY = `
  UPDATE log_entries SET status='logged', updated_at=?
   WHERE id=? AND status='planned'`;
export const CONFIRM_MEAL = `
  UPDATE log_entries SET status='logged', updated_at=?
   WHERE log_date=? AND meal_type=? AND status='planned'`;
export const CONFIRM_DAY = `
  UPDATE log_entries SET status='logged', updated_at=?
   WHERE log_date=? AND status='planned'`;

/**
 * Recently logged distinct foods, most recent first (LOG-3). Grouping on
 * (food_table, food_code-or-name) collapses repeats; the bare measure/quantity columns
 * come from the most-recent row in each group (SQLite's documented MAX() bare-column
 * behavior) so a one-tap re-add can reuse the last measure & quantity.
 */
export const RECENT_FOODS = `
  SELECT food_code, food_table, food_name, measure_name, quantity,
         MAX(created_at) AS last_logged
    FROM log_entries
   GROUP BY food_table, COALESCE(food_code, food_name)
   ORDER BY last_logged DESC
   LIMIT ?`;
