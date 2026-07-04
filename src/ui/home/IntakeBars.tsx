import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import type { RangeInsights } from '@/calc/insights';
import { dark as D } from '@/ui/theme';

import { getDayInitial } from './homeUtils';
import { styles } from './styles';

/** "This week" card: 7-day calorie bars + on-target count + average. */
export function WeekCard({ week, target }: { week: RangeInsights; target: number | null }) {
  return (
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
  );
}

/** "This month" card: 30-day calorie bars + on-target count + average. */
export function MonthCard({ month, target }: { month: RangeInsights; target: number | null }) {
  return (
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
