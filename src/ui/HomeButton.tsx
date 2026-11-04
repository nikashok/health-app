/**
 * The app logo in the nav bar of every screen pushed above the tabs: one tap closes them
 * all and returns to the tab you came from. When there is nothing underneath (a screen
 * opened directly by URL on web), it loads Today instead.
 */
import { useRouter } from 'expo-router';
import { Image, Platform, Pressable, StyleSheet } from 'react-native';

// Same size as the avatar button on Home; the largest that sits comfortably in a 44 pt nav bar.
const SIZE = 34;

export function HomeButton() {
  const router = useRouter();

  function goHome() {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  }

  return (
    <Pressable
      onPress={goHome}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // App-icon corner radius: 22.37% of its size.
  logo: { width: SIZE, height: SIZE, borderRadius: SIZE * 0.2237 },
  // The native iOS header insets its right item itself; the web header doesn't.
  wrap: { marginRight: Platform.OS === 'web' ? 16 : 0 },
  pressed: { opacity: 0.6 },
});
