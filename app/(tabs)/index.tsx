import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { consumedTotals } from '@/calc/dayTotals';
import { addDays, buildRangeInsights } from '@/calc/insights';
import { getDailyKcal } from '@/db/insights';
import { getEntriesForDate } from '@/db/logEntries';
import { getAllMeasurements, getMeasurement, getRecentMeasurements } from '@/db/measurements';
import { getProfile } from '@/db/profile';
import { supabase } from '@/db/supabase';
import { useSyncStatus } from '@/db/sync';
import { dark as D } from '@/ui/theme';
import { BodyTrends } from '@/ui/home/BodyTrends';
import { CalorieRing } from '@/ui/home/CalorieRing';
import { HomeFab } from '@/ui/home/HomeFab';
import { HomeHeader } from '@/ui/home/HomeHeader';
import { computeStreak, type HomeState } from '@/ui/home/homeUtils';
import { MonthCard, WeekCard } from '@/ui/home/IntakeBars';
import { MacrosCard } from '@/ui/home/MacrosCard';
import { QuickAddChips } from '@/ui/home/QuickAddChips';
import { QuickAddSheet } from '@/ui/home/QuickAddSheet';
import { styles } from '@/ui/home/styles';
import { TodayMeals } from '@/ui/home/TodayMeals';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<HomeState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { pending, lastSyncedAt } = useSyncStatus();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const profile = await getProfile();
        if (profile === null) {
          router.replace('/onboarding');
          return;
        }
        const todayISO = dayjs().format('YYYY-MM-DD');
        const target = profile.target_kcal ?? null;
        const [todayEntries, monthMap, measurement, recentMeasurements, allMeasurements] = await Promise.all([
          getEntriesForDate(todayISO),
          getDailyKcal(addDays(todayISO, -29), todayISO),
          getMeasurement(todayISO),
          getRecentMeasurements(7),
          getAllMeasurements(),
        ]);
        if (!active) return;
        setState({
          profile,
          today: todayEntries,
          week: buildRangeInsights(monthMap, todayISO, 7, target),
          monthMap,
          measurement,
          recentMeasurements,
          allMeasurements,
        });
      })();
      return () => {
        active = false;
      };
    }, [router])
  );

  if (!state) {
    return (
      <View style={[styles.center, { backgroundColor: D.bg }]}>
        <ActivityIndicator size="large" color={D.accent} />
        <Text style={styles.loading}>Loading your day</Text>
      </View>
    );
  }

  const { profile, today, week, monthMap, measurement, allMeasurements } = state;
  const target = profile.target_kcal ?? null;
  const todayISO = dayjs().format('YYYY-MM-DD');
  const consumed = consumedTotals(today);
  const streak = computeStreak(monthMap, todayISO);
  const month = buildRangeInsights(monthMap, todayISO, 30, target);

  return (
    <View style={styles.root}>
      {/* radial glow from top */}
      <LinearGradient
        colors={[D.glow, 'transparent']}
        style={styles.topGlow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 100 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <HomeHeader streak={streak} pending={pending} lastSyncedAt={lastSyncedAt} />
          <CalorieRing consumed={consumed} target={target} />
          <MacrosCard consumed={consumed} profile={profile} />
          <QuickAddChips today={today} todayISO={todayISO} router={router} />
          <BodyTrends measurement={measurement} allMeasurements={allMeasurements} />
          <WeekCard week={week} target={target} />
          <MonthCard month={month} target={target} />
          <TodayMeals today={today} todayISO={todayISO} router={router} />

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <Pressable onPress={() => router.push('/onboarding')}>
              <Text style={styles.footerLink}>{target ? 'Edit targets' : 'Set targets'}</Text>
            </Pressable>
            <Pressable onPress={() => supabase.auth.signOut()}>
              <Text style={styles.footerMuted}>Sign out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

      <HomeFab bottom={28 + insets.bottom} onPress={() => setSheetOpen(true)} />

      <QuickAddSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        measurement={measurement}
        todayISO={todayISO}
        router={router}
        insetsBottom={insets.bottom}
      />
    </View>
  );
}
