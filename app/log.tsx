import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { addDays } from '@/calc/insights';
import { deleteLogEntry, getRecentFoodsForMeal, type RecentFood } from '@/db/logEntries';
import { portionText, quickLog } from '@/db/quickLog';
import { getFoodBoosts, getOwnServings, searchAll, type OwnServing, type SearchResult } from '@/db/search';
import { tableToKind, type FoodKind } from '@/db/searchSql';
import type { MealType } from '@/types/db';
import { BottomAction, Card, GroupFooter, GroupHeader, PrimaryButton, Segmented } from '@/ui/components';
import { displayFoodName } from '@/ui/foodName';
import { int, numberText } from '@/ui/format';
import { Icon } from '@/ui/icons';
import { MEAL_OPTS } from '@/ui/meals';
import { colors, radius, type } from '@/ui/theme';
import { showError, showToast } from '@/ui/toast';

const recentKey = (r: RecentFood) => `${r.food_table}:${r.food_code ?? r.food_name}`;

export default function LogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `origin` ('home') tells Log Entry where to return after saving.
  const params = useLocalSearchParams<{ meal?: MealType; date?: string; origin?: string }>();
  const origin = params.origin;
  const date = params.date ?? today();
  const isPlan = date > today();

  // The meal is chosen here, where the one-tap "+" logs, as well as on Log Entry.
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'breakfast');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [servings, setServings] = useState<Map<string, OwnServing>>(new Map());
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [boosts, setBoosts] = useState<Map<string, number>>(new Map());
  const [searching, setSearching] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getRecentFoodsForMeal(meal, addDays(today(), -60)), getFoodBoosts()]).then(
        ([r, b]) => {
          if (!active) return;
          setRecents(r);
          setBoosts(b);
        }
      );
      return () => {
        active = false;
      };
    }, [meal])
  );

  useEffect(() => {
    let cancelled = false;
    const h = setTimeout(async () => {
      const term = query.trim();
      if (!term) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const r = await searchAll(term, { boosts });
      const own = await getOwnServings(r.filter((x) => x.kind === 'cooked').map((x) => x.code));
      if (!cancelled) {
        setResults(r);
        setServings(own);
        setSearching(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query, boosts]);

  function openFood(code: string | null, kind: FoodKind) {
    if (!code) return;
    router.push({
      pathname: '/log-entry',
      params: { code, table: kind, meal, date, ...(origin ? { origin } : {}) },
    });
  }

  function openCustom() {
    router.push({ pathname: '/custom-food', params: { meal, date, ...(origin ? { origin } : {}) } });
  }

  /** "+" on a recent food: log it now with its last portion; the toast offers Undo. */
  async function quickAdd(item: RecentFood) {
    if (!item.food_code) return;
    const kind = tableToKind(item.food_table);
    try {
      const r = await quickLog(
        { code: item.food_code, kind, measureName: item.measure_name, quantity: item.quantity },
        meal,
        date,
        isPlan
      );
      if (!r) {
        openFood(item.food_code, kind); // its measure is gone — choose a portion instead
        return;
      }
      const key = recentKey(item);
      setJustAdded(key);
      showToast(
        `${isPlan ? 'Planned' : 'Logged'} ${displayFoodName(r.food.name, r.food.kind)} · ${portionText(
          r.measureName,
          r.quantity
        )} · ${int(r.kcal)} kcal`,
        {
          action: {
            label: 'Undo',
            onPress: () =>
              deleteLogEntry(r.id)
                .then(() => {
                  setJustAdded((k) => (k === key ? null : k));
                  showToast('Removed');
                })
                .catch((e) => showError(e, 'Couldn’t undo — delete it from the Diary')),
          },
        }
      );
    } catch (e) {
      showError(e);
    }
  }

  const trimmed = query.trim();
  const showRecents = trimmed.length === 0 && recents.length > 0;
  const noMatch = trimmed.length > 0 && !searching && results.length === 0;
  return (
    <View style={styles.container}>
      <Segmented options={MEAL_OPTS} value={meal} onChange={setMeal} />
      <Text style={styles.subtitle}>
        {isPlan
          ? `Planning for ${dayjs(date).format('ddd D MMM')}`
          : date === today()
            ? `Today · ${dayjs(date).format('D MMM')}`
            : dayjs(date).format('ddd D MMM')}
      </Text>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholder="Search dishes, rice, dal, curd…"
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.leaf}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          accessibilityLabel="Search foods"
        />
        {query.length > 0 ? (
          <Pressable
            style={styles.clearHit}
            onPress={() => setQuery('')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="clear" size={18} color={colors.lineStrong} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <View style={styles.searching}>
          <ActivityIndicator color={colors.leaf} />
          <Text style={styles.searchingText}>Searching your offline food database</Text>
        </View>
      ) : null}

      {showRecents ? (
        <FlatList
          data={recents}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          keyExtractor={recentKey}
          ListHeaderComponent={<GroupHeader>Recent</GroupHeader>}
          ListFooterComponent={
            <GroupFooter>
              Foods you have at this meal come first. Tap + to log the same portion again.
            </GroupFooter>
          }
          renderItem={({ item, index }) => (
            <CardRow first={index === 0} last={index === recents.length - 1}>
              <RecentRow
                item={item}
                added={justAdded === recentKey(item)}
                onOpen={() => openFood(item.food_code, tableToKind(item.food_table))}
                onAdd={() => quickAdd(item)}
              />
            </CardRow>
          )}
        />
      ) : (
        <FlatList
          data={results}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => `${item.kind}:${item.code}`}
          ListHeaderComponent={
            <GroupHeader>{trimmed ? 'Search results' : 'Start typing to search'}</GroupHeader>
          }
          ListEmptyComponent={
            trimmed && !searching ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No match found</Text>
                <Text style={styles.emptyBody}>
                  Save it once as a custom food, then it will appear in search.
                </Text>
                <PrimaryButton title="Add Custom Food" onPress={openCustom} style={styles.emptyButton} />
              </Card>
            ) : null
          }
          ListFooterComponent={
            results.length > 0 ? (
              <GroupFooter>Can’t find it? Save it once as a custom food.</GroupFooter>
            ) : null
          }
          renderItem={({ item, index }) => (
            <CardRow first={index === 0} last={index === results.length - 1}>
              <ResultRow item={item} serving={servings.get(item.code)} onPress={openFood} />
            </CardRow>
          )}
        />
      )}

      {/* The no-match card already offers "Add Custom Food" — don't show it twice. */}
      {noMatch ? null : (
        <BottomAction
          title="Custom Food"
          variant="secondary"
          onPress={openCustom}
          insetBottom={insets.bottom}
        />
      )}
    </View>
  );
}

/** Wraps a list item so the whole FlatList reads as one rounded grouped card. */
function CardRow({
  children,
  first,
  last,
}: {
  children: React.ReactNode;
  first: boolean;
  last: boolean;
}) {
  return (
    <View style={[styles.cardRow, first && styles.cardRowFirst, last && styles.cardRowLast]}>
      <View style={[styles.cardRowInner, !first && styles.cardRowDivider]}>{children}</View>
    </View>
  );
}

function RecentRow({
  item,
  added,
  onOpen,
  onAdd,
}: {
  item: RecentFood;
  added: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const name = displayFoodName(item.food_name, item.food_table);
  const portion = portionText(item.measure_name, item.quantity);
  return (
    <View style={styles.recentRow}>
      <Pressable
        style={({ pressed }) => [styles.recentMain, pressed && styles.rowPressed]}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${name}, last ${portion}. Choose a portion`}
      >
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.meta}>
          {portion}
          {item.kcal != null ? ` · ${int(item.kcal)} kcal` : ''}
        </Text>
      </Pressable>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.addBtn, added && styles.addBtnDone, pressed && styles.addBtnPressed]}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Log ${portion} ${name} now`}
      >
        <Icon name={added ? 'check' : 'plus'} size={18} color={added ? colors.good : colors.leaf} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

function ResultRow({
  item,
  serving,
  onPress,
}: {
  item: SearchResult;
  serving?: OwnServing;
  onPress: (code: string | null, kind: FoodKind) => void;
}) {
  const name = displayFoodName(item.name, item.kind);
  // Per serving when the dish has one (per-100 g × serving grams — the same math as logging).
  const perServing =
    serving && item.energy_kcal != null
      ? `1 ${serving.measure_name} ≈ ${int((item.energy_kcal * serving.grams_per_unit) / 100)} kcal`
      : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(item.code, item.kind)}
      accessibilityRole="button"
    >
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.meta}>
          {kindLabel(item.kind)} ·{' '}
          {perServing ?? (
            <>
              <Text style={styles.metaKcal}>{numberText(item.energy_kcal)}</Text> kcal/100 g
            </>
          )}
        </Text>
      </View>
      <View style={styles.chevron}>
        <Icon name="chevron-right" size={14} color={colors.chevron} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

function kindLabel(kind: FoodKind): string {
  if (kind === 'cooked') return 'Dish';
  if (kind === 'custom') return 'Custom';
  return 'Raw ingredient';
}

function today(): string {
  return dayjs().format('YYYY-MM-DD');
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8, backgroundColor: colors.bg },
  subtitle: { ...type.footnote, color: colors.muted, marginTop: 8, marginLeft: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 10,
  },
  input: { flex: 1, height: 40, fontSize: 17, color: colors.ink },
  clearHit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12 },
  searchingText: { ...type.footnote, color: colors.muted },
  listContent: { paddingBottom: 140 },
  cardRow: { backgroundColor: colors.surface, overflow: 'hidden' },
  cardRowFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  cardRowLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  cardRowInner: { marginLeft: 16 },
  cardRowDivider: { borderTopWidth: 0.5, borderTopColor: colors.separator },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    paddingVertical: 10,
    paddingRight: 16,
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingRight: 12 },
  recentMain: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 10 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDone: { backgroundColor: 'rgba(48,209,88,0.16)' },
  addBtnPressed: { opacity: 0.7 },
  rowPressed: { opacity: 0.6 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  chevron: { marginLeft: 8 },
  name: { ...type.body, color: colors.ink },
  meta: { ...type.footnote, color: colors.muted },
  metaKcal: { color: colors.energy },
  emptyCard: { padding: 18, marginTop: 4 },
  emptyTitle: { ...type.title3, color: colors.ink },
  emptyBody: { ...type.subhead, color: colors.muted, marginTop: 6, lineHeight: 20 },
  emptyButton: { marginTop: 16 },
});
