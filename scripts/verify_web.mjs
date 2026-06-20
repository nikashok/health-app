/**
 * Headless WEB data-path check.
 *
 * Exercises the actual web stack — sql.js (the same WASM SQLite the browser runs) +
 * src/db/sqljsAdapter.ts + the shared migration — against the bundled DB, then the
 * real app SQL (LIKE search, snapshot insert, insights) and an IndexedDB-style
 * persistence round-trip. Proves the browser build's data layer is correct without a
 * browser.
 *
 * Run: node scripts/verify_web.mjs   (or npm run verify:web)
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSqlDb } from '../src/db/sqljsAdapter.ts';
import { probeFts, runMigrations } from '../src/db/migrate.ts';
import { buildLikeSql, buildLikeTerms, kindToTable } from '../src/db/searchSql.ts';
import { INSERT_LOG_ENTRY } from '../src/db/logEntriesSql.ts';
import { DAILY_KCAL_RANGE } from '../src/db/insightsSql.ts';
import { gramsTotal, snapshotNutrition } from '../src/calc/logEntry.ts';
import { consumedTotals } from '../src/calc/dayTotals.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DB = join(ROOT, 'assets', 'db', 'ifct2017.db');

let failures = 0;
function check(label, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
}
const near = (a, b) => Math.abs(a - b) < 0.05;

console.log('WEB data-path check (sql.js)\n----------------------------');
const SQL = await initSqlJs();
const sqlDb = new SQL.Database(readFileSync(BUNDLED_DB));

let exported = null; // stands in for the IndexedDB blob
const db = createSqlDb(sqlDb, () => {
  exported = sqlDb.export();
});

// ---- migration via the adapter --------------------------------------------
await runMigrations(db);
const tables = await db.getAllAsync("SELECT name FROM sqlite_master WHERE type='table'");
const names = new Set(tables.map((t) => t.name));
check('migration created user tables via the web adapter',
  ['user_profile', 'log_entries', 'custom_foods', 'measures'].every((t) => names.has(t)));
const foods = (await db.getFirstAsync('SELECT count(*) c FROM foods')).c;
const cooked = (await db.getFirstAsync('SELECT count(*) c FROM cooked_foods')).c;
check('reference data intact (528 / 1014)', foods === 528 && cooked === 1014, `${foods}/${cooked}`);
const n001 = (await db.getFirstAsync("SELECT energy_kcal e FROM foods WHERE code='N001'")).e;
check('N001 corrected to 191', Math.abs(n001 - 191) < 0.5, `kcal=${n001}`);

// ---- FTS5 absent → LIKE search works --------------------------------------
const fts = await probeFts(db);
check('FTS5 reported unavailable in sql.js (→ LIKE fallback)', fts === false);
const terms = buildLikeTerms('dosa');
const results = await db.getAllAsync(buildLikeSql('cooked', terms.length), ...terms, 50);
check('LIKE search "dosa" returns dishes', results.some((r) => /dosa/i.test(r.name)),
  `${results.length} results`);

// ---- snapshot insert via adapter.runAsync (lastInsertRowId) ---------------
const dosa = {
  ...(await db.getFirstAsync(
    `SELECT food_code AS code, food_name AS name, energy_kcal, protein_g, fat_g, carb_g, fibre_g
       FROM cooked_foods WHERE food_code='ASC146'`
  )),
  kind: 'cooked',
};
const grams = gramsTotal(1, 150);
const snap = snapshotNutrition(dosa, grams);
const ins = await db.runAsync(
  INSERT_LOG_ENTRY, '2026-06-20', 'breakfast', 'logged', dosa.code, kindToTable(dosa.kind),
  dosa.name, 'grams', 1, grams, snap.kcal, snap.protein_g, snap.fat_g, snap.carb_g,
  snap.fibre_g, '2026-06-20T08:00:00Z', '2026-06-20T08:00:00Z'
);
check('runAsync returns a real lastInsertRowId', ins.lastInsertRowId >= 1, `id=${ins.lastInsertRowId}`);
check('logged 150 g dosa snapshot = 246.9 kcal', snap.kcal === 246.9);

// ---- insights read it back ------------------------------------------------
const todayRows = await db.getAllAsync(
  'SELECT * FROM log_entries WHERE log_date=?', '2026-06-20'
);
check('consumed total reads the snapshot', near(consumedTotals(todayRows).kcal, 246.9));
const daily = await db.getAllAsync(DAILY_KCAL_RANGE, '2026-06-20', '2026-06-20');
check('per-day insight SUM works on web', near(daily[0].kcal, 246.9));

// ---- persistence round-trip (export() → reopen) ---------------------------
check('a write triggered an export (IndexedDB blob produced)', exported instanceof Uint8Array);
const reopened = createSqlDb(new SQL.Database(exported));
const survived = (await reopened.getFirstAsync('SELECT count(*) c FROM log_entries')).c;
check('user data survives a persist + reopen', survived === 1, `${survived} entries`);

console.log('----------------------------');
console.log(failures === 0 ? 'WEB DATA-PATH: PASS ✅' : `WEB DATA-PATH: FAIL ❌  (${failures} failed)`);
process.exit(failures === 0 ? 0 : 1);
