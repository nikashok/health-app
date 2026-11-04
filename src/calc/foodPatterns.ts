/**
 * Food patterns — your usual meal and your last meal, DERIVED from logged diary rows for
 * display and one-tap re-logging. Never persisted or synced (CLAUDE.md rule 5); reads
 * only snapshotted rows (rule 6). The kcal here is the old snapshot, shown as an
 * estimate; logging a pattern re-snapshots every item from the food's per-100 g values.
 */
import type { FoodTable, MealType } from '@/types/db';

/** The diary columns patterns need (status='logged' rows only — the caller filters). */
export interface PatternEntry {
  log_date: string;
  meal_type: MealType;
  food_table: FoodTable;
  food_code: string | null;
  food_name: string;
  measure_name: string;
  quantity: number;
  kcal: number;
  created_at: string;
}

export interface PatternItem {
  food_table: FoodTable;
  food_code: string;
  food_name: string;
  measure_name: string;
  quantity: number;
}

export interface MealPattern {
  items: PatternItem[];
  kcal: number; // snapshot kcal of the occurrence the items come from (an estimate)
  date: string; // that occurrence's day
  days: number; // how many days this exact set of foods was eaten at this meal
}

/** A usual meal needs to have happened on at least this many days in the window. */
export const MIN_USUAL_DAYS = 3;

const foodKey = (e: PatternEntry) => `${e.food_table}:${e.food_code ?? e.food_name}`;

/** Group one meal's rows by day, newest day first. Rows without a food code can't be re-logged. */
function byDay(entries: readonly PatternEntry[], meal: MealType, beforeISO: string) {
  const days = new Map<string, PatternEntry[]>();
  for (const e of entries) {
    if (e.meal_type !== meal || e.log_date >= beforeISO) continue;
    const list = days.get(e.log_date) ?? [];
    list.push(e);
    days.set(e.log_date, list);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, rows]) => ({ date, rows: rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) }));
}

function toPattern(date: string, rows: PatternEntry[], days: number): MealPattern | null {
  const items: PatternItem[] = rows
    .filter((r): r is PatternEntry & { food_code: string } => r.food_code != null && r.quantity > 0)
    .map((r) => ({
      food_table: r.food_table,
      food_code: r.food_code,
      food_name: r.food_name,
      measure_name: r.measure_name,
      quantity: r.quantity,
    }));
  if (items.length === 0) return null;
  return { items, kcal: rows.reduce((s, r) => s + (r.kcal ?? 0), 0), date, days };
}

/**
 * Your usual `meal`: the set of foods (ignoring portions) you've had for it on the most
 * days before `beforeISO`, if that's at least MIN_USUAL_DAYS. Ties go to the most recent.
 * Items and portions come from the latest day with that set.
 */
export function usualMeal(
  entries: readonly PatternEntry[],
  meal: MealType,
  beforeISO: string,
  minDays = MIN_USUAL_DAYS
): MealPattern | null {
  const days = byDay(entries, meal, beforeISO);
  const sets = new Map<string, { count: number; latest: { date: string; rows: PatternEntry[] } }>();
  for (const d of days) {
    const key = [...new Set(d.rows.map(foodKey))].sort().join('|');
    const s = sets.get(key);
    if (s) s.count++;
    else sets.set(key, { count: 1, latest: d }); // days are newest-first, so the first is the latest
  }
  let best: { count: number; latest: { date: string; rows: PatternEntry[] } } | null = null;
  for (const s of sets.values()) {
    if (s.count < minDays) continue;
    if (!best || s.count > best.count || (s.count === best.count && s.latest.date > best.latest.date)) best = s;
  }
  return best ? toPattern(best.latest.date, best.latest.rows, best.count) : null;
}

/** The last time you had `meal` before `beforeISO` — "Repeat Tue's breakfast". */
export function lastMeal(
  entries: readonly PatternEntry[],
  meal: MealType,
  beforeISO: string
): MealPattern | null {
  const [latest] = byDay(entries, meal, beforeISO);
  return latest ? toPattern(latest.date, latest.rows, 1) : null;
}

/** Whether two patterns are the same foods (so the UI doesn't offer both). */
export function samePattern(a: MealPattern | null, b: MealPattern | null): boolean {
  if (!a || !b) return false;
  const k = (p: MealPattern) =>
    [...new Set(p.items.map((i) => `${i.food_table}:${i.food_code}`))].sort().join('|');
  return k(a) === k(b);
}
