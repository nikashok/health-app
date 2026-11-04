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
  DestructiveButton,
  FieldRow,
  formScrollProps,
  GroupFooter,
  GroupHeader,
  PrimaryButton,
  Segmented,
  Stepper,
  TintButton,
} from '@/ui/components';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { int } from '@/ui/format';
import { Icon } from '@/ui/icons';
import { MEAL_OPTS } from '@/ui/meals';
import { showError, showToast } from '@/ui/toast';
import { isGrams, qtyForSwitch, qtyStep } from '@/ui/quantity';
import { colors, heroNumber, type } from '@/ui/theme';

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
  const [pickerOpen, setPickerOpen] = useState(false);

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

  function chooseMeasure(m: MeasureOption) {
    setQty((q) => qtyForSwitch(selected, m, q));
    setSelected(m);
  }

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
      showToast('Entry updated');
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  function onDelete() {
    confirmDestructive('Delete entry?', 'This removes it from your diary.', 'Delete', async () => {
      try {
        await deleteLogEntry(entryId);
        showToast('Entry deleted');
        router.back();
      } catch (e) {
        showError(e, 'Couldn’t delete — try again');
      }
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} {...formScrollProps}>
      <DatePickerModal
        visible={pickerOpen}
        value={date}
        onSelect={setDate}
        onClose={() => setPickerOpen(false)}
      />
      <Text style={styles.name}>{entry.food_name}</Text>

      <GroupHeader>Meal</GroupHeader>
      <Segmented options={MEAL_OPTS} value={meal} onChange={setMeal} />

      <GroupHeader>Date</GroupHeader>
      <Card>
        <FieldRow label="Date" first minHeight={50}>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => shiftDay(-1)}
              style={styles.navBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Icon name="chevron-left" size={20} color={colors.leaf} strokeWidth={2.4} />
            </Pressable>
            <Pressable
              onPress={() => setPickerOpen(true)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${dayjs(date).format('dddd D MMMM')}. Choose a date`}
            >
              <Text style={styles.dateText}>{dayjs(date).format('ddd, D MMM')}</Text>
            </Pressable>
            <Pressable
              onPress={() => shiftDay(1)}
              style={styles.navBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Icon name="chevron-right" size={20} color={colors.leaf} strokeWidth={2.4} />
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

      <Card style={styles.preview}>
        {preview ? (
          <>
            <View style={styles.previewKcalRow}>
              <Text style={styles.previewKcal}>{int(preview.kcal)}</Text>
              <Text style={styles.previewUnit}>kcal</Text>
            </View>
            <View style={styles.previewMacros}>
              <Macro letter="P" color={colors.protein} value={preview.protein_g} />
              <Macro letter="C" color={colors.carbs} value={preview.carb_g} />
              <Macro letter="F" color={colors.fat} value={preview.fat_g} />
            </View>
          </>
        ) : (
          <Text style={styles.previewHint}>Enter a quantity.</Text>
        )}
      </Card>
      {preview ? <GroupFooter>{int(preview.grams)} g</GroupFooter> : null}

      {entry.status === 'planned' && date <= TODAY() ? (
        <TintButton
          title="Ate it — confirm plan"
          onPress={() =>
            confirmEntry(entryId)
              .then(() => {
                showToast('Marked as eaten');
                router.back();
              })
              .catch((e) => showError(e))
          }
          style={styles.confirm}
        />
      ) : null}

      <PrimaryButton
        title={busy ? 'Saving…' : 'Save Changes'}
        onPress={onSave}
        disabled={!preview || busy}
        style={styles.save}
      />
      <DestructiveButton title="Delete Entry" onPress={onDelete} style={styles.delete} />
    </ScrollView>
  );
}

function Macro({ letter, color, value }: { letter: string; color: string; value: number | null }) {
  return (
    <Text style={styles.macroText}>
      <Text style={[styles.macroLetter, { color }]}>{letter}</Text> {gm(value)}
    </Text>
  );
}

function gm(n: number | null): string {
  return n != null ? `${Math.round(n)}g` : '—';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  notFound: { ...type.body, color: colors.muted },
  name: { ...type.title1, color: colors.ink, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: -6 },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dateText: { ...type.body, color: colors.leaf, minWidth: 110, textAlign: 'center' },
  planNote: { ...type.footnote, color: colors.saffron, marginTop: 7, marginLeft: 16 },
  preview: {
    marginTop: 24,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewKcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  previewKcal: heroNumber(32),
  previewUnit: { ...type.subhead, fontWeight: '600', color: colors.muted },
  previewMacros: { flexDirection: 'row', gap: 12 },
  macroText: { ...type.subhead, color: colors.ink },
  macroLetter: { fontWeight: '600' },
  previewHint: { ...type.subhead, color: colors.muted },
  confirm: { marginTop: 24 },
  save: { marginTop: 24 },
  delete: { marginTop: 8 },
});
