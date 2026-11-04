import { boostKey, historyBoost, matchTier, rankResults, type SearchResult } from './searchSql';

const dish = (code: string, name: string): SearchResult => ({
  code,
  name,
  kind: 'cooked',
  energy_kcal: 100,
  protein_g: null,
  fat_g: null,
  carb_g: null,
  fibre_g: null,
  sodium_mg: null,
});

describe('matchTier', () => {
  test('exact > starts with > every word > first word > inside a word', () => {
    expect(matchTier('Poha', 'poha')).toBe(100);
    expect(matchTier('Boiled rice (Uble chawal)', 'boiled rice')).toBe(100); // alias ignored
    expect(matchTier('Dal makhani', 'dal')).toBe(80);
    expect(matchTier('Hot tea (Garam Chai)', 'tea')).toBe(60);
    expect(matchTier('Masala dosa paneer fillings', 'dosa masala')).toBe(60);
    expect(matchTier('Arhar with spinach (Arhar dal aur palak)', 'dal spinach')).toBe(60);
    expect(matchTier('Moong dal kheer', 'dal rice')).toBe(40); // only the first term matches
    expect(matchTier('Caramel custard (steamed)', 'tea')).toBe(10);
  });

  test('first term at a word start beats a mid-word match', () => {
    expect(matchTier('Tea biscuits', 'tea xyz')).toBe(40);
  });
});

describe('rankResults', () => {
  // The web (LIKE) results for "tea", in the alphabetical order the SQL returns them.
  const tea = [
    dish('a', 'Black forest gateau'),
    dish('b', 'Caramel custard (steamed)'),
    dish('c', 'Hot tea (Garam Chai)'),
    dish('d', 'Iced tea'),
    dish('e', 'Kashmiri tea (Kehwa)'),
    dish('f', 'Orange gateau'),
    dish('g', 'Steamed cake with chocolate sauce'),
  ];

  test('real tea comes before words that merely contain "tea"', () => {
    const names = rankResults(tea, 'tea').map((r) => r.name);
    expect(names.slice(0, 3).sort()).toEqual(['Hot tea (Garam Chai)', 'Iced tea', 'Kashmiri tea (Kehwa)']);
    expect(names.slice(3)).toEqual(
      expect.arrayContaining(['Black forest gateau', 'Caramel custard (steamed)'])
    );
  });

  test('a food you log rises within its tier but never above a better match', () => {
    const boosts = new Map([
      [boostKey('cooked', 'e'), 12], // Kashmiri tea, a regular
      [boostKey('cooked', 'b'), 15], // even a big boost can't lift a mid-word match
    ]);
    const names = rankResults(tea, 'tea', boosts).map((r) => r.name);
    expect(names[0]).toBe('Kashmiri tea (Kehwa)');
    expect(names.indexOf('Caramel custard (steamed)')).toBeGreaterThan(2);
  });

  test('"dal" puts dishes that start with Dal first', () => {
    const dal = [
      dish('1', 'Arhar with spinach (Arhar dal aur palak)'),
      dish('2', 'Atta dal burfi'),
      dish('3', 'Cracked wheat porridge (Meetha daliya)'),
      dish('4', 'Dal dhokli'),
      dish('5', 'Dal makhani'),
    ];
    const names = rankResults(dal, 'dal').map((r) => r.name);
    expect(names.slice(0, 2)).toEqual(['Dal dhokli', 'Dal makhani']);
    expect(names[names.length - 1]).toBe('Cracked wheat porridge (Meetha daliya)'); // "daliya"
  });
});

describe('historyBoost', () => {
  test('anything logged gets 8, regulars up to 12', () => {
    expect(historyBoost(0)).toBe(0);
    expect(historyBoost(1)).toBe(8);
    expect(historyBoost(4)).toBe(10);
    expect(historyBoost(500)).toBe(12);
  });
});
