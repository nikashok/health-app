/**
 * user_profile data access (M2) — now backed by Supabase (one row per user, RLS
 * owner-only). Stores the profile + computed/overridden targets, and exposes whether
 * targets exist yet (drives the Home "Set your targets" gate, ONB-5).
 */
import type { ActivityLevel, Goal, Sex, Targets } from '@/calc/targets';
import type { TargetsSource, UserProfile } from '@/types/db';

import { requireUserId, supabase } from './supabase';

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

/** Load this user's profile row, or null if onboarding hasn't happened yet. */
export async function getProfile(): Promise<UserProfile | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // UserProfile keeps the legacy single-row `id: 1`; user_id is the real key.
  return { ...data, id: 1 } as UserProfile;
}

/** True once a calorie target exists — insights need a denominator (ONB-5). */
export async function hasTargets(): Promise<boolean> {
  const p = await getProfile();
  return !!p && p.target_kcal != null;
}

/** Upsert this user's profile + targets. created_at is set once (DB default) and
 *  preserved on later updates; updated_at is maintained by a trigger. */
export async function saveProfile(p: ProfileSave): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('user_profile').upsert(
    {
      user_id: userId,
      sex: p.sex,
      age: p.age,
      dob: p.dob,
      height_cm: p.height_cm,
      weight_kg: p.weight_kg,
      activity_level: p.activity_level,
      goal: p.goal,
      target_kcal: p.target_kcal,
      target_protein_g: p.target_protein_g,
      target_carb_g: p.target_carb_g,
      target_fat_g: p.target_fat_g,
      targets_source: p.targets_source,
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}
