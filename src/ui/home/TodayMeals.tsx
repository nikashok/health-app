import { Pressable, Text, View } from 'react-native';

import { MEAL_ORDER, mealConsumedKcal } from '@/calc/dayTotals';
import type { LogEntry } from '@/types/db';
import { Card, Chevron, Row } from '@/ui/components';
import { int } from '@/ui/format';

import { MEAL_LABELS, type HomeRouter } from './homeUtils';
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
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Meals</Text>
        <Pressable onPress={() => router.push('/diary')} hitSlop={8}>
          <Text style={styles.sectionLink}>Diary</Text>
        </Pressable>
      </View>
      <Card>
        {MEAL_ORDER.map((meal, i) => {
          const items = today.filter((e) => e.meal_type === meal && e.status === 'logged');
          const kcal = mealConsumedKcal(today, meal);
          const empty = items.length === 0;
          return (
            <Row
              key={meal}
              first={i === 0}
              // A meal with food opens today's diary to see/edit it; an empty one goes to Add Food.
              onPress={() =>
                empty
                  ? router.push({ pathname: '/log', params: { meal, date: todayISO, origin: 'home' } })
                  : router.push({ pathname: '/diary', params: { date: todayISO } })
              }
              contentStyle={styles.mealRow}
            >
              <View style={styles.mealInfo}>
                <Text style={styles.mealName}>{MEAL_LABELS[meal]}</Text>
                <Text style={styles.mealSub} numberOfLines={1}>
                  {empty ? 'Nothing logged yet' : items.map((e) => e.food_name).join(' · ')}
                </Text>
              </View>
              {empty ? (
                <Text style={styles.mealAdd}>Add</Text>
              ) : (
                <Text style={styles.mealKcal}>
                  {int(kcal)}
                  <Text style={styles.mealKcalUnit}> kcal</Text>
                </Text>
              )}
              <Chevron />
            </Row>
          );
        })}
      </Card>
    </View>
  );
}
