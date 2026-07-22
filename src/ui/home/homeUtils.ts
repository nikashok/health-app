// Shared constants, types, and pure helpers for the Home screen.
// Extracted verbatim from app/(tabs)/index.tsx (I0 Home split) — no behavior change.
import dayjs from 'dayjs';
import type { useRouter } from 'expo-router';

import { addDays, type RangeInsights } from '@/calc/insights';
import type { BodyMeasurement, LogEntry, MealType, UserProfile } from '@/types/db';
import { dark as D } from '@/ui/theme';

/** The expo-router navigator, passed to Home sub-components that navigate. */
export type HomeRouter = ReturnType<typeof useRouter>;

// ─── Constants ──────────────────────────────────────────────────────────────

export const RING_R = 104;
export const RING_C = 2 * Math.PI * RING_R; // 653.45

export const MEAL_COLORS: Record<MealType, string> = {
  breakfast: D.accent,
  lunch: '#3bc9ff',
  snack: '#6cf0bb',
  dinner: D.amber,
};

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HomeState {
  profile: UserProfile;
  today: LogEntry[];
  week: RangeInsights;
  monthMap: Record<string, number>;
  recentMeasurements: BodyMeasurement[];
  allMeasurements: BodyMeasurement[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getGreeting(): string {
  const h = dayjs().hour();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function inferMeal(): MealType {
  const h = dayjs().hour();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

export function computeStreak(monthMap: Record<string, number>, today: string): number {
  // If today has no data yet, start from yesterday so an in-progress day doesn't break the streak.
  let d = (monthMap[today] ?? 0) > 0 ? today : addDays(today, -1);
  let streak = 0;
  for (let i = 0; i < 31; i++) {
    if ((monthMap[d] ?? 0) > 0) {
      streak++;
      d = addDays(d, -1);
    } else {
      break;
    }
  }
  return streak;
}

export function getDayInitial(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day];
}

/**
 * Most recent recorded value of a measurement field, with the day it was recorded.
 * Weight and waist are logged independently, so each field is carried forward from its
 * own last non-null entry — a day with only a waist reading doesn't blank out weight.
 * @param all measurements oldest-first (as returned by getAllMeasurements)
 */
export function latestMeasured(
  all: BodyMeasurement[],
  key: 'weight_kg' | 'waist_cm'
): { value: number; date: string } | null {
  for (let i = all.length - 1; i >= 0; i--) {
    const v = all[i][key];
    if (v != null) return { value: v, date: all[i].measured_on };
  }
  return null;
}

/**
 * Hold the last known reading across days with no entry, so a sparkline stays flat
 * instead of dropping to the baseline. Leading gaps (before the first ever reading)
 * stay 0, which buildSparkPoints already treats as "no data".
 */
export function carryForward(values: (number | null)[]): number[] {
  let last = 0;
  return values.map((v) => {
    if (v != null && v > 0) last = v;
    return last;
  });
}

export function buildSparkPoints(values: number[], W: number, H: number): string {
  const valid = values.filter((v) => v > 0);
  if (valid.length < 2) return '';
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const step = W / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = v > 0 ? H - ((v - min) / range) * (H - 8) - 4 : H - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function buildAreaPath(pts: string, H: number): string {
  const coords = pts.split(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const fx = first.split(',')[0];
  const lx = last.split(',')[0];
  return `M${pts} L${lx},${H} L${fx},${H} Z`;
}
