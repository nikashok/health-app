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
