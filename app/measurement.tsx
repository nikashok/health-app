import dayjs from 'dayjs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  deleteMeasurement,
  getMeasurement,
  getRecentMeasurements,
  saveMeasurement,
} from '@/db/measurements';
import { confirmDestructive, confirmProceed } from '@/lib/confirm';
import type { BodyMeasurement } from '@/types/db';
import {
  Card,
  Chevron,
  DestructiveButton,
  FieldRow,
  formScrollProps,
  GroupFooter,
  GroupHeader,
  PrimaryButton,
  Row,
} from '@/ui/components';
import { colors, type } from '@/ui/theme';
import { showError, showToast } from '@/ui/toast';

/** Plausible adult ranges; anything outside asks for confirmation before saving. */
const WEIGHT_RANGE = [25, 250] as const; // kg — same bounds as the Targets form
const WAIST_RANGE = [40, 200] as const; // cm

/**
 * Log a day's body measurements — weight + waist, once a day. Saving again overwrites
 * that day's entry (one row per day). Opened without a `date` it logs today; the Recent
 * rows reopen this screen with a `date` to correct or delete an earlier reading.
 * Local-first; saves and deletes are backed up to Supabase.
 */
export default function MeasurementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? today();
  const isToday = date === today();

  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [existing, setExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<BodyMeasurement[]>([]);

  // Reload on focus so the Recent list reflects a correction made on a pushed copy.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [m, r] = await Promise.all([getMeasurement(date), getRecentMeasurements(14)]);
        if (!active) return;
        setWeight(m?.weight_kg != null ? String(m.weight_kg) : '');
        setWaist(m?.waist_cm != null ? String(m.waist_cm) : '');
        setExisting(m != null && (m.weight_kg != null || m.waist_cm != null));
        setRecent(r);
      })();
      return () => {
        active = false;
      };
    }, [date])
  );

  // Last reading from an earlier day, shown as a placeholder so the previous value stays
  // visible on a day with nothing logged. It is a hint only — never saved implicitly.
  const prevWeight = lastBefore(recent, date, 'weight_kg');
  // The day being edited is already in the fields above, so Recent lists the other days.
  const others = recent.filter((m) => m.measured_on !== date);
  const prevWaist = lastBefore(recent, date, 'waist_cm');

  const w = parseFloat(weight);
  const wa = parseFloat(waist);
  const hasWeight = weight.trim() !== '' && w > 0;
  const hasWaist = waist.trim() !== '' && wa > 0;
  const canSave = (hasWeight || hasWaist) && !saving;

  function onSave() {
    if (!canSave) return;
    // A typo like 726 kg or 8.8 cm saves silently otherwise — ask first.
    const odd: string[] = [];
    if (hasWeight && (w < WEIGHT_RANGE[0] || w > WEIGHT_RANGE[1])) odd.push(`${round1(w)} kg`);
    if (hasWaist && (wa < WAIST_RANGE[0] || wa > WAIST_RANGE[1])) odd.push(`${round1(wa)} cm`);
    if (odd.length > 0) {
      confirmProceed(
        'Check this reading',
        `${odd.join(' and ')} looks unusual. Save it anyway?`,
        'Save',
        save
      );
      return;
    }
    save();
  }

  async function save() {
    setSaving(true);
    try {
      await saveMeasurement(date, {
        weight_kg: hasWeight ? round1(w) : null,
        waist_cm: hasWaist ? round1(wa) : null,
      });
      showToast('Reading saved');
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    confirmDestructive(
      'Delete reading?',
      `This removes the weight and waist logged for ${dayjs(date).format('D MMM')}.`,
      'Delete',
      async () => {
        try {
          await deleteMeasurement(date);
          showToast('Reading deleted');
          router.back();
        } catch (e) {
          showError(e, 'Couldn’t delete — try again');
        }
      }
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} {...formScrollProps}>
      <Text style={styles.dateLabel}>{dateLabel(date)}</Text>

      <GroupHeader style={styles.firstHeader}>Measurements</GroupHeader>
      <Card>
        <FieldRow label="Weight" labelStyle={styles.label} suffix="kg" first minHeight={50}>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            placeholder="—"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.leaf}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
          />
        </FieldRow>
        <FieldRow label="Waist" labelStyle={styles.label} suffix="cm" minHeight={50}>
          <TextInput
            style={styles.input}
            value={waist}
            onChangeText={setWaist}
            placeholder="—"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.leaf}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
          />
        </FieldRow>
      </Card>
      <GroupFooter>
        {lastLine(prevWeight, prevWaist)}
        {isToday
          ? 'Logged once a day — saving again updates today’s entry.'
          : 'Saving replaces this day’s reading.'}
      </GroupFooter>

      <PrimaryButton
        title={saving ? 'Saving…' : 'Save'}
        onPress={onSave}
        disabled={!canSave}
        hint={!saving ? 'Enter your weight or waist to save.' : null}
        style={styles.save}
      />
      {existing ? (
        <DestructiveButton title="Delete Reading" onPress={onDelete} style={styles.delete} />
      ) : null}

      {others.length > 0 ? (
        <>
          <GroupHeader style={styles.recentHeader}>Recent</GroupHeader>
          <Card>
            {others.map((m, i) => (
              <Row
                key={m.measured_on}
                first={i === 0}
                onPress={() => router.push({ pathname: '/measurement', params: { date: m.measured_on } })}
              >
                <Text style={styles.histDate}>{dayjs(m.measured_on).format('ddd, D MMM')}</Text>
                <View style={styles.histVals}>
                  <Text style={styles.histVal}>{m.weight_kg != null ? `${m.weight_kg.toFixed(1)} kg` : '—'}</Text>
                  <Text style={styles.histVal}>{m.waist_cm != null ? `${m.waist_cm.toFixed(1)} cm` : '—'}</Text>
                  <Chevron style={styles.histChevron} />
                </View>
              </Row>
            ))}
          </Card>
          <GroupFooter>Tap a reading to correct or delete it.</GroupFooter>
        </>
      ) : null}
    </ScrollView>
  );
}

