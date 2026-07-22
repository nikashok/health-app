import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { gramsTotal, snapshotNutrition } from '@/calc/logEntry';
import { getCustomFood } from '@/db/customFoods';
import { logFood } from '@/db/logEntries';
import { getMeasures, type MeasureOption } from '@/db/measures';
import { getByCodeAndTable, type SearchResult } from '@/db/search';
import type { FoodKind } from '@/db/searchSql';
import type { MealType } from '@/types/db';
import { Card, Chip, FieldRow, GroupHeader, PrimaryButton, Segmented, Stepper } from '@/ui/components';
import { grams, numberText } from '@/ui/format';
import { colors, radius, type } from '@/ui/theme';

const MEAL_OPTS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'snack', label: 'Snack' },
  { value: 'dinner', label: 'Dinner' },
];

export default function LogEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code: string;
    table: FoodKind;
    meal?: MealType;
    date?: string;
  }>();
  const date = params.date ?? today();
  const isPlan = date > today();

  // The caller's meal (inferred from the time of day) is only a starting point — it is
  // editable here so the meal is always a deliberate choice before the entry is saved.
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'breakfast');
  const [food, setFood] = useState<SearchResult | null | undefined>(undefined);
  const [measures, setMeasures] = useState<MeasureOption[]>([]);
  const [selected, setSelected] = useState<MeasureOption | null>(null);
  const [qty, setQty] = useState('1');
  const [saving, setSaving] = useState(false);

  // Reload on focus so returning from "Edit food details" shows the new values.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        // Fetch the food and (for custom foods) its stored default measure in
        // parallel — both are independent Supabase reads, so don't serialize them.
        const [f, customDefault] = await Promise.all([
          getByCodeAndTable(params.code, params.table),
          params.table === 'custom' ? getCustomFood(params.code) : Promise.resolve(null),
        ]);
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
        setSelected((prev) => prev ?? opts.find((o) => o.is_default) ?? opts[0] ?? null);
      })();
      return () => {
        active = false;
      };
    }, [params.code, params.table])
  );

  // Grams move in 10 g jumps; unit measures (bowl, roti) still nudge one at a time —
  // "+10 bowls" is never what you want.
  const qtyStep = selected?.measure_name === 'grams' ? 10 : 1;

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
      <View style={styles.titleRow}>
        <Text style={styles.eyebrow}>{kindLabel(food.kind)}</Text>
        {food.kind === 'custom' ? (
          <Pressable
            onPress={() => router.push({ pathname: '/custom-food', params: { code: food.code } })}
            hitSlop={8}
          >
            <Text style={styles.editLink}>Edit details</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.name}>{food.name}</Text>
      <Text style={styles.meta}>
        {numberText(food.energy_kcal)} Cal/100g · {dayjs(date).format('D MMM YYYY')}
      </Text>

      {isPlan ? (
        <Card style={styles.planBanner}>
          <Text style={styles.planTitle}>This will be saved as a plan</Text>
          <Text style={styles.planBody}>
            It will not count as intake until you confirm it from the diary.
          </Text>
        </Card>
      ) : null}

      <GroupHeader>Meal</GroupHeader>
      <Segmented options={MEAL_OPTS} value={meal} onChange={setMeal} />

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
          <Stepper value={qty} onChange={setQty} step={qtyStep} />
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  eyebrow: { ...type.footnote, color: colors.leafDark, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  editLink: { ...type.subhead, color: colors.leafDark, fontWeight: '600' },
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
