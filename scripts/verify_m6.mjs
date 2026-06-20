/**
 * Headless M6 acceptance check (meal planning / confirm-to-log).
 *
 * Runs the SAME calc (dayTotals) + SQL (logEntriesSql confirm statements) the app uses
 * against a migrated DB copy:
 *  - a dish planned for tomorrow is `planned`, shows in tomorrow's plan-vs-target, and
 *    contributes nothing to today's consumed,
 *  - confirming flips planned→logged and updates intake,
 *  - an unconfirmed PAST plan is never counted as eaten,
 *  - Confirm-all per meal / per day work and are idempotent.
 *
 * Run: node scripts/verify_m6.mjs   (or npm run verify:m6)
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
import {
  CONFIRM_DAY,
  CONFIRM_ENTRY,
  CONFIRM_MEAL,
  INSERT_LOG_ENTRY,
} from '../src/db/logEntriesSql.ts';
import { consumedTotals, plannedTotals } from '../src/calc/dayTotals.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DB = join(ROOT, 'assets', 'db', 'ifct2017.db');
const TODAY = '2026-06-20';
const TOMORROW = '2026-06-21';
const YESTERDAY = '2026-06-19';

let failures = 0;
function check(label, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
}
const near = (a, b) => Math.abs(a - b) < 0.05;

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
const ts = () => `2026-06-20T08:00:${String(clock++).padStart(2, '0')}Z`;
function ins(db, date, meal, kcal, status) {
  const t = ts();
  const r = db.prepare(INSERT_LOG_ENTRY).run(
    date, meal, status, 'X', 'cooked_foods', 'Test', 'grams', 1, 100, kcal,
    null, null, null, null, t, t
  );
  return r.lastInsertRowid;
}
const forDate = (db, d) => db.prepare('SELECT * FROM log_entries WHERE log_date=?').all(d);
const status = (db, id) => db.prepare('SELECT status FROM log_entries WHERE id=?').get(id).status;
const consumedKcal = (db, d) => consumedTotals(forDate(db, d)).kcal;

const workdir = mkdtempSync(join(tmpdir(), 'm6-verify-'));
const dbPath = join(workdir, 'ifct2017.db');

try {
  console.log('M6 acceptance check\n-------------------');
  copyFileSync(BUNDLED_DB, dbPath);
  const db = new DatabaseSync(dbPath);
  applyM0(db);

  // ---- Plan a dish tomorrow -------------------------------------------
  const todayBreakfast = ins(db, TODAY, 'breakfast', 246.9, 'logged');
  const tomorrowPlan = ins(db, TOMORROW, 'dinner', 500, 'planned');

  check('a dish planned for tomorrow is stored as planned', status(db, tomorrowPlan) === 'planned');
  check('tomorrow plan-vs-target shows planned total',
    near(plannedTotals(forDate(db, TOMORROW)).kcal, 500));
  check('tomorrow has no consumed intake', consumedKcal(db, TOMORROW) === 0);
  check("tomorrow's plan contributes nothing to today's consumed",
    near(consumedKcal(db, TODAY), 246.9), `today=${consumedKcal(db, TODAY)}`);

  // ---- Confirm a TODAY plan flips status + updates intake --------------
  const todayPlan = ins(db, TODAY, 'dinner', 300, 'planned');
  check('today planned entry excluded from consumed before confirm',
    near(consumedKcal(db, TODAY), 246.9));
  db.prepare(CONFIRM_ENTRY).run(ts(), todayPlan);
  check('confirm flips planned → logged', status(db, todayPlan) === 'logged');
  check('confirm updates consumed intake', near(consumedKcal(db, TODAY), 546.9),
    `today=${consumedKcal(db, TODAY)}`);

  // ---- An unconfirmed PAST plan is NOT eaten --------------------------
  const pastPlan = ins(db, YESTERDAY, 'lunch', 400, 'planned');
  check('past plan stays planned (unconfirmed)', status(db, pastPlan) === 'planned');
  check('unconfirmed past plan is NOT counted as consumed', consumedKcal(db, YESTERDAY) === 0,
    `yesterday=${consumedKcal(db, YESTERDAY)}`);
  const dayChanges = db.prepare(CONFIRM_DAY).run(ts(), YESTERDAY).changes;
  check('Confirm-day flips the past plan once arrived', dayChanges === 1 && status(db, pastPlan) === 'logged');
  check('confirmed past plan now counts as consumed', near(consumedKcal(db, YESTERDAY), 400));

  // ---- Confirm-all per meal -------------------------------------------
  ins(db, TODAY, 'snack', 100, 'planned');
  ins(db, TODAY, 'snack', 150, 'planned');
  const mealChanges = db.prepare(CONFIRM_MEAL).run(ts(), TODAY, 'snack').changes;
  check('Confirm-meal flips all planned in that meal', mealChanges === 2);
  check('consumed reflects the confirmed meal (+250)', near(consumedKcal(db, TODAY), 796.9),
    `today=${consumedKcal(db, TODAY)}`);

  // ---- Idempotency + honesty ------------------------------------------
  const again = db.prepare(CONFIRM_MEAL).run(ts(), TODAY, 'snack').changes;
  check('Confirm-meal is idempotent (nothing left to flip)', again === 0);
  check('confirm-day did not touch other dates (tomorrow still planned)',
    status(db, tomorrowPlan) === 'planned');
  check('today breakfast logged entry never altered', status(db, todayBreakfast) === 'logged');

  db.close();
  console.log('-------------------');
  console.log(failures === 0 ? 'M6 ACCEPTANCE: PASS ✅' : `M6 ACCEPTANCE: FAIL ❌  (${failures} failed)`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
