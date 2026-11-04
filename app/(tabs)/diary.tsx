import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  revertToPlanned,
} from '@/db/logEntries';
import { getProfile } from '@/db/profile';
import { formatQty } from '@/db/quickLog';
import { reconcile } from '@/db/sync';
import type { LogEntry, MealType, UserProfile } from '@/types/db';
import { BottomAction, Card, Chevron, Row, TintButton } from '@/ui/components';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { DaySummaryCard } from '@/ui/DaySummaryCard';
import { displayFoodName } from '@/ui/foodName';
import { int } from '@/ui/format';
import { Icon } from '@/ui/icons';
import { inferMeal, MEAL_LABELS } from '@/ui/meals';
import { ScreenTitle } from '@/ui/ScreenTitle';
import { showError, showToast } from '@/ui/toast';
import { colors, radius, type } from '@/ui/theme';

const TODAY = () => dayjs().format('YYYY-MM-DD');

export default function DiaryScreen() {
  const router = useRouter();
  // `date` opens a given day (chart bars, Today's meals); `at` makes a repeat of the same
  // link count as a new request even after the day was changed by hand.
  const params = useLocalSearchParams<{ date?: string; at?: string }>();
  const [date, setDate] = useState(params.date ?? TODAY());
  useEffect(() => {
    if (params.date) setDate(params.date);
  }, [params.date, params.at]);
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

  /** Confirm plans as eaten, then reload; Undo puts them back; failures are reported. */
  const confirm = (run: () => Promise<number[]>, done: string) =>
    run()
      .then((ids) => {
        showToast(done, {
          action: {
            label: 'Undo',
            onPress: () =>
              revertToPlanned(ids)
                .then(load)
                .catch((e) => showError(e)),
          },
        });
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
  const plannedCount = list.filter((e) => e.status === 'planned').length;
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
        <ScreenTitle title="Diary" />
        <View style={styles.dateBar}>
          <Pressable
            onPress={() => shiftDay(-1)}
            style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
          >
            <Icon name="chevron-left" size={20} color={colors.leaf} strokeWidth={2.4} />
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
            accessibilityRole="button"
            accessibilityLabel="Next day"
          >
            <Icon name="chevron-right" size={20} color={colors.leaf} strokeWidth={2.4} />
          </Pressable>
        </View>

        <DaySummaryCard
          style={styles.totalCard}
          totals={isFuture ? planned : consumed}
          profile={profile}
          mode={isFuture ? 'planned' : 'eaten'}
          pendingPlan={
            !isFuture && planned.kcal > 0
              ? { kcal: planned.kcal, projected: date === today ? consumed.kcal + planned.kcal : null }
              : null
          }
          onGoalPress={() => router.push('/onboarding')}
          footer={
            showConfirmAll ? (
              <TintButton
                title={`Confirm All Planned (${plannedCount})`}
                onPress={() =>
                  confirm(
                    () => confirmDay(date),
                    `${plannedCount} planned ${plannedCount === 1 ? 'item' : 'items'} marked as eaten`
                  )
                }
                style={styles.confirmDay}
              />
            ) : null
          }
        />

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
                      onConfirm={() =>
                      confirm(
                        () => confirmEntry(entry.id),
                        `${displayFoodName(entry.food_name, entry.food_table)} marked as eaten`
                      )
                    }
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
      <BottomAction
        title={isFuture ? 'Plan Food' : 'Log Food'}
        onPress={() => router.push({ pathname: '/log', params: { meal: inferMeal(), date } })}
      />
    </SafeAreaView>
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
  const name = displayFoodName(entry.food_name, entry.food_table);
  // The row is a plain container: "open" and "Ate it" are sibling buttons, never one
  // inside the other (nested buttons confuse screen readers and taps).
  return (
    <Row first={first} style={planned ? styles.entryPlanned : undefined} contentStyle={styles.entryContent}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.entryOpen, pressed && styles.entryOpenPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${portion(entry)}, ${int(entry.kcal)} kcal${planned ? ', planned' : ''}. Edit`}
      >
        <View style={styles.entryMain}>
          <View style={styles.entryNameRow}>
            <Text style={styles.entryName} numberOfLines={2}>
              {name}
            </Text>
            {planned ? (
              <Text style={styles.plannedPill} numberOfLines={1}>
                Planned
              </Text>
            ) : null}
          </View>
          <Text style={styles.entryPortion}>{portion(entry)}</Text>
        </View>
        <Text style={styles.entryKcal}>
          {int(entry.kcal)}
          <Text style={styles.entryKcalUnit}> kcal</Text>
        </Text>
      </Pressable>
      {confirmable && planned ? (
        <Pressable
          style={styles.ateIt}
          onPress={onConfirm}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Ate it: ${name}`}
        >
          <Text style={styles.ateItText}>Ate it</Text>
        </Pressable>
      ) : null}
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
    : `${formatQty(e.quantity)} × ${e.measure_name} · ${Math.round(e.grams_total)} g`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 140 },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnPressed: { backgroundColor: colors.fill },
  dateCenter: { alignItems: 'center', minWidth: 150, gap: 1 },
  dateLabel: { ...type.title3, color: colors.ink },
  dateSub: { ...type.footnote, color: colors.muted },
  totalCard: { marginTop: 16 },
  confirmDay: { marginTop: 16 },
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
  entryContent: { gap: 10, paddingVertical: 0 },
  entryOpen: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  entryOpenPressed: { opacity: 0.6 },
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
