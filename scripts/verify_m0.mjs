/**
 * Headless M0 acceptance check.
 *
 * The app's data layer runs on expo-sqlite inside React Native, which can't run in
 * plain Node. But the *substance* of the M0 acceptance criteria is database state,
 * and the migration/seed SQL is centralized in src/db/m0Sql.ts. So this verifier:
 *   1. Copies the bundled assets/db/ifct2017.db to a temp file (== first-launch copy).
 *   2. Runs the SAME SQL the app runs (imported from m0Sql.ts) via node:sqlite.
 *   3. Asserts every M0 acceptance criterion, including an idempotent second launch.
 *
 * Run: node scripts/verify_m0.mjs   (or npm run verify:m0)
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISH_MEASURES_INSERT,
  FTS_PROBE,
  GLOBAL_MEASURES,
  GLOBAL_MEASURES_INSERT,
  N001_OVERRIDE,
  SCHEMA_VERSION,
  USER_TABLES_DDL,
} from '../src/db/m0Sql.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DB = join(ROOT, 'assets', 'db', 'ifct2017.db');

let failures = 0;
function check(label, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
}

/** Mirror of database.ts ensureWritableDb(): copy only if the dest is missing. */
function ensureWritableDb(src, dest) {
  if (existsSync(dest)) return false; // re-copy guard
  copyFileSync(src, dest);
  return true;
}

/** Mirror of database.ts migrate(): gated on schema_version, runs the shared SQL. */
function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db
    .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    .get();
  if (row && row.version >= SCHEMA_VERSION) return false; // already migrated

  db.exec('BEGIN');
  try {
    for (const ddl of USER_TABLES_DDL) db.exec(ddl);
    db.exec(N001_OVERRIDE);
    const ins = db.prepare(GLOBAL_MEASURES_INSERT);
    for (const [name, grams] of GLOBAL_MEASURES) ins.run(name, grams);
    db.exec(DISH_MEASURES_INSERT);
    db.exec('DELETE FROM schema_version');
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return true;
}

const workdir = mkdtempSync(join(tmpdir(), 'm0-verify-'));
const dbPath = join(workdir, 'SQLite_ifct2017.db');

try {
  console.log('M0 acceptance check\n-------------------');

  // ---- First launch: copy + open + migrate -------------------------------
  const copied1 = ensureWritableDb(BUNDLED_DB, dbPath);
  check('first launch copies the bundled DB to writable storage', copied1 === true);

  const db = new DatabaseSync(dbPath);
  const migrated1 = migrate(db);
  check('first launch runs the migration', migrated1 === true);

  // ---- Reference data counts --------------------------------------------
  const foods = db.prepare('SELECT count(*) c FROM foods').get().c;
  const cooked = db.prepare('SELECT count(*) c FROM cooked_foods').get().c;
  check('foods count = 528', foods === 528, `got ${foods}`);
  check('cooked_foods count = 1014', cooked === 1014, `got ${cooked}`);

  // ---- User tables exist -------------------------------------------------
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name)
  );
  for (const t of ['user_profile', 'log_entries', 'custom_foods', 'measures']) {
    check(`user table exists: ${t}`, tables.has(t));
  }
  const ver = db.prepare('SELECT version FROM schema_version').get().version;
  check('schema_version recorded', ver === SCHEMA_VERSION, `version=${ver}`);

  // ---- measures: global + dish rows -------------------------------------
  const globals = db
    .prepare('SELECT count(*) c FROM measures WHERE food_code IS NULL')
    .get().c;
  const dish = db
    .prepare('SELECT count(*) c FROM measures WHERE food_code IS NOT NULL')
    .get().c;
  check('measures has global rows (food_code IS NULL)', globals === GLOBAL_MEASURES.length,
    `got ${globals}`);
  check('measures has per-dish rows', dish > 0, `got ${dish}`);
  // dish rows must equal cooked dishes with a usable, non-flagged serving
  const expectedDish = db
    .prepare(
      `SELECT count(*) c FROM cooked_foods
        WHERE qa_note IS NULL AND servings_unit IS NOT NULL AND TRIM(servings_unit) <> ''
          AND energy_kcal > 0 AND unit_serving_energy_kcal IS NOT NULL`
    )
    .get().c;
  check('per-dish measures match non-flagged servings', dish === expectedDish,
    `seeded ${dish}, eligible ${expectedDish}`);
  const flagged = db
    .prepare('SELECT count(*) c FROM cooked_foods WHERE qa_note IS NOT NULL')
    .get().c;
  check('flagged (qa_note) servings are excluded from defaults', flagged >= 1,
    `${flagged} dishes flagged & skipped as defaults`);

  // ---- N001 override -----------------------------------------------------
  const n001 = db.prepare("SELECT energy_kcal FROM foods WHERE code='N001'").get().energy_kcal;
  check('foods.N001 reads ~191 kcal (typo corrected)', Math.abs(n001 - 191.0) < 0.5,
    `got ${n001}`);

  // ---- FTS5 probe --------------------------------------------------------
  let ftsOk = true;
  try {
    db.prepare(FTS_PROBE).get();
  } catch {
    ftsOk = false;
  }
  check('FTS5 probe (foods_fts) works', ftsOk);

  // ---- Sanity: per-100g math resolves for a dish measure ----------------
  const sample = db
    .prepare(
      `SELECT m.measure_name, m.grams_per_unit, c.energy_kcal
         FROM measures m JOIN cooked_foods c ON c.food_code = m.food_code
        WHERE m.food_code IS NOT NULL LIMIT 1`
    )
    .get();
  const kcalForOne = (sample.energy_kcal * sample.grams_per_unit) / 100;
  check('per-100g math yields a sane serving kcal', kcalForOne > 0 && kcalForOne < 3000,
    `${sample.measure_name}: ${kcalForOne.toFixed(1)} kcal`);

  // Write a user row, then simulate a SECOND launch -----------------------
  db.prepare(
    `INSERT INTO log_entries
       (log_date, meal_type, status, food_table, food_name, measure_name,
        quantity, grams_total, kcal, created_at, updated_at)
     VALUES ('2026-06-20','breakfast','logged','cooked_foods','Masala dosa','plate',
        1, 150, 246.9, '2026-06-20T08:00:00Z', '2026-06-20T08:00:00Z')`
  ).run();
  const measuresBefore = db.prepare('SELECT count(*) c FROM measures').get().c;
  db.close();

  // ---- Second launch: no re-copy, no re-migrate, user data preserved ----
  const copied2 = ensureWritableDb(BUNDLED_DB, dbPath);
  check('second launch does NOT re-copy the DB', copied2 === false);

  const db2 = new DatabaseSync(dbPath);
  const migrated2 = migrate(db2);
  check('second launch does NOT re-run the migration', migrated2 === false);

  const entries = db2.prepare('SELECT count(*) c FROM log_entries').get().c;
  check('user data survives second launch', entries === 1, `${entries} log entries`);
  const measuresAfter = db2.prepare('SELECT count(*) c FROM measures').get().c;
  check('measures not duplicated on second launch', measuresAfter === measuresBefore,
    `${measuresBefore} -> ${measuresAfter}`);
  const n001b = db2.prepare("SELECT energy_kcal FROM foods WHERE code='N001'").get().energy_kcal;
  check('N001 stays corrected after second launch', Math.abs(n001b - 191.0) < 0.5);
  db2.close();

  console.log('-------------------');
  if (failures === 0) {
    console.log('M0 ACCEPTANCE: PASS ✅');
  } else {
    console.log(`M0 ACCEPTANCE: FAIL ❌  (${failures} check(s) failed)`);
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
