/**
 * Trend weight — a time-aware exponentially weighted moving average of scale readings,
 * so a salty dinner or a hot day (±1–2 kg of water) doesn't read as fat gained or lost.
 * DERIVED for display only: never persisted, never synced (CLAUDE.md rule 5).
 *
 * Each reading pulls the trend toward itself by a = 1 − (1 − α)^gapDays: daily readings
 * move it by α, and a reading after a 5-day gap moves it as much as five daily ones
 * would have. α = 0.1 is the conventional "trend weight" smoothing (≈ a 10-day memory).
 *
 * Evidence note: frequent self-weighing is associated with better weight-loss outcomes;
 * that a smoothed display adds benefit on top is not well studied — this is a
 * statistical noise-reduction choice, not a clinical claim.
 */

export interface Reading {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface TrendPoint extends Reading {
  trend: number;
}

export const TREND_ALPHA = 0.1;

const DAY_MS = 86_400_000;
export function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

/** Trend over readings (any order; one per day — the last wins on duplicates). */
export function trendSeries(readings: readonly Reading[], alpha = TREND_ALPHA): TrendPoint[] {
  const byDay = new Map<string, number>();
  for (const r of readings) if (Number.isFinite(r.value) && r.value > 0) byDay.set(r.date, r.value);
  const sorted = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out: TrendPoint[] = [];
  let prev: { day: number; trend: number } | null = null;
  for (const [date, value] of sorted) {
    const day = dayNumber(date);
    let trend = value;
    if (prev) {
      const a = 1 - Math.pow(1 - alpha, Math.max(1, day - prev.day));
      trend = prev.trend + a * (value - prev.trend);
    }
    out.push({ date, value, trend });
    prev = { day, trend };
  }
  return out;
}

/**
 * Change in the trend over the last `days` days: latest trend minus the trend at the last
 * reading on or before the window start. With no reading that old, it measures from the
 * first reading instead (and says so via `since`). null with fewer than two readings.
 */
export function trendChange(
  points: readonly TrendPoint[],
  endISO: string,
  days = 30
): { delta: number; since: string; full: boolean } | null {
  if (points.length < 2) return null;
  const startDay = dayNumber(endISO) - days;
  const latest = points[points.length - 1];
  let base: TrendPoint | null = null;
  for (const p of points) if (dayNumber(p.date) <= startDay) base = p;
  const full = base != null;
  const from = base ?? points[0];
  if (from === latest) return null;
  return { delta: latest.trend - from.trend, since: from.date, full };
}

/**
 * Weekly rate of change of the trend (units/week): least-squares slope of the trend over
 * the last `days` days. null unless there are ≥3 points spanning at least a week.
 */
export function weeklyRate(points: readonly TrendPoint[], endISO: string, days = 28): number | null {
  const endDay = dayNumber(endISO);
  const recent = points.filter((p) => endDay - dayNumber(p.date) <= days);
  if (recent.length < 3) return null;
  const xs = recent.map((p) => dayNumber(p.date));
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = recent.reduce((s, p) => s + p.trend, 0) / recent.length;
  let num = 0;
  let den = 0;
  recent.forEach((p, i) => {
    num += (xs[i] - mx) * (p.trend - my);
    den += (xs[i] - mx) ** 2;
  });
  return den === 0 ? null : (num / den) * 7;
}
