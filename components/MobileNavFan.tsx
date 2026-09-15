/**
 * Phone navigation: a thumb-reachable button, bottom right, that fans open.
 *
 * The hamburger lived in the TOP LEFT — the hardest corner of a phone to reach
 * one-handed, and the one place people no longer look for navigation. Testing
 * on a real phone, getting between tabs was the clumsiest part of the app.
 *
 * Bottom right is where a thumb rests. The items fan upward in reverse order
 * so the FIRST item ends up CLOSEST to the button: the thing you most likely
 * want is the shortest distance away, and the list grows away from your thumb
 * rather than under it.
 *
 * Labels sit beside every icon. An icon-only fan looks tidier and is a
 * guessing game — and the whole reason this exists is that a real user could
 * not work out where to go.
 */
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, shadows, spacing } from '@/theme/tokens';

const AnimatedView = Animated.createAnimatedComponent(View);

export type FanItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  /** Draws attention — used for Upload Report until a report exists. */
  highlight?: boolean;
};

type Props = {
  items: FanItem[];
  open: boolean;
  onToggle: (open: boolean) => void;
};

const ITEM_HEIGHT = 46;
const ITEM_GAP = 10;

export default function MobileNavFan({ items, open, onToggle }: Props) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [open]);

  const scrim = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Fully transparent to touches when closed, otherwise an invisible sheet
    // would swallow every tap on the page underneath.
    pointerEvents: progress.value > 0.01 ? 'auto' : 'none',
  }));

  const fabIcon = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 135}deg` }],
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <AnimatedView style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onToggle(false)} />
      </AnimatedView>

      <View style={styles.stack} pointerEvents="box-none">
        {items.map((item, i) => (
          <FanRow
            key={item.key}
            item={item}
            index={items.length - 1 - i}
            progress={progress}
            colors={colors}
            onPress={() => { onToggle(false); item.onPress(); }}
          />
        ))}

        <Pressable
          onPress={() => onToggle(!open)}
          accessibilityLabel={open ? 'Close menu' : 'Open menu'}
          style={({ pressed }) => [
            styles.fab,
            shadows.lg,
            { backgroundColor: colors.headerBg, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <AnimatedView style={fabIcon}>
            <MaterialIcons name={open ? 'close' : 'menu'} size={26} color={colors.headerAccent} />
          </AnimatedView>
        </Pressable>
      </View>
    </View>
  );
}

function FanRow({
  item, index, progress, colors, onPress,
}: {
  item: FanItem;
  index: number;
  progress: { value: number };
  colors: any;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    // Each row lifts to its own slot above the button. Multiplying by progress
    // means they slide out from underneath it rather than simply fading in.
    const lift = (index + 1) * (ITEM_HEIGHT + ITEM_GAP);
    return {
      opacity: progress.value,
      transform: [
        { translateY: -lift * progress.value },
        { scale: 0.85 + 0.15 * progress.value },
      ],
      pointerEvents: progress.value > 0.9 ? 'auto' : 'none',
    };
  });

  return (
    <AnimatedView style={[styles.row, style]}>
      <Pressable
        onPress={onPress}
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
            { color: item.highlight ? colors.headerBg : colors.textPrimary,
              fontWeight: item.highlight ? '700' : '600' },
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
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 400,
  },
  stack: {
    position: 'absolute',
    right: spacing.lg,
    // Clear of the browser chrome at the bottom of a phone screen.
    bottom: Platform.OS === 'web' ? 28 : spacing.xl,
    alignItems: 'flex-end',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    position: 'absolute',
    right: 0,
    bottom: 4,
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
    minWidth: 170,
  },
  label: {
    fontSize: fontSize.md,
  },
});
