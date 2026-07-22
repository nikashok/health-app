import dayjs from 'dayjs';
import { Modal, Pressable, Text, View } from 'react-native';

import type { BodyMeasurement } from '@/types/db';
import { dark as D } from '@/ui/theme';

import { inferMeal, latestMeasured, type HomeRouter } from './homeUtils';
import { styles } from './styles';

/** Bottom-sheet of quick-add tiles (log food, weight, waist, diary). */
export function QuickAddSheet({
  visible,
  onClose,
  allMeasurements,
  todayISO,
  router,
  insetsBottom,
}: {
  visible: boolean;
  onClose: () => void;
  allMeasurements: BodyMeasurement[];
  todayISO: string;
  router: HomeRouter;
  insetsBottom: number;
}) {
  // Last recorded reading, not just today's — the tiles always show something once logged.
  const weight = latestMeasured(allMeasurements, 'weight_kg');
  const waist = latestMeasured(allMeasurements, 'waist_cm');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: 20 + insetsBottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>Quick add</Text>
            <Pressable style={styles.sheetCloseBtn} onPress={onClose}>
              <Text style={styles.sheetCloseX}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.quickGrid}>
            <QuickTile
              label="Log food"
              sub="Search database"
              iconBg={`${D.accent}4d`}
              iconColor={D.accent}
              tileBg={`${D.accent}24`}
              tileBorder={`${D.accent}66`}
              onPress={() => {
                onClose();
                router.push({
                  pathname: '/log',
                  params: { meal: inferMeal(), date: todayISO },
                });
              }}
            />
            <QuickTile
              label="Weight"
              sub={weight ? `${weight.value} kg · ${dayLabel(weight.date, todayISO)}` : 'Log today'}
              iconBg="rgba(59,201,255,0.18)"
              iconColor="#3bc9ff"
              tileBg="rgba(255,255,255,0.05)"
              tileBorder="rgba(255,255,255,0.08)"
              onPress={() => {
                onClose();
                router.push({ pathname: '/measurement', params: { date: todayISO } });
              }}
            />
            <QuickTile
              label="Waist"
              sub={waist ? `${waist.value} cm · ${dayLabel(waist.date, todayISO)}` : 'Log today'}
              iconBg="rgba(52,224,161,0.18)"
              iconColor="#34e0a1"
              tileBg="rgba(255,255,255,0.05)"
              tileBorder="rgba(255,255,255,0.08)"
              onPress={() => {
                onClose();
                router.push({ pathname: '/measurement', params: { date: todayISO } });
              }}
            />
            <QuickTile
              label="Diary"
              sub="View all entries"
              iconBg="rgba(74,168,255,0.18)"
              iconColor="#4aa8ff"
              tileBg="rgba(255,255,255,0.05)"
              tileBorder="rgba(255,255,255,0.08)"
              onPress={() => {
                onClose();
                router.push('/diary');
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "Today" for the current day, otherwise the short date the reading came from. */
function dayLabel(date: string, todayISO: string): string {
  return date === todayISO ? 'Today' : dayjs(date).format('D MMM');
}

function QuickTile({
  label,
  sub,
  iconBg,
  iconColor,
  tileBg,
  tileBorder,
  onPress,
}: {
  label: string;
  sub: string;
  iconBg: string;
  iconColor: string;
  tileBg: string;
  tileBorder: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickTile,
        { backgroundColor: tileBg, borderColor: tileBorder },
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
      onPress={onPress}
    >
      <View style={[styles.quickTileIcon, { backgroundColor: iconBg }]}>
        <Text style={[styles.quickTileIconTxt, { color: iconColor }]}>＋</Text>
      </View>
      <View>
        <Text style={styles.quickTileLabel}>{label}</Text>
        <Text style={styles.quickTileSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}
