import dayjs from 'dayjs';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Polyline,
  Stop,
  Svg,
} from 'react-native-svg';

import { addDays, buildRangeInsights, type RangeInsights } from '@/calc/insights';
import {
  consumedTotals,
  MEAL_ORDER,
  mealConsumedKcal,
  type Totals,
} from '@/calc/dayTotals';
import { getDailyKcal } from '@/db/insights';
import { getEntriesForDate } from '@/db/logEntries';
import { getAllMeasurements, getMeasurement, getRecentMeasurements } from '@/db/measurements';
import { getProfile } from '@/db/profile';
import { supabase } from '@/db/supabase';
import { useSyncStatus } from '@/db/sync';
import type { BodyMeasurement, LogEntry, MealType, UserProfile } from '@/types/db';
import { colors, dark as D } from '@/ui/theme';

// ─── Constants ──────────────────────────────────────────────────────────────

const RING_R = 104;
const RING_C = 2 * Math.PI * RING_R; // 653.45

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: D.accent,
  lunch: '#3bc9ff',
  snack: '#6cf0bb',
  dinner: D.amber,
};

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface HomeState {
  profile: UserProfile;
  today: LogEntry[];
  week: RangeInsights;
  monthMap: Record<string, number>;
  measurement: BodyMeasurement | null;
  recentMeasurements: BodyMeasurement[];
  allMeasurements: BodyMeasurement[];
}

