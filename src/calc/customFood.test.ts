import { macroKcal, macrosDisagree, servingToPer100 } from './customFood';

describe('servingToPer100', () => {
  test('a 40 g serving label converts to per-100 g', () => {
    const per100 = servingToPer100({ kcal: 180, protein: 4, carb: 28, fat: 6, fibre: null }, 40);
    expect(per100).toEqual({ kcal: 450, protein: 10, carb: 70, fat: 15, fibre: null });
  });
});

describe('macro check', () => {
  test('macros imply 4/4/9 kcal per gram', () => {
    expect(macroKcal({ protein: 10, carb: 70, fat: 15 })).toBe(455);
    expect(macroKcal({ protein: 10, carb: null, fat: 15 })).toBeNull();
  });

  test('flags a >20% mismatch, not small rounding gaps', () => {
    expect(macrosDisagree({ kcal: 450, protein: 10, carb: 70, fat: 15, fibre: 2 })).toBe(false);
    expect(macrosDisagree({ kcal: 250, protein: 10, carb: 70, fat: 15, fibre: 2 })).toBe(true);
    expect(macrosDisagree({ kcal: 450, protein: null, carb: 70, fat: 15, fibre: null })).toBe(false);
  });
});
