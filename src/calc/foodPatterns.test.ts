import { lastMeal, samePattern, usualMeal, type PatternEntry } from './foodPatterns';

let t = 0;
const row = (
  log_date: string,
  food_code: string,
  food_name: string,
  opts: Partial<PatternEntry> = {}
): PatternEntry => ({
  log_date,
  meal_type: 'breakfast',
  food_table: 'cooked_foods',
  food_code,
  food_name,
  measure_name: 'bowl',
  quantity: 1,
  kcal: 200,
  created_at: `${log_date}T07:00:${String(t++ % 60).padStart(2, '0')}Z`,
  ...opts,
});

// Poha + chai on 3 days (portions vary), idli + chai on 2 days, dinner noise.
const history: PatternEntry[] = [
  row('2026-10-28', 'POHA', 'Poha'),
  row('2026-10-28', 'CHAI', 'Hot tea', { measure_name: 'tea cup', kcal: 34 }),
  row('2026-10-29', 'IDLI', 'Idli', { measure_name: 'idli', quantity: 3 }),
  row('2026-10-29', 'CHAI', 'Hot tea', { measure_name: 'tea cup' }),
  row('2026-10-30', 'CHAI', 'Hot tea', { measure_name: 'tea cup' }),
  row('2026-10-30', 'POHA', 'Poha', { quantity: 1.5, kcal: 300 }),
  row('2026-11-01', 'IDLI', 'Idli', { measure_name: 'idli', quantity: 4 }),
  row('2026-11-01', 'CHAI', 'Hot tea', { measure_name: 'tea cup' }),
  row('2026-11-02', 'POHA', 'Poha', { quantity: 2, kcal: 400 }),
  row('2026-11-02', 'CHAI', 'Hot tea', { measure_name: 'tea cup', kcal: 34 }),
  row('2026-11-02', 'ROTI', 'Roti', { meal_type: 'dinner' }),
];

describe('usualMeal', () => {
  test('the most frequent set of foods, with portions from its latest day', () => {
    const u = usualMeal(history, 'breakfast', '2026-11-04');
    expect(u).not.toBeNull();
    expect(u!.days).toBe(3);
    expect(u!.date).toBe('2026-11-02');
    expect(u!.items.map((i) => i.food_name)).toEqual(['Poha', 'Hot tea']);
    expect(u!.items[0].quantity).toBe(2);
    expect(u!.kcal).toBe(434);
  });

  test('needs at least 3 days; days on or after the target are ignored', () => {
    expect(usualMeal(history, 'breakfast', '2026-11-01')).toBeNull(); // poha set only twice before
    expect(usualMeal(history, 'dinner', '2026-11-04')).toBeNull();
  });

  test('rows without a food code are not re-loggable', () => {
    const noCode = [1, 2, 3].map((d) => row(`2026-10-0${d}`, '', 'Mystery', { food_code: null }));
    expect(usualMeal(noCode, 'breakfast', '2026-11-04')).toBeNull();
  });
});

describe('lastMeal', () => {
  test('the most recent day of that meal before the target', () => {
    const l = lastMeal(history, 'breakfast', '2026-11-02');
    expect(l!.date).toBe('2026-11-01');
    expect(l!.items.map((i) => `${i.food_name} ${i.quantity}`)).toEqual(['Idli 4', 'Hot tea 1']);
  });

  test('null when the meal was never logged', () => {
    expect(lastMeal(history, 'snack', '2026-11-04')).toBeNull();
  });
});

describe('samePattern', () => {
  test('compares the foods, not the portions', () => {
    const u = usualMeal(history, 'breakfast', '2026-11-04');
    const l = lastMeal(history, 'breakfast', '2026-11-04');
    expect(samePattern(u, l)).toBe(true); // 2 Nov was the usual poha + chai
    expect(samePattern(u, lastMeal(history, 'breakfast', '2026-11-02'))).toBe(false);
  });
});
