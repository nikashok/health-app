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

/**
 * Recents for a meal (LOG-3): foods you eat at this meal come first (how often in the
 * window, then how recently), then everything else by recency — so the list tops itself
 * up when the meal has little history. Bare columns follow the MAX(created_at) row, so
 * the re-add uses the last measure & quantity. Params: meal, window start date, limit.
 */
export const RECENT_FOODS_FOR_MEAL = `
  SELECT food_code, food_table, food_name, measure_name, quantity, kcal,
         MAX(created_at) AS last_logged,
         SUM(CASE WHEN meal_type = ? AND log_date >= ? THEN 1 ELSE 0 END) AS in_meal
    FROM log_entries
   GROUP BY food_table, COALESCE(food_code, food_name)
   ORDER BY in_meal DESC, last_logged DESC
   LIMIT ?`;

/** How a food was last logged (any meal) — Log Entry opens with this portion. */
export const LAST_ENTRY_FOR_FOOD = `
  SELECT measure_name, quantity
    FROM log_entries
   WHERE food_table = ? AND food_code = ?
   ORDER BY created_at DESC
   LIMIT 1`;

/** Undo a confirm: logged → planned for the given ids (only rows confirmed just now). */
export const REVERT_TO_PLANNED = (n: number) => `
  UPDATE log_entries SET status = 'planned', updated_at = ?
   WHERE status = 'logged' AND id IN (${Array(n).fill('?').join(',')})`;

/**
 * Move an entry to another meal/date without re-snapshotting — for entries whose food no
 * longer exists (a deleted custom food). The nutrition snapshot is left exactly as logged.
 */
export const MOVE_LOG_ENTRY = `
  UPDATE log_entries SET log_date = ?, meal_type = ?, status = ?, updated_at = ?
   WHERE id = ?`;
