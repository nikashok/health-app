/**
 * M0 migration — single source of truth for the runtime schema + seed.
 *
 * This module is intentionally pure data (SQL strings + a tiny helper). It is
 * imported both by the app's migration runner (`database.ts`, via expo-sqlite)
 * and by the headless acceptance verifier (`scripts/verify_m0.mjs`, via
 * node:sqlite). Keeping the SQL here — and nowhere else — guarantees the thing we
 * verify is exactly the thing the app runs.
 *
 * What runs at runtime (on the writable copy of the bundled DB), once, gated by
 * `schema_version`:
 *   1. Create user tables: user_profile, log_entries, custom_foods, measures.
 *   2. Correct the foods.N001 source typo (~383 -> 191 kcal). See CLAUDE.md rule 4.
 *   3. Seed `measures`: global household measures + per-dish INDB serving units.
 *
 * The reference tables (foods, cooked_foods, *_fts) ship inside the bundled DB and
 * are never created or mutated here, except the one documented N001 correction.
 */

export const SCHEMA_VERSION = 1;

/** DDL for the four user tables (+ supporting indexes). All IF NOT EXISTS. */
export const USER_TABLES_DDL: string[] = [
  // Single-row profile. id is pinned to 1.
  `CREATE TABLE IF NOT EXISTS user_profile (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     sex TEXT,
     age INTEGER,
     dob TEXT,
     height_cm REAL,
     weight_kg REAL,
     activity_level TEXT,
     goal TEXT,
     target_kcal REAL,
     target_protein_g REAL,
     target_carb_g REAL,
     target_fat_g REAL,
     targets_source TEXT,
     created_at TEXT,
     updated_at TEXT
   )`,

  // The diary. Future log_date allowed (meal planning). status gates intake.
  // Nutrition columns are snapshots written at log time (PRD §7) — never recomputed.
  `CREATE TABLE IF NOT EXISTS log_entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     log_date TEXT NOT NULL,
     meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','snack','dinner')),
     status TEXT NOT NULL DEFAULT 'logged' CHECK (status IN ('planned','logged')),
     food_code TEXT,
     food_table TEXT NOT NULL CHECK (food_table IN ('foods','cooked_foods','custom')),
     food_name TEXT NOT NULL,
     measure_name TEXT NOT NULL,
     quantity REAL NOT NULL,
     grams_total REAL NOT NULL,
     kcal REAL NOT NULL,
     protein_g REAL,
     fat_g REAL,
     carb_g REAL,
     fibre_g REAL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_log_entries_date_status
     ON log_entries (log_date, status)`,

  // User-added foods, shaped like the shared core columns so search/log treat them
  // uniformly with foods/cooked_foods. name + calories required (CUST-1).
  `CREATE TABLE IF NOT EXISTS custom_foods (
     code TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     energy_kcal REAL NOT NULL,
     protein_g REAL,
     fat_g REAL,
     carb_g REAL,
     fibre_g REAL,
     sodium_mg REAL,
     default_measure_name TEXT,
     default_grams_per_unit REAL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,

  // Measures. food_code IS NULL => global household measure usable by any food.
  `CREATE TABLE IF NOT EXISTS measures (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     food_code TEXT,
     food_table TEXT,
     measure_name TEXT NOT NULL,
     grams_per_unit REAL NOT NULL,
     is_default INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS idx_measures_food ON measures (food_code)`,
];

/**
 * N001 source-typo correction (CLAUDE.md rule 4). The bundled DB keeps the raw
 * IFCT value (~383.6 kcal); this one-time migration fixes the writable copy.
 */
export const N001_OVERRIDE =
  `UPDATE foods SET energy_kcal = 191.0, energy_kj = 801.0 WHERE code = 'N001'`;

/**
 * Global household measures (PRD §9 #2, standardized weights).
 * PLACEHOLDER grams — flagged weak; VERIFY against NIN household-measure tables.
 * food_code/food_table NULL => available to every food. Not marked default: the UI
 * picks a global fallback when a food has no usable default of its own.
 * "grams" is deliberately NOT stored — the UI always offers it at factor 1.
 */
export const GLOBAL_MEASURES: ReadonlyArray<readonly [string, number]> = [
  ['katori', 150], // TODO(M0): verify vs NIN household-measure tables
  ['bowl', 200],
  ['cup', 240],
  ['glass', 250],
  ['tbsp', 15],
  ['tsp', 5],
  ['piece', 30],
];

export const GLOBAL_MEASURES_INSERT =
  `INSERT INTO measures (food_code, food_table, measure_name, grams_per_unit, is_default)
   VALUES (NULL, NULL, ?, ?, 0)`;

/**
 * Per-dish default measure from each cooked dish's INDB serving unit.
 * grams_per_unit = unit_serving_energy_kcal / energy_kcal * 100 (per-100g basis).
 * Skips dishes flagged broken (qa_note IS NOT NULL — the unreliable serving sizes)
 * and dishes with no usable serving unit/energy; those fall back to a global measure.
 */
export const DISH_MEASURES_INSERT =
  `INSERT INTO measures (food_code, food_table, measure_name, grams_per_unit, is_default)
   SELECT food_code, 'cooked_foods', servings_unit,
          unit_serving_energy_kcal / energy_kcal * 100.0, 1
     FROM cooked_foods
    WHERE qa_note IS NULL
      AND servings_unit IS NOT NULL AND TRIM(servings_unit) <> ''
      AND energy_kcal IS NOT NULL AND energy_kcal > 0
      AND unit_serving_energy_kcal IS NOT NULL`;

/** FTS5 probe (M0 task 3). If this throws, the app falls back to LIKE search. */
export const FTS_PROBE = `SELECT * FROM foods_fts LIMIT 1`;

/**
 * Sync schema (local-first backup to Supabase). Layered ON TOP of M0 idempotently on
 * every launch (see migrate.ts `ensureSyncSchema`) — deliberately NOT part of
 * USER_TABLES_DDL or the SCHEMA_VERSION gate, so the M0 acceptance verifiers are
 * unaffected and M0's non-idempotent measures seed is never re-run.
 *
 *  - sync_outbox: a durable dirty-key set. One row per (table, key) that needs pushing;
 *    the drain re-reads the current local row and upserts it (or deletes remotely if the
 *    local row is gone), so it always pushes the latest local truth and self-collapses.
 *  - sync_meta:   tiny key/value store (e.g. the one-time `hydrated` marker, last sync).
 *  - log_entries.sync_uuid: a stable, client-owned key (custom_foods already has `code`,
 *    user_profile is single-row) so pushes are idempotent upserts.
 */
export const SYNC_TABLES_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS sync_outbox (
     table_name TEXT NOT NULL,
     row_key    TEXT NOT NULL,
     queued_at  TEXT NOT NULL,
     attempts   INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (table_name, row_key)
   )`,
  `CREATE TABLE IF NOT EXISTS sync_meta (
     key   TEXT PRIMARY KEY,
     value TEXT
   )`,
];

/**
 * Daily body measurements (weight + waist), one row per day. Added idempotently every
 * launch (same path as the sync tables) so it lands on existing installs without a
 * SCHEMA_VERSION bump. Single-user locally, so `measured_on` is the primary key; the
 * date is also the stable cross-store key for backup (remote keys on user_id + date).
 */
export const BODY_MEASUREMENTS_DDL =
  `CREATE TABLE IF NOT EXISTS body_measurements (
     measured_on TEXT PRIMARY KEY,
     weight_kg   REAL,
     waist_cm    REAL,
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`;

/**
 * Starred foods (Add Food shows them first). Added idempotently every launch, like
 * body_measurements. `fav_key` = "<food_table>:<food_code>" is the primary key locally
 * and the stable cross-store key for backup (remote keys on user_id + fav_key).
 * food_name is a display copy only — favourites never carry nutrition.
 */
export const FAVORITE_FOODS_DDL =
  `CREATE TABLE IF NOT EXISTS favorite_foods (
     fav_key    TEXT PRIMARY KEY,
     food_table TEXT NOT NULL,
     food_code  TEXT NOT NULL,
     food_name  TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`;

/** Column we add to log_entries if missing (SQLite has no ADD COLUMN IF NOT EXISTS). */
export const LOG_ENTRIES_SYNC_UUID_COLUMN = 'sync_uuid';
export const ADD_LOG_ENTRIES_SYNC_UUID =
  `ALTER TABLE log_entries ADD COLUMN sync_uuid TEXT`;
export const INDEX_LOG_ENTRIES_SYNC_UUID =
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_log_entries_sync_uuid
     ON log_entries (sync_uuid) WHERE sync_uuid IS NOT NULL`;
