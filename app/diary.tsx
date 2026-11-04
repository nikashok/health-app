import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  consumedTotals,
  groupByMeal,
  MEAL_ORDER,
  mealConsumedKcal,
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
import { reconcile } from '@/db/sync';
import type { LogEntry, MealType, UserProfile } from '@/types/db';
import { Card, CardHeader, Chevron, Hairline, Row, TintButton, text } from '@/ui/components';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { int } from '@/ui/format';
import { showError, showToast } from '@/ui/toast';
import { clampPercent, colors, heroNumber, radius, type } from '@/ui/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};
const TODAY = () => dayjs().format('YYYY-MM-DD');

export default function DiaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(params.date ?? TODAY());
  // The day's entries, tagged with the date they belong to. Returning to the screen keeps
  // showing them while they reload (no spinner flash after every edit); only switching to
  // a different day shows the loading state.
  const [loaded, setLoaded] = useState<{ date: string; entries: LogEntry[] } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const entries = loaded && loaded.date === date ? loaded.entries : null;

  const load = useCallback(() => {
    return Promise.all([getEntriesForDate(date), getProfile()]).then(([e, p]) => {
      setLoaded({ date, entries: e });
      setProfile(p);
    });
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getEntriesForDate(date), getProfile()]).then(([e, p]) => {
        if (!active) return;
        setLoaded({ date, entries: e });
        setProfile(p);
      });
      return () => {
        active = false;
      };
    }, [date])
  );

  /** Confirm plans as eaten, then reload; a failure is reported instead of lost. */
  const confirm = (run: () => Promise<unknown>, done: string) =>
    run()
      .then(() => {
        showToast(done);
        return load();
      })
      .catch((e) => showError(e));

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
  const showOverlay = !isFuture && planned.kcal > 0;
  const showConfirmAll = confirmable && plannedCount > 0;

  // Pull to refresh: back up anything pending, then reload the day.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reconcile().catch(() => {});
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const shiftDay = (delta: number) =>
    setDate(dayjs(date).add(delta, 'day').format('YYYY-MM-DD'));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />
      }
    >
      <DatePickerModal
        visible={pickerOpen}
        value={date}
        onSelect={setDate}
        onClose={() => setPickerOpen(false)}
      />
      <View style={styles.dateBar}>
        <Pressable
          onPress={() => shiftDay(-1)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
          hitSlop={8}
          accessibilityLabel="Previous day"
        >
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={styles.dateCenter}
          accessibilityRole="button"
          accessibilityLabel={`${dateLabel(date)}, ${dayjs(date).format('D MMMM YYYY')}. Choose a date`}
        >
          <Text style={styles.dateLabel}>{dateLabel(date)}</Text>
          <Text style={styles.dateSub}>{dayjs(date).format('ddd, D MMM YYYY')}</Text>
        </Pressable>
        <Pressable
          onPress={() => shiftDay(1)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
          hitSlop={8}
          accessibilityLabel="Next day"
        >
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <Card style={styles.totalCard}>
        <CardHeader
          label={isFuture ? 'Planned' : 'Consumed'}
          color={colors.energy}
          detail={target != null ? `Goal ${int(target)}` : undefined}
        />
        <View style={styles.totalRow}>
          <Text style={styles.totalKcal}>{int(shown.kcal)}</Text>
          <Text style={text.unit}>kcal</Text>
        </View>
        {target != null ? (
          <View style={styles.calTrack}>
            <View
              style={[
                styles.calFill,
                { width: clampPercent(calRatio) },
                calRatio > 1 && styles.calOver,
              ]}
            />
          </View>
        ) : null}
        <View style={styles.totalMacros}>
          <MacroText letter="P" color={colors.protein} value={shown.protein_g} />
          <MacroText letter="C" color={colors.carbs} value={shown.carb_g} />
          <MacroText letter="F" color={colors.fat} value={shown.fat_g} />
        </View>
        {target == null ? (
          <Pressable onPress={() => router.push('/onboarding')} hitSlop={6}>
            <Text style={styles.setTargets}>Set targets ›</Text>
          </Pressable>
        ) : null}
        {showOverlay || showConfirmAll ? <Hairline style={styles.totalHairline} /> : null}
        {showOverlay ? (
          <Text style={styles.overlay}>
            {int(planned.kcal)} kcal planned separately
            {date === today ? ` · projected ${int(consumed.kcal + planned.kcal)}` : ''}
          </Text>
        ) : null}
        {showConfirmAll ? (
          <TintButton
            title={`Confirm All Planned (${plannedCount})`}
            onPress={() =>
              confirm(() => confirmDay(date), `${plannedCount} planned ${plannedCount === 1 ? 'item' : 'items'} marked as eaten`)
            }
            style={showOverlay ? styles.confirmDay : undefined}
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
          const plannedEntries = mealEntries.filter((e) => e.status === 'planned');
          const mealPlanned = plannedEntries.length;
          // Intake counts only what was eaten: on today/past days the subtotal is logged food
          // and plans are shown beside it; a future day is all plan.
          const subtotal = isFuture
            ? sumEntries(mealEntries).kcal
            : mealConsumedKcal(mealEntries, meal);
          const plannedKcal = isFuture ? 0 : sumEntries(plannedEntries).kcal;
          return (
            <View key={meal}>
              <View style={styles.mealHeaderRow}>
                <Text style={styles.mealHeaderLabel}>{MEAL_LABELS[meal].toUpperCase()}</Text>
                <View style={styles.mealHeaderRight}>
                  {confirmable && mealPlanned > 0 ? (
                    <Pressable
                      onPress={() => confirm(() => confirmMeal(date, meal), `${MEAL_LABELS[meal]} marked as eaten`)}
                      hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Confirm planned ${MEAL_LABELS[meal].toLowerCase()} as eaten`}
                    >
                      <Text style={styles.confirmMeal}>Confirm</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.mealSubtotal}>
                    {int(subtotal)} kcal
                    {plannedKcal > 0 ? (
                      <Text style={styles.mealPlannedKcal}> · +{int(plannedKcal)} planned</Text>
                    ) : null}
                  </Text>
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
                    onConfirm={() => confirm(() => confirmEntry(entry.id), `${entry.food_name} marked as eaten`)}
                  />
                ))}
                <Row
                  first={mealEntries.length === 0}
                  onPress={() => router.push({ pathname: '/log', params: { meal, date } })}
                >
                  <Text style={styles.addText}>+ Add {MEAL_LABELS[meal].toLowerCase()}</Text>
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

function MacroText({ letter, color, value }: { letter: string; color: string; value: number }) {
  return (
    <Text style={styles.macroText}>
      <Text style={[styles.macroLetter, { color }]}>{letter}</Text> {Math.round(value)} g
    </Text>
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
    <Row
      first={first}
      onPress={onOpen}
      style={planned ? styles.entryPlanned : undefined}
      contentStyle={styles.entryContent}
    >
      <View style={styles.entryMain}>
        <View style={styles.entryNameRow}>
          <Text style={styles.entryName} numberOfLines={2}>{entry.food_name}</Text>
          {planned ? (
            <Text style={styles.plannedPill} numberOfLines={1}>
              Planned
            </Text>
          ) : null}
        </View>
        <Text style={styles.entryPortion}>{portion(entry)}</Text>
      </View>
      <View style={styles.entryRight}>
        <Text style={styles.entryKcal}>
          {int(entry.kcal)}
          <Text style={styles.entryKcalUnit}> kcal</Text>
        </Text>
        {confirmable && planned ? (
          <Pressable
            style={styles.ateIt}
            onPress={onConfirm}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Ate it: ${entry.food_name}`}
          >
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
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 60 },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnPressed: { backgroundColor: colors.fill },
  navText: { fontSize: 26, lineHeight: 30, color: colors.leaf, marginTop: -3 },
  dateCenter: { alignItems: 'center', minWidth: 150, gap: 1 },
  dateLabel: { ...type.title3, color: colors.ink },
  dateSub: { ...type.footnote, color: colors.muted },
  totalCard: { marginTop: 16, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 6 },
  totalKcal: { ...heroNumber(40), lineHeight: 46 },
  calTrack: { height: 8, borderRadius: 4, backgroundColor: colors.energyTrack, overflow: 'hidden', marginTop: 10 },
  calFill: { height: '100%', backgroundColor: colors.energy, borderRadius: 4 },
  calOver: { backgroundColor: colors.over },
  totalMacros: { flexDirection: 'row', gap: 14, marginTop: 12 },
  macroText: { ...type.subhead, color: colors.ink },
  macroLetter: { fontWeight: '600' },
  totalHairline: { marginTop: 14, marginBottom: 12 },
  overlay: { ...type.footnote, color: colors.muted, lineHeight: 18 },
  setTargets: { ...type.subhead, marginTop: 12, color: colors.leaf },
  confirmDay: { marginTop: 12 },
  loadingPanel: { padding: 24, alignItems: 'center' },
  loadingText: { ...type.subhead, color: colors.muted, marginTop: 8 },
  mealHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 7,
    marginHorizontal: 16,
  },
  mealHeaderLabel: { ...type.footnote, color: colors.muted, letterSpacing: 0.2 },
  mealHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mealSubtotal: { ...type.footnote, color: colors.muted },
  mealPlannedKcal: { color: colors.plannedPillText },
  confirmMeal: { ...type.footnote, color: colors.leaf, fontWeight: '600' },
  addText: { ...type.body, color: colors.leaf },
  entryPlanned: { backgroundColor: colors.plannedRow },
  entryContent: { gap: 10 },
  entryMain: { flex: 1, minWidth: 0, gap: 2 },
  entryNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryName: { flexShrink: 1, ...type.body, color: colors.ink },
  plannedPill: {
    flexShrink: 0,
    ...type.caption,
    color: colors.plannedPillText,
    backgroundColor: colors.plannedPillBg,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontWeight: '600',
  },
  entryPortion: { ...type.footnote, color: colors.muted },
  entryRight: { alignItems: 'flex-end', gap: 6 },
  entryKcal: { ...type.body, color: colors.ink, fontVariant: ['tabular-nums'] },
  entryKcalUnit: { ...type.footnote, color: colors.muted },
  ateIt: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.leaf,
    justifyContent: 'center',
  },
  ateItText: { ...type.footnote, color: '#ffffff', fontWeight: '600' },
});
