import { Pressable, Text, View } from 'react-native';

import { MEAL_ORDER, mealConsumedKcal } from '@/calc/dayTotals';
import type { LogEntry } from '@/types/db';

import { MEAL_COLORS, MEAL_LABELS, type HomeRouter } from './homeUtils';
import { styles } from './styles';

/** Per-meal summary rows for today, with a link through to the diary. */
export function TodayMeals({
  today,
  todayISO,
  router,
}: {
  today: LogEntry[];
  todayISO: string;
  router: HomeRouter;
}) {
  return (
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
  );
}
