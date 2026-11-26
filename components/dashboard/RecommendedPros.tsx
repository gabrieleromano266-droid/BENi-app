/**
 * "Need a pro?" under a finding the inspector says needs a professional.
 *
 * Founder, 2026-11-25: "this is the perfect opportunity for a link right
 * under it… a placeholder that gives you a direct link to 2 or 3 contractors
 * that BENi will be able to work with." Shows real listings when the
 * `contractors` table has them for this trade; until then, an honest
 * placeholder rather than made-up businesses.
 */
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { Contractor, fetchContractors, Trade, TRADE_LABEL } from '@/services/contractorService';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RecommendedPros({ trade }: { trade: Trade }) {
  const { colors } = useTheme();
  const [pros, setPros] = useState<Contractor[] | null>(null);
  const label = TRADE_LABEL[trade];

  useEffect(() => {
    let live = true;
    fetchContractors(trade).then((list) => { if (live) setPros(list); });
    return () => { live = false; };
  }, [trade]);

  return (
    <View style={[styles.box, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.header}>
        <MaterialIcons name="handyman" size={16} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Recommended {label.many}
        </Text>
      </View>

      {pros && pros.length > 0 ? (
        pros.map((p) => (
          <View key={p.id} style={[styles.pro, { borderTopColor: colors.borderLight }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.textPrimary }]}>{p.name}</Text>
              {!!(p.note || p.service_area) && (
                <Text style={[styles.note, { color: colors.textMuted }]}>{p.note || p.service_area}</Text>
              )}
            </View>
            {!!p.phone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${p.phone}`).catch(() => {})} hitSlop={6}>
                <MaterialIcons name="phone" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            {!!p.website && (
              <TouchableOpacity onPress={() => Linking.openURL(p.website!).catch(() => {})} hitSlop={6}>
                <MaterialIcons name="open-in-new" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        ))
      ) : (
        <Text style={[styles.placeholder, { color: colors.textMuted }]}>
          BENi is lining up trusted Calgary {label.many}. Soon you'll be able to call one
          straight from here.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heading: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  pro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  note: {
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  placeholder: {
    fontSize: fontSize.sm,
    marginTop: 4,
    lineHeight: 18,
  },
});
