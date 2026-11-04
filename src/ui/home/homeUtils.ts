// Shared constants, types, and pure helpers for the Home screen.
import dayjs from 'dayjs';
import type { useRouter } from 'expo-router';

import { addDays } from '@/calc/insights';
import type { BodyMeasurement, LogEntry, MealType, UserProfile } from '@/types/db';

/** The expo-router navigator, passed to Home sub-components that navigate. */
export type HomeRouter = ReturnType<typeof useRouter>;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HomeState {
  profile: UserProfile;
  today: LogEntry[];
  allMeasurements: BodyMeasurement[];
  streak: number;
  /** Your usual foods per meal (derived, never stored) — a hint on empty meal rows. */
  usual: Partial<Record<MealType, string>>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getDayInitial(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day];
}

type MeasureKey = 'weight_kg' | 'waist_cm';

/**
 * Most recent recorded value of a measurement field, with the day it was recorded.
 * Weight and waist are logged independently, so each field is carried forward from its
 * own last non-null entry — a day with only a waist reading doesn't blank out weight.
 * @param all measurements oldest-first (as returned by getAllMeasurements)
 */
export function latestMeasured(
  all: BodyMeasurement[],
  key: MeasureKey
): { value: number; date: string } | null {
  for (let i = all.length - 1; i >= 0; i--) {
    const v = all[i][key];
    if (v != null) return { value: v, date: all[i].measured_on };
  }
  return null;
}

/**
 * The change line under a body card: "−2.2 kg in 30 days". Compares the latest reading
 * with the last one on or before the start of the window; with no reading that old it
 * falls back to the first reading ("since 2 Oct"). Derived for display only.
 */
export function changeLine(
  all: BodyMeasurement[],
  key: MeasureKey,
  unit: string,
  todayISO: string,
  days = 30
): string {
  const latest = latestMeasured(all, key);
  if (!latest) return 'No readings yet';
  const windowStart = addDays(todayISO, -days);
  let base: { value: number; date: string } | null = null;
  for (const m of all) {
    const v = m[key];
    if (v == null) continue;
    if (m.measured_on <= windowStart) base = { value: v, date: m.measured_on };
  }
  let suffix = `in ${days} days`;
  if (!base) {
    const first = all.find((m) => m[key] != null);
    if (!first || first.measured_on === latest.date) {
      return latest.date === todayISO ? 'Today' : `as of ${dayjs(latest.date).format('D MMM')}`;
    }
    base = { value: first[key]!, date: first.measured_on };
    suffix = `since ${dayjs(first.measured_on).format('D MMM')}`;
  }
  const delta = Math.round((latest.value - base.value) * 10) / 10;
  if (delta === 0) return `No change ${suffix}`;
  const sign = delta < 0 ? '−' : '+';
  return `${sign}${Math.abs(delta).toFixed(1)} ${unit} ${suffix}`;
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

export function buildSparkPoints(all: number[], W: number, H: number): string {
  // Start at the first real reading: days before it (e.g. weight logged before waist ever
  // was) have no value and would otherwise drag the line down to the baseline.
  const first = all.findIndex((v) => v > 0);
  const values = first < 0 ? [] : all.slice(first);
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
