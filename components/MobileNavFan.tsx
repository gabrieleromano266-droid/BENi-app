/**
 * Phone navigation: a thumb-reachable button, bottom right, that fans open
 * upward into the page.
 *
 * WHY IT LIVES IN THE LAYOUT, NOT IN SideNav. The first version rendered
 * inside SideNav's wrapper, which on a phone is only as tall as the 56px top
 * bar. `position: absolute` resolves against the nearest positioned ancestor,
 * so "bottom" meant the bottom of the HEADER — the button appeared at the top
 * right and the rows fanned off the top of the screen. Mounting it as a
 * sibling of the page content, inside the full-height layout root, is what
 * makes "bottom right" mean the bottom right of the screen.
 *
 * Self-contained on purpose: it does its own auth lookup, its own "do you have
 * a report yet" check and owns the upload dialog, so the layout can drop it in
 * without threading state through.
 *
 * The rows fan UPWARD in reverse order, so the FIRST item ends up CLOSEST to
 * the button: what you most likely want is the shortest distance away, and the
 * list grows away from your thumb rather than under it. Every row carries a
 * label — an icon-only fan looks tidier and is a guessing game, and the whole
 * reason this exists is that a real user could not work out where to go.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { usePathname, useRouter } from 'expo-router';
import UploadExtractPopup from '@/components/upload/UploadExtractPopup';
import { hasAnyReport } from '@/services/fileService';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, shadows, spacing } from '@/theme/tokens';

const AnimatedView = Animated.createAnimatedComponent(View);

type Item = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  highlight?: boolean;
};

const ITEM_HEIGHT = 46;
const ITEM_GAP = 10;
const FAB_SIZE = 56;

export default function MobileNavFan() {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [needsReport, setNeedsReport] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [open]);

  // Close when the route changes, so the menu never hangs over a new page.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) {
        hasAnyReport(id)
          .then((has) => setNeedsReport(!has))
          .catch(() => setNeedsReport(false));
      }
    });
  }, [pathname]);

  const go = (path: string) => { setOpen(false); router.push(path as any); };

  const handleSignOut = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  const items: Item[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'space-dashboard', onPress: () => go('/(tabs)/dashboard') },
    { key: 'properties', label: 'My Properties', icon: 'home-work', onPress: () => go('/(tabs)/properties') },
    { key: 'documents', label: 'Documents', icon: 'description', onPress: () => go('/(tabs)/documents') },
    { key: 'upload', label: 'Upload Report', icon: 'upload', highlight: needsReport,
      onPress: () => { setOpen(false); setUploadVisible(true); } },
    { key: 'profile', label: 'Profile', icon: 'person', onPress: () => go('/(tabs)/profile') },
    { key: 'signout', label: 'Sign Out', icon: 'logout', onPress: handleSignOut },
  ];

  const scrim = useAnimatedStyle(() => ({
    opacity: progress.value * 0.55,
  }));

  const fabSpin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

  return (
    <>
      {/* Scrim only exists while open, so it can never swallow taps meant for
          the page underneath. */}
      {open && (
        <AnimatedView
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 900 }, scrim]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        </AnimatedView>
      )}

      <View style={styles.stack} pointerEvents="box-none">
        {items.map((item, i) => (
          <FanRow
            key={item.key}
            item={item}
            slot={items.length - i}
            progress={progress}
            colors={colors}
            open={open}
          />
        ))}

        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityLabel={open ? 'Close menu' : 'Open menu'}
          style={({ pressed }) => [
            styles.fab,
            shadows.lg,
            { backgroundColor: colors.headerBg, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <AnimatedView style={fabSpin}>
            <MaterialIcons
              name={open ? 'close' : 'menu'}
              size={26}
              color={colors.headerAccent}
            />
          </AnimatedView>
        </Pressable>
      </View>

      <UploadExtractPopup
        visible={uploadVisible}
        userId={userId ?? ''}
        onClose={() => setUploadVisible(false)}
        onSuccess={() => { setUploadVisible(false); router.push('/(tabs)/dashboard' as any); }}
      />
    </>
  );
}

function FanRow({
  item, slot, progress, colors, open,
}: {
  item: Item;
  slot: number;
  progress: { value: number };
  colors: any;
  open: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const lift = slot * (ITEM_HEIGHT + ITEM_GAP);
    return {
      opacity: progress.value,
      transform: [
        { translateY: -lift * progress.value },
        { scale: 0.9 + 0.1 * progress.value },
      ],
    };
  });

  return (
    <AnimatedView style={[styles.row, style]} pointerEvents={open ? 'auto' : 'none'}>
      <Pressable
        onPress={item.onPress}
        style={({ pressed }) => [
          styles.pill,
          shadows.md,
          {
            backgroundColor: item.highlight ? colors.gold : colors.surface,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <MaterialIcons
          name={item.icon}
          size={19}
          color={item.highlight ? colors.headerBg : colors.textPrimary}
        />
        <Text
          style={[
            styles.label,
            {
              color: item.highlight ? colors.headerBg : colors.textPrimary,
              fontWeight: item.highlight ? '700' : '600',
            },
          ]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </Pressable>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    right: spacing.lg,
    // Clear of Safari's bottom toolbar, which floats over the page on iOS.
    bottom: Platform.OS === 'web' ? 34 : spacing.xl,
    alignItems: 'flex-end',
    zIndex: 1000,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    position: 'absolute',
    right: 0,
    bottom: (FAB_SIZE - ITEM_HEIGHT) / 2,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    minWidth: 180,
  },
  label: {
    fontSize: fontSize.md,
  },
});
