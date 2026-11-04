/**
 * Meal names and helpers — one copy for every screen (Today, Diary, Add Food, Log Entry,
 * Edit Entry). Display order lives with the totals math in src/calc/dayTotals (MEAL_ORDER).
 */
import dayjs from 'dayjs';

import type { MealType } from '@/types/db';

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

/** Options for the meal segmented control. */
export const MEAL_OPTS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'snack', label: 'Snack' },
  { value: 'dinner', label: 'Dinner' },
];

/** The meal you're most likely logging right now (a starting point — always editable). */
export function inferMeal(hour = dayjs().hour()): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
}
