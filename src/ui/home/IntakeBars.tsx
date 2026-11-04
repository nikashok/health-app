import dayjs from 'dayjs';
import { useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import {
  completedAverage,
  daysInBand,
  kcalBand,
  type DayKcal,
  type RangeInsights,
} from '@/calc/insights';
import { CardHeader, Chevron } from '@/ui/components';
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

function dayName(d: DayKcal, isToday: boolean): string {
  return isToday ? 'Today so far' : dayjs(d.date).format('ddd D MMM');
}

function bandWord(kcal: number, target: number | null, isToday: boolean): string | null {
  if (isToday || kcal <= 0) return null;
  const band = kcalBand(kcal, target);
  return band === 'on' ? 'on target' : band === 'over' ? 'over target' : band === 'under' ? 'under target' : null;
}

function barLabel(d: DayKcal, isToday: boolean, target: number | null): string {
  if (d.kcal <= 0) return `${dayName(d, isToday)}, nothing logged`;
  const band = bandWord(d.kcal, target, isToday);
  return `${dayName(d, isToday)}, ${int(d.kcal)} kcal${band ? `, ${band}` : ''}`;
}

type DayPress = (date: string) => void;

/**
 * Tapping a bar selects it and shows that day's total in the card; "Open day" then goes
 * to the Diary. Tapping the selected bar again clears it.
 */
function useSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = (date: string) => setSelected((s) => (s === date ? null : date));
  return { selected, toggle };
}

/** "Past 7 days": daily average, days on target, and the 7 bars with day initials. */
export function WeekCard({
  week,
  target,
  onOpenDay,
}: {
  week: RangeInsights;
  target: number | null;
  onOpenDay: DayPress;
}) {
  const H = 96;
  const scale = chartScale(week, target);
  const targetY = target ? (target / scale) * H : null;
  const lastIdx = week.series.length - 1;
  const sel = useSelection();
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
            <Bar
              key={d.date}
              d={d}
              isToday={i === lastIdx}
              target={target}
              height={Math.max(4, (d.kcal / scale) * H)}
              shape={styles.weekBar}
              selected={sel.selected === d.date}
              dimmed={sel.selected != null && sel.selected !== d.date}
              onPress={() => sel.toggle(d.date)}
            />
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
      <Selection range={week} target={target} selected={sel.selected} onOpenDay={onOpenDay} />
      {target != null ? <Legend /> : null}
    </View>
  );
}

/** "Past 30 days": the same summary over 30 thinner bars. */
export function MonthCard({
  month,
  target,
  onOpenDay,
}: {
  month: RangeInsights;
  target: number | null;
  onOpenDay: DayPress;
}) {
  const H = 60;
  const scale = chartScale(month, target);
  const targetY = target ? (target / scale) * H : null;
  const lastIdx = month.series.length - 1;
  const sel = useSelection();
  return (
    <View style={[styles.card, styles.trendCard, styles.monthCard]}>
      <TrendSummary range={month} target={target} detail="Past 30 days" />
      <View style={[styles.chart, { height: H }]}>
        {targetY != null ? (
          <>
            <View style={[styles.targetLine, { bottom: targetY }]} />
            <Text style={[styles.targetLabel, { bottom: targetY + 3 }]} maxFontSizeMultiplier={MAX_SCALE}>
              {int(target!)}
            </Text>
          </>
        ) : null}
        <View style={[styles.bars, styles.monthBars]}>
          {month.series.map((d, i) => (
            <Bar
              key={d.date}
              d={d}
              isToday={i === lastIdx}
              target={target}
              height={Math.max(3, (d.kcal / scale) * H)}
              shape={styles.monthBar}
              selected={sel.selected === d.date}
              dimmed={sel.selected != null && sel.selected !== d.date}
              onPress={() => sel.toggle(d.date)}
            />
          ))}
        </View>
      </View>
      <View style={styles.rangeLabels} importantForAccessibility="no-hide-descendants">
        <Text style={styles.rangeLabel}>{dayjs(month.series[0]?.date).format('D MMM')}</Text>
        <Text style={[styles.rangeLabel, styles.dayLabelToday]}>Today</Text>
      </View>
      <Selection range={month} target={target} selected={sel.selected} onOpenDay={onOpenDay} />
    </View>
  );
}

