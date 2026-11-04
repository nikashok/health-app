/**
 * Insights SQL (M5). Shared with the headless verifier.
 *
 * Insights are fast SUMs over the snapshot columns with no joins (PRD §7) and count
 * ONLY status='logged' rows — planned entries are never intake.
 */

/** Per-day consumed kcal over an inclusive [start, end] date range. */
export const DAILY_KCAL_RANGE = `
  SELECT log_date AS date, SUM(kcal) AS kcal
    FROM log_entries
   WHERE status = 'logged' AND log_date BETWEEN ? AND ?
   GROUP BY log_date`;

/** Per-meal consumed kcal for a single date (today's split, HOME-2). */
export const MEAL_KCAL_FOR_DATE = `
  SELECT meal_type, SUM(kcal) AS kcal
    FROM log_entries
   WHERE status = 'logged' AND log_date = ?
   GROUP BY meal_type`;

/**
 * Days with logged intake on or before a date, newest first (drives the logging streak,
 * which has no fixed window). Planned rows never count.
 */
export const LOGGED_DATES_DESC = `
  SELECT log_date AS date
    FROM log_entries
   WHERE status = 'logged' AND log_date <= ?
   GROUP BY log_date
  HAVING SUM(kcal) > 0
   ORDER BY log_date DESC
   LIMIT ?`;

/**
 * Logged diary rows in [start, end) for food-pattern detection (usual / last meal). Reads
 * snapshots only; the patterns derived from them are never stored (CLAUDE.md rule 5).
 */
export const LOGGED_ENTRIES_BETWEEN = `
  SELECT log_date, meal_type, food_table, food_code, food_name, measure_name, quantity, kcal, created_at
    FROM log_entries
   WHERE status = 'logged' AND log_date >= ? AND log_date < ?
   ORDER BY log_date, created_at`;

/** Whether any logged entry exists at all (drives the new-user empty state). */
export const ANY_LOGGED = `SELECT EXISTS(SELECT 1 FROM log_entries WHERE status='logged') AS has`;
