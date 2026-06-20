/**
 * Unit tests for target computation (BUILD_GUIDE: unit-test /src/calc, Mifflin-St
 * Jeor vs a hand calc). Run with `npm test` (jest-expo).
 */
import {
  computeBmr,
  computeTargets,
  computeTdee,
  proteinPerKg,
  type ProfileInput,
} from './targets';

const MALE: ProfileInput = {
  sex: 'male',
  age: 30,
  height_cm: 180,
  weight_kg: 80,
  activity_level: 'moderate',
  goal: 'maintain',
};

const FEMALE: ProfileInput = {
  sex: 'female',
  age: 25,
  height_cm: 165,
  weight_kg: 60,
  activity_level: 'light',
  goal: 'lose',
};

describe('computeBmr (Mifflin-St Jeor)', () => {
  test('male hand calc: 10*80 + 6.25*180 - 5*30 + 5 = 1780', () => {
    expect(computeBmr(MALE)).toBe(1780);
  });
  test('female hand calc: 10*60 + 6.25*165 - 5*25 - 161 = 1345.25', () => {
    expect(computeBmr(FEMALE)).toBeCloseTo(1345.25, 5);
  });
});

describe('computeTdee', () => {
  test('male moderate: 1780 * 1.55 = 2759', () => {
    expect(computeTdee(MALE)).toBeCloseTo(2759, 5);
  });
});

describe('proteinPerKg', () => {
  test('maintain + sedentary = 1.6', () => {
    expect(proteinPerKg('maintain', 'sedentary')).toBeCloseTo(1.6);
  });
  test('lose + active is clamped to 2.2', () => {
    expect(proteinPerKg('lose', 'active')).toBeCloseTo(2.2);
  });
  test('maintain + active = 1.8', () => {
    expect(proteinPerKg('maintain', 'active')).toBeCloseTo(1.8);
  });
});

describe('computeTargets', () => {
  test('male maintain → hand-calculated set', () => {
    expect(computeTargets(MALE)).toEqual({
      target_kcal: 2759, // 2759 + 0
      target_protein_g: 128, // 1.6 * 80
      target_fat_g: 83, // round(0.27 * 2759 / 9)
      target_carb_g: 375, // (2759 - 512 - 747) / 4
    });
  });

  test('female lose → 500 kcal deficit + 2.0 g/kg protein', () => {
    expect(computeTargets(FEMALE)).toEqual({
      target_kcal: 1350, // round(1849.71875 - 500)
      target_protein_g: 120, // 2.0 * 60
      target_fat_g: 41, // round(0.27 * 1350 / 9)
      target_carb_g: 125, // (1350 - 480 - 369) / 4
    });
  });

  test('heavier weight recomputes to a higher calorie target', () => {
    const lighter = computeTargets(MALE).target_kcal;
    const heavier = computeTargets({ ...MALE, weight_kg: 90 }).target_kcal;
    expect(heavier).toBeGreaterThan(lighter);
  });
});
