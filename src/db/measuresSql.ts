/**
 * Measure options for the Log Food picker (M3). SQL + the pure composition logic,
 * shared with the headless verifier.
 *
 * A food's pickable measures = its own measures (a cooked dish's INDB serving) UNION
 * the global household measures (food_code IS NULL), PLUS "grams" (factor 1) which is
 * always offered and never stored in the table. Custom foods contribute their own
 * default measure. Exactly one option is the default; if the food has none of its
 * own, grams is the default (no fake household-weight precision).
 */

export interface RawMeasure {
  food_code: string | null;
  measure_name: string;
  grams_per_unit: number;
  is_default: number; // 0 | 1
}

export interface MeasureOption {
  measure_name: string;
  grams_per_unit: number;
  is_default: boolean;
}

/** A custom food's own default measure (stored on custom_foods, not in `measures`). */
export interface CustomDefaultMeasure {
  measure_name: string;
  grams_per_unit: number;
}

export const MEASURES_FOR_FOOD = `
  SELECT food_code, measure_name, grams_per_unit, is_default
    FROM measures
   WHERE food_code = ? OR food_code IS NULL`;

/**
 * Compose the ordered list of measure options for a food. The default option is moved
 * to the front. Names are de-duplicated case-insensitively (first wins).
 */
export function composeMeasures(
  rows: RawMeasure[],
  customDefault?: CustomDefaultMeasure | null
): MeasureOption[] {
  const out: MeasureOption[] = [];
  const seen = new Set<string>();
  const add = (name: string, grams: number, isDefault: boolean) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ measure_name: name, grams_per_unit: grams, is_default: isDefault });
  };

  // A custom food's own default takes precedence.
  if (customDefault?.measure_name) {
    add(customDefault.measure_name, customDefault.grams_per_unit, true);
  }
  // Food-specific measures (e.g. a cooked dish's serving unit).
  for (const r of rows) {
    if (r.food_code != null) add(r.measure_name, r.grams_per_unit, r.is_default === 1);
  }
  // Grams is always available at factor 1.
  add('grams', 1, false);
  // Global household measures.
  for (const r of rows) {
    if (r.food_code == null) add(r.measure_name, r.grams_per_unit, false);
  }

  // Guarantee exactly one default: fall back to grams.
  if (!out.some((o) => o.is_default)) {
    const grams = out.find((o) => o.measure_name === 'grams');
    if (grams) grams.is_default = true;
  }
  // Default first; otherwise stable.
  out.sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1));
  return out;
}

/** The default option from a composed list. */
export function defaultMeasure(options: MeasureOption[]): MeasureOption | undefined {
  return options.find((o) => o.is_default) ?? options[0];
}
