import { dateRange } from './insights';
import { trendChange, trendSeries, weeklyRate } from './trend';

describe('trendSeries', () => {
  test('starts at the first reading and moves 10% toward each daily reading', () => {
    const t = trendSeries([
      { date: '2026-11-01', value: 80 },
      { date: '2026-11-02', value: 81 },
    ]);
    expect(t[0].trend).toBe(80);
    expect(t[1].trend).toBeCloseTo(80.1, 6);
  });

  test('a gap moves the trend as much as the missed daily readings would have', () => {
    const daily = trendSeries([
      { date: '2026-11-01', value: 80 },
      ...dateRange('2026-11-06', 5).map((date) => ({ date, value: 78 })),
    ]);
    const gapped = trendSeries([
      { date: '2026-11-01', value: 80 },
      { date: '2026-11-06', value: 78 },
    ]);
    expect(gapped[1].trend).toBeCloseTo(daily[daily.length - 1].trend, 6);
  });

  test('damps day-to-day water swings', () => {
    // The scale swings 2 kg every day around 80 kg; once settled the trend moves < 0.2 kg.
    const noisy = dateRange('2026-11-30', 40).map((date, i) => ({ date, value: i % 2 ? 81 : 79 }));
    const settled = trendSeries(noisy).slice(-10).map((p) => p.trend);
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(0.2);
    expect(Math.abs(settled[settled.length - 1] - 80)).toBeLessThan(0.2);
  });

  test('ignores order, duplicates (last wins) and non-positive values', () => {
    const t = trendSeries([
      { date: '2026-11-02', value: 81 },
      { date: '2026-11-01', value: 0 },
      { date: '2026-11-01', value: 80 },
    ]);
    expect(t.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-02']);
  });
});

describe('trendChange / weeklyRate', () => {
  // Steady loss of 0.1 kg/day for 90 days (long enough for the trend to settle on the slope).
  const steady = trendSeries(dateRange('2026-11-04', 90).map((date, i) => ({ date, value: 89 - 0.1 * i })));

  test('change over 30 days follows the real 3 kg loss', () => {
    const c = trendChange(steady, '2026-11-04', 30)!;
    expect(c.full).toBe(true);
    expect(c.delta).toBeCloseTo(-3, 1);
  });

  test('without 30 days of history it measures from the first reading', () => {
    const short = steady.slice(-10);
    const c = trendChange(short, '2026-11-04', 30)!;
    expect(c.full).toBe(false);
    expect(c.since).toBe(short[0].date);
  });

  test('weekly rate ≈ −0.7 kg/week for 0.1 kg/day', () => {
    expect(weeklyRate(steady, '2026-11-04')!).toBeCloseTo(-0.7, 1);
  });

  test('not enough data → null', () => {
    expect(weeklyRate(steady.slice(-2), '2026-11-04')).toBeNull();
    expect(trendChange(steady.slice(-1), '2026-11-04')).toBeNull();
  });
});
