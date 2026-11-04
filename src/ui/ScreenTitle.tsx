/**
 * The large in-screen title every tab root uses (Today, Diary, Progress), so the three
 * read as one app: account avatar top right, a muted eyebrow, the large title, and an
 * optional meta line underneath.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/db/supabase';
import { confirmDestructive } from '@/lib/confirm';
import { colors, type } from '@/ui/theme';

export function ScreenTitle({
  eyebrow,
  title,
  meta,
}: {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <View>
      <View style={styles.topRow}>
        <AccountButton />
      </View>
      <View style={styles.block}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {meta ? <View style={styles.meta}>{meta}</View> : null}
      </View>
    </View>
  );
}

/** Avatar (your email's initial) that opens Edit targets / Sign out. */
export function AccountButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [initial, setInitial] = useState('•');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const c = (data.session?.user?.email ?? '').charAt(0).toUpperCase();
      if (c) setInitial(c);
    });
  }, []);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const signOut = () =>
    confirmDestructive(
      'Sign out?',
      'You will need your email and password to sign back in.',
      'Sign Out',
      () => supabase.auth.signOut()
    );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Account"
        hitSlop={6}
      >
        <Text style={styles.avatarText}>{initial}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { top: insets.top + 48 }]}>
            <Pressable
              onPress={pick(() => router.push('/onboarding'))}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.menuText}>Edit targets</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              onPress={pick(signOut)}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.menuText, styles.menuDestructive]}>Sign out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topRow: { height: 36, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  block: { paddingHorizontal: 4, gap: 2 },
  eyebrow: { ...type.footnote, fontWeight: '600', color: colors.muted, letterSpacing: 0.2 },
  title: { ...type.largeTitle, color: colors.ink },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.subhead, fontWeight: '600', color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: {
    position: 'absolute',
    right: 16,
    width: 200,
    backgroundColor: colors.fill,
    borderRadius: 14,
    overflow: 'hidden',
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  menuItemPressed: { backgroundColor: colors.lineStrong },
  menuText: { ...type.body, color: colors.ink },
  menuDestructive: { color: colors.rose },
  menuDivider: { height: 0.5, backgroundColor: colors.lineStrong },
});
