/**
 * The backdrop behind Login and Register: a sky at dusk and a porch light.
 *
 * Earlier versions drew a repeating street of little house outlines over
 * this. Gabriele's verdict on 2026-11-16: tacky — and he was right. A
 * pattern of icons is what a template does. What is left is the part that
 * carried the feeling anyway: the page colour warming toward the ground the
 * way a sky does at the end of a day, and a soft gold pool behind the form
 * where the eye lands. Nothing to look at, just warmer than a flat field.
 *
 * SVG so it is sharp at any size, weighs nothing, and recolours for dark mode.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeContext';

export default function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const skyHorizon = isDark ? '#241f1b' : '#e6d9c2';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} />
            <Stop offset="1" stopColor={skyHorizon} />
          </LinearGradient>
          <RadialGradient id="porch" cx="50%" cy="80%" r="55%">
            <Stop offset="0" stopColor={colors.gold} stopOpacity={isDark ? 0.22 : 0.16} />
            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dusk)" />
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
