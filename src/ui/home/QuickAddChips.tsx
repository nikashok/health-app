import { Pressable, ScrollView, Text, View } from 'react-native';

import { MEAL_ORDER, mealConsumedKcal } from '@/calc/dayTotals';
import type { LogEntry } from '@/types/db';

import { inferMeal, MEAL_LABELS, type HomeRouter } from './homeUtils';
import { styles } from './styles';

/** Horizontal "Quick add" row: a primary Log-food chip plus a chip per logged meal. */
export function QuickAddChips({
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
  );
}
