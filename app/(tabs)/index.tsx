import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { consumedTotals, MEAL_ORDER, plannedTotals } from '@/calc/dayTotals';
import { usualMeal } from '@/calc/foodPatterns';
import { addDays, streakFrom } from '@/calc/insights';
import { trendSeries } from '@/calc/trend';
import { getLoggedDates, getPatternEntries } from '@/db/insights';
import { confirmMeal, getEntriesForDate, revertToPlanned } from '@/db/logEntries';
import { getAllMeasurements } from '@/db/measurements';
import { getProfile } from '@/db/profile';
import { reconcile } from '@/db/sync';
import type { MealType } from '@/types/db';
import { BottomAction } from '@/ui/components';
import { DaySummaryCard } from '@/ui/DaySummaryCard';
import { displayFoodName } from '@/ui/foodName';
import { BodyTrends, readings } from '@/ui/home/BodyTrends';
import type { HomeState } from '@/ui/home/homeUtils';
import { TARGET_DRIFT_KG, TargetsNudge } from '@/ui/home/TargetsNudge';
import { styles } from '@/ui/home/styles';
import { TodayMeals } from '@/ui/home/TodayMeals';
import { inferMeal, MEAL_LABELS } from '@/ui/meals';
import { getPref, setPref } from '@/ui/prefs';
import { ScreenTitle } from '@/ui/ScreenTitle';
import { SyncStatus } from '@/ui/SyncStatus';
import { colors } from '@/ui/theme';
import { showError, showToast } from '@/ui/toast';

/** Load everything Today shows. Returns null when there is no profile yet (first run). */
async function loadToday(): Promise<HomeState | null> {
  const profile = await getProfile();
  if (profile === null) return null;
  const todayISO = dayjs().format('YYYY-MM-DD');
  const [todayEntries, allMeasurements, loggedDates, history] = await Promise.all([
    getEntriesForDate(todayISO),
    getAllMeasurements(),
    getLoggedDates(todayISO),
    getPatternEntries(addDays(todayISO, -60), todayISO),
  ]);
  const weightTrend = trendSeries(readings(allMeasurements, 'weight_kg'));
  const trend = weightTrend.length > 0 ? weightTrend[weightTrend.length - 1].trend : null;
  const dismissed = parseFloat((await getPref('targetsNudgeDismissedAt')) ?? '');
  const drift =
    trend != null && profile.weight_kg != null ? Math.abs(trend - profile.weight_kg) : 0;
  const nudgeTrend =
    trend != null &&
    drift >= TARGET_DRIFT_KG &&
    !(Number.isFinite(dismissed) && Math.abs(trend - dismissed) < TARGET_DRIFT_KG)
      ? trend
      : null;
  const usual: HomeState['usual'] = {};
  for (const meal of MEAL_ORDER) {
    const u = usualMeal(history, meal, todayISO);
    if (u) usual[meal] = u.items.map((i) => displayFoodName(i.food_name, i.food_table)).join(' · ');
  }
  return {
    profile,
    today: todayEntries,
    allMeasurements,
    streak: streakFrom(loggedDates, todayISO),
    usual,
    nudgeTrend,
  };
}

export default function TodayScreen() {
  const router = useRouter();
  const [state, setState] = useState<HomeState | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    const s = await loadToday();
    if (s === null) router.replace('/onboarding');
    else setState(s);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadToday().then((s) => {
        if (!active) return;
        if (s === null) router.replace('/onboarding');
        else setState(s);
      });
      return () => {
        active = false;
      };
    }, [router])
  );

  // Pull to refresh (native): back up anything pending, then reload the day.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reconcile().catch(() => {});
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  if (!state) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loading}>Loading your day</Text>
      </View>
    );
  }

  const { profile, today, allMeasurements, streak, usual, nudgeTrend } = state;
  const todayISO = dayjs().format('YYYY-MM-DD');
  const consumed = consumedTotals(today);
  const planned = plannedTotals(today);

  const logFood = () =>
    router.push({ pathname: '/log', params: { meal: inferMeal(), date: todayISO, origin: 'home' } });
  const confirmPlanned = (meal: MealType) =>
    confirmMeal(todayISO, meal)
      .then((ids) => {
        showToast(`${MEAL_LABELS[meal]} marked as eaten`, {
          action: {
            label: 'Undo',
            onPress: () =>
              revertToPlanned(ids)
                .then(reload)
                .catch((e) => showError(e)),
          },
        });
        return reload();
      })
      .catch((e) => showError(e));

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 140 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />
          }
        >
          <ScreenTitle
            eyebrow={dayjs().format('dddd, D MMMM')}
            title="Today"
            meta={
              <>
                <Text style={styles.metaText}>
                  {streak > 0 ? `${streak}-day streak` : 'Log today to start a streak'}
                </Text>
                <Text style={styles.metaSep}>·</Text>
                <SyncStatus inline />
              </>
            }
          />
          <DaySummaryCard
            style={styles.caloriesCard}
            totals={consumed}
            profile={profile}
            pendingPlan={
              planned.kcal > 0 ? { kcal: planned.kcal, projected: consumed.kcal + planned.kcal } : null
            }
            onGoalPress={() => router.push('/onboarding')}
          />
          {nudgeTrend != null && profile.weight_kg != null ? (
            <TargetsNudge
              profileWeight={profile.weight_kg}
              trend={nudgeTrend}
              onUpdate={() =>
                router.push({ pathname: '/onboarding', params: { weight: nudgeTrend.toFixed(1) } })
              }
              onDismiss={() => {
                setPref('targetsNudgeDismissedAt', String(nudgeTrend));
                setState({ ...state, nudgeTrend: null });
              }}
            />
          ) : null}
          <TodayMeals
            today={today}
            todayISO={todayISO}
            usual={usual}
            router={router}
            onConfirmMeal={confirmPlanned}
          />
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Body</Text>
          </View>
          <BodyTrends
            allMeasurements={allMeasurements}
            todayISO={todayISO}
            onPress={() => router.push('/measurement')}
          />
        </ScrollView>
      </SafeAreaView>

      <BottomAction title="Log Food" onPress={logFood} />
    </View>
  );
}
