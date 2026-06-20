import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { Card, Chevron, GroupHeader, PrimaryButton, Row } from '@/ui/components';
import { numberText } from '@/ui/format';
import { colors, radius, type } from '@/ui/theme';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export default function LogScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: MealType; date?: string }>();
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

  function openFood(code: string | null, kind: FoodKind) {
    if (!code) return;
    router.push({ pathname: '/log-entry', params: { code, table: kind, meal, date } });
  }

  function openCustom() {
    router.push({ pathname: '/custom-food', params: { meal, date } });
  }

  const trimmed = query.trim();
  const showRecents = trimmed.length === 0 && recents.length > 0;
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
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable style={styles.clear} onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.clearText}>✕</Text>
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
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => `${item.food_table}:${item.food_code ?? item.food_name}`}
          ListHeaderComponent={<GroupHeader>Recently logged</GroupHeader>}
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
                <PrimaryButton title="Add custom food" onPress={openCustom} style={styles.emptyButton} />
              </Card>
            ) : null
          }
          renderItem={({ item, index }) => (
            <CardRow first={index === 0} last={index === results.length - 1}>
              <ResultRow item={item} onPress={openFood} />
            </CardRow>
          )}
        />
      )}

      <View style={styles.footer}>
        <PrimaryButton title="＋  Custom food" onPress={openCustom} />
      </View>
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
      style={[
        styles.cardRow,
        first && styles.cardRowFirst,
        last && styles.cardRowLast,
        !first && styles.cardRowDivider,
      ]}
    >
      {children}
    </View>
  );
}

function RecentRow({
  item,
  onPress,
}: {
  item: RecentFood;
  onPress: (code: string | null, kind: FoodKind) => void;
}) {
  return (
    <Pressable style={styles.row} onPress={() => onPress(item.food_code, tableToKind(item.food_table))}>
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={2}>{item.food_name}</Text>
        <Text style={styles.meta}>Last: {item.quantity} × {item.measure_name}</Text>
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
    <Pressable style={styles.row} onPress={() => onPress(item.code, item.kind)}>
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.meta}>
          {kindLabel(item.kind)} · {numberText(item.energy_kcal)} Cal/100g
        </Text>
      </View>
      <Chevron />
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
  header: { marginBottom: 10 },
  subtitle: { ...type.subhead, color: colors.muted },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fillStrong,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  searchIcon: { fontSize: 19, color: colors.faint, marginRight: 4 },
  input: { flex: 1, paddingVertical: 11, fontSize: 17, color: colors.ink },
  clear: { paddingHorizontal: 6, paddingVertical: 8 },
  clearText: { color: colors.faint, fontSize: 15, fontWeight: '600' },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  searchingText: { ...type.footnote, color: colors.muted },
  listContent: { paddingTop: 12, paddingBottom: 96 },
  cardRow: { backgroundColor: colors.surface, marginHorizontal: 0 },
  cardRowFirst: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  cardRowLast: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  cardRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 60,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  rowMain: { flex: 1, paddingRight: 10 },
  name: { ...type.body, color: colors.ink, lineHeight: 21 },
  meta: { ...type.footnote, color: colors.muted, marginTop: 2 },
  emptyCard: { padding: 18, marginTop: 4 },
  emptyTitle: { ...type.title3, color: colors.ink },
  emptyBody: { ...type.subhead, color: colors.muted, marginTop: 6, lineHeight: 20 },
  emptyButton: { marginTop: 16 },
  footer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
});
