/**
 * Calorie & macro target computation (M2, PRD §8). Pure + deterministic so it can be
 * unit-tested (src/calc/targets.test.ts) and verified headlessly (verify_m2.mjs).
 *
 * Honesty note (PRD §8): these are STARTING estimates. The ~500 kcal/day deficit and
 * the 7700 kcal≈1 kg rule over-predict real long-term loss because the body adapts;
 * correct against the user's actual trend, don't treat as law.
 */

export type Sex = 'male' | 'female';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export interface ProfileInput {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
}

export interface Targets {
  target_kcal: number;
  target_protein_g: number;
  target_carb_g: number;
  target_fat_g: number;
}

/** TDEE multipliers (PRD §8: ~1.2 sedentary → ~1.9 very active). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** kcal/day adjustment per goal. ~500 deficit/surplus is the conventional start. */
export const GOAL_KCAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 500,
};

/** Share of total energy allocated to fat by default (within the 20–35% range). */
export const FAT_ENERGY_FRACTION = 0.27;

/** Mifflin-St Jeor resting metabolic rate (kcal/day). */
export function computeBmr(p: ProfileInput): number {
  const s = p.sex === 'male' ? 5 : -161;
  return 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + s;
}

/** Total daily energy expenditure (kcal/day). */
export function computeTdee(p: ProfileInput): number {
  return computeBmr(p) * ACTIVITY_FACTORS[p.activity_level];
}

/**
 * Protein target anchored to body weight (PRD §8). 1.6 g/kg baseline, up to 2.2 for
 * deficit and/or active users (lean-mass preservation). Result is clamped to [1.6, 2.2].
 */
export function proteinPerKg(goal: Goal, activity: ActivityLevel): number {
  let p = 1.6;
  if (goal === 'lose') p = 2.0; // deficit → preserve lean mass
  if (activity === 'active' || activity === 'very_active') p += 0.2;
  return Math.min(p, 2.2);
}

/**
 * Full target set. kcal = goal-adjusted TDEE; protein from body weight; fat from a
 * default energy share; carbs take the remaining energy ("by preference" — overridable).
 */
export function computeTargets(p: ProfileInput): Targets {
  const kcal = Math.max(0, Math.round(computeTdee(p) + GOAL_KCAL_DELTA[p.goal]));
  const protein_g = Math.round(proteinPerKg(p.goal, p.activity_level) * p.weight_kg);
  const fat_g = Math.round((FAT_ENERGY_FRACTION * kcal) / 9);
  const carb_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return {
    target_kcal: kcal,
    target_protein_g: protein_g,
    target_carb_g: carb_g,
    target_fat_g: fat_g,
  };
}
