/**
 * The backdrop behind Login and Register: a street of rooflines at dusk, with
 * a few lights on.
 *
 * The first version was the roofline pattern alone, flat on cream. It was
 * tidy and it was nobody's. What makes a street feel like home is not the
 * houses, it is the lit window — so two of every four houses have one, and
 * the sky warms toward the horizon the way it does at the end of a day. A
 * faint porch-light glow sits behind the form, where the eye lands anyway.
 *
 * Everything stays at low opacity on purpose. A login screen you remember for
 * its background is a login screen that got it wrong; this should register as
 * "warm", not as "a picture".
 *
 * SVG so it is sharp at any size, weighs nothing, and recolours for dark mode
 * — where the windows get to glow a little more, because that is when a light
 * left on means the most.
 */
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import { useTheme } from '@/theme/ThemeContext';

export default function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();

  const strokeOpacity = isDark ? 0.12 : 0.08;
  // The one element here that is allowed to glow.
  const windowOpacity = isDark ? 0.55 : 0.32;
  const skyHorizon = isDark ? '#241f1b' : '#e6d9c2';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {/* Sky: the page colour at the top, warming toward the ground. */}
          <LinearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} />
            <Stop offset="1" stopColor={skyHorizon} />
          </LinearGradient>

          {/* Porch light: a soft gold pool behind the form. */}
          <RadialGradient id="porch" cx="50%" cy="80%" r="55%">
            <Stop offset="0" stopColor={colors.gold} stopOpacity={isDark ? 0.22 : 0.16} />
            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
          </RadialGradient>

          {/* Four houses per tile, second row offset by half a house so it
              reads as a street rather than graph paper. */}
          <Pattern id="street" patternUnits="userSpaceOnUse" x="0" y="0" width="240" height="208">
            <G
              stroke={colors.primary}
              strokeOpacity={strokeOpacity}
              strokeWidth={1.6}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M10 52 L34 30 L58 52" />
              <Path d="M16 52 L16 74 M52 52 L52 74 M16 74 L52 74" />

              <Path d="M130 52 L154 30 L178 52" />
              <Path d="M136 52 L136 74 M172 52 L172 74 M136 74 L172 74" />

              <Path d="M70 156 L94 134 L118 156" />
              <Path d="M76 156 L76 178 M112 156 L112 178 M76 178 L112 178" />

              <Path d="M190 156 L214 134 L238 156" />
              <Path d="M196 156 L196 178 M232 156 L232 178 M196 178 L232 178" />
            </G>

            {/* Two of the four have a light on. */}
            <G fill={colors.gold} fillOpacity={windowOpacity}>
              <Rect x="24" y="58" width="7" height="7" rx="1" />
              <Rect x="37" y="58" width="7" height="7" rx="1" />
              <Rect x="216" y="162" width="7" height="7" rx="1" />
            </G>
          </Pattern>
        </Defs>

        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dusk)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#street)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#porch)" />
      </Svg>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
