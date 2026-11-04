/**
 * Unit tests for week/month insight rollups.
 */
import {
  addDays,
  buildRangeInsights,
  completedAverage,
  completedValueAverage,
  dateRange,
  daysInBand,
  kcalBand,
  ratio,
  streakFrom,
} from './insights';

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

describe('daysInBand', () => {
  const series = [
    { date: '2026-06-14', kcal: 2000 },
    { date: '2026-06-15', kcal: 2100 },
    { date: '2026-06-16', kcal: 2101 },
    { date: '2026-06-17', kcal: 1850 },
    { date: '2026-06-18', kcal: 0 },
  ];

  test('counts logged days within ±100 kcal, matching kcalBand', () => {
    expect(daysInBand(series, 2000)).toBe(2);
  });

  test('an empty day never counts, even with a tiny target', () => {
    expect(daysInBand([{ date: '2026-06-18', kcal: 0 }], 50)).toBe(0);
  });

  test('no target → null', () => {
    expect(daysInBand(series, null)).toBeNull();
  });
});

describe('ratio', () => {
  test('consumed / target, 0 when no target', () => {
    expect(ratio(1000, 2000)).toBe(0.5);
    expect(ratio(1000, null)).toBe(0);
  });
});

describe('streakFrom', () => {
  const today = '2026-11-04';

  test('counts back from today when today is logged', () => {
    expect(streakFrom(['2026-11-04', '2026-11-03', '2026-11-02'], today)).toBe(3);
  });

  test('starts from yesterday while today is still empty', () => {
    expect(streakFrom(['2026-11-03', '2026-11-02'], today)).toBe(2);
  });

  test('a gap ends the streak', () => {
    expect(streakFrom(['2026-11-04', '2026-11-03', '2026-11-01'], today)).toBe(2);
    expect(streakFrom(['2026-11-02'], today)).toBe(0);
  });

  test('is not capped at a month (the old 30-day window bug)', () => {
    const dates = dateRange(today, 75); // 75 consecutive days ending today
    expect(streakFrom(dates, today)).toBe(75);
    expect(streakFrom(dates.slice(0, -1), today)).toBe(74); // today not logged yet
  });

  test('order and duplicates do not matter', () => {
    expect(streakFrom(['2026-11-03', '2026-11-04', '2026-11-03'], today)).toBe(2);
  });
});

describe('completedAverage', () => {
  test('averages finished days only and reports days left out as too low', () => {
    const past = [
      { date: '2026-11-01', kcal: 1800 },
      { date: '2026-11-02', kcal: 0 }, // nothing logged — not counted, not "low"
      { date: '2026-11-03', kcal: 300 }, // a scrap log — left out, reported
      { date: '2026-11-04', kcal: 2200 },
    ];
    expect(completedAverage(past)).toEqual({ avgKcal: 2000, countedDays: 2, lowDays: 1 });
  });

  test('no counted days → zero average', () => {
    expect(completedAverage([{ date: '2026-11-01', kcal: 200 }])).toEqual({
      avgKcal: 0,
      countedDays: 0,
      lowDays: 1,
    });
    expect(completedAverage([])).toEqual({ avgKcal: 0, countedDays: 0, lowDays: 0 });
  });
});

describe('completedValueAverage', () => {
  test('averages over the same counted days as the calorie average', () => {
    const past = [
      { kcal: 2000, value: 120 },
      { kcal: 300, value: 10 }, // a scrap log — left out
      { kcal: 0, value: 0 }, // nothing logged — left out
      { kcal: 1800, value: 100 },
    ];
    expect(completedValueAverage(past)).toEqual({ avg: 110, countedDays: 2 });
    expect(completedValueAverage([])).toEqual({ avg: 0, countedDays: 0 });
  });
});
