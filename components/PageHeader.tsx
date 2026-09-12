/**
 * Standard page header — title, optional muted subtitle, optional left node
 * (e.g. back arrow) and right node (action button / selection actions).
 *
 * Every screen's top header should use this so heading typography and spacing
 * are changeable in one place.
 */
import { ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { BREAKPOINT } from '@/theme/layout';
import { fonts, fontSize, spacing } from '@/theme/tokens';
import NotificationBell from '@/components/NotificationBell';

type Props = {
  title: string;
  subtitle?: string;
  /** Override the subtitle color (defaults to muted). Pass a theme token, not a raw hex. */
  subtitleColor?: string;
  /** Rendered before the title block (e.g. back arrow) */
  left?: ReactNode;
  /** Rendered after the title block (e.g. primary action, selection actions) */
  right?: ReactNode;
  /** Set false where the bell would be noise (e.g. auth screens). */
  showBell?: boolean;
};

export default function PageHeader({ title, subtitle, subtitleColor, left, right, showBell = true }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  // On a phone the title, the bell and one or two action buttons cannot share a
  // single 375px row without crushing the title. Below the breakpoint the
  // actions drop onto their own full-width line underneath instead.
  const narrow = width < BREAKPOINT;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {left}
        <View style={styles.textBlock}>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit={narrow}
            minimumFontScale={0.8}
          >
            {title}
          </Text>
          {subtitle != null && (
            <Text style={[styles.subtitle, { color: subtitleColor ?? colors.textMuted }]}>{subtitle}</Text>
          )}
        </View>
        {showBell && <NotificationBell />}
        {!narrow && right}
      </View>
      {narrow && right != null && <View style={styles.narrowActions}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  narrowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  textBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.h2,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: fontSize.md,
  },
});
