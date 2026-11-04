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

/**
 * A day below this is treated as an incomplete log (a forgotten meal, a single snack
 * entered and abandoned) rather than a real day of eating, so it is excluded from the
 * average. Such days still appear in `series` and in `loggedDays` — they happened.
 */
export const MIN_COUNTED_KCAL = 500;

export interface RangeInsights {
  series: DayKcal[]; // one point per day in range (0 when nothing logged) — the trend
  totalDays: number; // length of the range (7 or ~30)
  loggedDays: number; // days that actually have logged data
  countedDays: number; // logged days at/above MIN_COUNTED_KCAL — the average's denominator
  avgKcal: number; // average over COUNTED days only (0 if none)
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

  // Barely-logged days would drag the average down and misrepresent actual intake.
  const counted = logged.filter((d) => d.kcal >= MIN_COUNTED_KCAL);
  const countedDays = counted.length;
  const avgKcal =
    countedDays === 0 ? 0 : counted.reduce((s, d) => s + d.kcal, 0) / countedDays;

  let daysOnTarget: number | null = null;
  if (target != null && target > 0) {
    const band = tolerance * target;
    daysOnTarget = logged.filter((d) => Math.abs(d.kcal - target) <= band).length;
  }

  return {
    series,
    totalDays: days,
    loggedDays,
    countedDays,
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

/**
 * Logged days whose intake falls in the ±`band` kcal "on target" band — the same rule
 * `kcalBand` uses to colour the bars, so the count always matches the green bars.
 * Days with nothing logged are not counted. Returns null when there is no target.
 */
export function daysInBand(
  series: DayKcal[],
  target: number | null | undefined,
  band = 100
): number | null {
  if (target == null || target <= 0) return null;
  return series.filter((d) => d.kcal > 0 && kcalBand(d.kcal, target, band) === 'on').length;
}

/** Progress ratio (0..n) of a consumed value against a target. 0 when no target. */
export function ratio(consumed: number, target: number | null | undefined): number {
  return target != null && target > 0 ? consumed / target : 0;
}

/**
 * Consecutive days with logged food, ending today — or ending yesterday while today has
 * nothing logged yet, so an in-progress morning doesn't break the streak. `dates` is any
 * list of YYYY-MM-DD days that have logged intake (order and duplicates don't matter).
 * Unlike a fixed window, this has no upper limit.
 */
export function streakFrom(dates: readonly string[], todayISO: string): number {
  const days = new Set(dates);
  let d = days.has(todayISO) ? todayISO : addDays(todayISO, -1);
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export interface CompletedAverage {
  avgKcal: number; // average over counted days (0 when none)
  countedDays: number; // completed days at/above MIN_COUNTED_KCAL
  lowDays: number; // logged days left out for being under MIN_COUNTED_KCAL
}

/**
 * Daily average over finished days only. Pass the range WITHOUT today: an unfinished
 * day would drag the average down every afternoon, and the "days on target" count
 * already leaves today out — so both figures describe the same days. Days below
 * `minKcal` are treated as incomplete logs and reported in `lowDays` instead.
 */
export function completedAverage(
  pastDays: readonly DayKcal[],
  minKcal = MIN_COUNTED_KCAL
): CompletedAverage {
  const logged = pastDays.filter((d) => d.kcal > 0);
  const counted = logged.filter((d) => d.kcal >= minKcal);
  const avgKcal =
    counted.length === 0 ? 0 : counted.reduce((s, d) => s + d.kcal, 0) / counted.length;
  return { avgKcal, countedDays: counted.length, lowDays: logged.length - counted.length };
}
