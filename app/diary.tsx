import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  consumedTotals,
  groupByMeal,
  MEAL_ORDER,
  plannedTotals,
  sumEntries,
} from '@/calc/dayTotals';
import {
  confirmDay,
  confirmEntry,
  confirmMeal,
  getEntriesForDate,
} from '@/db/logEntries';
import { getProfile } from '@/db/profile';
import type { LogEntry, MealType, UserProfile } from '@/types/db';
import { Card, Chevron, PrimaryButton, Row, TintButton } from '@/ui/components';
import { grams } from '@/ui/format';
import { clampPercent, colors, radius, type } from '@/ui/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Evening Snack',
  dinner: 'Dinner',
};
const TODAY = () => dayjs().format('YYYY-MM-DD');

export default function DiaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(params.date ?? TODAY());
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const load = useCallback(() => {
    return Promise.all([getEntriesForDate(date), getProfile()]).then(([e, p]) => {
      setEntries(e);
      setProfile(p);
    });
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setEntries(null);
      Promise.all([getEntriesForDate(date), getProfile()]).then(([e, p]) => {
        if (!active) return;
        setEntries(e);
        setProfile(p);
      });
      return () => {
        active = false;
      };
    }, [date])
  );

  const today = TODAY();
  const isFuture = date > today;
  const confirmable = date <= today;
  const list = entries ?? [];
  const grouped = groupByMeal(list);
  const consumed = consumedTotals(list);
  const planned = plannedTotals(list);
  const shown = isFuture ? planned : consumed;
  const target = profile?.target_kcal ?? null;
  const plannedCount = list.filter((e) => e.status === 'planned').length;
  const calRatio = target ? shown.kcal / target : 0;

  const shiftDay = (delta: number) =>
    setDate(dayjs(date).add(delta, 'day').format('YYYY-MM-DD'));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.dateBar}>
        <Pressable onPress={() => shiftDay(-1)} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Pressable onPress={() => setDate(today)} style={styles.dateCenter}>
          <Text style={styles.dateLabel}>{dateLabel(date)}</Text>
          <Text style={styles.dateSub}>{dayjs(date).format('ddd, D MMM YYYY')}</Text>
        </Pressable>
        <Pressable onPress={() => shiftDay(1)} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <Card style={[styles.totalCard, isFuture && styles.totalCardPlan]}>
        <Text style={styles.totalLabel}>{isFuture ? 'Planned total' : 'Consumed total'}</Text>
        <Text style={styles.totalKcal}>
          {Math.round(shown.kcal)}
          {target != null ? <Text style={styles.totalTarget}> of {Math.round(target)}</Text> : null}
          <Text style={styles.totalUnit}> Cal</Text>
        </Text>
        {target != null ? (
          <View style={styles.calTrack}>
            <View
              style={[
                styles.calFill,
                { width: clampPercent(calRatio) },
                isFuture && styles.calFillPlan,
                calRatio > 1 && styles.calOver,
              ]}
            />
          </View>
        ) : null}
        <Text style={styles.totalMacros}>
          P {grams(shown.protein_g)} · C {grams(shown.carb_g)} · F {grams(shown.fat_g)}
        </Text>
        {!isFuture && planned.kcal > 0 ? (
          <Text style={styles.overlay}>
            {Math.round(planned.kcal)} Cal planned separately
            {date === today ? ` · projected ${Math.round(consumed.kcal + planned.kcal)}` : ''}
          </Text>
        ) : null}
        {target == null ? (
          <Pressable onPress={() => router.push('/onboarding')}>
            <Text style={styles.setTargets}>Set targets ›</Text>
          </Pressable>
        ) : null}
        {confirmable && plannedCount > 0 ? (
          <PrimaryButton
            title={`Confirm all planned (${plannedCount})`}
            onPress={() => confirmDay(date).then(load)}
            style={styles.confirmDay}
          />
        ) : null}
      </Card>

      {entries === null ? (
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={colors.leaf} />
          <Text style={styles.loadingText}>Loading diary</Text>
        </View>
      ) : (
        MEAL_ORDER.map((meal) => {
          const mealEntries = grouped[meal];
          const subtotal = sumEntries(mealEntries).kcal;
          const mealPlanned = mealEntries.filter((e) => e.status === 'planned').length;
          return (
            <View key={meal} style={styles.meal}>
              <View style={styles.mealHeaderRow}>
                <Text style={styles.mealHeaderLabel}>{MEAL_LABELS[meal].toUpperCase()}</Text>
                <View style={styles.mealHeaderRight}>
                  {confirmable && mealPlanned > 0 ? (
                    <TintButton
                      title="Confirm"
                      onPress={() => confirmMeal(date, meal).then(load)}
                      style={styles.confirmMeal}
                    />
                  ) : null}
                  <Text style={styles.mealSubtotal}>{Math.round(subtotal)} Cal</Text>
                </View>
              </View>

              <Card>
                {mealEntries.map((entry, i) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    first={i === 0}
                    confirmable={confirmable}
                    onOpen={() => router.push({ pathname: '/edit-entry', params: { id: String(entry.id) } })}
                    onConfirm={() => confirmEntry(entry.id).then(load)}
                  />
                ))}
                <Row
                  first={mealEntries.length === 0}
                  onPress={() => router.push({ pathname: '/log', params: { meal, date } })}
                >
                  <Text style={styles.addText}>＋ Add {MEAL_LABELS[meal].toLowerCase()}</Text>
                  <Chevron />
                </Row>
              </Card>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function EntryRow({
  entry,
  first,
  confirmable,
  onOpen,
  onConfirm,
}: {
  entry: LogEntry;
  first: boolean;
  confirmable: boolean;
  onOpen: () => void;
  onConfirm: () => void;
}) {
  const planned = entry.status === 'planned';
  return (
    <Row first={first} onPress={onOpen} style={planned ? styles.entryPlanned : undefined}>
      <View style={styles.entryMain}>
        <View style={styles.entryNameRow}>
          <Text style={styles.entryName} numberOfLines={2}>{entry.food_name}</Text>
          {planned ? <Text style={styles.plannedPill}>Planned</Text> : null}
        </View>
        <Text style={styles.entryPortion}>{portion(entry)}</Text>
      </View>
      <View style={styles.entryRight}>
        <Text style={styles.entryKcal}>{Math.round(entry.kcal)} Cal</Text>
        {confirmable && planned ? (
          <Pressable style={styles.ateIt} onPress={onConfirm} hitSlop={6}>
            <Text style={styles.ateItText}>Ate it</Text>
          </Pressable>
        ) : null}
      </View>
    </Row>
  );
}

function dateLabel(date: string): string {
  const t = dayjs();
  if (date === t.format('YYYY-MM-DD')) return 'Today';
  if (date === t.add(1, 'day').format('YYYY-MM-DD')) return 'Tomorrow';
  if (date === t.subtract(1, 'day').format('YYYY-MM-DD')) return 'Yesterday';
  return dayjs(date).format('D MMM');
}

function portion(e: LogEntry): string {
  return e.measure_name === 'grams'
    ? `${Math.round(e.grams_total)} g`
    : `${e.quantity} × ${e.measure_name} · ${Math.round(e.grams_total)} g`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 42 },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { paddingHorizontal: 16, paddingVertical: 6 },
  navText: { fontSize: 30, color: colors.leafDark, fontWeight: '500' },
  dateCenter: { alignItems: 'center', minWidth: 150 },
  dateLabel: { ...type.title2, color: colors.ink },
  dateSub: { ...type.footnote, color: colors.muted, marginTop: 2 },
  totalCard: { marginTop: 16, padding: 18 },
  totalCardPlan: { backgroundColor: colors.saffronBg },
  totalLabel: { ...type.footnote, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  totalKcal: { marginTop: 4, fontSize: 34, fontWeight: '700', color: colors.ink },
  totalTarget: { color: colors.faint, fontSize: 22, fontWeight: '600' },
  totalUnit: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  calTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.fillStrong, overflow: 'hidden', marginTop: 12 },
  calFill: { height: '100%', backgroundColor: colors.leaf, borderRadius: radius.pill },
  calFillPlan: { backgroundColor: colors.saffron },
  calOver: { backgroundColor: colors.saffron },
  totalMacros: { ...type.subhead, marginTop: 10, color: colors.muted },
  overlay: { ...type.footnote, marginTop: 8, color: colors.saffron, lineHeight: 19 },
  setTargets: { ...type.subhead, marginTop: 10, color: colors.leafDark, fontWeight: '600' },
  confirmDay: { marginTop: 14 },
  loadingPanel: { padding: 24, alignItems: 'center' },
  loadingText: { ...type.subhead, color: colors.muted, marginTop: 8 },
  meal: { marginTop: 22 },
  mealHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
    marginLeft: 16,
    marginRight: 4,
  },
  mealHeaderLabel: { ...type.footnote, color: colors.muted, letterSpacing: 0.3 },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealSubtotal: { ...type.footnote, color: colors.muted },
  confirmMeal: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill },
  addText: { ...type.body, color: colors.leafDark, fontWeight: '500' },
  entryPlanned: { backgroundColor: colors.saffronBg },
  entryMain: { flex: 1, paddingRight: 10 },
  entryNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryName: { flexShrink: 1, ...type.body, color: colors.ink, lineHeight: 21 },
  plannedPill: {
    ...type.caption,
    color: colors.saffron,
    backgroundColor: '#ffe7b3',
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontWeight: '600',
  },
  entryPortion: { ...type.footnote, color: colors.muted, marginTop: 3 },
  entryRight: { alignItems: 'flex-end' },
  entryKcal: { ...type.subhead, color: colors.ink, fontWeight: '600' },
  ateIt: {
    marginTop: 6,
    backgroundColor: colors.leaf,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  ateItText: { ...type.caption, color: '#ffffff', fontWeight: '600' },
});
