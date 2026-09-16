/**
 * The backdrop behind Login and Register.
 *
 * The auth screens were a bare cream field with the word "Login" on it — the
 * first thing anyone sees, and it said nothing about what BENi is or that any
 * care went into it.
 *
 * The pattern is a field of rooflines: BENi's mark is a house, so the motif is
 * already the brand rather than decoration borrowed from somewhere else. It is
 * drawn at very low opacity on purpose — it should register as texture you
 * half-notice, not wallpaper competing with the form. A login screen you
 * remember for its background is a login screen that got it wrong.
 *
 * Built as SVG rather than a bitmap so it stays sharp at any size, weighs
 * nothing, and recolours itself for dark mode.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeContext';

export default function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();

  // Barely there. High enough to feel textured, low enough that the eye goes
  // to the form first.
  const strokeOpacity = isDark ? 0.10 : 0.07;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {/* One house repeated on a staggered grid — the second row offset by
              half a tile so it reads as a neighbourhood, not graph paper. */}
          <Pattern id="rooflines" patternUnits="userSpaceOnUse" x="0" y="0" width="120" height="104">
            <G stroke={colors.primary} strokeOpacity={strokeOpacity} strokeWidth={1.6} fill="none">
              <Path d="M10 52 L34 30 L58 52" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M16 52 L16 74 M52 52 L52 74 M16 74 L52 74" strokeLinecap="round" />
              <Path d="M70 104 L94 82 L118 104" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M76 104 L76 126 M112 104 L112 126" strokeLinecap="round" />
            </G>
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#rooflines)" />
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
