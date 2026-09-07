/**
 * Standard page header — title, optional muted subtitle, optional left node
 * (e.g. back arrow) and right node (action button / selection actions).
 *
 * Every screen's top header should use this so heading typography and spacing
 * are changeable in one place.
 */
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, spacing } from '@/theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  /** Override the subtitle color (defaults to muted). Pass a theme token, not a raw hex. */
  subtitleColor?: string;
  /** Rendered before the title block (e.g. back arrow) */
  left?: ReactNode;
  /** Rendered after the title block (e.g. primary action, selection actions) */
  right?: ReactNode;
};

export default function PageHeader({ title, subtitle, subtitleColor, left, right }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {left}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle != null && (
          <Text style={[styles.subtitle, { color: subtitleColor ?? colors.textMuted }]}>{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
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
