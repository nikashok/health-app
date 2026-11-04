import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/db/supabase';
import { PrimaryButton } from './components';
import { colors, radius, type } from './theme';

/**
 * Sign-in gate. Rendered by the root layout whenever there's no Supabase session; a
 * successful sign-in fires onAuthStateChange, which swaps this for the app.
 *
 * This is a private app — there is intentionally NO public sign-up. Accounts are
 * created by the owner in the Supabase dashboard (Authentication → Users → Add user),
 * and public sign-ups are disabled in Supabase auth settings. So this screen only
 * ever signs an existing user in.
 */
export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Success → onAuthStateChange in the root layout takes over.
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.icon}
            accessibilityLabel="Nutrition Tracker"
          />
          <Text style={styles.title}>Nutrition Tracker</Text>
          <Text style={styles.sub}>
            Sign in to your private diary. It’s stored on this device and backed up to your account.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.field}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.leaf}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            accessibilityLabel="Email"
          />

          <Text style={[styles.label, styles.labelGap]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.field, styles.passwordField]}
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.leaf}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
              accessibilityLabel="Password"
            />
            <Pressable
              onPress={() => setShowPassword((s) => !s)}
              style={styles.showBtn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            title={busy ? 'Signing in…' : 'Sign In'}
            onPress={onSubmit}
            disabled={!canSubmit}
            hint={!busy ? 'Enter your email and password (at least 6 characters).' : null}
            style={styles.submit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Supabase's messages are developer-facing; say what to do instead. */
function friendlyAuthError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check both and try again.';
  if (/email not confirmed/i.test(msg)) return 'This account’s email hasn’t been confirmed yet.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Couldn’t reach the server. Check your connection and try again.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts — wait a minute and try again.';
  return 'Sign-in didn’t work. Please try again.';
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 60 },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 22,
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  title: { ...type.largeTitle, color: colors.ink, textAlign: 'center' },
  sub: {
    ...type.subhead,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
    marginHorizontal: 24,
    lineHeight: 20,
  },
  label: { ...type.footnote, fontWeight: '600', color: colors.muted, marginLeft: 4, marginBottom: 6 },
  labelGap: { marginTop: 16 },
  field: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 17, // 16+ stops iOS Safari zooming on focus
    color: colors.ink,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordField: { flex: 1, paddingRight: 64 },
  showBtn: { position: 'absolute', right: 6, height: 38, paddingHorizontal: 10, justifyContent: 'center' },
  showText: { ...type.subhead, fontWeight: '600', color: colors.leaf },
  error: { ...type.footnote, color: colors.rose, marginTop: 12, marginHorizontal: 4, lineHeight: 18 },
  submit: { marginTop: 24 },
});
