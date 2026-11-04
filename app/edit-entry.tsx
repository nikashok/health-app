import dayjs from 'dayjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirmDestructive } from '@/lib/confirm';
import { gramsTotal, snapshotNutrition } from '@/calc/logEntry';
import {
  confirmEntry,
  deleteLogEntry,
  getEntry,
  moveLogEntry,
  revertToPlanned,
  updateLogEntry,
} from '@/db/logEntries';
import type { MeasureOption } from '@/db/measures';
import { loadFoodForLogging } from '@/db/quickLog';
import type { SearchResult } from '@/db/search';
import { tableToKind } from '@/db/searchSql';
import type { LogEntry, MealType } from '@/types/db';
import {
  Card,
  DestructiveButton,
  FieldRow,
  formScrollProps,
  GroupHeader,
  PrimaryButton,
  Segmented,
  TintButton,
} from '@/ui/components';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { displayFoodName } from '@/ui/foodName';
import { Icon } from '@/ui/icons';
import { MEAL_OPTS } from '@/ui/meals';
import { NutritionPreview, PortionPicker } from '@/ui/portion';
import { showError, showToast } from '@/ui/toast';
import { colors, type } from '@/ui/theme';

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
      const { food: f, options: opts } = e.food_code
        ? await loadFoodForLogging(e.food_code, tableToKind(e.food_table))
        : { food: null, options: [] as MeasureOption[] };
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
    if (!entry || busy) return;
    // Future date => plan; otherwise keep the entry's current status (confirm is M6).
    const status = date > TODAY() ? 'planned' : entry.status;
    if (!food) {
      // The food is gone, so only the meal/date can change; the snapshot stays as logged.
      setBusy(true);
      try {
        await moveLogEntry(entryId, { meal, date, status });
        showToast('Entry moved');
        router.back();
      } catch (e) {
        showError(e);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!selected || !preview) return;
    setBusy(true);
    try {
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
      <Text style={styles.name}>{displayFoodName(entry.food_name, entry.food_table)}</Text>

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

      {food ? (
        <>
          <PortionPicker
            foodName={food.name}
            options={measures}
            selected={selected}
            setSelected={setSelected}
            qty={qty}
            setQty={setQty}
          />
          <NutritionPreview preview={preview} />
        </>
      ) : (
        <Card style={styles.missing}>
          <Text style={styles.missingText}>
            This food is no longer in your foods, so its portion can’t be changed. You can still
            move it to another meal or day, or delete it.
          </Text>
        </Card>
      )}

      {entry.status === 'planned' && date <= TODAY() ? (
        <TintButton
          title="Ate it — confirm plan"
          onPress={() =>
            confirmEntry(entryId)
              .then((ids) => {
                showToast('Marked as eaten', {
                  action: { label: 'Undo', onPress: () => revertToPlanned(ids).catch((e) => showError(e)) },
                });
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
        disabled={(food != null && !preview) || busy}
        style={styles.save}
      />
      <DestructiveButton title="Delete Entry" onPress={onDelete} style={styles.delete} />
    </ScrollView>
  );
}



const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  notFound: { ...type.body, color: colors.muted },
  name: { ...type.title1, color: colors.ink, paddingHorizontal: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: -6 },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dateText: { ...type.body, color: colors.leaf, minWidth: 110, textAlign: 'center' },
  planNote: { ...type.footnote, color: colors.saffron, marginTop: 7, marginLeft: 16 },
  missing: { marginTop: 24, padding: 16 },
  missingText: { ...type.subhead, color: colors.muted, lineHeight: 20 },
  confirm: { marginTop: 24 },
  save: { marginTop: 24 },
  delete: { marginTop: 8 },
});
