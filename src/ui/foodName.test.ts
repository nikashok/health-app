import { displayFoodName } from './foodName';

describe('displayFoodName', () => {
  test('drops the Latin binomial from raw ingredients', () => {
    expect(displayFoodName('Bajra (Pennisetum typhoideum)', 'raw')).toBe('Bajra');
    expect(displayFoodName('Banana, ripe, montham (Musa x paradisiaca)', 'foods')).toBe(
      'Banana, ripe, montham'
    );
    expect(displayFoodName('Rice, raw, milled (Oryza sativa )', 'raw')).toBe('Rice, raw, milled');
    expect(displayFoodName('Quinoa(Chenopodium quinoa)', 'raw')).toBe('Quinoa');
  });

  test('keeps descriptive parentheses on raw foods', () => {
    expect(displayFoodName('Beef, round (leg)', 'raw')).toBe('Beef, round (leg)');
    expect(displayFoodName('Goat, tube (small intestine)', 'raw')).toBe('Goat, tube (small intestine)');
  });

  test('never touches dishes or custom foods (their parentheses are Hindi names)', () => {
    expect(displayFoodName('Boiled rice (Uble chawal)', 'cooked')).toBe('Boiled rice (Uble chawal)');
    expect(displayFoodName('Boiled rice (Uble chawal)', 'cooked_foods')).toBe('Boiled rice (Uble chawal)');
    expect(displayFoodName('Mom rajma (Kidney beans)', 'custom')).toBe('Mom rajma (Kidney beans)');
  });
});
