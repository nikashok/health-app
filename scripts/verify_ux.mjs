/**
 * Headless check of the SQL behind the 2026-11 UX pass, on the real migration + sql.js
 * adapter (the web stack): favourites table, meal-aware recents, last-used portion, the
 * logged-dates streak query, pattern rows, confirm → undo, and the move-only update.
 * Invariant checks: planned rows never reach intake queries, and a move keeps the
 * nutrition snapshot exactly as logged.
 *
 * Run: npm run verify:ux
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSqlDb } from '../src/db/sqljsAdapter.ts';
import { runMigrations } from '../src/db/migrate.ts';
import {
  CONFIRM_MEAL,
  INSERT_LOG_ENTRY,
  LAST_ENTRY_FOR_FOOD,
  MOVE_LOG_ENTRY,
  RECENT_FOODS_FOR_MEAL,
  REVERT_TO_PLANNED,
} from '../src/db/logEntriesSql.ts';
import { DAILY_KCAL_RANGE, LOGGED_DATES_DESC, LOGGED_ENTRIES_BETWEEN } from '../src/db/insightsSql.ts';
import { DELETE_FAVORITE, favKey, INSERT_FAVORITE, LIST_FAVORITES } from '../src/db/favoritesSql.ts';
import { streakFrom } from '../src/calc/insights.ts';
import { usualMeal } from '../src/calc/foodPatterns.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
function check(label, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
}

console.log('UX pass SQL check (sql.js)\n--------------------------');
const SQL = await initSqlJs();
const db = createSqlDb(new SQL.Database(readFileSync(join(ROOT, 'assets', 'db', 'ifct2017.db'))), () => {});
await runMigrations(db);
await runMigrations(db); // idempotent: a second launch must not fail or duplicate

const tables = new Set((await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table'")).map((t) => t.name));
check('migration creates favorite_foods (idempotently)', tables.has('favorite_foods'));

let n = 0;
async function log(date, meal, code, name, measure, qty, kcal, status = 'logged') {
  n++;
  const ts = `${date}T0${n % 10}:00:00Z`;
  const r = await db.runAsync(
    INSERT_LOG_ENTRY, date, meal, status, code, 'cooked_foods', name, measure, qty, qty * 100,
    kcal, 1, 1, 1, 1, ts, ts
  );
  return r.lastInsertRowId;
}
// Chai + poha at breakfast three days running; roti at dinner; a plan for today's lunch.
for (const d of ['2026-11-01', '2026-11-02', '2026-11-03']) {
  await log(d, 'breakfast', 'ASC001', 'Hot tea (Garam Chai)', 'tea cup', 1, 34);
  await log(d, 'breakfast', 'BFP044', 'Poha', 'bowl', d === '2026-11-03' ? 2 : 1, 161);
  await log(d, 'dinner', 'ASC096', 'Chapati/Roti', 'chapati', 3, 219);
}
const planId = await log('2026-11-04', 'lunch', 'ASC113', 'Boiled rice (Uble chawal)', 'plate', 1, 176, 'planned');

// ---- meal-aware recents ---------------------------------------------------
const bRecents = await db.getAllAsync(RECENT_FOODS_FOR_MEAL, 'breakfast', '2026-09-05', 10);
const dRecents = await db.getAllAsync(RECENT_FOODS_FOR_MEAL, 'dinner', '2026-09-05', 10);
check('breakfast recents lead with breakfast foods', ['Poha', 'Hot tea (Garam Chai)'].includes(bRecents[0].food_name), bRecents.map((r) => r.food_name).join(', '));
check('dinner recents lead with roti', dRecents[0].food_name === 'Chapati/Roti');
check('recents carry the latest portion', bRecents.find((r) => r.food_name === 'Poha').quantity === 2);

// ---- last-used portion ----------------------------------------------------
const last = await db.getFirstAsync(LAST_ENTRY_FOR_FOOD, 'cooked_foods', 'BFP044');
check('last portion = most recent entry', last.measure_name === 'bowl' && last.quantity === 2);

// ---- streak / patterns read logged rows only ------------------------------
const dates = (await db.getAllAsync(LOGGED_DATES_DESC, '2026-11-04', 1000)).map((r) => r.date);
check('logged dates exclude the planned-only day', !dates.includes('2026-11-04'), dates.join(','));
check('streak counts back from yesterday', streakFrom(dates, '2026-11-04') === 3);
const hist = await db.getAllAsync(LOGGED_ENTRIES_BETWEEN, '2026-09-05', '2026-11-04');
check('pattern rows exclude plans', hist.every((e) => e.log_date !== '2026-11-04'));
const usual = usualMeal(hist, 'breakfast', '2026-11-04');
check('usual breakfast detected from snapshots', usual?.days === 3 && usual.items.length === 2);

// ---- confirm → undo -------------------------------------------------------
const intake = async () => (await db.getAllAsync(DAILY_KCAL_RANGE, '2026-11-04', '2026-11-04'))[0]?.kcal ?? 0;
check('INVARIANT: a plan is not intake', (await intake()) === 0);
await db.runAsync(CONFIRM_MEAL, '2026-11-04T12:00:00Z', '2026-11-04', 'lunch');
check('confirming makes it intake', (await intake()) === 176);
await db.runAsync(REVERT_TO_PLANNED(1), '2026-11-04T12:00:05Z', planId);
check('INVARIANT: undo puts it back out of intake', (await intake()) === 0);

// ---- move keeps the snapshot ---------------------------------------------
const before = await db.getFirstAsync('SELECT kcal, protein_g, grams_total FROM log_entries WHERE id = ?', planId);
await db.runAsync(MOVE_LOG_ENTRY, '2026-11-03', 'dinner', 'logged', '2026-11-04T13:00:00Z', planId);
const after = await db.getFirstAsync('SELECT log_date, meal_type, kcal, protein_g, grams_total FROM log_entries WHERE id = ?', planId);
check('move changes only meal/date/status', after.log_date === '2026-11-03' && after.meal_type === 'dinner');
check('INVARIANT: move keeps the nutrition snapshot', after.kcal === before.kcal && after.protein_g === before.protein_g && after.grams_total === before.grams_total);

// ---- favourites -----------------------------------------------------------
const key = favKey('cooked_foods', 'BFP044');
await db.runAsync(INSERT_FAVORITE, key, 'cooked_foods', 'BFP044', 'Poha', '2026-11-04T08:00:00Z');
await db.runAsync(INSERT_FAVORITE, key, 'cooked_foods', 'BFP044', 'Poha', '2026-11-04T08:00:01Z'); // no dup
const favs = await db.getAllAsync(LIST_FAVORITES);
check('favourite stored once', favs.length === 1);
check('favourite carries its last portion', favs[0].measure_name === 'bowl' && favs[0].quantity === 2);
await db.runAsync(DELETE_FAVORITE, key);
check('unstar removes it', (await db.getAllAsync(LIST_FAVORITES)).length === 0);

console.log('--------------------------');
console.log(failures === 0 ? 'UX SQL: PASS ✅' : `UX SQL: FAIL ❌  (${failures} failed)`);
process.exit(failures === 0 ? 0 : 1);
