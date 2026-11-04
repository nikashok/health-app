import dayjs from 'dayjs';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import {
  completedAverage,
  daysInBand,
  kcalBand,
  type DayKcal,
  type RangeInsights,
} from '@/calc/insights';
import { CardHeader } from '@/ui/components';
import { int } from '@/ui/format';
import { colors } from '@/ui/theme';

import { getDayInitial } from './homeUtils';
import { styles } from './styles';


/** Big numbers and chart labels stop growing past this text-size multiplier, so they can't clip. */
const MAX_SCALE = 1.3;

/**
 * Bar look per day. On target = solid green, over = solid red, under = a dim fill with a
 * green outline — a different SHAPE, not just a paler green, so it reads at a glance and
 * without colour vision. Today is still in progress, so its bar is neutral grey rather
 * than judged "under" all day; it gets its band once it is a past day.
 */
function barStyle(kcal: number, target: number | null, isToday: boolean): ViewStyle {
  if (kcal <= 0) return { backgroundColor: colors.fill };
  if (isToday) return { backgroundColor: colors.lineStrong };
  const band = kcalBand(kcal, target);
  if (band === 'on') return { backgroundColor: colors.trendOn };
  if (band === 'over') return { backgroundColor: colors.trendOver };
  if (band === 'under')
    return { backgroundColor: colors.trendUnder, borderWidth: 1.5, borderColor: colors.trendOn };
  return { backgroundColor: colors.energy };
}

/** Chart ceiling: 20% headroom over the target (2,000 → 2,400), or the biggest day. */
function chartScale(range: RangeInsights, target: number | null): number {
  return Math.max((target ?? 0) * 1.2, ...range.series.map((d) => d.kcal), 1);
}

function barLabel(d: DayKcal, isToday: boolean): string {
  const day = isToday ? 'Today so far' : dayjs(d.date).format('ddd D MMM');
  return d.kcal > 0 ? `${day}, ${int(d.kcal)} kcal` : `${day}, nothing logged`;
}

type DayPress = (date: string) => void;

/** "Past 7 days": daily average, days on target, and the 7 bars with day initials. */
export function WeekCard({
  week,
  target,
  onDayPress,
}: {
  week: RangeInsights;
  target: number | null;
  onDayPress: DayPress;
}) {
  const H = 96;
  const scale = chartScale(week, target);
  const targetY = target ? (target / scale) * H : null;
  const lastIdx = week.series.length - 1;
  return (
    <View style={[styles.card, styles.trendCard]}>
      <TrendSummary range={week} target={target} detail="Past 7 days" />
      <View style={[styles.chart, { height: H }]}>
        {targetY != null ? (
          <>
            <View style={[styles.targetLine, { bottom: targetY }]} />
            <Text style={[styles.targetLabel, { bottom: targetY + 3 }]} maxFontSizeMultiplier={MAX_SCALE}>
              {int(target!)}
            </Text>
          </>
        ) : null}
        <View style={[styles.bars, styles.weekBars]}>
          {week.series.map((d, i) => (
            <Pressable
              key={d.date}
              onPress={() => onDayPress(d.date)}
              style={styles.barHit}
              accessibilityRole="button"
              accessibilityLabel={barLabel(d, i === lastIdx)}
            >
              <View
                style={[
                  styles.weekBar,
                  { height: Math.max(4, (d.kcal / scale) * H) },
                  barStyle(d.kcal, target, i === lastIdx),
                ]}
              />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.dayLabels} importantForAccessibility="no-hide-descendants">
        {week.series.map((d, i) => (
          <Text
            key={d.date}
            style={[styles.dayLabel, i === lastIdx && styles.dayLabelToday]}
            maxFontSizeMultiplier={MAX_SCALE}
          >
            {getDayInitial(d.date)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** "Past 30 days": the same summary over 30 thinner bars. */
export function MonthCard({
  month,
  target,
  onDayPress,
}: {
  month: RangeInsights;
  target: number | null;
  onDayPress: DayPress;
}) {
  const H = 52;
  const scale = chartScale(month, target);
  const targetY = target ? (target / scale) * H : null;
  const lastIdx = month.series.length - 1;
  return (
    <View style={[styles.card, styles.trendCard, styles.monthCard]}>
      <TrendSummary range={month} target={target} detail="Past 30 days" />
      <View style={[styles.chart, { height: H }]}>
        {targetY != null ? <View style={[styles.targetLine, { bottom: targetY }]} /> : null}
        <View style={[styles.bars, styles.monthBars]}>
          {month.series.map((d, i) => (
            <Pressable
              key={d.date}
              onPress={() => onDayPress(d.date)}
              style={styles.barHit}
              accessibilityRole="button"
              accessibilityLabel={barLabel(d, i === lastIdx)}
            >
              <View
                style={[
                  styles.monthBar,
                  { height: Math.max(3, (d.kcal / scale) * H) },
                  barStyle(d.kcal, target, i === lastIdx),
                ]}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function TrendSummary({
  range,
  target,
  detail,
}: {
  range: RangeInsights;
  target: number | null;
  detail: string;
}) {
  // Today is excluded from both figures: an unfinished day can't be judged on or off
  // target yet, and counting it in the average would drag the average down mid-day.
  const past = range.series.slice(0, -1);
  const onTarget = daysInBand(past, target);
  const { avgKcal, countedDays } = completedAverage(past);
  const avg = countedDays > 0 ? `${int(avgKcal)} kcal` : 'not enough data';
  const summary =
    `${detail}: daily average ${avg}` +
    (onTarget != null ? `, ${onTarget} of ${past.length} days on target` : '');
  return (
    <>
      <CardHeader label="Calories" color={colors.energy} detail={detail} />
      <View style={styles.trendSummary} accessible accessibilityLabel={summary}>
        <View>
          <Text style={styles.trendEyebrow}>Daily average</Text>
          <View style={styles.heroRow}>
            <Text style={styles.trendHero} maxFontSizeMultiplier={MAX_SCALE}>
              {countedDays > 0 ? int(avgKcal) : '—'}
            </Text>
            <Text style={styles.trendUnit}>kcal</Text>
          </View>
        </View>
        {onTarget != null ? (
          <Text style={styles.trendStat}>
            <Text style={styles.trendStatCount}>
              {onTarget} of {past.length}
            </Text>{' '}
            days on target
          </Text>
        ) : null}
      </View>
    </>
  );
}
