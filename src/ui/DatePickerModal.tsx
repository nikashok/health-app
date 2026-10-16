/**
 * Month-grid date picker in a modal (no native dependency, so it works the same on iOS,
 * Android and web). Future dates are allowed — they are how plans are made.
 */
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, type } from './theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function DatePickerModal({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(() => dayjs(value).startOf('month'));
  useEffect(() => {
    if (visible) setMonth(dayjs(value).startOf('month'));
  }, [visible, value]);

  const todayISO = dayjs().format('YYYY-MM-DD');
  const lead = month.day(); // blanks before the 1st (Sunday-first grid)
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: month.daysInMonth() }, (_, i) => month.date(i + 1).format('YYYY-MM-DD')),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const pick = (d: string) => {
    onSelect(d);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close date picker">
        {/* Inner Pressable swallows taps so they don't close the sheet. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setMonth((m) => m.subtract(1, 'month'))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Text style={styles.nav}>‹</Text>
            </Pressable>
            <Text style={styles.month}>{month.format('MMMM YYYY')}</Text>
            <Pressable
              onPress={() => setMonth((m) => m.add(1, 'month'))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Text style={styles.nav}>›</Text>
            </Pressable>
          </View>

          <View style={styles.row}>
            {WEEKDAYS.map((d, i) => (
              <Text key={i} style={styles.weekday}>
                {d}
              </Text>
            ))}
          </View>

          {Array.from({ length: cells.length / 7 }, (_, r) => (
            <View key={r} style={styles.row}>
              {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
                if (!d) return <View key={i} style={styles.cell} />;
                const selected = d === value;
                const isToday = d === todayISO;
                return (
                  <Pressable
                    key={d}
                    onPress={() => pick(d)}
                    style={styles.cell}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={dayjs(d).format('dddd D MMMM')}
                  >
                    <View style={[styles.dayCircle, selected && styles.daySelected]}>
                      <Text
                        style={[
                          styles.day,
                          isToday && !selected && styles.dayToday,
                          selected && styles.dayTextSelected,
                        ]}
                      >
                        {dayjs(d).date()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Pressable onPress={() => pick(todayISO)} style={styles.todayBtn} accessibilityRole="button">
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  nav: { fontSize: 28, lineHeight: 32, color: colors.leaf, paddingHorizontal: 6 },
  month: { ...type.headline, color: colors.ink },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', ...type.footnote, color: colors.muted, paddingVertical: 6 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.leaf },
  day: { ...type.body, color: colors.ink },
  dayToday: { color: colors.leaf, fontWeight: '600' },
  dayTextSelected: { color: '#ffffff', fontWeight: '600' },
  todayBtn: { marginTop: 8, height: 44, alignItems: 'center', justifyContent: 'center' },
  todayText: { ...type.headline, color: colors.leaf },
});
