import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/db/supabase';
import { Card, PrimaryButton, Row } from './components';
import { colors, type } from './theme';

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
      setError(e instanceof Error ? e.message : String(e));
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
            Sign in to your private diary. It syncs across your devices.
          </Text>

          <Card>
            <Row first minHeight={50}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
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
                onSubmitEditing={onSubmit}
              />
            </Row>
            <Row minHeight={50}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.leaf}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="password"
                onSubmitEditing={onSubmit}
              />
            </Row>
          </Card>

          {error ? <Text style={styles.error}>{error}</Text> : null}

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
  label: { ...type.body, color: colors.ink, marginRight: 12, minWidth: 84 },
  input: { ...type.body, color: colors.ink, flex: 1, textAlign: 'right', paddingVertical: 0 },
  error: { ...type.footnote, color: colors.rose, marginTop: 10, marginHorizontal: 16 },
  submit: { marginTop: 24 },
});
