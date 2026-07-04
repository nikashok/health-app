import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text } from 'react-native';

import { styles } from './styles';

/** Floating "+" button that opens the quick-add sheet. */
export function HomeFab({ bottom, onPress }: { bottom: number; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.fab,
        { bottom },
        pressed && { opacity: 0.88, transform: [{ scale: 0.93 }] },
      ]}
      onPress={onPress}
    >
      <LinearGradient
        colors={['#c8803a', '#b06228']}
        style={styles.fabInner}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
      >
        <Text style={styles.fabPlus}>＋</Text>
      </LinearGradient>
    </Pressable>
  );
}
