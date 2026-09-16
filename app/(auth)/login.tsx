/**
 * Sign in.
 *
 * This is the first thing anyone BENi is shared with ever sees, and it used to
 * be a bare cream field with the word "Login" on it — no mark, no indication of
 * what the product is, nothing that suggested care. A stranger following a link
 * from a text message decides what they think of a product here.
 *
 * So: the house mark, the line the whole product is built around, and the form
 * lifted onto a card over a faint field of rooflines. Everything is still one
 * screen and two fields — the point is warmth, not ceremony.
 */
import Button from '@/components/Button';
import InfoPopup from '@/components/InfoPopup';
import { SingleLineInput } from '@/components/Inputs';
import AuthBackdrop from '@/components/auth/AuthBackdrop';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { fonts, fontSize, radius, shadows, spacing } from '@/theme/tokens';
import {
  Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';

export default function LoginScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [popupVisible, setPopupVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      setPopupVisible(true);
      return;
    }
    router.replace('/(tabs)/dashboard');
  };

  return (
    <AuthBackdrop>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} hitSlop={10}>
            <Text style={styles.themeToggleIcon}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>

          <Image
            source={require('@/assets/images/beni-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={[styles.tagline, { color: colors.gold }]}>
            Own your home, not just the keys.
          </Text>

          <View style={[styles.card, shadows.lg, { backgroundColor: colors.surface }]}>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Welcome back</Text>

            <SingleLineInput
              placeholderText="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <SingleLineInput
              placeholderText="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Button
              title={busy ? 'Signing in…' : 'Sign in'}
              onPress={handleLogin}
              variant="primary"
              fullWidth
              disabled={busy}
              style={{ marginBottom: spacing.sm }}
            />
            <Button
              title="Create an account"
              onPress={() => router.push('/(auth)/register')}
              variant="secondary"
              fullWidth
            />
          </View>

          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            Turn your inspection report into a maintenance plan you'll actually use.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <InfoPopup
        visible={popupVisible}
        message={error}
        type="error"
        title="Login Failed"
        onClose={() => setPopupVisible(false)}
        showConfirm={false}
        cancelText="Close"
        autoDismiss={5000}
      />
    </AuthBackdrop>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  themeToggle: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    padding: spacing.sm,
  },
  themeToggleIcon: { fontSize: 20 },
  logo: {
    width: 88,
    height: 88,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.md,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  heading: {
    fontFamily: fonts.heading,
    fontSize: fontSize.h3,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
  },
  footnote: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xl,
    maxWidth: 320,
    lineHeight: 18,
  },
});
