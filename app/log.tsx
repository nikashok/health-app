import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { lastMeal, samePattern, usualMeal, type MealPattern, type PatternEntry } from '@/calc/foodPatterns';
import { addDays } from '@/calc/insights';
import { listFavorites, type FavoriteFood } from '@/db/favorites';
import { getPatternEntries } from '@/db/insights';
import {
  deleteLogEntries,
  deleteLogEntry,
  getEntriesForDate,
  getRecentFoodsForMeal,
  type RecentFood,
} from '@/db/logEntries';
import { portionText, quickLog, quickLogMany } from '@/db/quickLog';
import { getFoodBoosts, getOwnServings, searchAll, type OwnServing, type SearchResult } from '@/db/search';
import { tableToKind, type FoodKind } from '@/db/searchSql';
import type { FoodTable, MealType } from '@/types/db';
import { BottomAction, Card, GroupFooter, GroupHeader, PrimaryButton, Segmented } from '@/ui/components';
import { displayFoodName } from '@/ui/foodName';
import { int, numberText } from '@/ui/format';
import { Icon } from '@/ui/icons';
import { MEAL_LABELS, MEAL_OPTS } from '@/ui/meals';
import { colors, radius, type } from '@/ui/theme';
import { showError, showToast } from '@/ui/toast';

/** Something that can be re-logged in one tap: a recent food or a favourite. */
interface QuickFood {
  key: string;
  food_table: FoodTable;
  food_code: string | null;
  food_name: string;
  measure_name: string | null;
  quantity: number | null;
  kcal: number | null;
}

const fromRecent = (r: RecentFood): QuickFood => ({
  key: `${r.food_table}:${r.food_code ?? r.food_name}`,
  food_table: r.food_table,
  food_code: r.food_code,
  food_name: r.food_name,
  measure_name: r.measure_name,
  quantity: r.quantity,
  kcal: r.kcal ?? null,
});
const fromFavorite = (f: FavoriteFood): QuickFood => ({
  key: f.fav_key,
  food_table: f.food_table,
  food_code: f.food_code,
  food_name: f.food_name,
  measure_name: f.measure_name,
  quantity: f.quantity,
  kcal: f.kcal,
});

