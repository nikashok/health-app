import dayjs from 'dayjs';
import { Text, View } from 'react-native';

import { getGreeting } from './homeUtils';
import { styles } from './styles';

/** Date label, backup-status chip, greeting, and the day-streak pill. */
export function HomeHeader({
  streak,
  pending,
  lastSyncedAt,
}: {
  streak: number;
  pending: number;
  lastSyncedAt: string | null;
}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.dateLabel}>{dayjs().format('ddd · D MMMM').toUpperCase()}</Text>
        {lastSyncedAt && pending === 0 ? (
          <Text style={styles.syncOk}>☁ Backed up</Text>
        ) : pending > 0 ? (
          <Text style={styles.syncPending}>↑ Syncing…</Text>
        ) : null}
        <Text style={styles.greeting}>{getGreeting()}</Text>
      </View>
      <View style={styles.streakPill}>
        <View style={styles.streakDot} />
        <Text style={styles.streakNum}>{streak}</Text>
        <Text style={styles.streakTxt}>day streak</Text>
      </View>
    </View>
  );
}
