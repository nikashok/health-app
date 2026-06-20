/**
 * Headless M7 acceptance check (integration & polish).
 *
 * Demonstrates "tests pass" + a coherent offline v1 end-to-end, using the SAME calc +
 * SQL the app runs:
 *  - calc spot-checks (the headline unit cases),
 *  - INVARIANT 1: a snapshot stays fixed after a source-data edit (we never recompute
 *    from food_code),
 *  - INVARIANT 2: insights count only logged (planned excluded),
 *  - the full flow onboarding → log → plan → confirm → insights, all on the local DB.
 *
 * Run: node scripts/verify_m7.mjs   (or npm run verify:m7)
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
import { GET_PROFILE, UPSERT_PROFILE } from '../src/db/profileSql.ts';
import { CONFIRM_ENTRY, INSERT_LOG_ENTRY } from '../src/db/logEntriesSql.ts';
import { ANY_LOGGED, DAILY_KCAL_RANGE } from '../src/db/insightsSql.ts';
import { kindToTable } from '../src/db/searchSql.ts';
import { computeBmr, computeTargets } from '../src/calc/targets.ts';
import { gramsTotal, snapshotNutrition } from '../src/calc/logEntry.ts';
import { consumedTotals, plannedTotals } from '../src/calc/dayTotals.ts';
import { addDays, buildRangeInsights } from '../src/calc/insights.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DB = join(ROOT, 'assets', 'db', 'ifct2017.db');
const TODAY = '2026-06-20';

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
function logFood(db, food, qty, gpu, meal, date, status = 'logged') {
  const grams = gramsTotal(qty, gpu);
  const snap = snapshotNutrition(food, grams);
  const t = ts();
  const r = db.prepare(INSERT_LOG_ENTRY).run(
    date, meal, status, food.code, kindToTable(food.kind), food.name, 'grams', qty,
    grams, snap.kcal, snap.protein_g, snap.fat_g, snap.carb_g, snap.fibre_g, t, t
  );
  return r.lastInsertRowid;
}
const forDate = (db, d) => db.prepare('SELECT * FROM log_entries WHERE log_date=?').all(d);
const rowKcal = (db, id) => db.prepare('SELECT kcal FROM log_entries WHERE id=?').get(id).kcal;

const workdir = mkdtempSync(join(tmpdir(), 'm7-verify-'));
const dbPath = join(workdir, 'ifct2017.db');

try {
  console.log('M7 acceptance check\n-------------------');
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

  // ---- Calc unit spot-checks ------------------------------------------
  console.log('[unit spot-checks]');
  check('BMR Mifflin-St Jeor (male) = 1780',
    computeBmr({ sex: 'male', age: 30, height_cm: 180, weight_kg: 80, activity_level: 'moderate', goal: 'maintain' }) === 1780);
  const t = computeTargets({ sex: 'male', age: 30, height_cm: 180, weight_kg: 80, activity_level: 'moderate', goal: 'maintain' });
  check('computeTargets male maintain = 2759 kcal / 128 P', t.target_kcal === 2759 && t.target_protein_g === 128);
  check('snapshot 150 g dosa = 246.9 kcal', snapshotNutrition(dosa, 150).kcal === 246.9);
  check('consumedTotals excludes planned (pure)',
    consumedTotals([{ status: 'logged', kcal: 100, protein_g: null, carb_g: null, fat_g: null, fibre_g: null },
                    { status: 'planned', kcal: 999, protein_g: null, carb_g: null, fat_g: null, fibre_g: null }]).kcal === 100);

  // ---- INVARIANT 1: snapshot fixed after a source edit -----------------
  console.log('[invariants]');
  const logged = logFood(db, dosa, 150, 1, 'breakfast', TODAY); // 246.9
  check('logged entry snapshot = 246.9', rowKcal(db, logged) === 246.9);
  db.prepare(`UPDATE cooked_foods SET energy_kcal = energy_kcal * 2 WHERE food_code='ASC146'`).run();
  check('INVARIANT: snapshot unchanged after source kcal doubled',
    rowKcal(db, logged) === 246.9, `kcal=${rowKcal(db, logged)}`);
  check('INVARIANT: consumed reads the snapshot, not the edited source',
    near(consumedTotals(forDate(db, TODAY)).kcal, 246.9));

  // ---- INVARIANT 2: insights exclude planned (DB level) ----------------
  logFood(db, dosa, 200, 1, 'dinner', TODAY, 'planned'); // a plan for today
  const map = {};
  for (const r of db.prepare(DAILY_KCAL_RANGE).all(TODAY, TODAY)) map[r.date] = r.kcal;
  check('INVARIANT: per-day SUM(logged) ignores planned', near(map[TODAY] ?? 0, 246.9), `sum=${map[TODAY]}`);
  check('INVARIANT: planned summed separately', near(plannedTotals(forDate(db, TODAY)).kcal, 329.2));

  // ---- Full offline flow: onboarding → log → plan → confirm → insights -
  console.log('[end-to-end offline flow]');
  // clean slate for the flow
  db.exec('DELETE FROM log_entries');

  // onboarding
  const now = TODAY + 'T00:00:00Z';
  db.prepare(UPSERT_PROFILE).run('female', 28, null, 165, 62, 'light', 'lose',
    1400, 120, 130, 45, 'computed', now, now);
  const profile = db.prepare(GET_PROFILE).get();
  check('onboarding persisted targets', profile.target_kcal === 1400 && profile.targets_source === 'computed');
  check('empty-state predicate false before any log', db.prepare(ANY_LOGGED).get().has === 0);

  // log (today)
  logFood(db, dosa, 150, 1, 'breakfast', TODAY); // 246.9 logged
  check('log writes today intake', near(consumedTotals(forDate(db, TODAY)).kcal, 246.9));
  check('empty-state predicate true after logging', db.prepare(ANY_LOGGED).get().has === 1);

  // plan (tomorrow) then confirm a today plan
  logFood(db, dosa, 300, 1, 'lunch', addDays(TODAY, 1), 'planned'); // tomorrow plan
  const todayPlan = logFood(db, dosa, 100, 1, 'snack', TODAY, 'planned');
  check('plan does not inflate today consumed', near(consumedTotals(forDate(db, TODAY)).kcal, 246.9));
  db.prepare(CONFIRM_ENTRY).run(ts(), todayPlan); // "Ate it"
  check('confirm flips plan into intake',
    near(consumedTotals(forDate(db, TODAY)).kcal, 246.9 + snapshotNutrition(dosa, 100).kcal));

  // insights
  const month = {};
  for (const r of db.prepare(DAILY_KCAL_RANGE).all(addDays(TODAY, -29), TODAY)) month[r.date] = r.kcal;
  const week = buildRangeInsights(month, TODAY, 7, profile.target_kcal);
  check('insights roll up the confirmed intake', week.series.length === 7 && week.loggedDays === 1);
  check('tomorrow plan stays out of consumed insights', month[addDays(TODAY, 1)] === undefined);

  db.close();
  console.log('-------------------');
  console.log(failures === 0 ? 'M7 ACCEPTANCE: PASS ✅' : `M7 ACCEPTANCE: FAIL ❌  (${failures} failed)`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
