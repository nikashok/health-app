/**
 * One-tap logging (recents now; favourites and usual meals reuse it). Every quick log
 * resolves the food FRESH — current per-100 g values and the current definition of the
 * chosen measure — and goes through `logFood`, so it is snapshotted exactly like a log
 * made on the Log Entry screen (CLAUDE.md rules 1–2). Nothing is copied from an old row's
 * nutrition.
 */
import { gramsTotal, snapshotNutrition } from '@/calc/logEntry';
import type { MealType } from '@/types/db';

import { getCustomFood } from './customFoods';
import { logFood } from './logEntries';
import { getMeasures, type MeasureOption } from './measures';
import { getByCodeAndTable, type SearchResult } from './search';
import type { FoodKind } from './searchSql';

/** A food and the measures it can be logged in (custom foods include their own default). */
export async function loadFoodForLogging(
  code: string,
  kind: FoodKind
): Promise<{ food: SearchResult | null; options: MeasureOption[] }> {
  const [food, customDefault] = await Promise.all([
    getByCodeAndTable(code, kind),
    kind === 'custom' ? getCustomFood(code) : Promise.resolve(null),
  ]);
  const options = await getMeasures(
    code,
    customDefault?.default_measure_name
      ? {
          measure_name: customDefault.default_measure_name,
          grams_per_unit: customDefault.default_grams_per_unit ?? 1,
        }
      : null
  );
  return { food, options };
}

export interface QuickLogItem {
  code: string;
  kind: FoodKind;
  measureName: string;
  quantity: number;
}

export interface QuickLogResult {
  id: number;
  food: SearchResult;
  kcal: number;
  measureName: string;
  quantity: number;
}

/**
 * Log an item straight away. Returns null when the food or its measure no longer exists —
 * the caller should then open Log Entry so the portion can be chosen.
 */
export async function quickLog(
  item: QuickLogItem,
  meal: MealType,
  date: string,
  isPlan: boolean
): Promise<QuickLogResult | null> {
  if (!(item.quantity > 0)) return null;
  const { food, options } = await loadFoodForLogging(item.code, item.kind);
  if (!food) return null;
  const measure = options.find((o) => o.measure_name === item.measureName);
  if (!measure) return null;
  const id = await logFood({
    food,
    measureName: measure.measure_name,
    gramsPerUnit: measure.grams_per_unit,
    quantity: item.quantity,
    meal,
    date,
    status: isPlan ? 'planned' : 'logged',
  });
  const { kcal } = snapshotNutrition(food, gramsTotal(item.quantity, measure.grams_per_unit));
  return { id, food, kcal, measureName: measure.measure_name, quantity: item.quantity };
}

/** "2 × roti", "150 g" — how a portion reads in a list or a toast. */
export function portionText(measureName: string, quantity: number): string {
  if (measureName === 'grams') return `${Math.round(quantity)} g`;
  return `${formatQty(quantity)} × ${measureName}`;
}

/** 0.5 → "½", 1.5 → "1½", 2 → "2", 1.25 → "1.25". */
export function formatQty(q: number): string {
  const whole = Math.floor(q);
  const frac = Math.round((q - whole) * 100) / 100;
  const glyph = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : null;
  if (frac === 0) return String(whole);
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  return String(Math.round(q * 100) / 100);
}
