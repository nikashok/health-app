import dayjs from 'dayjs';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { consumedTotals, mealConsumedKcal, plannedTotals } from '@/calc/dayTotals';
import { addDays, buildRangeInsights, ratio, type RangeInsights } from '@/calc/insights';
import { getDailyKcal, hasAnyLogged } from '@/db/insights';
import { getEntriesForDate } from '@/db/logEntries';
import { getProfile } from '@/db/profile';
import type { LogEntry, MealType, UserProfile } from '@/types/db';
import { Card, Chevron, GroupHeader, Row } from '@/ui/components';
import { grams, numberText } from '@/ui/format';
import { clampPercent, colors, radius, shadow, type } from '@/ui/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};
const MEALS: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export default function HomeScreen() {
  const router = useRouter();
  const [state, setState] = useState<{
    profile: UserProfile;
    today: LogEntry[];
    week: RangeInsights;
    month: RangeInsights;
    hasData: boolean;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const profile = await getProfile();
        if (profile === null) {
          router.replace('/onboarding');
          return;
        }

        const today = dayjs().format('YYYY-MM-DD');
        const target = profile.target_kcal ?? null;
        const [todayEntries, monthMap, hasData] = await Promise.all([
          getEntriesForDate(today),
          getDailyKcal(addDays(today, -29), today),
          hasAnyLogged(),
        ]);
        if (!active) return;
        setState({
          profile,
          today: todayEntries,
          week: buildRangeInsights(monthMap, today, 7, target),
          month: buildRangeInsights(monthMap, today, 30, target),
          hasData,
        });
      })();
      return () => {
        active = false;
      };
    }, [router])
  );

  if (!state) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loading}>Loading your day</Text>
      </View>
    );
  }

  const { profile, today, week, month, hasData } = state;
  const target = profile.target_kcal ?? null;
  const consumed = consumedTotals(today);
  const plannedToday = plannedTotals(today);
  const projected = consumed.kcal + plannedToday.kcal;
  const todayISO = dayjs().format('YYYY-MM-DD');
  const calRatio = target ? consumed.kcal / target : 0;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.title}>Home</Text>
            <Text style={styles.eyebrow}>{dayjs().format('dddd, D MMMM')}</Text>
          </View>
          <Pressable style={styles.diaryButton} onPress={() => router.push('/diary')} hitSlop={8}>
            <Text style={styles.diaryButtonText}>Diary</Text>
            <Chevron />
          </Pressable>
        </View>

        {target == null ? (
          <Pressable onPress={() => router.push('/onboarding')}>
            <Card style={styles.noticeCard}>
              <Row first>
                <View style={styles.flexShrink}>
                  <Text style={styles.noticeTitle}>Set your targets</Text>
                  <Text style={styles.noticeBody}>
                    Add daily calories and macros to make progress meaningful.
                  </Text>
                </View>
                <Chevron />
              </Row>
            </Card>
          </Pressable>
        ) : null}

        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroLabel}>Cal Eaten</Text>
            {plannedToday.kcal > 0 ? <Text style={styles.planPill}>Plan added</Text> : null}
          </View>
          <Text style={styles.hero}>
            {Math.round(consumed.kcal)}
            {target ? <Text style={styles.heroTarget}> of {Math.round(target)}</Text> : null}
            <Text style={styles.heroUnit}> Cal</Text>
          </Text>

          {target ? (
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

          {plannedToday.kcal > 0 ? (
            <Text style={styles.plannedOverlay}>
              {Math.round(plannedToday.kcal)} Cal still planned · projected {Math.round(projected)}
            </Text>
          ) : null}

          <View style={styles.macroStack}>
            <MacroBar label="Protein" value={consumed.protein_g} target={profile.target_protein_g} />
            <MacroBar label="Carbs" value={consumed.carb_g} target={profile.target_carb_g} />
            <MacroBar label="Fat" value={consumed.fat_g} target={profile.target_fat_g} />
          </View>
        </Card>

        <GroupHeader>Quick add</GroupHeader>
        <Card>
          {MEALS.map((meal, i) => (
            <Row
              key={meal}
              first={i === 0}
              onPress={() => router.push({ pathname: '/log', params: { meal, date: todayISO } })}
            >
              <Text style={styles.mealName}>{MEAL_LABELS[meal]}</Text>
              <View style={styles.mealRight}>
                <Text style={styles.mealKcal}>{Math.round(mealConsumedKcal(today, meal))} Cal</Text>
                <Chevron />
              </View>
            </Row>
          ))}
        </Card>

        {!hasData ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Start with the meal in front of you.</Text>
            <Text style={styles.emptyBody}>
              Search works offline across Indian dishes, raw ingredients, and your custom foods.
            </Text>
          </Card>
        ) : (
          <>
            <GroupHeader>This week</GroupHeader>
            <Card style={styles.insightCard}>
              <Trend insights={week} target={target} compact />
              <StatRow insights={week} target={target} />
            </Card>

            <GroupHeader>This month</GroupHeader>
            <Card style={styles.insightCard}>
              <Trend insights={month} target={target} />
              <StatRow insights={month} target={target} />
            </Card>
          </>
        )}

        <Link href="/onboarding" style={styles.editTargets}>
          {target ? 'Edit targets' : 'Set targets'}
        </Link>
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
        onPress={() =>
          router.push({ pathname: '/log', params: { meal: inferMeal(), date: todayISO } })
        }
      >
        <Text style={styles.addButtonText}>＋  Log food</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function MacroBar({ label, value, target }: { label: string; value: number; target: number | null }) {
  const r = ratio(value, target);
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroHeader}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {grams(value)}
          {target != null ? ` / ${grams(target)}` : ''}
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: clampPercent(r) }, r > 1 && styles.macroOver]} />
      </View>
    </View>
  );
}

