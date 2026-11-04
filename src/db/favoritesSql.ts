/**
 * favorite_foods SQL (shared with the headless verifier). Favourites hold no nutrition;
 * the last portion shown for a favourite comes from its most recent diary row.
 */

/** Favourites, newest first, with how each was last logged (for the one-tap "+"). */
export const LIST_FAVORITES = `
  SELECT f.fav_key, f.food_table, f.food_code, f.food_name, f.created_at,
         (SELECT e.measure_name FROM log_entries e
           WHERE e.food_table = f.food_table AND e.food_code = f.food_code
           ORDER BY e.created_at DESC LIMIT 1) AS measure_name,
         (SELECT e.quantity FROM log_entries e
           WHERE e.food_table = f.food_table AND e.food_code = f.food_code
           ORDER BY e.created_at DESC LIMIT 1) AS quantity,
         (SELECT e.kcal FROM log_entries e
           WHERE e.food_table = f.food_table AND e.food_code = f.food_code
           ORDER BY e.created_at DESC LIMIT 1) AS kcal
    FROM favorite_foods f
   ORDER BY f.created_at DESC`;

export const IS_FAVORITE = `SELECT 1 AS yes FROM favorite_foods WHERE fav_key = ?`;

export const INSERT_FAVORITE = `
  INSERT INTO favorite_foods (fav_key, food_table, food_code, food_name, created_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(fav_key) DO NOTHING`;

export const DELETE_FAVORITE = `DELETE FROM favorite_foods WHERE fav_key = ?`;

export const GET_FAVORITE = `SELECT * FROM favorite_foods WHERE fav_key = ?`;

/** "<food_table>:<food_code>" — same shape as the search boost key. */
export function favKey(foodTable: string, foodCode: string): string {
  return `${foodTable}:${foodCode}`;
}
