import MobileNavFan from '@/components/MobileNavFan';
import SideNav from '@/components/SideNav';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { SIDEBAR_BREAKPOINT } from '@/theme/layout';
import { Slot, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

export default function TabLayout() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= SIDEBAR_BREAKPOINT;
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/(auth)/login');
      } else {
        setReady(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace('/(auth)/login');
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!ready) return null;

  return (
    <View style={{ flex: 1, flexDirection: isWide ? 'row' : 'column', backgroundColor: colors.background }}>
      <SideNav />
      <View style={{ flex: 1 }}>
        <Slot />
      </View>

      {/* Mounted HERE rather than inside SideNav: on a phone SideNav's wrapper
          is only as tall as the 56px top bar, and an absolutely-positioned
          child resolves against its nearest positioned ancestor — so "bottom
          right" came out as the bottom right of the HEADER. This root fills the
          screen, which is what makes the fan sit where a thumb actually is. */}
      {!isWide && <MobileNavFan />}
    </View>
  );
}
