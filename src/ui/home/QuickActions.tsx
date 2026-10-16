import { Pressable, Text, View } from 'react-native';

import { styles } from './styles';

/**
 * "+ Log Weight" capsule under the body cards. (Logging food lives on the floating
 * button, so it isn't repeated here.)
 */
export function QuickActions({ onLogWeight }: { onLogWeight: () => void }) {
  return (
    <View style={styles.quickRow}>
      <Pressable
        onPress={onLogWeight}
        accessibilityRole="button"
        style={({ pressed }) => [styles.quickBtn, styles.quickPlain, pressed && styles.quickPressed]}
      >
        <Text style={styles.quickText}>+ Log Weight</Text>
      </Pressable>
    </View>
  );
}
