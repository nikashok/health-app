/**
 * Headless M5 acceptance check (Home / insights).
 *
 * Runs the SAME calc (insights, dayTotals) + SQL (insightsSql) the app uses against a
 * migrated DB copy:
 *  - today's totals = sum of today's LOGGED snapshots (planned excluded),
 *  - rings use the target denominator from user_profile,
 *  - week/month roll up (avg over logged days, days-on-target, partial, trend),
 *  - the new-user empty-state predicate flips correctly.
 *
 * Run: node scripts/verify_m5.mjs   (or npm run verify:m5)
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
import { UPSERT_PROFILE } from '../src/db/profileSql.ts';
import { INSERT_LOG_ENTRY } from '../src/db/logEntriesSql.ts';
import { ANY_LOGGED, DAILY_KCAL_RANGE, MEAL_KCAL_FOR_DATE } from '../src/db/insightsSql.ts';
import { consumedTotals } from '../src/calc/dayTotals.ts';
import { addDays, buildRangeInsights, ratio } from '../src/calc/insights.ts';

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
const nextTs = () => `2026-06-20T08:00:${String(clock++).padStart(2, '0')}Z`;
function ins(db, date, meal, kcal, status = 'logged', protein = null) {
  const ts = nextTs();
  db.prepare(INSERT_LOG_ENTRY).run(
    date, meal, status, 'X', 'cooked_foods', 'Test', 'grams', 1, 100, kcal,
    protein, null, null, null, ts, ts
  );
}
const forDate = (db, d) =>
  db.prepare('SELECT * FROM log_entries WHERE log_date=?').all(d);
function dailyMap(db, start, end) {
  const map = {};
  for (const r of db.prepare(DAILY_KCAL_RANGE).all(start, end)) map[r.date] = r.kcal ?? 0;
  return map;
}
const anyLogged = (db) => db.prepare(ANY_LOGGED).get().has === 1;

const workdir = mkdtempSync(join(tmpdir(), 'm5-verify-'));
const dbPath = join(workdir, 'ifct2017.db');

try {
  console.log('M5 acceptance check\n-------------------');
  copyFileSync(BUNDLED_DB, dbPath);
  const db = new DatabaseSync(dbPath);
  applyM0(db);

  // ---- Empty state (new user) ------------------------------------------
  check('no data → empty-state predicate is false (shows "Log your first meal")',
    anyLogged(db) === false);

  // ---- Targets are the denominator (from user_profile) -----------------
  const now = TODAY + 'T00:00:00Z';
  db.prepare(UPSERT_PROFILE).run(
    'male', 30, null, 180, 80, 'moderate', 'maintain',
    2000, 150, 250, 60, 'computed', now, now
  );
  const target = db.prepare('SELECT target_kcal, target_protein_g FROM user_profile WHERE id=1').get();
  check('target denominator read from user_profile', target.target_kcal === 2000);

  // ---- Seed logged + planned data --------------------------------------
  ins(db, TODAY, 'breakfast', 246.9, 'logged', 6);
  ins(db, TODAY, 'lunch', 164.6, 'logged', 4);
  ins(db, TODAY, 'dinner', 300, 'planned', 10); // must NOT count
  ins(db, addDays(TODAY, -3), 'breakfast', 1800, 'logged');
  ins(db, addDays(TODAY, -6), 'breakfast', 2000, 'logged');
  ins(db, addDays(TODAY, -29), 'breakfast', 1500, 'logged'); // month boundary (included)
  ins(db, addDays(TODAY, -35), 'breakfast', 9999, 'logged'); // outside month (excluded)

  check('data present → empty-state predicate is true', anyLogged(db) === true);

  // ---- Today: totals = sum of today's LOGGED snapshots -----------------
  const todayEntries = forDate(db, TODAY);
  const consumed = consumedTotals(todayEntries);
  check("today's total = sum of logged snapshots (planned 300 excluded)",
    near(consumed.kcal, 411.5), `kcal=${consumed.kcal}`);
  check("today's protein excludes planned", near(consumed.protein_g, 10), `P=${consumed.protein_g}`);

  // ---- Per-meal split ---------------------------------------------------
  const meals = {};
  for (const r of db.prepare(MEAL_KCAL_FOR_DATE).all(TODAY)) meals[r.meal_type] = r.kcal;
  check('per-meal split: breakfast + lunch logged, dinner (planned) absent',
    near(meals.breakfast, 246.9) && near(meals.lunch, 164.6) && meals.dinner === undefined,
    `b=${meals.breakfast} l=${meals.lunch} d=${meals.dinner}`);

  // ---- Rings use the target denominator --------------------------------
  check('protein ring ratio = consumed / target',
    near(ratio(consumed.protein_g, target.target_protein_g), 10 / 150));

  // ---- Week rollup ------------------------------------------------------
  const monthMap = dailyMap(db, addDays(TODAY, -29), TODAY);
  const week = buildRangeInsights(monthMap, TODAY, 7, target.target_kcal);
  check('week trend has 7 points', week.series.length === 7);
  // The 411.5 kcal day is logged but under MIN_COUNTED_KCAL, so it is not averaged.
  check('week avg is over counted days only (≥500 kcal)',
    near(week.avgKcal, (2000 + 1800) / 2), `avg=${week.avgKcal.toFixed(1)}`);
  check('week counts the sub-500 day as logged, not as counted',
    week.loggedDays === 3 && week.countedDays === 2,
    `logged=${week.loggedDays} counted=${week.countedDays}`);
  check('week days-on-target uses target band (±10%)',
    week.daysOnTarget === 2, `onTarget=${week.daysOnTarget} of ${week.loggedDays} logged`);
  check('week labelled partial (<7 days logged)', week.partial === true);

  // ---- Month rollup -----------------------------------------------------
  const month = buildRangeInsights(monthMap, TODAY, 30, target.target_kcal);
  check('month trend has 30 points', month.series.length === 30);
  check('month includes day -29 (range boundary)', monthMap[addDays(TODAY, -29)] === 1500);
  check('month excludes day -35 (outside range)', monthMap[addDays(TODAY, -35)] === undefined);
  check('month avg excludes out-of-range and sub-500 days',
    near(month.avgKcal, (1500 + 2000 + 1800) / 3), `avg=${month.avgKcal.toFixed(1)}`);
  check('month labelled partial', month.partial === true);

  db.close();
  console.log('-------------------');
  console.log(failures === 0 ? 'M5 ACCEPTANCE: PASS ✅' : `M5 ACCEPTANCE: FAIL ❌  (${failures} failed)`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
