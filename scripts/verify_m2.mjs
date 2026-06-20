/**
 * Headless M2 acceptance check (onboarding + targets).
 *
 * Verifies the pure target calc against hand calculations AND the persistence round
 * trip (compute → save → read), recompute-on-weight-change, and manual override
 * flagging — running the SAME calc (src/calc/targets.ts) and SAME profile SQL
 * (src/db/profileSql.ts) the app uses, against a migrated copy of the bundled DB.
 *
 * Run: node scripts/verify_m2.mjs   (or npm run verify:m2)
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
import { computeBmr, computeTargets } from '../src/calc/targets.ts';

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

// Mirrors src/db/profile.ts saveProfile param order.
function saveProfile(db, p, now) {
  db.prepare(UPSERT_PROFILE).run(
    p.sex, p.age, p.dob ?? null, p.height_cm, p.weight_kg, p.activity_level, p.goal,
    p.target_kcal, p.target_protein_g, p.target_carb_g, p.target_fat_g, p.targets_source,
    now, now
  );
}
const getProfile = (db) => db.prepare(GET_PROFILE).get();

const workdir = mkdtempSync(join(tmpdir(), 'm2-verify-'));
const dbPath = join(workdir, 'ifct2017.db');

try {
  console.log('M2 acceptance check\n-------------------');
  copyFileSync(BUNDLED_DB, dbPath);
  const db = new DatabaseSync(dbPath);
  applyM0(db);

  // ---- Pure calc vs hand calculations ----------------------------------
  const male = { sex: 'male', age: 30, height_cm: 180, weight_kg: 80,
    activity_level: 'moderate', goal: 'maintain' };
  check('BMR (Mifflin-St Jeor) male hand calc = 1780', computeBmr(male) === 1780);
  const t = computeTargets(male);
  check('computeTargets male maintain matches hand calc',
    t.target_kcal === 2759 && t.target_protein_g === 128 && t.target_fat_g === 83 &&
      t.target_carb_g === 375, JSON.stringify(t));

  // ---- Persist computed targets ----------------------------------------
  saveProfile(db, { ...male, dob: null, ...t, targets_source: 'computed' },
    '2026-06-20T08:00:00Z');
  let row = getProfile(db);
  check('onboarding stores targets', row && row.target_kcal === 2759, `kcal=${row?.target_kcal}`);
  check('targets_source flagged computed', row.targets_source === 'computed');
  check('profile is a single pinned row (id=1)', row.id === 1);

  // ---- Editing weight recomputes ---------------------------------------
  const heavier = { ...male, weight_kg: 95 };
  const t2 = computeTargets(heavier);
  check('recompute on weight change yields a higher kcal target',
    t2.target_kcal > t.target_kcal, `${t.target_kcal} -> ${t2.target_kcal}`);
  saveProfile(db, { ...heavier, dob: null, ...t2, targets_source: 'computed' },
    '2026-06-21T08:00:00Z');
  row = getProfile(db);
  check('recomputed targets persist', row.target_kcal === t2.target_kcal, `kcal=${row.target_kcal}`);
  check('weight update persisted', row.weight_kg === 95);
  check('created_at preserved, updated_at advanced on edit',
    row.created_at === '2026-06-20T08:00:00Z' && row.updated_at === '2026-06-21T08:00:00Z',
    `created=${row.created_at} updated=${row.updated_at}`);
  check('still a single row after edit',
    db.prepare('SELECT count(*) c FROM user_profile').get().c === 1);

  // ---- Manual override wins and is flagged ------------------------------
  const manual = { target_kcal: 2000, target_protein_g: 150, target_carb_g: 180, target_fat_g: 60 };
  check('manual targets differ from computed (real override)', manual.target_kcal !== t2.target_kcal);
  saveProfile(db, { ...heavier, dob: null, ...manual, targets_source: 'manual' },
    '2026-06-22T08:00:00Z');
  row = getProfile(db);
  check('manual override stored as-is',
    row.target_kcal === 2000 && row.target_protein_g === 150 && row.target_carb_g === 180 &&
      row.target_fat_g === 60);
  check('targets_source flagged manual', row.targets_source === 'manual');

  db.close();
  console.log('-------------------');
  console.log(failures === 0 ? 'M2 ACCEPTANCE: PASS ✅' : `M2 ACCEPTANCE: FAIL ❌  (${failures} failed)`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