// ─── Screen ──────────────────────────────────────────────────────────────────

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
  const calRatio = target ? consumed.kcal / target : 0;
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
          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.dateLabel}>{dayjs().format('ddd · D MMMM').toUpperCase()}</Text>
              {lastSyncedAt && pending === 0 ? (
                <Text style={styles.syncOk}>☁ Backed up</Text>
              ) : pending > 0 ? (
                <Text style={styles.syncPending}>↑ Syncing…</Text>
              ) : null}
              <Text style={styles.greeting}>{getGreeting()}</Text>
            </View>
            <View style={styles.streakPill}>
              <View style={styles.streakDot} />
              <Text style={styles.streakNum}>{streak}</Text>
              <Text style={styles.streakTxt}>day streak</Text>
            </View>
          </View>

          {/* ── Cal ring card ── */}
          <View style={styles.card}>
            <View style={styles.ringWrap}>
              <Svg width={232} height={232} viewBox="0 0 232 232">
                <Defs>
                  <SvgLinearGradient id="calGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={D.accent2} />
                    <Stop offset="1" stopColor={D.accent} />
                  </SvgLinearGradient>
                </Defs>
                <Circle
                  cx={116}
                  cy={116}
                  r={RING_R}
                  fill="none"
                  stroke={D.trackBg}
                  strokeWidth={17}
                />
                {(target != null || consumed.kcal > 0) && (
                  <Circle
                    cx={116}
                    cy={116}
                    r={RING_R}
                    fill="none"
                    stroke="url(#calGrad)"
                    strokeWidth={17}
                    strokeLinecap="round"
                    strokeDasharray={`${RING_C}`}
                    strokeDashoffset={`${RING_C * (1 - Math.min(1, target ? calRatio : 0.5))}`}
                    transform="rotate(-90 116 116)"
                  />
                )}
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={styles.ringEyebrow}>Eaten today</Text>
                <Text style={styles.ringKcal}>
                  {Math.round(consumed.kcal).toLocaleString()}
                </Text>
                {target != null && (
                  <Text style={styles.ringTarget}>
                    of {Math.round(target).toLocaleString()} kcal
                  </Text>
                )}
              </View>
            </View>

            {target != null && (
              <View
                style={[
                  styles.goalPill,
                  consumed.kcal >= target ? styles.goalPillOk : styles.goalPillPending,
                ]}
              >
                {consumed.kcal >= target ? (
                  <Text style={styles.goalText}>
                    ✓  Goal reached · {Math.round(consumed.kcal - target)} over
                  </Text>
                ) : (
                  <Text style={styles.goalTextPending}>
                    {Math.round(target - consumed.kcal).toLocaleString()} kcal remaining
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* ── Macros card ── */}
          <View style={[styles.card, styles.macrosCard]}>
            <Text style={styles.sectionInCard}>Macros</Text>
            <MacroBar
              label="Protein"
              value={consumed.protein_g}
              targetVal={profile.target_protein_g}
              gradColors={[D.orange, D.orange2]}
            />
            <MacroBar
              label="Carbs"
              value={consumed.carb_g}
              targetVal={profile.target_carb_g}
              gradColors={[D.cyan, D.cyan2]}
            />
            <MacroBar
              label="Fat"
              value={consumed.fat_g}
              targetVal={profile.target_fat_g}
              gradColors={[D.orange, D.orange2]}
              overColor="#ff9f6b"
            />
            <MacroBar
              label="Fibre"
              value={consumed.fibre_g}
              targetVal={30}
              gradColors={[D.green, D.green2]}
              last
            />
          </View>

          {/* ── Quick add chips ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Quick add</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              <Pressable
                style={styles.chipPrimary}
                onPress={() =>
                  router.push({ pathname: '/log', params: { meal: inferMeal(), date: todayISO } })
                }
              >
                <Text style={styles.chipPrimaryText}>＋  Log food</Text>
              </Pressable>
              {MEAL_ORDER.map((meal) => {
                const kcal = mealConsumedKcal(today, meal);
                if (kcal === 0) return null;
                const items = today.filter(
                  (e) => e.meal_type === meal && e.status === 'logged'
                );
                const name = items[0]?.food_name ?? MEAL_LABELS[meal];
                return (
                  <Pressable
                    key={meal}
                    style={styles.chip}
                    onPress={() =>
                      router.push({ pathname: '/log', params: { meal, date: todayISO } })
                    }
                  >
                    <Text style={styles.chipText}>
                      {name.length > 16 ? name.slice(0, 14) + '…' : name}
                      <Text style={styles.chipMuted}> · {Math.round(kcal)}</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Trends ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Trends</Text>
            <View style={styles.trendsGrid}>
              <MiniTrendCard
                label="Weight"
                value={measurement?.weight_kg ?? null}
                unit="kg"
                data={allMeasurements.map((m) => m.weight_kg ?? 0)}
                strokeColor={D.amber}
                gradId="wA"
                gradColor={D.amber}
              />
              <MiniTrendCard
                label="Waist"
                value={measurement?.waist_cm ?? null}
                unit="cm"
                data={allMeasurements.map((m) => m.waist_cm ?? 0)}
                strokeColor={D.cyan}
                gradId="wB"
                gradColor={D.cyan}
              />
            </View>
          </View>

          {/* ── This week ── */}
          <View style={[styles.card, styles.weekCard]}>
            <View style={styles.weekHead}>
              <Text style={styles.sectionInCard}>This week</Text>
              <Text style={styles.weekStat}>
                {week.daysOnTarget ?? 0} / {week.totalDays} on target
              </Text>
            </View>
            <WeekBars week={week} target={target} />
            {week.loggedDays > 0 && (
              <Text style={styles.weekSub}>
                Avg {Math.round(week.avgKcal).toLocaleString()} kcal/day this week.
              </Text>
            )}
          </View>

          {/* ── This month ── */}
          <View style={[styles.card, styles.weekCard]}>
            <View style={styles.weekHead}>
              <Text style={styles.sectionInCard}>This month</Text>
              <Text style={styles.weekStat}>
                {month.daysOnTarget ?? 0} / {month.totalDays} on target
              </Text>
            </View>
            <MonthBars month={month} target={target} />
            {month.loggedDays > 0 && (
              <Text style={styles.weekSub}>
                Avg {Math.round(month.avgKcal).toLocaleString()} kcal/day this month.
              </Text>
            )}
          </View>

          {/* ── Today's meals ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, styles.sectionLabelNoGap]}>Today's meals</Text>
              <Pressable onPress={() => router.push('/diary')}>
                <Text style={styles.sectionLink}>View diary ›</Text>
              </Pressable>
            </View>
            <View style={[styles.card, styles.mealsCard]}>
              {MEAL_ORDER.map((meal, i) => {
                const items = today.filter(
                  (e) => e.meal_type === meal && e.status === 'logged'
                );
                const kcal = mealConsumedKcal(today, meal);
                const sub =
                  items.length > 0
                    ? items
                        .slice(0, 2)
                        .map((e) => e.food_name)
                        .join(' · ')
                    : 'Nothing logged yet';
                return (
                  <Pressable
                    key={meal}
                    style={[styles.mealRow, i < MEAL_ORDER.length - 1 && styles.mealRowDivider]}
                    onPress={() =>
                      router.push({ pathname: '/log', params: { meal, date: todayISO } })
                    }
                  >
                    <View
                      style={[styles.mealDot, { backgroundColor: MEAL_COLORS[meal] }]}
                    />
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealName}>{MEAL_LABELS[meal]}</Text>
                      <Text style={styles.mealSub} numberOfLines={1}>
                        {sub}
                      </Text>
                    </View>
                    <Text style={styles.mealKcal}>{Math.round(kcal)}</Text>
                    <Text style={styles.mealKcalUnit}> kcal</Text>
                    <Text style={styles.mealChevron}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

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

      {/* ── FAB ── */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: 28 + insets.bottom },
          pressed && { opacity: 0.88, transform: [{ scale: 0.93 }] },
        ]}
        onPress={() => setSheetOpen(true)}
      >
        <LinearGradient
          colors={['#c8803a', '#b06228']}
          style={styles.fabInner}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
        >
          <Text style={styles.fabPlus}>＋</Text>
        </LinearGradient>
      </Pressable>

      {/* ── Quick-add bottom sheet ── */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>Quick add</Text>
              <Pressable style={styles.sheetCloseBtn} onPress={() => setSheetOpen(false)}>
                <Text style={styles.sheetCloseX}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.quickGrid}>
              <QuickTile
                label="Log food"
                sub="Search database"
                iconBg={`${D.accent}4d`}
                iconColor={D.accent}
                tileBg={`${D.accent}24`}
                tileBorder={`${D.accent}66`}
                onPress={() => {
                  setSheetOpen(false);
                  router.push({
                    pathname: '/log',
                    params: { meal: inferMeal(), date: todayISO },
                  });
                }}
              />
              <QuickTile
                label="Weight"
                sub={
                  measurement?.weight_kg
                    ? `Last ${measurement.weight_kg} kg`
                    : 'Log today'
                }
                iconBg="rgba(59,201,255,0.18)"
                iconColor="#3bc9ff"
                tileBg="rgba(255,255,255,0.05)"
                tileBorder="rgba(255,255,255,0.08)"
                onPress={() => {
                  setSheetOpen(false);
                  router.push({ pathname: '/measurement', params: { date: todayISO } });
                }}
              />
              <QuickTile
                label="Waist"
                sub={
                  measurement?.waist_cm
                    ? `Last ${measurement.waist_cm} cm`
                    : 'Log today'
                }
                iconBg="rgba(52,224,161,0.18)"
                iconColor="#34e0a1"
                tileBg="rgba(255,255,255,0.05)"
                tileBorder="rgba(255,255,255,0.08)"
                onPress={() => {
                  setSheetOpen(false);
                  router.push({ pathname: '/measurement', params: { date: todayISO } });
                }}
              />
              <QuickTile
                label="Diary"
                sub="View all entries"
                iconBg="rgba(74,168,255,0.18)"
                iconColor="#4aa8ff"
                tileBg="rgba(255,255,255,0.05)"
                tileBorder="rgba(255,255,255,0.08)"
                onPress={() => {
                  setSheetOpen(false);
                  router.push('/diary');
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  targetVal,
  gradColors,
  overColor,
  last,
}: {
  label: string;
  value: number;
  targetVal: number | null;
  gradColors: [string, string];
  overColor?: string;
  last?: boolean;
}) {
  const r = targetVal ? Math.min(1, value / targetVal) : 0;
  const over = targetVal != null && value > targetVal;
  const overAmt = over ? Math.round(value - targetVal!) : 0;

  return (
    <View style={[styles.macroRow, !last && styles.macroRowGap]}>
      <View style={styles.macroHead}>
        <View style={styles.macroLabelRow}>
          <Text style={styles.macroLabelTxt}>{label}</Text>
          {over && overColor && (
            <View
              style={[styles.overBadge, { backgroundColor: `${overColor}26` }]}
            >
              <Text style={[styles.overBadgeTxt, { color: overColor }]}>
                {overAmt} over
              </Text>
            </View>
          )}
        </View>
        <Text
          style={[styles.macroVal, over && overColor ? { color: gradColors[1] } : null]}
        >
          {Math.round(value)}
          {targetVal != null ? (
            <Text style={styles.macroTargetTxt}> / {Math.round(targetVal)} g</Text>
          ) : (
            <Text style={styles.macroTargetTxt}> g</Text>
          )}
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <LinearGradient
          colors={gradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.macroFill, { width: `${Math.round(r * 100)}%` }]}
        />
      </View>
    </View>
  );
}

