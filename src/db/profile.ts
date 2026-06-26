/**
 * user_profile data access (M2) — local-first with one-way backup to Supabase. Stores
 * the profile + computed/overridden targets, and exposes whether targets exist yet
 * (drives the Home "Set your targets" gate, ONB-5). Single row, pinned to id = 1.
 */
import type { ActivityLevel, Goal, Sex, Targets } from '@/calc/targets';
import type { TargetsSource, UserProfile } from '@/types/db';

import { getDatabase } from './database';
import { GET_PROFILE, UPSERT_PROFILE } from './profileSql';
import { enqueue, PROFILE_KEY, scheduleDrain } from './sync';

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
  const row = await getDatabase().getFirstAsync<UserProfile>(GET_PROFILE);
  return row ?? null;
}

/** True once a calorie target exists — insights need a denominator (ONB-5). */
export async function hasTargets(): Promise<boolean> {
  const p = await getProfile();
  return !!p && p.target_kcal != null;
}

/** Upsert the profile + targets and queue it for backup. created_at is preserved. */
export async function saveProfile(p: ProfileSave): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
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
    await enqueue(db, 'user_profile', PROFILE_KEY);
  });
  scheduleDrain();
}