/** Newest reading of `key` recorded strictly before `date`. `recent` is newest-first. */
function lastBefore(
  recent: BodyMeasurement[],
  date: string,
  key: 'weight_kg' | 'waist_cm'
): { value: number; date: string } | null {
  for (const m of recent) {
    const v = m[key];
    if (m.measured_on < date && v != null) return { value: v, date: m.measured_on };
  }
  return null;
}

/**
 * "Last: 77.7 kg on Mon 2 Nov · 89.4 cm on Tue 27 Oct. " — the previous readings as
 * plain text, instead of greyed placeholder text that looks like an entered value.
 */
function lastLine(
  w: { value: number; date: string } | null,
  waist: { value: number; date: string } | null
): string {
  const parts = [
    w ? `${w.value.toFixed(1)} kg on ${dayjs(w.date).format('ddd D MMM')}` : null,
    waist ? `${waist.value.toFixed(1)} cm on ${dayjs(waist.date).format('ddd D MMM')}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `Last: ${parts.join(' · ')}. ` : '';
}

function today(): string {
  return dayjs().format('YYYY-MM-DD');
}
function dateLabel(date: string): string {
  if (date === today()) return 'Today';
  if (date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return 'Yesterday';
  return dayjs(date).format('ddd, D MMM YYYY');
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  dateLabel: { ...type.title2, color: colors.ink, paddingHorizontal: 4 },
  firstHeader: { marginTop: 18 },
  label: { color: colors.good, fontWeight: '600' },
  input: {
    ...type.headline,
    color: colors.ink,
    width: 96, // fixed: a web <input> otherwise takes its default ~20ch width and clips the unit
    textAlign: 'right',
    paddingVertical: 0,
  },
  save: { marginTop: 24 },
  delete: { marginTop: 8 },
  recentHeader: { marginTop: 28 },
  histDate: { ...type.subhead, color: colors.muted },
  histVals: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  histVal: {
    ...type.subhead,
    color: colors.ink,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    minWidth: 60,
    textAlign: 'right',
  },
  histChevron: { marginLeft: -8 },
});
