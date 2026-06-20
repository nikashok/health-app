import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { gramsTotal, snapshotNutrition } from '@/calc/logEntry';
import { getCustomFood } from '@/db/customFoods';
import { logFood } from '@/db/logEntries';
import { getMeasures, type MeasureOption } from '@/db/measures';
import { getByCodeAndTable, type SearchResult } from '@/db/search';
import type { FoodKind } from '@/db/searchSql';
import type { MealType } from '@/types/db';
import { Card, Chip, FieldRow, GroupHeader, PrimaryButton, Stepper } from '@/ui/components';
import { grams, numberText } from '@/ui/format';
import { colors, radius, type } from '@/ui/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export default function LogEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code: string;
    table: FoodKind;
    meal?: MealType;
    date?: string;
  }>();
  const meal = params.meal ?? 'breakfast';
  const date = params.date ?? today();
  const isPlan = date > today();

  const [food, setFood] = useState<SearchResult | null | undefined>(undefined);
  const [measures, setMeasures] = useState<MeasureOption[]>([]);
  const [selected, setSelected] = useState<MeasureOption | null>(null);
  const [qty, setQty] = useState('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const f = await getByCodeAndTable(params.code, params.table);
      const customDefault =
        params.table === 'custom' ? await getCustomFood(params.code) : null;
      const opts = await getMeasures(
        params.code,
        customDefault?.default_measure_name
          ? {
              measure_name: customDefault.default_measure_name,
              grams_per_unit: customDefault.default_grams_per_unit ?? 1,
            }
          : null
      );
      if (!active) return;
      setFood(f ?? null);
      setMeasures(opts);
      setSelected(opts.find((o) => o.is_default) ?? opts[0] ?? null);
    })();
    return () => {
      active = false;
    };
  }, [params.code, params.table]);

  const quantity = parseFloat(qty);
  const quantityError = qty.trim().length > 0 && !(quantity > 0) ? 'Enter a quantity above 0.' : null;
  const preview = useMemo(() => {
    if (!food || !selected || !(quantity > 0)) return null;
    const totalGrams = gramsTotal(quantity, selected.grams_per_unit);
    return { grams: totalGrams, ...snapshotNutrition(food, totalGrams) };
  }, [food, selected, quantity]);

  async function onSave() {
    if (!food || !selected || !preview || saving) return;
    setSaving(true);
    try {
      await logFood({
        food,
        measureName: selected.measure_name,
        gramsPerUnit: selected.grams_per_unit,
        quantity,
        meal,
        date,
        status: isPlan ? 'planned' : 'logged',
      });
      router.replace({ pathname: '/diary', params: { date } });
    } finally {
      setSaving(false);
    }
  }

  if (food === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loading}>Preparing measures</Text>
      </View>
    );
  }
  if (food === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not load that food</Text>
        <PrimaryButton title="Back to search" onPress={() => router.back()} style={styles.errorButton} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{kindLabel(food.kind)}</Text>
      <Text style={styles.name}>{food.name}</Text>
      <Text style={styles.meta}>
        {numberText(food.energy_kcal)} Cal/100g · {MEAL_LABELS[meal]} · {dayjs(date).format('D MMM YYYY')}
      </Text>

      {isPlan ? (
        <Card style={styles.planBanner}>
          <Text style={styles.planTitle}>This will be saved as a plan</Text>
          <Text style={styles.planBody}>
            It will not count as intake until you confirm it from the diary.
          </Text>
        </Card>
      ) : null}

      <GroupHeader>Measure</GroupHeader>
      <View style={styles.chips}>
        {measures.map((m) => (
          <Chip
            key={m.measure_name}
            on={selected?.measure_name === m.measure_name}
            label={m.measure_name + (m.measure_name !== 'grams' ? ` (${Math.round(m.grams_per_unit)}g)` : '')}
            onPress={() => setSelected(m)}
          />
        ))}
      </View>

      <GroupHeader>Quantity</GroupHeader>
      <Card>
        <FieldRow label="Quantity" first>
          <Stepper value={qty} onChange={setQty} step={1} />
        </FieldRow>
      </Card>
      {quantityError ? <Text style={styles.errorText}>{quantityError}</Text> : null}

      <Card style={styles.preview}>
        {preview ? (
          <>
            <Text style={styles.previewLabel}>NUTRITION SNAPSHOT</Text>
            <Text style={styles.previewKcal}>{Math.round(preview.kcal)} Cal</Text>
            <Text style={styles.previewMacros}>
              {grams(preview.grams)} · P {grams(preview.protein_g)} · C {grams(preview.carb_g)} · F {grams(preview.fat_g)}
            </Text>
          </>
        ) : (
          <Text style={styles.previewHint}>Choose a measure and quantity to preview.</Text>
        )}
      </Card>

      <PrimaryButton
        title={saving ? 'Saving…' : isPlan ? 'Save plan' : 'Log food'}
        onPress={onSave}
        disabled={!preview || saving}
        style={styles.save}
      />
    </ScrollView>
  );
}

function today(): string {
  return dayjs().format('YYYY-MM-DD');
}
function kindLabel(k: FoodKind): string {
  return k === 'cooked' ? 'Dish' : k === 'raw' ? 'Raw ingredient' : 'Custom food';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 42 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  loading: { ...type.subhead, color: colors.muted, marginTop: 12 },
  errorTitle: { ...type.title3, color: colors.ink, marginBottom: 16 },
  errorButton: { alignSelf: 'stretch', paddingHorizontal: 18 },
  eyebrow: { ...type.footnote, color: colors.leafDark, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 4 },
  name: { ...type.title1, color: colors.ink, marginTop: 4 },
  meta: { ...type.subhead, color: colors.muted, marginTop: 6, lineHeight: 20 },
  planBanner: {
    marginTop: 18,
    padding: 14,
    backgroundColor: colors.saffronBg,
  },
  planTitle: { ...type.headline, color: colors.saffron },
  planBody: { ...type.footnote, color: colors.saffron, marginTop: 4, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  errorText: { ...type.footnote, color: colors.rose, marginTop: 6, marginLeft: 16 },
  preview: {
    marginTop: 24,
    padding: 20,
    alignItems: 'center',
  },
  previewLabel: { ...type.caption, color: colors.muted, fontWeight: '600', letterSpacing: 0.4 },
  previewKcal: { color: colors.ink, fontSize: 36, fontWeight: '700', marginTop: 6 },
  previewMacros: { ...type.subhead, color: colors.muted, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  previewHint: { ...type.subhead, color: colors.muted },
  save: { marginTop: 24 },
});
