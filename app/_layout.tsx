import { ThemeProvider } from '@/theme/ThemeContext';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import '../global.css';
import { supabase } from '@/services/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [loading, setLoading] = useState(true);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  });

  useEffect(() => {
    supabase.auth.getUser().then(() => setLoading(false));
  }, []);

  // Wait for both the auth check and the brand fonts before first paint, so
  // text doesn't flash in the system font and reflow when Montserrat/Inter load.
  if (loading || !fontsLoaded) return null;

  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
