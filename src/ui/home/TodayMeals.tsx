import { Pressable, Text, View } from 'react-native';

import { MEAL_ORDER, mealConsumedKcal } from '@/calc/dayTotals';
import type { LogEntry, MealType } from '@/types/db';
import { Card, Row } from '@/ui/components';
import { int } from '@/ui/format';
import { displayFoodName } from '@/ui/foodName';
import { Icon } from '@/ui/icons';
import { MEAL_LABELS } from '@/ui/meals';
import { colors } from '@/ui/theme';

import type { HomeRouter } from './homeUtils';
import { styles } from './styles';

const names = (entries: LogEntry[]) =>
  entries.map((e) => displayFoodName(e.food_name, e.food_table)).join(' · ');

/**
 * Today's meals. Each row shows what was eaten (kcal counts logged food only), any plans
 * for that meal with an "Ate it" to confirm them, and a "+" that goes straight to Add
 * Food for that meal. Tapping a meal with food opens today in the Diary.
 */
export function TodayMeals({
  today,
  todayISO,
  usual,
  router,
  onConfirmMeal,
}: {
  today: LogEntry[];
  todayISO: string;
  /** Usual foods per meal, shown on empty rows ("Usual: poha · chai"); + logs them in one more tap. */
  usual: Partial<Record<MealType, string>>;
  router: HomeRouter;
  onConfirmMeal: (meal: MealType) => void;
}) {
  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Meals</Text>
      </View>
      <Card>
        {MEAL_ORDER.map((meal, i) => {
          const logged = today.filter((e) => e.meal_type === meal && e.status === 'logged');
          const planned = today.filter((e) => e.meal_type === meal && e.status === 'planned');
          const kcal = mealConsumedKcal(today, meal);
          const empty = logged.length === 0 && planned.length === 0;
          const label = MEAL_LABELS[meal];
          const add = () =>
            router.push({ pathname: '/log', params: { meal, date: todayISO, origin: 'home' } });
          const open = () =>
            router.push({ pathname: '/diary', params: { date: todayISO, at: String(Date.now()) } });
          return (
            // A plain container: "open", "Ate it" and "+" are sibling buttons (never nested).
            <Row key={meal} first={i === 0} contentStyle={styles.mealRow}>
              <Pressable
                onPress={empty ? add : open}
                style={({ pressed }) => [styles.mealOpen, pressed && styles.mealOpenPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${
                  logged.length > 0 ? `${names(logged)}, ${int(kcal)} kcal` : 'nothing logged'
                }${planned.length > 0 ? `; planned ${names(planned)}` : ''}. ${empty ? 'Add food' : 'Open in Diary'}`}
              >
                <View style={styles.mealInfo}>
                  <Text style={styles.mealName}>{label}</Text>
                  {logged.length > 0 || planned.length === 0 ? (
                    <Text style={styles.mealSub} numberOfLines={1}>
                      {logged.length > 0
                        ? names(logged)
                        : usual[meal]
                          ? `Usual: ${usual[meal]}`
                          : 'Nothing logged yet'}
                    </Text>
                  ) : null}
                  {planned.length > 0 ? (
                    <Text style={styles.mealPlanned} numberOfLines={1}>
                      Planned: {names(planned)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.mealRight}>
                {kcal > 0 ? (
                  <Text style={styles.mealKcal}>
                    {int(kcal)}
                    <Text style={styles.mealKcalUnit}> kcal</Text>
                  </Text>
                ) : null}
                {planned.length > 0 ? (
                  <Pressable
                    onPress={() => onConfirmMeal(meal)}
                    style={styles.mealAteIt}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Ate it: planned ${label.toLowerCase()}`}
                  >
                    <Text style={styles.mealAteItText}>Ate it</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                onPress={add}
                style={({ pressed }) => [styles.mealAdd, pressed && styles.mealAddPressed]}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`Add food to ${label.toLowerCase()}`}
              >
                <Icon name="plus" size={18} color={colors.leaf} strokeWidth={2.4} />
              </Pressable>
            </Row>
          );
        })}
      </Card>
    </View>
  );
}
