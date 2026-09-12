import Button from '@/components/Button';
import InfoPopup from '@/components/InfoPopup';
import { SingleLineInput } from '@/components/Inputs';
import PhoneInput from '@/components/PhoneInput';
import ScreenWrapper from '@/components/ScreenWrapper';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { fontSize, spacing } from '@/theme/tokens';
import { StyleSheet, Text, View } from 'react-native';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [areaCode, setAreaCode] = useState('+1');

  const [popupVisible, setPopupVisible] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState<'error' | 'success' | 'warning'>('error');
  const [popupTitle, setPopupTitle] = useState('');

  const showPopup = (type: typeof popupType, title: string, message: string) => {
    setPopupType(type);
    setPopupTitle(title);
    setPopupMessage(message);
    setPopupVisible(true);
  };

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      showPopup('error', 'Password Mismatch', 'Passwords do not match.');
      return;
    }
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      showPopup('error', 'Registration Failed', signUpError.message);
      return;
    }

    if (signUpData.user && signUpData.user.identities?.length === 0) {
      showPopup('warning', 'Registration Incomplete', 'Email already in use. Please log in instead.');
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      showPopup('error', 'Registration Failed', 'Could not retrieve user ID. Please try logging in.');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      first_name: firstName || '',
      surname: lastName || '',
      phone: phone ? `${areaCode}${phone}` : '',
    });

    if (profileError) {
      showPopup('error', 'Profile Error', profileError.message + ' — please sign in to update your profile.');
      return;
    }

    // With email confirmation off, signUp already returns a session — so send
    // them straight into the app. Telling someone to "check your email" when no
    // email is coming is a dead end, and bouncing an already-signed-in user to
    // the login screen just makes them type their password again.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      showPopup('success', 'Welcome to BENi', 'Your account is ready.');
      setTimeout(() => router.replace('/(tabs)/dashboard'), 1200);
      return;
    }

    showPopup('success', 'Account Created', 'Please check your email to confirm your account.');
    setTimeout(() => router.replace('/(auth)/login'), 3000);
  };

  return (
    <ScreenWrapper>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Register</Text>

      <View style={styles.form}>
        <View style={styles.nameRow}>
          <SingleLineInput
            placeholderText="First Name"
            value={firstName}
            onChangeText={setFirstName}
            style={{ flex: 1 }}
          />
          <SingleLineInput
            placeholderText="Last Name"
            value={lastName}
            onChangeText={setLastName}
            style={{ flex: 1 }}
          />
        </View>

        <PhoneInput
          areaCode={areaCode}
          setAreaCode={setAreaCode}
          phone={phone}
          setPhone={setPhone}
        />

        <SingleLineInput
          placeholderText="Email (required)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <SingleLineInput
          placeholderText="Password (required)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <SingleLineInput
          placeholderText="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <Button
          title="Register"
          onPress={handleRegister}
          variant="success"
          fullWidth
          style={{ marginBottom: 10 }}
        />
        <Button
          title="Back to Login"
          onPress={() => router.push('/(auth)/login')}
          variant="secondary"
          fullWidth
        />
      </View>

      <InfoPopup
        visible={popupVisible}
        message={popupMessage}
        title={popupTitle}
        type={popupType}
        onClose={() => setPopupVisible(false)}
        showConfirm={false}
        cancelText="Close"
        autoDismiss={5000}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSize.h1,
    fontWeight: 'bold',
    marginBottom: spacing.xl,
  },
  form: {
    width: '100%',
    maxWidth: 320,
  },
  nameRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
