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

/** Whether any logged entry exists at all (drives the new-user empty state). */
export const ANY_LOGGED = `SELECT EXISTS(SELECT 1 FROM log_entries WHERE status='logged') AS has`;