export default function LogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `origin` ('home') tells Log Entry where to return after saving.
  const params = useLocalSearchParams<{ meal?: MealType; date?: string; origin?: string }>();
  const origin = params.origin;
  const date = params.date ?? today();
  const isPlan = date > today();

  // The meal is chosen here, where the one-tap actions log, as well as on Log Entry.
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'breakfast');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [servings, setServings] = useState<Map<string, OwnServing>>(new Map());
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [history, setHistory] = useState<PatternEntry[]>([]);
  const [startedMeals, setStartedMeals] = useState<Set<MealType>>(new Set());
  const [boosts, setBoosts] = useState<Map<string, number>>(new Map());
  const [searching, setSearching] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([
        getRecentFoodsForMeal(meal, addDays(today(), -60)),
        getFoodBoosts(),
        listFavorites(),
        getPatternEntries(addDays(date, -60), date),
        getEntriesForDate(date),
      ]).then(([r, b, f, h, day]) => {
        if (!active) return;
        setRecents(r);
        setBoosts(b);
        setFavorites(f);
        setHistory(h);
        setStartedMeals(new Set(day.map((e) => e.meal_type)));
      });
      return () => {
        active = false;
      };
    }, [meal, date])
  );

  // Your usual meal and the last time you had it — offered only while this meal is empty.
  const shortcuts = useMemo(() => {
    if (startedMeals.has(meal)) return { usual: null, last: null };
    return { usual: usualMeal(history, meal, date), last: lastMeal(history, meal, date) };
  }, [history, meal, date, startedMeals]);

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

  /** "+" on a recent food or favourite: log its last portion now; the toast offers Undo. */
  async function quickAdd(item: QuickFood) {
    if (!item.food_code) return;
    const kind = tableToKind(item.food_table);
    if (!item.measure_name || !item.quantity) {
      openFood(item.food_code, kind); // never logged yet — choose a portion first
      return;
    }
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
      setJustAdded(item.key);
      setStartedMeals((s) => new Set(s).add(meal));
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
                  setJustAdded((k) => (k === item.key ? null : k));
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

  /** "Log all" on a usual / repeated meal: every item at once, then back, with Undo. */
  async function logPattern(p: MealPattern, what: string) {
    try {
      const r = await quickLogMany(
        p.items.map((i) => ({
          code: i.food_code,
          kind: tableToKind(i.food_table),
          measureName: i.measure_name,
          quantity: i.quantity,
        })),
        meal,
        date,
        isPlan
      );
      if (r.ids.length === 0) {
        showToast('Those foods are no longer available', { tone: 'error' });
        return;
      }
      const n = r.ids.length;
      showToast(
        `${isPlan ? 'Planned' : 'Logged'} ${what} · ${n} ${n === 1 ? 'item' : 'items'} · ${int(r.kcal)} kcal` +
          (r.skipped > 0 ? ` (${r.skipped} no longer available)` : ''),
        {
          action: {
            label: 'Undo',
            onPress: () =>
              deleteLogEntries(r.ids)
                .then(() => showToast('Removed'))
                .catch((e) => showError(e, 'Couldn’t undo — delete them from the Diary')),
          },
        }
      );
      if (router.canGoBack()) router.back();
    } catch (e) {
      showError(e);
    }
  }

  const trimmed = query.trim();
  const quick = recents.map(fromRecent);
  const favs = favorites.map(fromFavorite);
  const showHome = trimmed.length === 0;
  const noMatch = trimmed.length > 0 && !searching && results.length === 0;
  const mealWord = MEAL_LABELS[meal].toLowerCase();
  const verb = isPlan ? 'Plan all' : 'Log all';

  const header = (
    <>
      <MealShortcuts
        usual={shortcuts.usual}
        last={shortcuts.last}
        date={date}
        mealWord={mealWord}
        verb={verb}
        onLog={logPattern}
      />
      {favs.length > 0 ? (
        <>
          <GroupHeader>Favourites</GroupHeader>
          <Card>
            {favs.map((f, i) => (
              <View key={f.key} style={[styles.inlineRow, i > 0 && styles.cardRowDivider]}>
                <QuickRow
                  item={f}
                  added={justAdded === f.key}
                  onOpen={() => openFood(f.food_code, tableToKind(f.food_table))}
                  onAdd={() => quickAdd(f)}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}
      {quick.length > 0 ? <GroupHeader>Recent</GroupHeader> : null}
    </>
  );

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

      {showHome ? (
        <FlatList
          data={quick}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={header}
          ListEmptyComponent={
            favs.length === 0 && !shortcuts.usual && !shortcuts.last ? (
              <GroupHeader>Start typing to search</GroupHeader>
            ) : null
          }
          ListFooterComponent={
            quick.length > 0 ? (
              <GroupFooter>
                Foods you have at this meal come first. Tap + to log the same portion again.
              </GroupFooter>
            ) : null
          }
          renderItem={({ item, index }) => (
            <CardRow first={index === 0} last={index === quick.length - 1}>
              <QuickRow
                item={item}
                added={justAdded === item.key}
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
          ListHeaderComponent={<GroupHeader>Search results</GroupHeader>}
          ListEmptyComponent={
            !searching ? (
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

/** "Your usual breakfast" and "Repeat yesterday's breakfast", each with Log all. */
function MealShortcuts({
  usual,
  last,
  date,
  mealWord,
  verb,
  onLog,
}: {
  usual: MealPattern | null;
  last: MealPattern | null;
  date: string;
  mealWord: string;
  verb: string;
  onLog: (p: MealPattern, what: string) => void;
}) {
  const showLast = last != null && !samePattern(usual, last);
  if (!usual && !showLast) return null;
  const lastTitle =
    last && last.date === addDays(date, -1)
      ? `Repeat yesterday’s ${mealWord}`
      : last
        ? `Repeat ${mealWord} from ${dayjs(last.date).format('ddd D MMM')}`
        : '';
  return (
    <>
      <GroupHeader>{`Quick ${mealWord}`}</GroupHeader>
      <Card>
        {usual ? (
          <ShortcutRow
            first
            title={`Your usual ${mealWord}`}
            pattern={usual}
            detail={`${usual.days} times in the last 60 days`}
            verb={verb}
            onLog={() => onLog(usual, `usual ${mealWord}`)}
          />
        ) : null}
        {showLast && last ? (
          <ShortcutRow
            first={!usual}
            title={lastTitle}
            pattern={last}
            verb={verb}
            onLog={() => onLog(last, mealWord)}
          />
        ) : null}
      </Card>
    </>
  );
}

function ShortcutRow({
  first,
  title,
  pattern,
  detail,
  verb,
  onLog,
}: {
  first: boolean;
  title: string;
  pattern: MealPattern;
  detail?: string;
  verb: string;
  onLog: () => void;
}) {
  const names = pattern.items.map((i) => displayFoodName(i.food_name, i.food_table)).join(' · ');
  return (
    <View style={[styles.inlineRow, !first && styles.cardRowDivider]}>
      <View style={styles.shortcut}>
        <View style={styles.shortcutMain}>
          <Text style={styles.shortcutTitle}>{title}</Text>
          <Text style={styles.meta} numberOfLines={2}>
            {names}
          </Text>
          <Text style={styles.meta}>
            ≈ {int(pattern.kcal)} kcal{detail ? ` · ${detail}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onLog}
          style={({ pressed }) => [styles.logAll, pressed && styles.addBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${verb}: ${title}, ${names}`}
        >
          <Text style={styles.logAllText}>{verb}</Text>
        </Pressable>
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
    <View style={[styles.cardRow, first && styles.cardRowFirst, last && styles.cardRowLast]}>
      <View style={[styles.cardRowInner, !first && styles.cardRowDivider]}>{children}</View>
    </View>
  );
}

function QuickRow({
  item,
  added,
  onOpen,
  onAdd,
}: {
  item: QuickFood;
  added: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const name = displayFoodName(item.food_name, item.food_table);
  const portion =
    item.measure_name && item.quantity ? portionText(item.measure_name, item.quantity) : null;
  return (
    <View style={styles.recentRow}>
      <Pressable
        style={({ pressed }) => [styles.recentMain, pressed && styles.rowPressed]}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${name}${portion ? `, last ${portion}` : ''}. Choose a portion`}
      >
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.meta}>
          {portion
            ? `${portion}${item.kcal != null ? ` · ${int(item.kcal)} kcal` : ''}`
            : 'Not logged yet — tap to choose a portion'}
        </Text>
      </Pressable>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.addBtn, added && styles.addBtnDone, pressed && styles.addBtnPressed]}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={portion ? `Log ${portion} ${name} now` : `Choose a portion of ${name}`}
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
  inlineRow: { marginLeft: 16 },
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
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingRight: 12 },
  shortcutMain: { flex: 1, minWidth: 0, gap: 2 },
  shortcutTitle: { ...type.headline, color: colors.ink },
  logAll: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.leaf,
    justifyContent: 'center',
  },
  logAllText: { ...type.subhead, fontWeight: '600', color: '#ffffff' },
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
