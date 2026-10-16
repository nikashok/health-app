import dayjs from 'dayjs';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { styles } from './styles';

/**
 * Avatar button (opens Edit targets / Sign out), the date, the "Today" large title and
 * a meta line with the logging streak and backup state.
 */
export function HomeHeader({
  initial,
  streak,
  syncLabel,
  onSyncPress,
  hasTarget,
  topInset,
  onEditTargets,
  onSignOut,
}: {
  initial: string;
  streak: number;
  syncLabel: string;
  onSyncPress: () => void;
  hasTarget: boolean;
  topInset: number;
  onEditTargets: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pick = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <View>
      <View style={styles.avatarRow}>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Account"
          hitSlop={6}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.dateLabel}>{dayjs().format('dddd, D MMMM').toUpperCase()}</Text>
        <Text style={styles.largeTitle}>Today</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>
            {streak > 0 ? `${streak}-day streak` : 'No streak yet'} ·{' '}
          </Text>
          {/* Same as Diary's pill: tap to back up now. */}
          <Pressable
            onPress={onSyncPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${syncLabel}. Back up now`}
          >
            <Text style={styles.metaText}>{syncLabel}</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: topInset + 48 }]}>
            <Pressable
              onPress={pick(onEditTargets)}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Text style={styles.menuText}>{hasTarget ? 'Edit targets' : 'Set targets'}</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              onPress={pick(onSignOut)}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Text style={[styles.menuText, styles.menuDestructive]}>Sign out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
