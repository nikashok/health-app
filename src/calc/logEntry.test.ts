/**
 * Unit tests for logging math (BUILD_GUIDE: assert the 246.9 kcal dosa case).
 */
import { gramsTotal, round1, snapshotNutrition, type Per100g } from './logEntry';

// Masala dosa (ASC146) per-100g, from the bundled INDB data.
const MASALA_DOSA: Per100g = {
  energy_kcal: 164.5846710205078,
  protein_g: 4.0,
  fat_g: 7.0,
  carb_g: 22.0,
  fibre_g: 2.0,
};

describe('snapshotNutrition (per-100g basis)', () => {
  test('150 g of Masala dosa = 246.9 kcal', () => {
    expect(snapshotNutrition(MASALA_DOSA, 150).kcal).toBe(246.9);
  });

  test('macros scale proportionally with grams', () => {
    const snap = snapshotNutrition(MASALA_DOSA, 150);
    expect(snap.protein_g).toBe(6); // 4.0 * 1.5
    expect(snap.fat_g).toBe(10.5); // 7.0 * 1.5
    expect(snap.carb_g).toBe(33); // 22.0 * 1.5
    expect(snap.fibre_g).toBe(3); // 2.0 * 1.5
  });

  test('a null macro stays null (unknown, not zero)', () => {
    const snap = snapshotNutrition({ ...MASALA_DOSA, fibre_g: null }, 150);
    expect(snap.fibre_g).toBeNull();
  });

  test('missing energy coerces kcal to 0 (NOT NULL column stays valid)', () => {
    expect(snapshotNutrition({ ...MASALA_DOSA, energy_kcal: null }, 150).kcal).toBe(0);
  });
});

describe('gramsTotal', () => {
  test('quantity × grams_per_unit', () => {
    expect(gramsTotal(2, 150)).toBe(300); // 2 katori @ 150 g
    expect(gramsTotal(150, 1)).toBe(150); // 150 × grams
  });
});

describe('round1', () => {
  test('rounds to one decimal place', () => {
    expect(round1(246.8770065307617)).toBe(246.9);
  });
});
