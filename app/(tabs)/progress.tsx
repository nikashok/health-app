import dayjs from 'dayjs';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addDays, buildRangeInsights } from '@/calc/insights';
import { getDailyKcal } from '@/db/insights';
import { getProfile } from '@/db/profile';
import type { UserProfile } from '@/types/db';
import { Card } from '@/ui/components';
import { MonthCard, WeekCard } from '@/ui/home/IntakeBars';
import { styles } from '@/ui/home/styles';
import { ScreenTitle } from '@/ui/ScreenTitle';
import { colors } from '@/ui/theme';

/** Fewer logged days than this in the last 30 and trends aren't meaningful yet. */
const MIN_DAYS_FOR_TRENDS = 3;

interface ProgressState {
  profile: UserProfile | null;
  monthMap: Record<string, number>;
}

/**
 * Progress tab: calorie trends over the past 7 and 30 days (logged intake only — the SQL
 * filters status='logged'). Everything here is derived for display; nothing is stored.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const [state, setState] = useState<ProgressState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const todayISO = dayjs().format('YYYY-MM-DD');
      Promise.all([getProfile(), getDailyKcal(addDays(todayISO, -29), todayISO)]).then(
        ([profile, monthMap]) => {
          if (active) setState({ profile, monthMap });
        }
      );
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
  const week = buildRangeInsights(state.monthMap, todayISO, 7, target);
  const month = buildRangeInsights(state.monthMap, todayISO, 30, target);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <ScreenTitle title="Progress" />
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
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
