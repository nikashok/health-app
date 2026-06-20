/**
 * Headless M3 acceptance check (Log Food).
 *
 * Runs the SAME calc (src/calc/logEntry.ts) + SQL (measuresSql, logEntriesSql,
 * customFoodsSql, searchSql) the app uses, against a migrated copy of the bundled DB:
 *  - logging 150 g of Masala dosa writes kcal = 246.9 with proportional macros,
 *  - a household measure scales correctly,
 *  - recents list prior foods, and
 *  - a custom food saves and is reusable in search + loggable.
 *
 * Run: node scripts/verify_m3.mjs   (or npm run verify:m3)
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISH_MEASURES_INSERT,
  GLOBAL_MEASURES,
  GLOBAL_MEASURES_INSERT,
  N001_OVERRIDE,
  SCHEMA_VERSION,
  USER_TABLES_DDL,
} from '../src/db/m0Sql.ts';
import { gramsTotal, round1, snapshotNutrition } from '../src/calc/logEntry.ts';
import {
  composeMeasures,
  defaultMeasure,
  MEASURES_FOR_FOOD,
} from '../src/db/measuresSql.ts';
import { INSERT_LOG_ENTRY, RECENT_FOODS } from '../src/db/logEntriesSql.ts';
import {
  generateCustomCode,
  GET_CUSTOM_FOOD,
  INSERT_CUSTOM_FOOD,
} from '../src/db/customFoodsSql.ts';
import {
  buildCustomLikeSql,
  buildLikeTerms,
  GET_CUSTOM_BY_CODE,
  kindToTable,
} from '../src/db/searchSql.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DB = join(ROOT, 'assets', 'db', 'ifct2017.db');
const DATE = '2026-06-20';

let failures = 0;
function check(label, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
}

function applyM0(db) {
  db.exec('BEGIN');
  for (const ddl of USER_TABLES_DDL) db.exec(ddl);
  db.exec(N001_OVERRIDE);
  const ins = db.prepare(GLOBAL_MEASURES_INSERT);
  for (const [name, grams] of GLOBAL_MEASURES) ins.run(name, grams);
  db.exec(DISH_MEASURES_INSERT);
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  db.exec('COMMIT');
}

// Mirror of src/db/logEntries.ts logFood (synchronous).
function logFood(db, food, measureName, gpu, qty, meal, when, status = 'logged') {
  const grams = gramsTotal(qty, gpu);
  const snap = snapshotNutrition(food, grams);
  const r = db.prepare(INSERT_LOG_ENTRY).run(
    DATE, meal, status, food.code, kindToTable(food.kind), food.name,
    measureName, qty, grams, snap.kcal, snap.protein_g, snap.fat_g, snap.carb_g,
    snap.fibre_g, when, when
  );
  return { id: r.lastInsertRowid, grams, snap };
}

const workdir = mkdtempSync(join(tmpdir(), 'm3-verify-'));
const dbPath = join(workdir, 'ifct2017.db');

try {
  console.log('M3 acceptance check\n-------------------');
  copyFileSync(BUNDLED_DB, dbPath);
  const db = new DatabaseSync(dbPath);
  applyM0(db);

  const dosa = {
    ...db.prepare(
      `SELECT food_code AS code, food_name AS name, energy_kcal, protein_g, fat_g, carb_g, fibre_g
         FROM cooked_foods WHERE food_code='ASC146'`
    ).get(),
    kind: 'cooked',
  };

  // ---- Measure picker --------------------------------------------------
  const opts = composeMeasures(db.prepare(MEASURES_FOR_FOOD).all('ASC146'));
  const def = defaultMeasure(opts);
  check('measure picker offers grams (factor 1)',
    opts.some((o) => o.measure_name === 'grams' && o.grams_per_unit === 1));
  check('dish default measure is the INDB serving, not grams',
    def && def.is_default && def.measure_name !== 'grams', `default=${def?.measure_name}`);
  const katori = opts.find((o) => o.measure_name === 'katori');
  check('global household measures are offered (katori = 150 g)',
    katori && katori.grams_per_unit === 150);

  // ---- The 246.9 kcal dosa case ----------------------------------------
  const r1 = logFood(db, dosa, 'grams', 1, 150, 'breakfast', '2026-06-20T08:00:01Z');
  check('150 g Masala dosa snapshot = 246.9 kcal', r1.snap.kcal === 246.9, `kcal=${r1.snap.kcal}`);
  const row = db.prepare('SELECT * FROM log_entries WHERE id = ?').get(r1.id);
  check('stored row kcal = 246.9', row.kcal === 246.9, `kcal=${row.kcal}`);
  check('stored grams_total = 150', row.grams_total === 150);
  check('stored status = logged', row.status === 'logged');
  check('stored food_table = cooked_foods', row.food_table === 'cooked_foods');
  check('stored meal + date', row.meal_type === 'breakfast' && row.log_date === DATE);
  check('macros are proportional (×1.5)',
    row.protein_g === round1(dosa.protein_g * 1.5) &&
      row.carb_g === round1(dosa.carb_g * 1.5) &&
      row.fat_g === round1(dosa.fat_g * 1.5),
    `P${row.protein_g} C${row.carb_g} F${row.fat_g}`);

  // ---- Household measure scales correctly ------------------------------
  const r2 = logFood(db, dosa, 'katori', katori.grams_per_unit, 2, 'lunch', '2026-06-20T08:00:02Z');
  const expectedKcal = round1(dosa.energy_kcal * 3); // 2 × 150 g = 300 g
  check('2 katori (300 g) scales grams + kcal',
    r2.grams === 300 && r2.snap.kcal === expectedKcal, `grams=${r2.grams} kcal=${r2.snap.kcal}`);

  // ---- Custom food: save, reusable in search, loggable -----------------
  const code = generateCustomCode();
  db.prepare(INSERT_CUSTOM_FOOD).run(
    code, 'Test Bhaji', 200, 5, null, null, null, null, 'bowl', 180,
    '2026-06-20T08:00:03Z', '2026-06-20T08:00:03Z'
  );
  const stored = db.prepare(GET_CUSTOM_FOOD).get(code);
  check('custom food saved', stored && stored.name === 'Test Bhaji');

  const terms = buildLikeTerms('bhaji');
  const found = db.prepare(buildCustomLikeSql(terms.length)).all(...terms, 50);
  check('custom food is reusable in search (kind=custom)',
    found.some((f) => f.code === code && f.kind === 'custom'), `${found.length} match(es)`);
  const byCode = db.prepare(GET_CUSTOM_BY_CODE).get(code);
  check('custom food resolves by code', byCode && byCode.name === 'Test Bhaji');

  const custom = { code, name: 'Test Bhaji', kind: 'custom', energy_kcal: 200,
    protein_g: 5, fat_g: null, carb_g: null, fibre_g: null };
  const r3 = logFood(db, custom, 'grams', 1, 100, 'snack', '2026-06-20T08:00:04Z');
  const crow = db.prepare('SELECT * FROM log_entries WHERE id = ?').get(r3.id);
  check('custom food logs as a snapshot row (200 kcal, table=custom)',
    crow.kcal === 200 && crow.food_table === 'custom');

  // ---- Recently logged --------------------------------------------------
  const recents = db.prepare(RECENT_FOODS).all(8);
  const names = recents.map((r) => r.food_name);
  check('recents list prior foods', names.includes('Masala dosa') && names.includes('Test Bhaji'),
    names.join(' | '));
  check('recents are distinct (dosa logged twice, listed once)',
    names.filter((n) => n === 'Masala dosa').length === 1);
  check('recents most-recent first', recents[0].food_name === 'Test Bhaji',
    `first=${recents[0].food_name}`);

  db.close();
  console.log('-------------------');
  console.log(failures === 0 ? 'M3 ACCEPTANCE: PASS ✅' : `M3 ACCEPTANCE: FAIL ❌  (${failures} failed)`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
