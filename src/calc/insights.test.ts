/**
 * Unit tests for week/month insight rollups.
 */
import { addDays, buildRangeInsights, dateRange, kcalBand, ratio } from './insights';

describe('date math', () => {
  test('addDays handles month/year boundaries', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  test('dateRange is inclusive, oldest first', () => {
    expect(dateRange('2026-06-20', 7)).toEqual([
      '2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17',
      '2026-06-18', '2026-06-19', '2026-06-20',
    ]);
  });
});

describe('buildRangeInsights', () => {
  const perDay = { '2026-06-18': 1800, '2026-06-19': 2000, '2026-06-20': 2200 };

  test('fills missing days with 0 and reports partial', () => {
    const r = buildRangeInsights(perDay, '2026-06-20', 7, 2000);
    expect(r.series).toHaveLength(7);
    expect(r.series[0].kcal).toBe(0); // 2026-06-14, no data
    expect(r.loggedDays).toBe(3);
    expect(r.partial).toBe(true);
  });

  test('avg is over logged days only', () => {
    const r = buildRangeInsights(perDay, '2026-06-20', 7, 2000);
    expect(r.avgKcal).toBeCloseTo((1800 + 2000 + 2200) / 3, 5); // not /7
    expect(r.countedDays).toBe(3);
  });

  test('days under 500 kcal are excluded from the average but still logged', () => {
    const withScrap = { ...perDay, '2026-06-17': 320 };
    const r = buildRangeInsights(withScrap, '2026-06-20', 7, 2000);
    expect(r.loggedDays).toBe(4); // the 320 day happened
    expect(r.countedDays).toBe(3); // …but doesn't dilute the average
    expect(r.avgKcal).toBeCloseTo((1800 + 2000 + 2200) / 3, 5);
  });

  test('500 exactly still counts', () => {
    const r = buildRangeInsights({ '2026-06-20': 500 }, '2026-06-20', 7, 2000);
    expect(r.countedDays).toBe(1);
    expect(r.avgKcal).toBe(500);
  });

  test('only sub-500 days → no average to report', () => {
    const r = buildRangeInsights({ '2026-06-20': 200 }, '2026-06-20', 7, 2000);
    expect(r.loggedDays).toBe(1);
    expect(r.countedDays).toBe(0);
    expect(r.avgKcal).toBe(0);
  });

  test('daysOnTarget counts logged days within 10% of target', () => {
    const r = buildRangeInsights(perDay, '2026-06-20', 7, 2000); // band = 200
    // 1800 (|−200| ok), 2000 (ok), 2200 (|+200| ok) → 3
    expect(r.daysOnTarget).toBe(3);
    const tight = buildRangeInsights(perDay, '2026-06-20', 7, 2000, 0.05); // band = 100
    expect(tight.daysOnTarget).toBe(1); // only 2000
  });

  test('no target → daysOnTarget null', () => {
    expect(buildRangeInsights(perDay, '2026-06-20', 7, null).daysOnTarget).toBeNull();
  });

  test('not partial when every day has data', () => {
    const full: Record<string, number> = {};
    for (const d of dateRange('2026-06-20', 7)) full[d] = 1500;
    expect(buildRangeInsights(full, '2026-06-20', 7, 2000).partial).toBe(false);
  });
});

describe('kcalBand', () => {
  test('within ±100 kcal of target is on target, inclusive at the edges', () => {
    expect(kcalBand(2000, 2000)).toBe('on');
    expect(kcalBand(2100, 2000)).toBe('on');
    expect(kcalBand(1900, 2000)).toBe('on');
  });

  test('more than 100 over / under', () => {
    expect(kcalBand(2101, 2000)).toBe('over');
    expect(kcalBand(1899, 2000)).toBe('under');
  });

  test('no target → null', () => {
    expect(kcalBand(2000, null)).toBeNull();
    expect(kcalBand(2000, 0)).toBeNull();
  });
});

describe('ratio', () => {
  test('consumed / target, 0 when no target', () => {
    expect(ratio(1000, 2000)).toBe(0.5);
    expect(ratio(1000, null)).toBe(0);
  });
});