function MiniTrendCard({
  label,
  value,
  unit,
  data,
  strokeColor,
  gradId,
  gradColor,
}: {
  label: string;
  value: number | null;
  unit: string;
  data: number[];
  strokeColor: string;
  gradId: string;
  gradColor: string;
}) {
  const sparkPts = buildSparkPoints(data, 120, 38);
  const areaPath = sparkPts ? buildAreaPath(sparkPts, 38) : '';

  return (
    <View style={styles.trendCard}>
      <Text style={styles.trendLabel}>{label}</Text>
      <View style={styles.trendValRow}>
        <Text style={styles.trendVal}>{value ?? '—'}</Text>
        <Text style={styles.trendUnit}>{unit}</Text>
      </View>
      <Svg width="100%" height={38} viewBox="0 0 120 38" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradColor} stopOpacity={0.34} />
            <Stop offset="1" stopColor={gradColor} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        {sparkPts ? (
          <>
            <Path d={areaPath} fill={`url(#${gradId})`} />
            <Polyline
              points={sparkPts}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

function WeekBars({ week, target }: { week: RangeInsights; target: number | null }) {
  const max = Math.max(target ?? 0, ...week.series.map((d) => d.kcal), 1);
  const MAX_H = 50;
  return (
    <View style={styles.barsRow}>
      {week.series.map((d) => {
        const h = Math.max(4, (d.kcal / max) * MAX_H);
        const hasData = d.kcal > 0;
        const isOver = target !== null && d.kcal > target + 100;
        const dayInit = getDayInitial(d.date);
        return (
          <View key={d.date} style={styles.barCol}>
            <View style={[styles.barTrack, { height: MAX_H }]}>
              {hasData ? (
                isOver ? (
                  <View style={[styles.bar, styles.barOver, { height: h, borderRadius: 8 }]} />
                ) : (
                  <LinearGradient
                    colors={[D.accent2, D.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.bar, { height: h, borderRadius: 8 }]}
                  />
                )
              ) : (
                <View style={[styles.bar, styles.barEmpty, { height: h, borderRadius: 8 }]} />
              )}
            </View>
            <Text style={styles.barDayLabel}>{dayInit}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MonthBars({ month, target }: { month: RangeInsights; target: number | null }) {
  const max = Math.max(target ?? 0, ...month.series.map((d) => d.kcal), 1);
  const MAX_H = 44;
  return (
    <View style={styles.monthBarsRow}>
      {month.series.map((d) => {
        const h = Math.max(2, (d.kcal / max) * MAX_H);
        const hasData = d.kcal > 0;
        const isOver = target !== null && d.kcal > target + 100;
        return (
          <View key={d.date} style={styles.monthBarCol}>
            <View style={[styles.monthBarTrack, { height: MAX_H }]}>
              {hasData ? (
                isOver ? (
                  <View style={[styles.monthBar, styles.barOver, { height: h }]} />
                ) : (
                  <LinearGradient
                    colors={[D.accent2, D.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.monthBar, { height: h }]}
                  />
                )
              ) : (
                <View style={[styles.monthBar, styles.barEmpty, { height: h }]} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function QuickTile({
  label,
  sub,
  iconBg,
  iconColor,
  tileBg,
  tileBorder,
  onPress,
}: {
  label: string;
  sub: string;
  iconBg: string;
  iconColor: string;
  tileBg: string;
  tileBorder: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickTile,
        { backgroundColor: tileBg, borderColor: tileBorder },
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
      onPress={onPress}
    >
      <View style={[styles.quickTileIcon, { backgroundColor: iconBg }]}>
        <Text style={[styles.quickTileIconTxt, { color: iconColor }]}>＋</Text>
      </View>
      <View>
        <Text style={styles.quickTileLabel}>{label}</Text>
        <Text style={styles.quickTileSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = dayjs().hour();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function inferMeal(): MealType {
  const h = dayjs().hour();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

function computeStreak(monthMap: Record<string, number>, today: string): number {
  // If today has no data yet, start from yesterday so an in-progress day doesn't break the streak.
  let d = (monthMap[today] ?? 0) > 0 ? today : addDays(today, -1);
  let streak = 0;
  for (let i = 0; i < 31; i++) {
    if ((monthMap[d] ?? 0) > 0) {
      streak++;
      d = addDays(d, -1);
    } else {
      break;
    }
  }
  return streak;
}

function getDayInitial(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day];
}

function buildSparkPoints(values: number[], W: number, H: number): string {
  const valid = values.filter((v) => v > 0);
  if (valid.length < 2) return '';
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const step = W / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = v > 0 ? H - ((v - min) / range) * (H - 8) - 4 : H - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildAreaPath(pts: string, H: number): string {
  const coords = pts.split(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const fx = first.split(',')[0];
  const lx = last.split(',')[0];
  return `M${pts} L${lx},${H} L${fx},${H} Z`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: D.bg,
  },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { fontSize: 14, color: D.muted, marginTop: 12 },

  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    zIndex: 0,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 4,
  },
  dateLabel: {
    fontSize: 12,
    letterSpacing: 1.6,
    color: D.label,
    fontWeight: '600',
  },
  syncOk: {
    fontSize: 10,
    color: D.green,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  syncPending: {
    fontSize: 10,
    color: D.muted,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  greeting: {
    fontSize: 27,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
    marginTop: 3,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,170,70,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,170,70,0.25)',
    marginTop: 4,
  },
  streakDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ffb454',
  },
  streakNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffd08a',
  },
  streakTxt: {
    fontSize: 12,
    color: 'rgba(255,208,138,0.75)',
  },

  // Cards
  card: {
    backgroundColor: D.card,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: 28,
    marginBottom: 16,
    alignItems: 'center',
    padding: 22,
  },
  sectionInCard: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: D.label,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: 16,
  },

  // Cal ring
  ringWrap: {
    position: 'relative',
    width: 232,
    height: 232,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: D.label,
    fontWeight: '600',
  },
  ringKcal: {
    fontSize: 54,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 58,
    letterSpacing: -1,
    marginTop: 2,
  },
  ringTarget: {
    fontSize: 14,
    color: D.muted,
  },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 14,
  },
  goalPillOk: {
    backgroundColor: 'rgba(255,170,70,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,170,70,0.20)',
  },
  goalPillPending: {
    backgroundColor: `${D.accent}18`,
    borderWidth: 1,
    borderColor: `${D.accent}30`,
  },
  goalText: {
    fontSize: 13.5,
    color: '#ffd9a8',
    fontWeight: '500',
  },
  goalTextPending: {
    fontSize: 13.5,
    color: D.accent2,
    fontWeight: '500',
  },

  // Macros
  macrosCard: {
    alignItems: 'stretch',
    paddingBottom: 8,
  },
  macroRow: {},
  macroRowGap: { marginBottom: 17 },
  macroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  macroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroLabelTxt: {
    fontSize: 15,
    color: D.ink,
    fontWeight: '600',
  },
  overBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  overBadgeTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  macroVal: {
    fontSize: 14.5,
    color: D.ink,
    fontWeight: '600',
  },
  macroTargetTxt: {
    fontSize: 13,
    color: D.muted,
    fontWeight: '400',
  },
  macroTrack: {
    height: 8,
    borderRadius: 5,
    backgroundColor: D.trackBg,
    overflow: 'hidden',
  },
  macroFill: {
    height: '100%',
    borderRadius: 5,
    minWidth: 4,
  },

  // Section headings
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: D.label,
    fontWeight: '600',
    marginBottom: 12,
    paddingLeft: 2,
  },
  sectionLabelNoGap: {
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '600',
    color: D.amber,
  },

  // Month bars
  monthBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  monthBarCol: {
    flex: 1,
    alignItems: 'center',
  },
  monthBarTrack: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  monthBar: {
    width: '100%',
    borderRadius: 3,
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    gap: 9,
    paddingBottom: 4,
  },
  chipPrimary: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: `${D.accent}28`,
    borderWidth: 1,
    borderColor: `${D.accent}70`,
  },
  chipPrimaryText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: D.border,
  },
  chipText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#e9e9ee',
  },
  chipMuted: {
    color: D.muted,
  },

  // Trends
  trendsGrid: {
    flexDirection: 'row',
    gap: 13,
  },
  trendCard: {
    flex: 1,
    backgroundColor: D.card,
    borderWidth: 1,
    borderColor: D.border,
    borderRadius: 24,
    padding: 16,
    gap: 8,
  },
  trendLabel: {
    fontSize: 13,
    color: D.muted,
    fontWeight: '500',
  },
  trendValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  trendVal: {
    fontSize: 29,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  trendUnit: {
    fontSize: 13,
    color: D.muted,
  },

  // Week bars
  weekCard: {
    alignItems: 'stretch',
  },
  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  weekStat: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  weekSub: {
    marginTop: 16,
    fontSize: 13,
    color: D.muted,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barCol: {
    alignItems: 'center',
    gap: 8,
  },
  barTrack: {
    justifyContent: 'flex-end',
    width: 24,
  },
  bar: {
    width: 24,
  },
  barEmpty: {
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  barOver: {
    backgroundColor: colors.rose,
    borderRadius: 8,
  },
  barDayLabel: {
    fontSize: 11,
    color: D.label,
  },

  // Meals
  mealsCard: {
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    paddingHorizontal: 18,
  },
  mealRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: D.divider,
  },
  mealDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '600',
    color: D.ink,
  },
  mealSub: {
    fontSize: 12,
    color: D.muted,
    marginTop: 1,
  },
  mealKcal: {
    fontSize: 15,
    fontWeight: '600',
    color: D.ink,
  },
  mealKcalUnit: {
    fontSize: 11,
    color: D.muted,
  },
  mealChevron: {
    fontSize: 18,
    color: 'rgba(235,235,245,0.3)',
    marginLeft: 2,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 8,
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '600',
    color: D.accent2,
  },
  footerMuted: {
    fontSize: 14,
    color: D.muted,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: 'hidden',
  },
  fabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 31,
  },
  fabPlus: {
    fontSize: 28,
    color: '#ffffff',
    lineHeight: 30,
  },

  // Bottom sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'rgba(22,22,27,0.97)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseX: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickTile: {
    width: '47.5%',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 11,
  },
  quickTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileIconTxt: {
    fontSize: 20,
    lineHeight: 24,
  },
  quickTileLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  quickTileSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
});
