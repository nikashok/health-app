/**
 * Unit tests for day rollups — especially the invariant that planned entries are
 * never counted as consumed intake (PRD §6.7).
 */
import {
  consumedTotals,
  groupByMeal,
  mealConsumedKcal,
  plannedTotals,
} from './dayTotals';
import type { LogEntry } from '@/types/db';

function entry(over: Partial<LogEntry>): LogEntry {
  return {
    id: 1,
    log_date: '2026-06-20',
    meal_type: 'breakfast',
    status: 'logged',
    food_code: 'ASC146',
    food_table: 'cooked_foods',
    food_name: 'Masala dosa',
    measure_name: 'grams',
    quantity: 150,
    grams_total: 150,
    kcal: 246.9,
    protein_g: 5,
    fat_g: 10,
    carb_g: 30,
    fibre_g: 2,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

describe('consumed vs planned', () => {
  const entries = [
    entry({ id: 1, kcal: 200, status: 'logged' }),
    entry({ id: 2, kcal: 500, status: 'planned' }),
    entry({ id: 3, kcal: 300, status: 'logged', meal_type: 'lunch' }),
  ];

  test('consumed sums logged only', () => {
    expect(consumedTotals(entries).kcal).toBe(500); // 200 + 300, not the planned 500
  });

  test('planned sums planned only', () => {
    expect(plannedTotals(entries).kcal).toBe(500);
  });

  test('macros null count as 0', () => {
    expect(consumedTotals([entry({ kcal: 100, protein_g: null })]).protein_g).toBe(0);
  });
});

describe('per-meal + grouping', () => {
  const entries = [
    entry({ id: 1, meal_type: 'breakfast', kcal: 246.9 }),
    entry({ id: 2, meal_type: 'breakfast', kcal: 100, status: 'planned' }),
    entry({ id: 3, meal_type: 'dinner', kcal: 400 }),
  ];

  test('mealConsumedKcal excludes planned', () => {
    expect(mealConsumedKcal(entries, 'breakfast')).toBe(246.9);
    expect(mealConsumedKcal(entries, 'dinner')).toBe(400);
  });

  test('groupByMeal buckets in order', () => {
    const g = groupByMeal(entries);
    expect(g.breakfast).toHaveLength(2);
    expect(g.dinner).toHaveLength(1);
    expect(g.snack).toHaveLength(0);
  });
});
