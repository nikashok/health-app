import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { gramsTotal, snapshotNutrition } from '@/calc/logEntry';
import { getCustomFood } from '@/db/customFoods';
import { logFood } from '@/db/logEntries';
import { getMeasures, type MeasureOption } from '@/db/measures';
import { getByCodeAndTable, type SearchResult } from '@/db/search';
import type { FoodKind } from '@/db/searchSql';
import type { MealType } from '@/types/db';
import {
  Card,
  CardHeader,
  Chip,
  FieldRow,
  formScrollProps,
  GroupHeader,
  Hairline,
  PrimaryButton,
  Segmented,
  Stepper,
  text,
} from '@/ui/components';
import { int, numberText } from '@/ui/format';
import { MEAL_OPTS } from '@/ui/meals';
import { showError, showToast } from '@/ui/toast';
import { initialQty, isGrams, pickerMeasures, qtyForSwitch, qtyStep } from '@/ui/quantity';
import { colors, heroNumber, type } from '@/ui/theme';


export default function LogEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code: string;
    table: FoodKind;
    meal?: MealType;
    date?: string;
    origin?: string; // 'home' when the flow started on Home
    lastMeasure?: string; // a recent food's last measure + quantity, to prefill
    lastQty?: string;
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
  const picked = useRef(false);

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
        // Grams leads and is selected, unless a custom food has its own saved default.
        const picker = pickerMeasures(opts, params.table === 'custom');
        setFood(f ?? null);
        setMeasures(picker.options);
        // Keep the user's choice when refocusing (e.g. back from Edit details).
        // A recent food starts from how it was last logged, if that measure still exists.
        if (!picked.current) {
          picked.current = true;
          const last = picker.options.find((o) => o.measure_name === params.lastMeasure);
          const lastQty = parseFloat(params.lastQty ?? '');
          if (last && lastQty > 0) {
            setSelected(last);
            setQty(String(lastQty));
          } else {
            setSelected(picker.selected);
            setQty(initialQty(picker.selected));
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [params.code, params.table])
  );

  function chooseMeasure(m: MeasureOption) {
    setQty((q) => qtyForSwitch(selected, m, q));
    setSelected(m);
  }

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
      showToast(`${isPlan ? 'Planned' : 'Logged'} ${food.name}`);
      // Return to where the flow started: Home, or the screen before Add Food (usually Diary).
      if (params.origin === 'home') router.dismissAll();
      else if (router.canDismiss()) router.dismiss(2);
      else router.replace({ pathname: '/diary', params: { date } });
    } catch (e) {
      showError(e);
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} {...formScrollProps}>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <Text style={styles.eyebrow}>{kindLabel(food.kind).toUpperCase()}</Text>
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
          {numberText(food.energy_kcal)} kcal/100g · {dayjs(date).format('D MMM YYYY')}
        </Text>
      </View>

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
            label={m.measure_name + (!isGrams(m) ? ` (${Math.round(m.grams_per_unit)}g)` : '')}
            onPress={() => chooseMeasure(m)}
          />
        ))}
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
      {quantityError ? <Text style={styles.errorText}>{quantityError}</Text> : null}

      <Card style={styles.preview}>
        {preview ? (
          <>
            <CardHeader label="Nutrition" color={colors.energy} detail={`${int(preview.grams)} g`} />
            <View style={styles.previewRow}>
              <Text style={styles.previewKcal}>{int(preview.kcal)}</Text>
              <Text style={text.unit}>kcal</Text>
            </View>
            <Hairline style={styles.previewHairline} />
            <View style={styles.macroCols}>
              <MacroCol label="Protein" color={colors.protein} value={preview.protein_g} first />
              <View style={styles.macroSep} />
              <MacroCol label="Carbs" color={colors.carbs} value={preview.carb_g} />
              <View style={styles.macroSep} />
              <MacroCol label="Fat" color={colors.fat} value={preview.fat_g} />
            </View>
          </>
        ) : (
          <Text style={styles.previewHint}>Choose a measure and quantity to preview.</Text>
        )}
      </Card>

      <PrimaryButton
        title={saving ? 'Saving…' : isPlan ? 'Save Plan' : 'Log Food'}
        onPress={onSave}
        disabled={!preview || saving}
        style={styles.save}
      />
    </ScrollView>
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
      <Text style={[styles.macroLabel, { color }]}>{label}</Text>
      <Text style={styles.macroVal}>
        {value != null ? Math.round(value) : '—'}
        <Text style={styles.macroUnit}> g</Text>
      </Text>
    </View>
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
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  loading: { ...type.subhead, color: colors.muted, marginTop: 12 },
  errorTitle: { ...type.title3, color: colors.ink, marginBottom: 16 },
  errorButton: { alignSelf: 'stretch', paddingHorizontal: 18 },
  titleBlock: { paddingHorizontal: 4, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...type.footnote, color: colors.muted, fontWeight: '600', letterSpacing: 0.2 },
  editLink: { ...type.subhead, color: colors.leaf },
  name: { ...type.title1, color: colors.ink },
  meta: { ...type.subhead, color: colors.muted },
  planBanner: { marginTop: 18, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.saffronBg },
  planTitle: { ...type.headline, color: colors.saffron },
  planBody: { ...type.footnote, color: colors.ink, marginTop: 4, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  errorText: { ...type.footnote, color: colors.rose, marginTop: 6, marginLeft: 16 },
  preview: { marginTop: 24, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  previewRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 6 },
  previewKcal: { ...heroNumber(40), lineHeight: 46 },
  previewHairline: { marginTop: 14, marginBottom: 12 },
  macroCols: { flexDirection: 'row' },
  macroSep: { width: 1, backgroundColor: colors.separator },
  macroCol: { flex: 1, paddingHorizontal: 10, gap: 2 },
  macroColFirst: { paddingLeft: 0 },
  macroLabel: { ...type.footnote, fontWeight: '600' },
  macroVal: { fontSize: 20, fontWeight: '600', color: colors.ink },
  macroUnit: { ...type.footnote, color: colors.muted, fontWeight: '400' },
  previewHint: { ...type.subhead, color: colors.muted },
  save: { marginTop: 24 },
});
