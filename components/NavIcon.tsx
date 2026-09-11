/**
 * Animated sidebar icons.
 *
 * Each icon animates in a way that says something about what the page does,
 * rather than every icon doing the same generic pulse:
 *
 *   dashboard  - the four blocks jiggle (they are the dashboard's tiles)
 *   properties - the house hops (you are moving between homes)
 *   documents  - the lines of writing fill in left to right (a page being filled)
 *   upload     - the arrow flies up out of the tray
 *
 * Drawn as SVG rather than using the icon font, because a font glyph is a
 * single shape and these animations need the parts to move independently
 * (four separate blocks, three separate lines of writing).
 *
 * The animation runs on press and on hover, so it is discoverable with a mouse
 * on web and still fires from a tap on a phone. `active` keeps the icon in its
 * finished state for the page you are on.
 */
import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

export type NavIconName = 'dashboard' | 'properties' | 'documents' | 'upload';

const AnimatedView = Animated.createAnimatedComponent(View);

type Props = {
  name: NavIconName;
  color: string;
  size?: number;
  /** Replays whenever this changes — the parent bumps it on press/hover. */
  trigger: number;
  active?: boolean;
};

export default function NavIcon({ name, color, size = 18, trigger, active }: Props) {
  switch (name) {
    case 'dashboard': return <DashboardIcon color={color} size={size} trigger={trigger} />;
    case 'properties': return <PropertiesIcon color={color} size={size} trigger={trigger} />;
    case 'documents': return <DocumentsIcon color={color} size={size} trigger={trigger} active={active} />;
    case 'upload': return <UploadIcon color={color} size={size} trigger={trigger} />;
  }
}

/** Four tiles that wobble out of alignment and settle back. */
function DashboardIcon({ color, size, trigger }: { color: string; size: number; trigger: number }) {
  const tilt = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    tilt.value = withSequence(
      withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
      withRepeat(withTiming(-1, { duration: 110 }), 3, true),
      withTiming(0, { duration: 110, easing: Easing.out(Easing.quad) }),
    );
  }, [trigger]);

  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value * 9}deg` }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value * -9}deg` }] }));

  const block = (x: number, y: number, w: number, h: number) => (
    <Rect x={x} y={y} width={w} height={h} rx={1.6} fill={color} />
  );

  return (
    <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap' }}>
      <AnimatedView style={[{ width: size / 2, height: size / 2 }, a]}>
        <Svg width={size / 2} height={size / 2} viewBox="0 0 10 10">{block(0.6, 0.6, 8.8, 8.8)}</Svg>
      </AnimatedView>
      <AnimatedView style={[{ width: size / 2, height: size / 2 }, b]}>
        <Svg width={size / 2} height={size / 2} viewBox="0 0 10 10">{block(0.6, 0.6, 8.8, 8.8)}</Svg>
      </AnimatedView>
      <AnimatedView style={[{ width: size / 2, height: size / 2 }, b]}>
        <Svg width={size / 2} height={size / 2} viewBox="0 0 10 10">{block(0.6, 0.6, 8.8, 8.8)}</Svg>
      </AnimatedView>
      <AnimatedView style={[{ width: size / 2, height: size / 2 }, a]}>
        <Svg width={size / 2} height={size / 2} viewBox="0 0 10 10">{block(0.6, 0.6, 8.8, 8.8)}</Svg>
      </AnimatedView>
    </View>
  );
}

/** The house hops, with a small squash on landing. */
function PropertiesIcon({ color, size, trigger }: { color: string; size: number; trigger: number }) {
  const hop = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    hop.value = withSequence(
      withTiming(-1, { duration: 150, easing: Easing.out(Easing.quad) }),
      withTiming(0.35, { duration: 130, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 120, easing: Easing.out(Easing.back(2)) }),
    );
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: hop.value * 4 },
      { scaleY: 1 - Math.max(0, hop.value) * 0.16 },
      { scaleX: 1 + Math.max(0, hop.value) * 0.12 },
    ],
  }));

  return (
    <AnimatedView style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 3 2.5 10.2V21h7v-5.6h5V21h7V10.2Z" fill={color} />
      </Svg>
    </AnimatedView>
  );
}

/** Three lines of writing fill in, one after the other. */
function DocumentsIcon({
  color, size, trigger, active,
}: { color: string; size: number; trigger: number; active?: boolean }) {
  const l1 = useSharedValue(active ? 1 : 0);
  const l2 = useSharedValue(active ? 1 : 0);
  const l3 = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    if (trigger === 0) return;
    const write = (v: typeof l1, delay: number) => {
      v.value = withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(delay, withTiming(1, { duration: 230, easing: Easing.out(Easing.cubic) })),
      );
    };
    write(l1, 0);
    write(l2, 110);
    write(l3, 220);
  }, [trigger]);

  // Three separate hook calls rather than a helper in a loop — hooks must run
  // in the same order on every render.
  const s1 = useAnimatedStyle(() => ({ width: `${l1.value * 100}%` }));
  const s2 = useAnimatedStyle(() => ({ width: `${l2.value * 100}%` }));
  const s3 = useAnimatedStyle(() => ({ width: `${l3.value * 62}%` }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
        <Path
          d="M6 2h8l5 5v15H6Z"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.37, top: size * 0.45, width: size * 0.38, gap: size * 0.11 }}>
        <AnimatedView style={[{ height: Math.max(1, size * 0.075), backgroundColor: color, borderRadius: 1 }, s1]} />
        <AnimatedView style={[{ height: Math.max(1, size * 0.075), backgroundColor: color, borderRadius: 1 }, s2]} />
        <AnimatedView style={[{ height: Math.max(1, size * 0.075), backgroundColor: color, borderRadius: 1 }, s3]} />
      </View>
    </View>
  );
}

/** The arrow flies up and out, then reappears from the bottom. */
function UploadIcon({ color, size, trigger }: { color: string; size: number; trigger: number }) {
  const lift = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (trigger === 0) return;
    lift.value = withSequence(
      withTiming(-1, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withTiming(0.9, { duration: 0 }),
      withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }),
    );
    fade.value = withSequence(
      withTiming(0, { duration: 240, easing: Easing.in(Easing.quad) }),
      withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
    );
  }, [trigger]);

  const arrow = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value * (size * 0.5) }],
    opacity: fade.value,
  }));

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      {/* tray stays put */}
      <Svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
        <Path d="M3 17v3.5h18V17" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
      <AnimatedView style={[{ position: 'absolute', width: size, height: size }, arrow]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3.5 6.5 9M12 3.5 17.5 9M12 3.5V15" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </AnimatedView>
    </View>
  );
}

/**
 * Wraps a nav row so the icon replays on hover (web) and on press (everywhere).
 * onHoverIn only exists on web builds; omitting it on native is harmless.
 */
export function NavIconPressable({
  children, onPress, onReplay, style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  onReplay: () => void;
  style?: any;
}) {
  const hoverProps = Platform.OS === 'web' ? { onHoverIn: onReplay } : {};
  return (
    <Pressable
      onPress={() => { onReplay(); onPress(); }}
      {...hoverProps}
      style={style}
    >
      {children}
    </Pressable>
  );
}
