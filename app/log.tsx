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

import { getRecentFoods, type RecentFood } from '@/db/logEntries';
import { searchAll, type SearchResult } from '@/db/search';
import { tableToKind, type FoodKind } from '@/db/searchSql';
import type { MealType } from '@/types/db';
import { BottomAction, Card, Chevron, GroupFooter, GroupHeader, PrimaryButton } from '@/ui/components';
import { numberText } from '@/ui/format';
import { MEAL_LABELS } from '@/ui/meals';
import { colors, radius, type } from '@/ui/theme';


export default function LogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `origin` ('home') tells Log Entry where to return after saving.
  const params = useLocalSearchParams<{ meal?: MealType; date?: string; origin?: string }>();
  const origin = params.origin;
  const meal: MealType = params.meal ?? 'breakfast';
  const date = params.date ?? today();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [searching, setSearching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getRecentFoods().then(setRecents);
    }, [])
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
      const r = await searchAll(term);
      if (!cancelled) {
        setResults(r);
        setSearching(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query]);

  /** `last` prefills a recent food with the measure and quantity it was last logged in. */
  function openFood(code: string | null, kind: FoodKind, last?: RecentFood) {
    if (!code) return;
    router.push({
      pathname: '/log-entry',
      params: {
        code,
        table: kind,
        meal,
        date,
        ...(origin ? { origin } : {}),
        ...(last ? { lastMeasure: last.measure_name, lastQty: String(last.quantity) } : {}),
      },
    });
  }

  function openCustom() {
    router.push({ pathname: '/custom-food', params: { meal, date, ...(origin ? { origin } : {}) } });
  }

  const trimmed = query.trim();
  const showRecents = trimmed.length === 0 && recents.length > 0;
  const noMatch = trimmed.length > 0 && !searching && results.length === 0;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          {MEAL_LABELS[meal]} · {dayjs(date).format('D MMM')}
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
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
        />
        {query.length > 0 ? (
          <Pressable
            style={styles.clearHit}
            onPress={() => setQuery('')}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <View style={styles.clear}>
              <Text style={styles.clearText}>✕</Text>
            </View>
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
          keyExtractor={(item) => `${item.food_table}:${item.food_code ?? item.food_name}`}
          ListHeaderComponent={<GroupHeader>Recently logged</GroupHeader>}
          ListFooterComponent={<SearchNote />}
          renderItem={({ item, index }) => (
            <CardRow first={index === 0} last={index === recents.length - 1}>
              <RecentRow item={item} onPress={openFood} />
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
          ListFooterComponent={results.length > 0 ? <SearchNote /> : null}
          renderItem={({ item, index }) => (
            <CardRow first={index === 0} last={index === results.length - 1}>
              <ResultRow item={item} onPress={openFood} />
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
    <View
      style={[styles.cardRow, first && styles.cardRowFirst, last && styles.cardRowLast]}
    >
      <View style={[styles.cardRowInner, !first && styles.cardRowDivider]}>{children}</View>
    </View>
  );
}

function RecentRow({
  item,
  onPress,
}: {
  item: RecentFood;
  onPress: (code: string | null, kind: FoodKind, last?: RecentFood) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(item.food_code, tableToKind(item.food_table), item)}
    >
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={2}>{item.food_name}</Text>
        <Text style={styles.meta}>
          Last:{' '}
          {item.measure_name === 'grams'
            ? `${Math.round(item.quantity)} g`
            : `${item.quantity} × ${item.measure_name}`}
        </Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

function ResultRow({
  item,
  onPress,
}: {
  item: SearchResult;
  onPress: (code: string | null, kind: FoodKind) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(item.code, item.kind)}
    >
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.meta}>
          {kindLabel(item.kind)} · <Text style={styles.metaKcal}>{numberText(item.energy_kcal)}</Text> kcal/100g
        </Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

function SearchNote() {
  return (
    <GroupFooter>
      Searching your offline food database. Can’t find it? Save it once as a custom food.
    </GroupFooter>
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
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 4, backgroundColor: colors.bg },
  header: { paddingHorizontal: 4 },
  subtitle: { ...type.subhead, color: colors.muted },
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
  searchIcon: { fontSize: 19, color: colors.muted },
  input: { flex: 1, height: 40, fontSize: 17, color: colors.ink },
  clearHit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  clear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { color: '#000000', fontSize: 11, fontWeight: '700' },
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
  rowPressed: { opacity: 0.6 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.body, color: colors.ink },
  meta: { ...type.footnote, color: colors.muted },
  metaKcal: { color: colors.energy },
  emptyCard: { padding: 18, marginTop: 4 },
  emptyTitle: { ...type.title3, color: colors.ink },
  emptyBody: { ...type.subhead, color: colors.muted, marginTop: 6, lineHeight: 20 },
  emptyButton: { marginTop: 16 },
});
