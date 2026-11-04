import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addDays, buildRangeInsights, completedValueAverage, dateRange } from '@/calc/insights';
import { getDailyTotals, type DayTotals } from '@/db/insights';
import { getAllMeasurements } from '@/db/measurements';
import { getProfile } from '@/db/profile';
import type { BodyMeasurement, UserProfile } from '@/types/db';
import { Card } from '@/ui/components';
import { readings } from '@/ui/home/BodyTrends';
import { MonthCard, WeekCard } from '@/ui/home/IntakeBars';
import { styles } from '@/ui/home/styles';
import { BodyChartCard } from '@/ui/progress/BodyChartCard';
import { ProteinCard } from '@/ui/progress/ProteinCard';
import { ScreenTitle } from '@/ui/ScreenTitle';
import { colors } from '@/ui/theme';

/** Fewer logged days than this in the last 30 and calorie trends aren't meaningful yet. */
const MIN_DAYS_FOR_TRENDS = 3;

interface ProgressState {
  profile: UserProfile | null;
  totals: Record<string, DayTotals>;
  measurements: BodyMeasurement[];
}

/**
 * Progress tab: weight trend, calorie and protein averages, waist. Intake reads logged
 * snapshots only (the SQL filters status='logged'); every figure here is derived for
 * display and never stored (CLAUDE.md rules 5–6).
 */
export default function ProgressScreen() {
  const router = useRouter();
  const [state, setState] = useState<ProgressState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const todayISO = dayjs().format('YYYY-MM-DD');
      Promise.all([
        getProfile(),
        getDailyTotals(addDays(todayISO, -29), todayISO),
        getAllMeasurements(),
      ]).then(([profile, totals, measurements]) => {
        if (active) setState({ profile, totals, measurements });
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const openDay = (date: string) =>
    router.push({ pathname: '/diary', params: { date, at: String(Date.now()) } });

  if (!state) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={colors.leaf} />
      </View>
    );
  }

  const todayISO = dayjs().format('YYYY-MM-DD');
  const target = state.profile?.target_kcal ?? null;
  const monthMap: Record<string, number> = {};
  for (const [d, t] of Object.entries(state.totals)) monthMap[d] = t.kcal;
  const week = buildRangeInsights(monthMap, todayISO, 7, target);
  const month = buildRangeInsights(monthMap, todayISO, 30, target);
  // Protein over finished days only (today excluded), same counting rule as calories.
  const pastDays = (n: number) =>
    dateRange(addDays(todayISO, -1), n - 1).map((d) => ({
      kcal: state.totals[d]?.kcal ?? 0,
      value: state.totals[d]?.protein ?? 0,
    }));

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <ScreenTitle title="Progress" />

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Weight</Text>
          </View>
          <BodyChartCard
            title="Weight"
            unit="kg"
            readings={readings(state.measurements, 'weight_kg')}
            smooth
            minSpan={2}
            todayISO={todayISO}
          />

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Calories</Text>
          </View>
          {month.loggedDays < MIN_DAYS_FOR_TRENDS ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Trends appear after a few days</Text>
              <Text style={styles.emptyBody}>
                Log your meals for {MIN_DAYS_FOR_TRENDS} days and your 7- and 30-day averages will
                show up here.
              </Text>
            </Card>
          ) : (
            <>
              <WeekCard week={week} target={target} onOpenDay={openDay} />
              <MonthCard month={month} target={target} onOpenDay={openDay} />
              <View style={styles.sectionGap} />
              <ProteinCard
                week={completedValueAverage(pastDays(7))}
                month={completedValueAverage(pastDays(30))}
                target={state.profile?.target_protein_g ?? null}
              />
            </>
          )}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Waist</Text>
          </View>
          <BodyChartCard
            title="Waist"
            unit="cm"
            readings={readings(state.measurements, 'waist_cm')}
            smooth={false}
            minSpan={3}
            todayISO={todayISO}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
