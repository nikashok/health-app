import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirmDestructive } from '@/lib/confirm';
import { gramsTotal, snapshotNutrition } from '@/calc/logEntry';
import { getCustomFood } from '@/db/customFoods';
import { confirmEntry, deleteLogEntry, getEntry, updateLogEntry } from '@/db/logEntries';
import { getMeasures, type MeasureOption } from '@/db/measures';
import { getByCodeAndTable, type SearchResult } from '@/db/search';
import { tableToKind } from '@/db/searchSql';
import type { LogEntry, MealType } from '@/types/db';
import {
  Card,
  Chip,
  FieldRow,
  GroupHeader,
  PrimaryButton,
  Segmented,
  Stepper,
  TintButton,
} from '@/ui/components';
import { colors, type } from '@/ui/theme';

const MEAL_OPTS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'B’fast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'snack', label: 'Snack' },
  { value: 'dinner', label: 'Dinner' },
];
const TODAY = () => dayjs().format('YYYY-MM-DD');

/**
 * Edit Entry (EDIT-1…4). Change measure / quantity / meal / date and re-snapshot, or
 * delete. Moving the date or meal moves the entry so both days' totals update. A move
 * to a future date makes it a plan; otherwise the existing status is preserved.
 */
export default function EditEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);

  const [entry, setEntry] = useState<LogEntry | null | undefined>(undefined);
  const [food, setFood] = useState<SearchResult | null>(null);
  const [measures, setMeasures] = useState<MeasureOption[]>([]);
  const [selected, setSelected] = useState<MeasureOption | null>(null);
  const [qty, setQty] = useState('1');
  const [meal, setMeal] = useState<MealType>('breakfast');
  const [date, setDate] = useState(TODAY());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const e = await getEntry(entryId);
      if (!e) {
        if (active) setEntry(null);
        return;
      }
      const kind = tableToKind(e.food_table);
      // Independent Supabase reads — run them in parallel, not one after the other.
      const [f, customDefault] = await Promise.all([
        e.food_code ? getByCodeAndTable(e.food_code, kind) : Promise.resolve(null),
        e.food_table === 'custom' && e.food_code
          ? getCustomFood(e.food_code)
          : Promise.resolve(null),
      ]);
      const opts = await getMeasures(
        e.food_code,
        customDefault?.default_measure_name
          ? {
              measure_name: customDefault.default_measure_name,
              grams_per_unit: customDefault.default_grams_per_unit ?? 1,
            }
          : null
      );
      // Ensure the entry's own measure is selectable even if absent from the list.
      if (!opts.some((o) => o.measure_name === e.measure_name)) {
        opts.unshift({
          measure_name: e.measure_name,
          grams_per_unit: e.quantity ? e.grams_total / e.quantity : 1,
          is_default: false,
        });
      }
      if (!active) return;
      setEntry(e);
      setFood(f);
      setMeasures(opts);
      setSelected(opts.find((o) => o.measure_name === e.measure_name) ?? opts[0]);
      setQty(String(e.quantity));
      setMeal(e.meal_type);
      setDate(e.log_date);
    })();
    return () => {
      active = false;
    };
  }, [entryId]);

  const quantity = parseFloat(qty);
  const preview = useMemo(() => {
    if (!food || !selected || !(quantity > 0)) return null;
    const grams = gramsTotal(quantity, selected.grams_per_unit);
    return { grams, ...snapshotNutrition(food, grams) };
  }, [food, selected, quantity]);

  async function onSave() {
    if (!entry || !food || !selected || !preview || busy) return;
    setBusy(true);
    try {
      // Future date => plan; otherwise keep the entry's current status (confirm is M6).
      const status = date > TODAY() ? 'planned' : entry.status;
      await updateLogEntry(entryId, {
        food,
        measureName: selected.measure_name,
        gramsPerUnit: selected.grams_per_unit,
        quantity,
        meal,
        date,
        status,
      });
      router.back();
    } finally {
      setBusy(false);
    }
  }

  function onDelete() {
    confirmDestructive('Delete entry?', 'This removes it from your diary.', 'Delete', async () => {
      await deleteLogEntry(entryId);
      router.back();
    });
  }

  if (entry === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
      </View>
    );
  }
  if (entry === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Entry not found.</Text>
      </View>
    );
  }

  const shiftDay = (d: number) =>
    setDate(dayjs(date).add(d, 'day').format('YYYY-MM-DD'));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{entry.food_name}</Text>

      <GroupHeader>Meal</GroupHeader>
      <Segmented options={MEAL_OPTS} value={meal} onChange={setMeal} />

      <GroupHeader>Date</GroupHeader>
      <Card>
        <FieldRow label="Date" first>
          <View style={styles.dateRow}>
            <Pressable onPress={() => shiftDay(-1)} style={styles.navBtn} hitSlop={8}>
              <Text style={styles.navText}>‹</Text>
            </Pressable>
            <Text style={styles.dateText}>{dayjs(date).format('ddd, D MMM')}</Text>
            <Pressable onPress={() => shiftDay(1)} style={styles.navBtn} hitSlop={8}>
              <Text style={styles.navText}>›</Text>
            </Pressable>
          </View>
        </FieldRow>
      </Card>
      {date > TODAY() ? <Text style={styles.planNote}>Future date — saved as a plan.</Text> : null}

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

      <Card style={styles.preview}>
        {preview ? (
          <>
            <Text style={styles.previewKcal}>{Math.round(preview.kcal)} Cal</Text>
            <Text style={styles.previewMacros}>
              {Math.round(preview.grams)} g · P {gm(preview.protein_g)} · C {gm(preview.carb_g)} · F {gm(preview.fat_g)}
            </Text>
          </>
        ) : (
          <Text style={styles.previewHint}>Enter a quantity.</Text>
        )}
      </Card>

      {entry.status === 'planned' && date <= TODAY() ? (
        <TintButton
          title="Ate it — confirm plan"
          onPress={() => confirmEntry(entryId).then(() => router.back())}
          style={styles.confirm}
        />
      ) : null}

      <PrimaryButton
        title={busy ? 'Saving…' : 'Save changes'}
        onPress={onSave}
        disabled={!preview || busy}
        style={styles.save}
      />
      <Pressable style={styles.delete} onPress={onDelete}>
        <Text style={styles.deleteText}>Delete entry</Text>
      </Pressable>
    </ScrollView>
  );
}

function gm(n: number | null): string {
  return n != null ? `${Math.round(n)}g` : '—';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  notFound: { ...type.body, color: colors.muted },
  name: { ...type.title1, color: colors.ink, marginTop: 4, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: { paddingHorizontal: 8 },
  navText: { fontSize: 24, color: colors.leafDark, fontWeight: '500' },
  dateText: { ...type.body, color: colors.ink, fontWeight: '500', minWidth: 110, textAlign: 'center' },
  planNote: { ...type.footnote, color: colors.saffron, marginTop: 6, marginLeft: 16 },
  preview: { marginTop: 24, padding: 18, alignItems: 'center' },
  previewKcal: { fontSize: 28, fontWeight: '700', color: colors.ink },
  previewMacros: { ...type.subhead, marginTop: 4, color: colors.muted },
  previewHint: { ...type.subhead, color: colors.muted },
  confirm: { marginTop: 24 },
  save: { marginTop: 16 },
  delete: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  deleteText: { ...type.body, color: colors.rose, fontWeight: '500' },
});
