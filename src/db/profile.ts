/**
 * user_profile data access (M2). Stores the profile + computed/overridden targets,
 * and exposes whether targets exist yet (drives the Home "Set your targets" gate, ONB-5).
 */
import type { ActivityLevel, Goal, Sex, Targets } from '@/calc/targets';
import type { TargetsSource, UserProfile } from '@/types/db';

import { getDatabase } from './database';
import { GET_PROFILE, UPSERT_PROFILE } from './profileSql';

/** Everything needed to persist a profile + its targets. */
export interface ProfileSave extends Targets {
  sex: Sex;
  age: number;
  dob: string | null;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  targets_source: TargetsSource;
}

/** Load the single profile row, or null if onboarding hasn't happened yet. */
export async function getProfile(): Promise<UserProfile | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<UserProfile>(GET_PROFILE);
  return row ?? null;
}

/** True once a calorie target exists — insights need a denominator (ONB-5). */
export async function hasTargets(): Promise<boolean> {
  const p = await getProfile();
  return !!p && p.target_kcal != null;
}

/** Upsert the profile + targets. created_at is set once and preserved thereafter. */
export async function saveProfile(p: ProfileSave): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    UPSERT_PROFILE,
    p.sex,
    p.age,
    p.dob,
    p.height_cm,
    p.weight_kg,
    p.activity_level,
    p.goal,
    p.target_kcal,
    p.target_protein_g,
    p.target_carb_g,
    p.target_fat_g,
    p.targets_source,
    now, // created_at (ignored by ON CONFLICT update)
    now // updated_at
  );
}
