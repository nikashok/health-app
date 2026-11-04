/**
 * The portion and nutrition blocks shared by Log Entry and Edit Entry, so both screens
 * pick measures, quantities and read the preview the same way.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { NutritionSnapshot } from '@/calc/logEntry';
import type { MeasureOption } from '@/db/measures';
import { formatQty } from '@/db/quickLog';
import { Card, CardHeader, Chip, FieldRow, GroupHeader, Hairline, Stepper, text } from '@/ui/components';
import { int } from '@/ui/format';
import { isGrams, QUICK_QUANTITIES, qtyForSwitch, qtyStep, splitMeasures } from '@/ui/quantity';
import { colors, heroNumber, type } from '@/ui/theme';

/** Measure chips (relevant ones first, "More" for the rest), the quantity stepper, and ½/1½ picks. */
export function PortionPicker({
  foodName,
  options,
  selected,
  setSelected,
  qty,
  setQty,
  keep = [],
}: {
  foodName: string;
  options: MeasureOption[];
  selected: MeasureOption | null;
  setSelected: (m: MeasureOption) => void;
  qty: string;
  setQty: (q: string) => void;
  /** Measures that must stay visible (e.g. the one this food was last logged in). */
  keep?: (string | null | undefined)[];
}) {
  const [showAll, setShowAll] = useState(false);
  const { shown, more } = splitMeasures(foodName, options, [selected?.measure_name, ...keep]);
  const list = showAll ? options : shown;
  const quantity = parseFloat(qty);
  const error = qty.trim().length > 0 && !(quantity > 0) ? 'Enter a quantity above 0.' : null;

  const choose = (m: MeasureOption) => {
    setQty(qtyForSwitch(selected, m, qty));
    setSelected(m);
  };

  return (
    <>
      <GroupHeader>Measure</GroupHeader>
      <View style={styles.chips}>
        {list.map((m) => (
          <Chip
            key={m.measure_name}
            on={selected?.measure_name === m.measure_name}
            label={m.measure_name + (!isGrams(m) ? ` (${Math.round(m.grams_per_unit)}g)` : '')}
            onPress={() => choose(m)}
          />
        ))}
        {!showAll && more.length > 0 ? (
          <Chip label={`More (${more.length})`} on={false} onPress={() => setShowAll(true)} />
        ) : null}
      </View>

      <GroupHeader>Quantity</GroupHeader>
      <Card>
        <FieldRow label="Quantity" first minHeight={50}>
          <Stepper
            value={qty}
            onChange={setQty}
            step={qtyStep(selected)}
            unit={isGrams(selected) ? 'g' : undefined}
          />
        </FieldRow>
      </Card>
      {selected && !isGrams(selected) ? (
        <View style={styles.quick}>
          {QUICK_QUANTITIES.map((q) => (
            <Chip key={q} label={formatQty(q)} on={quantity === q} onPress={() => setQty(String(q))} />
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}

export type Preview = NutritionSnapshot & { grams: number };

/** What logging this adds to the day: "Today 1,240 → 1,487 of 2,180 kcal". */
export interface DayImpact {
  label: string;
  before: number;
  target: number | null;
}

/** Hero kcal for the chosen portion, the four macros, and (optionally) the day's new total. */
export function NutritionPreview({
  preview,
  impact,
  style,
}: {
  preview: Preview | null;
  impact?: DayImpact | null;
  style?: object;
}) {
  if (!preview) {
    return (
      <Card style={[styles.card, style]}>
        <Text style={styles.hint}>Choose a measure and a quantity above 0 to see the nutrition.</Text>
      </Card>
    );
  }
  const after = impact ? impact.before + preview.kcal : 0;
  const over = impact?.target != null && after > impact.target;
  return (
    <Card style={[styles.card, style]}>
      <CardHeader label="Nutrition" color={colors.energy} detail={`${int(preview.grams)} g`} />
      <View style={styles.kcalRow}>
        <Text style={styles.kcal}>{int(preview.kcal)}</Text>
        <Text style={text.unit}>kcal</Text>
      </View>
      <Hairline style={styles.hairline} />
      <View style={styles.macroCols}>
        <MacroCol label="Protein" color={colors.protein} value={preview.protein_g} first />
        <View style={styles.macroSep} />
        <MacroCol label="Carbs" color={colors.carbs} value={preview.carb_g} />
        <View style={styles.macroSep} />
        <MacroCol label="Fat" color={colors.fat} value={preview.fat_g} />
        <View style={styles.macroSep} />
        <MacroCol label="Fibre" color={colors.fibre} value={preview.fibre_g} />
      </View>
      {impact ? (
        <Text style={styles.impact}>
          {impact.label}{' '}
          <Text style={styles.impactNum}>{int(impact.before)}</Text> →{' '}
          <Text style={[styles.impactNum, over && styles.impactOver]}>{int(after)}</Text>
          {impact.target != null ? ` of ${int(impact.target)} kcal` : ' kcal'}
        </Text>
      ) : null}
    </Card>
  );
}

function MacroCol({
  label,
  color,
  value,
  first,
}: {
  label: string;
  color: string;
  value: number | null;
  first?: boolean;
}) {
  return (
    <View style={[styles.macroCol, first && styles.macroColFirst]}>
      <Text style={[styles.macroLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.macroVal}>
        {value != null ? Math.round(value) : '—'}
        <Text style={styles.macroUnit}> g</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quick: { flexDirection: 'row', gap: 8, marginTop: 10, marginLeft: 4 },
  error: { ...type.footnote, color: colors.rose, marginTop: 6, marginLeft: 16 },
  card: { marginTop: 24, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  hint: { ...type.subhead, color: colors.muted },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 6 },
  kcal: { ...heroNumber(40), lineHeight: 46 },
  hairline: { marginTop: 14, marginBottom: 12 },
  macroCols: { flexDirection: 'row' },
  macroSep: { width: 1, backgroundColor: colors.separator },
  macroCol: { flex: 1, minWidth: 0, paddingHorizontal: 8, gap: 2 },
  macroColFirst: { paddingLeft: 0 },
  macroLabel: { ...type.footnote, fontWeight: '600' },
  macroVal: { fontSize: 20, fontWeight: '600', color: colors.ink },
  macroUnit: { ...type.footnote, color: colors.muted, fontWeight: '400' },
  impact: { ...type.footnote, color: colors.muted, marginTop: 14 },
  impactNum: { color: colors.ink, fontWeight: '600' },
  impactOver: { color: colors.over },
});
