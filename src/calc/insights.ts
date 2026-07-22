/**
 * Week/month insight rollups (M5) — pure aggregation over per-day consumed kcal.
 *
 * Dependency-free on purpose (plain Date math, no dayjs) so it unit-tests and verifies
 * headlessly. Input is a date→kcal map of *logged* totals (the SQL already filters to
 * status='logged'); planned entries never reach here.
 */

/** YYYY-MM-DD shifted by n days (UTC, so it's calendar-stable). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `days` consecutive dates ending at `endISO` (inclusive), oldest first. */
export function dateRange(endISO: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(endISO, -i));
  return out;
}

export interface DayKcal {
  date: string;
  kcal: number;
}

export interface RangeInsights {
  series: DayKcal[]; // one point per day in range (0 when nothing logged) — the trend
  totalDays: number; // length of the range (7 or ~30)
  loggedDays: number; // days that actually have logged data
  avgKcal: number; // average over LOGGED days only (0 if none)
  daysOnTarget: number | null; // days within tolerance of target; null if no target
  partial: boolean; // fewer logged days than the full range → label as partial
}

/**
 * Roll a date→kcal map into a fixed range.
 * @param perDay  date → consumed kcal (missing dates treated as 0)
 * @param endISO  last day of the range (usually today)
 * @param days    range length (7 = week, 30 = month)
 * @param target  daily kcal target (denominator); null when unset
 * @param tolerance fraction of target a day may deviate and still count "on target"
 */
export function buildRangeInsights(
  perDay: Record<string, number>,
  endISO: string,
  days: number,
  target: number | null,
  tolerance = 0.1
): RangeInsights {
  const series: DayKcal[] = dateRange(endISO, days).map((date) => ({
    date,
    kcal: perDay[date] ?? 0,
  }));

  const logged = series.filter((d) => d.kcal > 0);
  const loggedDays = logged.length;
  const avgKcal =
    loggedDays === 0 ? 0 : logged.reduce((s, d) => s + d.kcal, 0) / loggedDays;

  let daysOnTarget: number | null = null;
  if (target != null && target > 0) {
    const band = tolerance * target;
    daysOnTarget = logged.filter((d) => Math.abs(d.kcal - target) <= band).length;
  }

  return {
    series,
    totalDays: days,
    loggedDays,
    avgKcal,
    daysOnTarget,
    partial: loggedDays < days,
  };
}

/** Where a day's intake sits relative to target. */
export type KcalBand = 'over' | 'under' | 'on';

/**
 * Classify a day's kcal against the target using an absolute band (default ±100 kcal):
 * more than `band` above → 'over', more than `band` below → 'under', otherwise 'on'.
 * Returns null when there is no target to compare against.
 *
 * This is the *display* band used to colour intake bars; `daysOnTarget` above uses its
 * own proportional tolerance and is deliberately left alone.
 */
export function kcalBand(
  kcal: number,
  target: number | null | undefined,
  band = 100
): KcalBand | null {
  if (target == null || target <= 0) return null;
  if (kcal > target + band) return 'over';
  if (kcal < target - band) return 'under';
  return 'on';
}

/** Progress ratio (0..n) of a consumed value against a target. 0 when no target. */
export function ratio(consumed: number, target: number | null | undefined): number {
  return target != null && target > 0 ? consumed / target : 0;
}
