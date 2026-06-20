/**
 * Headless M1 acceptance check (search).
 *
 * Copies the bundled DB, applies the real M0 migration (so the data is in the app's
 * post-migration state, e.g. N001 = 191), then runs the SAME search SQL the app runs
 * (imported from src/db/searchSql.ts) via node:sqlite — exercising both the FTS5 path
 * and the LIKE fallback. Mirrors the M0 verifier pattern.
 *
 * Run: node scripts/verify_m1.mjs   (or npm run verify:m1)
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
  buildFtsMatch,
  buildLikeSql,
  buildLikeTerms,
  DEFAULT_LIMIT,
  GET_COOKED_BY_CODE,
  GET_RAW_BY_CODE,
  SEARCH_COOKED_FTS,
  SEARCH_RAW_FTS,
} from '../src/db/searchSql.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DB = join(ROOT, 'assets', 'db', 'ifct2017.db');

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

// Mirrors src/db/search.ts, but synchronous via node:sqlite. `fts` toggles the path.
function runSearch(db, kind, q, fts, limit = DEFAULT_LIMIT) {
  if (fts) {
    const match = buildFtsMatch(q);
    if (!match) return [];
    const sql = kind === 'cooked' ? SEARCH_COOKED_FTS : SEARCH_RAW_FTS;
    return db.prepare(sql).all(match, limit);
  }
  const terms = buildLikeTerms(q);
  if (terms.length === 0) return [];
  return db.prepare(buildLikeSql(kind, terms.length)).all(...terms, limit);
}
function searchAll(db, q, fts) {
  return [...runSearch(db, 'cooked', q, fts), ...runSearch(db, 'raw', q, fts)];
}

const workdir = mkdtempSync(join(tmpdir(), 'm1-verify-'));
const dbPath = join(workdir, 'ifct2017.db');

try {
  console.log('M1 acceptance check\n-------------------');
  copyFileSync(BUNDLED_DB, dbPath);
  const db = new DatabaseSync(dbPath);
  applyM0(db);

  // ---- FTS5 path -------------------------------------------------------
  console.log('[FTS5 path]');
  const dosa = searchAll(db, 'dosa', true);
  const dosaCooked = dosa.filter((r) => r.kind === 'cooked');
  check('"dosa" returns cooked dishes', dosaCooked.length > 0, `${dosaCooked.length} dishes`);
  check('"dosa" results carry kcal/100g', dosaCooked.every((r) => r.energy_kcal != null));
  check('"dosa" top results include Masala dosa',
    dosa.some((r) => /masala dosa/i.test(r.name)),
    dosaCooked.slice(0, 3).map((r) => r.name).join(' | '));

  const mango = searchAll(db, 'mango', true);
  const mangoRaw = mango.filter((r) => r.kind === 'raw');
  check('"mango" returns raw fruit', mangoRaw.length > 0,
    mangoRaw.slice(0, 3).map((r) => r.name).join(' | '));

  const masalaDos = searchAll(db, 'masala dos', true);
  check('multi-word "masala dos" works (prefix on each term)',
    masalaDos.some((r) => /masala dosa/i.test(r.name)), `${masalaDos.length} results`);

  // cooked-before-raw ordering (LOG-2)
  const dal = searchAll(db, 'dal', true);
  const firstRaw = dal.findIndex((r) => r.kind === 'raw');
  const lastCooked = dal.map((r) => r.kind).lastIndexOf('cooked');
  check('searchAll ranks cooked dishes before raw ingredients',
    firstRaw === -1 || lastCooked < firstRaw, `cooked end @${lastCooked}, raw start @${firstRaw}`);

  // ---- getByCode (post-migration values) -------------------------------
  const byCooked = db.prepare(GET_COOKED_BY_CODE).get('ASC146');
  check('getByCode resolves a cooked dish', byCooked?.name === 'Masala dosa', byCooked?.name);
  const byRaw = db.prepare(GET_RAW_BY_CODE).get('N001');
  check('getByCode resolves a raw food with corrected N001 kcal',
    byRaw && Math.abs(byRaw.energy_kcal - 191) < 0.5, `N001=${byRaw?.energy_kcal}`);

  // empty query => no results
  check('empty query returns nothing', searchAll(db, '   ', true).length === 0);

  // ---- LIKE fallback path ----------------------------------------------
  console.log('[LIKE fallback path]');
  const dosaLike = searchAll(db, 'dosa', false);
  check('LIKE fallback "dosa" returns results',
    dosaLike.some((r) => /dosa/i.test(r.name)), `${dosaLike.length} results`);
  const mangoLike = searchAll(db, 'mango', false).filter((r) => r.kind === 'raw');
  check('LIKE fallback "mango" returns raw fruit', mangoLike.length > 0, `${mangoLike.length} raw`);
  const masalaDosLike = searchAll(db, 'masala dos', false);
  check('LIKE fallback multi-word "masala dos" works',
    masalaDosLike.some((r) => /masala dos/i.test(r.name)), `${masalaDosLike.length} results`);

  db.close();
  console.log('-------------------');
  console.log(failures === 0 ? 'M1 ACCEPTANCE: PASS ✅' : `M1 ACCEPTANCE: FAIL ❌  (${failures} failed)`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
