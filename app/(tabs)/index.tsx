import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { consumedTotals } from '@/calc/dayTotals';
import { addDays, buildRangeInsights, streakFrom } from '@/calc/insights';
import { getDailyKcal, getLoggedDates } from '@/db/insights';
import { getEntriesForDate } from '@/db/logEntries';
import { getAllMeasurements } from '@/db/measurements';
import { getProfile } from '@/db/profile';
import { supabase } from '@/db/supabase';
import { reconcile, useSyncStatus } from '@/db/sync';
import { confirmDestructive } from '@/lib/confirm';
import { BottomAction } from '@/ui/components';
import { BodyTrends } from '@/ui/home/BodyTrends';
import { CaloriesCard } from '@/ui/home/CaloriesCard';
import { HomeHeader } from '@/ui/home/HomeHeader';
import { inferMeal, type HomeState } from '@/ui/home/homeUtils';
import { MonthCard, WeekCard } from '@/ui/home/IntakeBars';
import { QuickActions } from '@/ui/home/QuickActions';
import { styles } from '@/ui/home/styles';
import { TodayMeals } from '@/ui/home/TodayMeals';
import { colors } from '@/ui/theme';

/** Load everything Home shows. Returns null when there is no profile yet (first run). */
async function loadHome(): Promise<HomeState | null> {
  const profile = await getProfile();
  if (profile === null) return null;
  const todayISO = dayjs().format('YYYY-MM-DD');
  const target = profile.target_kcal ?? null;
  const [todayEntries, monthMap, allMeasurements, loggedDates] = await Promise.all([
    getEntriesForDate(todayISO),
    getDailyKcal(addDays(todayISO, -29), todayISO),
    getAllMeasurements(),
    getLoggedDates(todayISO),
  ]);
  return {
    profile,
    today: todayEntries,
    week: buildRangeInsights(monthMap, todayISO, 7, target),
    monthMap,
    allMeasurements,
    streak: streakFrom(loggedDates, todayISO),
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<HomeState | null>(null);
  const [initial, setInitial] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { pending, syncing } = useSyncStatus();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setInitial((data.session?.user?.email ?? '').charAt(0).toUpperCase());
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadHome().then((s) => {
        if (!active) return;
        if (s === null) router.replace('/onboarding');
        else setState(s);
      });
      return () => {
        active = false;
      };
    }, [router])
  );

  // Pull to refresh: back up anything pending, then reload the day.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reconcile().catch(() => {});
      const s = await loadHome();
      if (s) setState(s);
    } finally {
      setRefreshing(false);
    }
  }, []);

  if (!state) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loading}>Loading your day</Text>
      </View>
    );
  }

  const { profile, today, week, monthMap, allMeasurements, streak } = state;
  const target = profile.target_kcal ?? null;
  const todayISO = dayjs().format('YYYY-MM-DD');
  const consumed = consumedTotals(today);
  const month = buildRangeInsights(monthMap, todayISO, 30, target);
  const syncLabel = syncing ? 'Backing up…' : pending > 0 ? `${pending} to back up` : 'Backed up';

  const logFood = () =>
    router.push({ pathname: '/log', params: { meal: inferMeal(), date: todayISO, origin: 'home' } });
  const logWeight = () => router.push('/measurement');
  const editTargets = () => router.push('/onboarding');
  const openDay = (date: string) => router.push({ pathname: '/diary', params: { date } });
  const signOut = () =>
    confirmDestructive(
      'Sign out?',
      'You will need your email and password to sign back in.',
      'Sign Out',
      () => supabase.auth.signOut()
    );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 130 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />
          }
        >
          <HomeHeader
            initial={initial || '•'}
            streak={streak}
            syncLabel={syncLabel}
            onSyncPress={onRefresh}
            hasTarget={target != null}
            topInset={insets.top}
            onEditTargets={editTargets}
            onSignOut={signOut}
          />
          <CaloriesCard consumed={consumed} profile={profile} onGoalPress={editTargets} />
          <BodyTrends allMeasurements={allMeasurements} todayISO={todayISO} onPress={logWeight} />
          <QuickActions onLogWeight={logWeight} />

          {/* TODO: add "Show All" here once an insights screen exists (app/insights.tsx). */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Trends</Text>
          </View>
          <WeekCard week={week} target={target} onDayPress={openDay} />
          <MonthCard month={month} target={target} onDayPress={openDay} />

          <TodayMeals today={today} todayISO={todayISO} router={router} />
        </ScrollView>
      </SafeAreaView>

      <BottomAction title="Log Food" onPress={logFood} insetBottom={insets.bottom} />
    </View>
  );
}