function Trend({
  insights,
  target,
  compact,
}: {
  insights: RangeInsights;
  target: number | null;
  compact?: boolean;
}) {
  const max = Math.max(target ?? 0, ...insights.series.map((d) => d.kcal), 1);
  const band = target ? 0.1 * target : 0;
  return (
    <View style={[styles.trend, compact && styles.trendCompact]}>
      {insights.series.map((d) => {
        const onTarget = target != null && d.kcal > 0 && Math.abs(d.kcal - target) <= band;
        return (
          <View key={d.date} style={styles.trendCol}>
            <View style={styles.trendBarTrack}>
              <View
                style={[
                  styles.trendBar,
                  { height: clampPercent(d.kcal / max) },
                  d.kcal === 0 && styles.trendBarEmpty,
                  onTarget && styles.trendBarOnTarget,
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StatRow({ insights, target }: { insights: RangeInsights; target: number | null }) {
  return (
    <View style={styles.statRow}>
      <View>
        <Text style={styles.statValue}>{numberText(insights.avgKcal)}</Text>
        <Text style={styles.statLabel}>avg Cal/day</Text>
      </View>
      {target != null && insights.daysOnTarget != null ? (
        <View style={styles.statRight}>
          <Text style={styles.statValue}>
            {insights.daysOnTarget}/{insights.loggedDays}
          </Text>
          <Text style={styles.statLabel}>days on target</Text>
        </View>
      ) : null}
      {insights.partial ? (
        <Text style={styles.partial}>
          Partial view: {insights.loggedDays} of {insights.totalDays} days logged.
        </Text>
      ) : null}
    </View>
  );
}

function inferMeal(): MealType {
  const hour = dayjs().hour();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  loading: { ...type.subhead, marginTop: 12, color: colors.muted },
  content: { padding: 16, paddingBottom: 112 },
  flexShrink: { flexShrink: 1, paddingRight: 12 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginTop: 4,
  },
  title: { ...type.largeTitle, color: colors.ink },
  eyebrow: { ...type.subhead, color: colors.muted, marginTop: 2 },
  diaryButton: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  diaryButtonText: { ...type.body, color: colors.leafDark, fontWeight: '600' },
  noticeCard: { marginBottom: 16 },
  noticeTitle: { ...type.headline, color: colors.ink },
  noticeBody: { ...type.subhead, color: colors.muted, marginTop: 3, lineHeight: 19 },
  heroCard: { padding: 18 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { ...type.footnote, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  planPill: {
    ...type.caption,
    backgroundColor: colors.saffronBg,
    color: colors.saffron,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: '600',
  },
  hero: { marginTop: 8, color: colors.ink, fontSize: 40, fontWeight: '700', letterSpacing: 0.4 },
  heroTarget: { color: colors.faint, fontSize: 24, fontWeight: '600' },
  heroUnit: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  calTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.fillStrong,
    overflow: 'hidden',
    marginTop: 14,
  },
  calFill: { height: '100%', backgroundColor: colors.leaf, borderRadius: radius.pill },
  calOver: { backgroundColor: colors.saffron },
  plannedOverlay: { ...type.footnote, color: colors.saffron, marginTop: 8 },
  macroStack: { marginTop: 18, gap: 13 },
  macroRow: { gap: 6 },
  macroHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  macroLabel: { ...type.subhead, color: colors.ink, fontWeight: '500' },
  macroValue: { ...type.subhead, color: colors.muted },
  macroTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    overflow: 'hidden',
  },
  macroFill: { height: '100%', backgroundColor: colors.leaf, borderRadius: radius.pill },
  macroOver: { backgroundColor: colors.saffron },
  mealName: { ...type.body, color: colors.ink },
  mealRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mealKcal: { ...type.body, color: colors.muted },
  emptyCard: { padding: 18, marginTop: 22 },
  emptyTitle: { ...type.title3, color: colors.ink },
  emptyBody: { ...type.subhead, color: colors.muted, marginTop: 6, lineHeight: 20 },
  insightCard: { padding: 14 },
  trend: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 108,
    gap: 3,
  },
  trendCompact: { height: 92 },
  trendCol: { flex: 1, alignItems: 'center', height: '100%' },
  trendBarTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', backgroundColor: colors.lineStrong, borderRadius: 3, minHeight: 3 },
  trendBarOnTarget: { backgroundColor: colors.leaf },
  trendBarEmpty: { backgroundColor: colors.line },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  statRight: { alignItems: 'flex-end' },
  statValue: { ...type.title3, color: colors.ink, fontWeight: '700' },
  statLabel: { ...type.caption, color: colors.muted },
  partial: { ...type.caption, width: '100%', color: colors.saffron },
  editTargets: {
    ...type.subhead,
    marginTop: 24,
    color: colors.leafDark,
    fontWeight: '600',
    textAlign: 'center',
  },
  addButton: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: colors.leaf,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: radius.pill,
    ...shadow,
  },
  addButtonPressed: { opacity: 0.9 },
  addButtonText: { ...type.headline, color: '#ffffff', fontSize: 16 },
});
