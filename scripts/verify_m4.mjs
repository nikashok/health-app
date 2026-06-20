/**
 * Headless M4 acceptance check (Diary / Day + edit).
 *
 * Runs the SAME calc (logEntry, dayTotals) + SQL (logEntriesSql) the app uses against
 * a migrated DB copy:
 *  - entries appear under the right meal/date,
 *  - editing re-snapshots (kcal recomputes),
 *  - moving an entry updates BOTH days' totals,
 *  - a future date is planned and excluded from consumed intake.
 *
 * Run: node scripts/verify_m4.mjs   (or npm run verify:m4)
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
import { consumedTotals, groupByMeal, plannedTotals } from '../src/calc/dayTotals.ts';
import {
  DELETE_LOG_ENTRY,
  GET_ENTRY,
  INSERT_LOG_ENTRY,
  UPDATE_LOG_ENTRY,
} from '../src/db/logEntriesSql.ts';
import { kindToTable } from '../src/db/searchSql.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DB = join(ROOT, 'assets', 'db', 'ifct2017.db');
const TODAY = '2026-06-20';
const D1 = '2026-06-18';
const D2 = '2026-06-19';
const FUTURE = '2026-07-01';

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

let clock = 0;
const nextTs = () => `2026-06-20T08:00:${String(clock++).padStart(2, '0')}Z`;

function logFood(db, food, gpu, qty, meal, date, status = 'logged') {
  const grams = gramsTotal(qty, gpu);
  const snap = snapshotNutrition(food, grams);
  const ts = nextTs();
  const r = db.prepare(INSERT_LOG_ENTRY).run(
    date, meal, status, food.code, kindToTable(food.kind), food.name,
    'grams', qty, grams, snap.kcal, snap.protein_g, snap.fat_g, snap.carb_g,
    snap.fibre_g, ts, ts
  );
  return r.lastInsertRowid;
}
function updateEntry(db, id, food, gpu, qty, meal, date, status) {
  const grams = gramsTotal(qty, gpu);
  const snap = snapshotNutrition(food, grams);
  db.prepare(UPDATE_LOG_ENTRY).run(
    date, meal, status, food.code, kindToTable(food.kind), food.name, 'grams',
    qty, grams, snap.kcal, snap.protein_g, snap.fat_g, snap.carb_g, snap.fibre_g,
    nextTs(), id
  );
}
const forDate = (db, date) =>
  db.prepare('SELECT * FROM log_entries WHERE log_date=? ORDER BY meal_type, created_at').all(date);

const workdir = mkdtempSync(join(tmpdir(), 'm4-verify-'));
const dbPath = join(workdir, 'ifct2017.db');

try {
  console.log('M4 acceptance check\n-------------------');
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
  const E = dosa.energy_kcal;

  // ---- Entries appear under the right meal/date ------------------------
  const e1 = logFood(db, dosa, 1, 150, 'breakfast', D1); // 246.9
  const e2 = logFood(db, dosa, 1, 100, 'lunch', D1); // 164.6
  const e3 = logFood(db, dosa, 1, 200, 'breakfast', D2); // 329.2

  let d1 = forDate(db, D1);
  const g1 = groupByMeal(d1);
  check('D1 has the two D1 entries under the right meals',
    g1.breakfast.length === 1 && g1.lunch.length === 1 && g1.dinner.length === 0);
  check('D2 entry is not on D1', !d1.some((e) => e.id === e3));
  check('D1 consumed total = sum of its logged entries',
    round1(consumedTotals(d1).kcal) === round1(E * 1.5 + E * 1.0),
    `kcal=${round1(consumedTotals(d1).kcal)}`);

  // ---- Editing re-snapshots -------------------------------------------
  updateEntry(db, e1, dosa, 1, 300, 'breakfast', D1, 'logged'); // 150g -> 300g
  const e1row = db.prepare(GET_ENTRY).get(e1);
  check('edit re-snapshots kcal (150 g -> 300 g)',
    e1row.kcal === round1(E * 3) && e1row.grams_total === 300, `kcal=${e1row.kcal}`);

  // ---- Moving an entry updates BOTH days ------------------------------
  const d1BeforeMove = round1(consumedTotals(forDate(db, D1)).kcal);
  const d2BeforeMove = round1(consumedTotals(forDate(db, D2)).kcal);
  updateEntry(db, e2, dosa, 1, 100, 'lunch', D2, 'logged'); // move D1 -> D2
  const d1AfterMove = round1(consumedTotals(forDate(db, D1)).kcal);
  const d2AfterMove = round1(consumedTotals(forDate(db, D2)).kcal);
  check('move: source day total drops by the entry',
    round1(d1BeforeMove - d1AfterMove) === round1(E * 1.0), `${d1BeforeMove} -> ${d1AfterMove}`);
  check('move: destination day total rises by the entry',
    round1(d2AfterMove - d2BeforeMove) === round1(E * 1.0), `${d2BeforeMove} -> ${d2AfterMove}`);

  // ---- Moving across meals --------------------------------------------
  updateEntry(db, e1, dosa, 1, 300, 'dinner', D1, 'logged'); // breakfast -> dinner
  const g1b = groupByMeal(forDate(db, D1));
  check('move across meals re-buckets the entry',
    g1b.dinner.length === 1 && g1b.breakfast.length === 0);

  // ---- Future date => planned, excluded from consumed ------------------
  updateEntry(db, e3, dosa, 1, 200, 'breakfast', FUTURE, 'planned'); // move D2 -> future
  const fut = forDate(db, FUTURE);
  check('future entry stored as planned', fut[0].status === 'planned');
  check('planned entry excluded from consumed intake', consumedTotals(fut).kcal === 0);
  check('planned entry counted in planned projection',
    round1(plannedTotals(fut).kcal) === round1(E * 2), `planned=${round1(plannedTotals(fut).kcal)}`);
  check('navigating to a future date returns its entries', fut.length === 1 && FUTURE > TODAY);

  // ---- Delete ----------------------------------------------------------
  db.prepare(DELETE_LOG_ENTRY).run(e1);
  check('delete removes the entry', db.prepare(GET_ENTRY).get(e1) === undefined);

  db.close();
  console.log('-------------------');
  console.log(failures === 0 ? 'M4 ACCEPTANCE: PASS ✅' : `M4 ACCEPTANCE: FAIL ❌  (${failures} failed)`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
