/**
 * Quantity handling shared by Log Entry and Edit Entry. Grams move in 10 g jumps and
 * start at 100 g; unit measures (bowl, roti) nudge one at a time — "+10 bowls" is never
 * what you want.
 */
import type { MeasureOption } from '@/db/measures';

export const DEFAULT_GRAMS = 100;

export function isGrams(m: MeasureOption | null | undefined): boolean {
  return m?.measure_name === 'grams';
}

export function qtyStep(m: MeasureOption | null | undefined): number {
  return isGrams(m) ? 10 : 1;
}

/** Starting quantity for a measure: 100 g for grams, 1 for a unit measure. */
export function initialQty(m: MeasureOption | null | undefined): string {
  return isGrams(m) ? String(DEFAULT_GRAMS) : '1';
}

/**
 * The quantity to show after switching measure. Moving to grams keeps the same total
 * weight (1 bowl of 180 g → 180 g); moving to a unit measure starts at 1, so switching
 * from 180 g never becomes 180 bowls.
 */
export function qtyForSwitch(
  from: MeasureOption | null,
  to: MeasureOption,
  qty: string
): string {
  if (from?.measure_name === to.measure_name) return qty;
  if (!isGrams(to)) return '1';
  const q = parseFloat(qty);
  if (!from || !(q > 0)) return String(DEFAULT_GRAMS);
  return String(Math.round(q * from.grams_per_unit));
}

/**
 * Picker order for a new log: grams first and selected, unless the food carries its
 * own default measure (a custom food's saved default), which then leads instead.
 */
export function pickerMeasures(
  options: MeasureOption[],
  preferOwnDefault: boolean
): { options: MeasureOption[]; selected: MeasureOption | null } {
  const own = preferOwnDefault ? options.find((o) => o.is_default && !isGrams(o)) : undefined;
  const grams = options.find(isGrams);
  const lead = [own, grams].filter((o): o is MeasureOption => o != null);
  const rest = options.filter((o) => !lead.includes(o));
  const ordered = [...lead, ...rest];
  return { options: ordered, selected: ordered[0] ?? null };
}

/** The household measures every food gets (src/db/m0Sql.ts GLOBAL_MEASURES). */
const GLOBAL_NAMES = new Set(['katori', 'bowl', 'cup', 'glass', 'tbsp', 'tsp', 'piece']);

/** Words that mark a drink, or a fat / condiment eaten by the spoon. Word-start matches. */
const DRINK =
  /\b(tea|chai|coffee|juice|milk|lassi|chaas|buttermilk|smoothie|soup|sherbet|sharbat|water|drink|cooler|punch|lemonade|panna|kehwa|kadha|squash|rasam)|shake\b/i;
const SPOONED =
  /\b(ghee|oil|butter|sugar|jaggery|gur|honey|chutney|pickle|achar|sauce|jam|ketchup|mayonnaise|mayo|cream|dressing|powder|salt|seeds?)\b/i;

/** Household measures that make sense for a food, judged from its name. */
export function plausibleGlobals(foodName: string): string[] {
  if (DRINK.test(foodName)) return ['cup', 'glass'];
  if (SPOONED.test(foodName)) return ['tbsp', 'tsp'];
  return ['katori', 'bowl', 'piece'];
}

/**
 * Split a food's measures into the chips worth showing and the rest ("More"). Always
 * shown: grams, the food's own measures (a dish's serving, a custom default), anything in
 * `keep` (the selected / last-used measure), and the 2–3 household measures that fit the
 * food — so a dosa doesn't offer "glass" and tea doesn't offer "katori". Order follows
 * `options` (grams-first as built by pickerMeasures). Nothing is removed: "More" shows all.
 */
export function splitMeasures(
  foodName: string,
  options: MeasureOption[],
  keep: (string | null | undefined)[] = []
): { shown: MeasureOption[]; more: MeasureOption[] } {
  const wanted = new Set<string>([...plausibleGlobals(foodName), ...keep.filter((k): k is string => !!k)]);
  const isShown = (o: MeasureOption) =>
    isGrams(o) || o.is_default || !GLOBAL_NAMES.has(o.measure_name.toLowerCase()) || wanted.has(o.measure_name);
  return { shown: options.filter(isShown), more: options.filter((o) => !isShown(o)) };
}

/** One-tap quantities offered under the stepper for unit measures (½ katori, 1½ roti). */
export const QUICK_QUANTITIES = [0.5, 1, 1.5, 2] as const;
