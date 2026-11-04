/**
 * Custom-food entry helpers (pure, tested). Values may be typed per 100 g or per serving;
 * they are always STORED per 100 g (CLAUDE.md rule 1 — every log then computes
 * per100g × grams / 100, whichever way they were entered).
 */

export interface NutrientInput {
  kcal: number;
  protein: number | null;
  carb: number | null;
  fat: number | null;
  fibre: number | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Convert values typed for one serving of `servingGrams` to per-100 g. */
export function servingToPer100(v: NutrientInput, servingGrams: number): NutrientInput {
  const f = 100 / servingGrams;
  const s = (n: number | null) => (n == null ? null : r1(n * f));
  return { kcal: r1(v.kcal * f), protein: s(v.protein), carb: s(v.carb), fat: s(v.fat), fibre: s(v.fibre) };
}

/**
 * kcal implied by the macros (Atwater 4/4/9; fibre left out — its ~2 kcal/g is within
 * the tolerance). null until protein, carbs and fat are all entered.
 */
export function macroKcal(v: Pick<NutrientInput, 'protein' | 'carb' | 'fat'>): number | null {
  if (v.protein == null || v.carb == null || v.fat == null) return null;
  return v.protein * 4 + v.carb * 4 + v.fat * 9;
}

/** True when the calories and the macros disagree by more than `tolerance` (default 20%). */
export function macrosDisagree(v: NutrientInput, tolerance = 0.2): boolean {
  const implied = macroKcal(v);
  if (implied == null || v.kcal <= 0) return false;
  return Math.abs(implied - v.kcal) / v.kcal > tolerance;
}
