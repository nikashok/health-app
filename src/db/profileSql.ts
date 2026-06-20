/**
 * user_profile read/write SQL (M2). Single source of truth shared by the expo
 * wrapper (src/db/profile.ts) and the headless verifier (verify_m2.mjs).
 *
 * The profile is a single row pinned to id = 1 (enforced by the M0 CHECK). Targets
 * are snapshotted onto this row; targets_source records whether they were computed
 * or manually overridden (ONB-3).
 */

export const GET_PROFILE = `SELECT * FROM user_profile WHERE id = 1`;

/**
 * Upsert the single profile row. created_at is set on first insert and preserved on
 * update (it is deliberately not in the UPDATE SET list).
 */
export const UPSERT_PROFILE = `
  INSERT INTO user_profile (
    id, sex, age, dob, height_cm, weight_kg, activity_level, goal,
    target_kcal, target_protein_g, target_carb_g, target_fat_g, targets_source,
    created_at, updated_at
  ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    sex = excluded.sex,
    age = excluded.age,
    dob = excluded.dob,
    height_cm = excluded.height_cm,
    weight_kg = excluded.weight_kg,
    activity_level = excluded.activity_level,
    goal = excluded.goal,
    target_kcal = excluded.target_kcal,
    target_protein_g = excluded.target_protein_g,
    target_carb_g = excluded.target_carb_g,
    target_fat_g = excluded.target_fat_g,
    targets_source = excluded.targets_source,
    updated_at = excluded.updated_at`;

/** Column order for UPSERT_PROFILE params (after the literal id = 1). */
export const UPSERT_PARAM_ORDER = [
  'sex',
  'age',
  'dob',
  'height_cm',
  'weight_kg',
  'activity_level',
  'goal',
  'target_kcal',
  'target_protein_g',
  'target_carb_g',
  'target_fat_g',
  'targets_source',
  'created_at',
  'updated_at',
] as const;