function Bar({
  d,
  isToday,
  target,
  height,
  shape,
  selected,
  dimmed,
  onPress,
}: {
  d: DayKcal;
  isToday: boolean;
  target: number | null;
  height: number;
  shape: ViewStyle;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.barHit}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={barLabel(d, isToday, target)}
    >
      <View style={[shape, { height }, barStyle(d.kcal, target, isToday), dimmed && styles.barDimmed]} />
    </Pressable>
  );
}

/** The selected bar's day and total, with a link to that day in the Diary. */
function Selection({
  range,
  target,
  selected,
  onOpenDay,
}: {
  range: RangeInsights;
  target: number | null;
  selected: string | null;
  onOpenDay: DayPress;
}) {
  if (!selected) return null;
  const idx = range.series.findIndex((d) => d.date === selected);
  if (idx < 0) return null;
  const d = range.series[idx];
  const isToday = idx === range.series.length - 1;
  const band = bandWord(d.kcal, target, isToday);
  return (
    <Pressable
      onPress={() => onOpenDay(d.date)}
      style={({ pressed }) => [styles.selection, pressed && styles.selectionPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${barLabel(d, isToday, target)}. Open this day in the diary`}
    >
      <View style={styles.selectionInfo}>
        <Text style={styles.selectionDay}>{dayName(d, isToday)}</Text>
        <Text style={styles.selectionText} numberOfLines={1}>
          {d.kcal > 0 ? `${int(d.kcal)} kcal` : 'Nothing logged'}
          {band ? ` · ${band}` : ''}
        </Text>
      </View>
      <View style={styles.selectionLink}>
        <Text style={styles.selectionLinkText}>Open day</Text>
        <Chevron style={styles.selectionChevron} />
      </View>
    </Pressable>
  );
}

/** What the bar styles mean (shown once, under the 7-day chart). */
function Legend() {
  return (
    <View style={styles.legend} importantForAccessibility="no-hide-descendants">
      <LegendItem label="On target" swatch={{ backgroundColor: colors.trendOn }} />
      <LegendItem
        label="Under"
        swatch={{ backgroundColor: colors.trendUnder, borderWidth: 1.5, borderColor: colors.trendOn }}
      />
      <LegendItem label="Over" swatch={{ backgroundColor: colors.trendOver }} />
      <LegendItem label="Today" swatch={{ backgroundColor: colors.lineStrong }} />
    </View>
  );
}

function LegendItem({ label, swatch }: { label: string; swatch: ViewStyle }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, swatch]} />
      <Text style={styles.legendText}>{label}</Text>
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
  const { avgKcal, countedDays, lowDays } = completedAverage(past);
  const avg = countedDays > 0 ? `${int(avgKcal)} kcal` : 'not enough data';
  const partial = range.loggedDays < range.totalDays;
  const headerDetail = partial ? `${detail} · ${range.loggedDays} logged` : detail;
  const summary =
    `${detail}: daily average ${avg}` +
    (onTarget != null ? `, ${onTarget} of ${past.length} days on target` : '') +
    (lowDays > 0 ? `. ${lowDays} short ${lowDays === 1 ? 'day' : 'days'} not counted` : '');
  return (
    <>
      <CardHeader label="Calories" color={colors.energy} detail={headerDetail} />
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
      {lowDays > 0 ? (
        <Text style={styles.trendNote}>
          {lowDays} {lowDays === 1 ? 'day' : 'days'} under 500 kcal not counted in the average
        </Text>
      ) : null}
    </>
  );
}
