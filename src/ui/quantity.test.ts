import type { MeasureOption } from '@/db/measures';

import { plausibleGlobals, qtyForSwitch, splitMeasures } from './quantity';

const m = (measure_name: string, grams_per_unit: number, is_default = false): MeasureOption => ({
  measure_name,
  grams_per_unit,
  is_default,
});
const globals = [m('katori', 150), m('bowl', 200), m('cup', 240), m('glass', 250), m('tbsp', 15), m('tsp', 5), m('piece', 30)];

describe('plausibleGlobals', () => {
  test('drinks get cups and glasses, fats and condiments get spoons, the rest bowls', () => {
    expect(plausibleGlobals('Hot tea (Garam Chai)')).toEqual(['cup', 'glass']);
    expect(plausibleGlobals('Banana milkshake (Kele milkshake)')).toEqual(['cup', 'glass']);
    expect(plausibleGlobals('Ghee')).toEqual(['tbsp', 'tsp']);
    expect(plausibleGlobals('Mint chutney (Pudina chutney)')).toEqual(['tbsp', 'tsp']);
    expect(plausibleGlobals('Masala dosa')).toEqual(['katori', 'bowl', 'piece']);
    // "tea" inside a word is not a drink
    expect(plausibleGlobals('Steamed rice')).toEqual(['katori', 'bowl', 'piece']);
  });
});

describe('splitMeasures', () => {
  const dosa = [m('grams', 1), m('dosa', 210, true), ...globals];

  test('a dish shows grams, its own serving and food-shaped measures; the rest go under More', () => {
    const { shown, more } = splitMeasures('Masala dosa', dosa);
    expect(shown.map((o) => o.measure_name)).toEqual(['grams', 'dosa', 'katori', 'bowl', 'piece']);
    expect(more.map((o) => o.measure_name)).toEqual(['cup', 'glass', 'tbsp', 'tsp']);
  });

  test('the selected or last-used measure is always shown', () => {
    const { shown } = splitMeasures('Masala dosa', dosa, ['glass']);
    expect(shown.map((o) => o.measure_name)).toContain('glass');
  });

  test('nothing is lost: shown + more is every option', () => {
    const { shown, more } = splitMeasures('Hot tea', [m('grams', 1), m('tea cup', 211, true), ...globals]);
    expect(shown.length + more.length).toBe(9);
    expect(shown.map((o) => o.measure_name)).toEqual(['grams', 'tea cup', 'cup', 'glass']);
  });
});

describe('qtyForSwitch (unchanged behaviour)', () => {
  test('to grams keeps the weight; to a unit starts at 1', () => {
    expect(qtyForSwitch(m('bowl', 180), m('grams', 1), '1')).toBe('180');
    expect(qtyForSwitch(m('grams', 1), m('bowl', 180), '180')).toBe('1');
  });
});
