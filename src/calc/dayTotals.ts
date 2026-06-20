/**
 * Day rollups (M4) — pure sums over snapshotted log_entries.
 *
 * The intake-honesty rule (PRD §6.7 / CLAUDE.md): *consumed* totals count ONLY
 * status='logged'. planned entries are summed separately for the plan-vs-target
 * preview and are never counted as actual intake. Reads snapshots, never recomputes.
 */
import type { EntryStatus, LogEntry, MealType } from '@/types/db';

export interface Totals {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fibre_g: number;
}

const ZERO: Totals = { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fibre_g: 0 };

const n = (v: number | null): number => v ?? 0;

/** Sum a set of entries (null macros count as 0). */
export function sumEntries(entries: LogEntry[]): Totals {
  return entries.reduce<Totals>(
    (t, e) => ({
      kcal: t.kcal + n(e.kcal),
      protein_g: t.protein_g + n(e.protein_g),
      carb_g: t.carb_g + n(e.carb_g),
      fat_g: t.fat_g + n(e.fat_g),
      fibre_g: t.fibre_g + n(e.fibre_g),
    }),
    { ...ZERO }
  );
}

const byStatus = (entries: LogEntry[], status: EntryStatus) =>
  entries.filter((e) => e.status === status);

/** Consumed intake — logged entries only (the figure shown against target). */
export function consumedTotals(entries: LogEntry[]): Totals {
  return sumEntries(byStatus(entries, 'logged'));
}

/** Planned (not-yet-eaten) totals — shown as a projection, never as intake. */
export function plannedTotals(entries: LogEntry[]): Totals {
  return sumEntries(byStatus(entries, 'planned'));
}

/** Consumed kcal subtotal for one meal (per-meal split, HOME-2 / DIARY-3). */
export function mealConsumedKcal(entries: LogEntry[], meal: MealType): number {
  return entries
    .filter((e) => e.meal_type === meal && e.status === 'logged')
    .reduce((sum, e) => sum + n(e.kcal), 0);
}

/** Group a day's entries by meal in fixed display order. */
export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export function groupByMeal(entries: LogEntry[]): Record<MealType, LogEntry[]> {
  const out: Record<MealType, LogEntry[]> = {
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: [],
  };
  for (const e of entries) out[e.meal_type].push(e);
  return out;
}
