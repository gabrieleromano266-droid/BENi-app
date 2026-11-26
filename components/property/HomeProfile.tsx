/**
 * The home's profile, at the top of its page (BENI-76).
 *
 * Founder, 2026-11-25: "instead of clicking on the property and just showing
 * more tasks… it could show a picture of the property, the details you've put
 * in, when the inspection was done. More so a profile." The tasks already live
 * on the dashboard; this is the home's identity card — and the start of the
 * record that eventually passes to the next owner.
 *
 * The photo slot is a placeholder until BENI-58 pulls the house photo out of
 * the inspection report.
 */
import Card from '@/components/Card';
import Button from '@/components/Button';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import { DBTask } from '@/types';
import { yearsSince } from '@/utils/schedule';
import { taskTone, TONE_LABEL, toneColor, TaskTone } from '@/utils/severityStyle';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

type Props = {
  details: { address: string | null; year_built: number | null; last_inspection_date: string | null };
  reportCount: number;
  tasks: DBTask[];
  onOpenPlan: () => void;
};

const SUMMARY: TaskTone[] = ['critical', 'moderate', 'minor', 'routine'];

export default function HomeProfile({ details, reportCount, tasks, onOpenPlan }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 700;

  const open = tasks.filter((t) => !t.completed_at);
  const counts: Record<TaskTone, number> = { critical: 0, moderate: 0, minor: 0, routine: 0, none: 0 };
  for (const t of open) {
    counts[taskTone({ severity: t.severity, taskKind: t.task_kind, recurFrequency: t.recur_frequency })]++;
  }

  const inspected = details.last_inspection_date
    ? new Date(details.last_inspection_date + 'T00:00:00').toLocaleDateString(undefined, {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;
  const age = details.last_inspection_date ? yearsSince(details.last_inspection_date) : null;
  const homeAge = details.year_built ? new Date().getFullYear() - details.year_built : null;

  return (
    <Card style={[styles.card, narrow && styles.cardNarrow]}>
      <View style={[styles.photo, narrow && styles.photoNarrow, { backgroundColor: colors.propertyBackdrop }]}>
        <MaterialIcons name="home" size={48} color={colors.headerAccent} />
        <Text style={[styles.photoNote, { color: colors.headerTextMuted }]}>
          Photo from your inspection report — coming soon
        </Text>
      </View>

      <View style={styles.info}>
        <Fact label="Address" value={details.address ?? 'Not added yet'} muted={!details.address} />
        <Fact
          label="Year built"
          value={details.year_built ? `${details.year_built}${homeAge !== null ? ` · ${homeAge} years old` : ''}` : 'Not added yet'}
          muted={!details.year_built}
        />
        <Fact
          label="Last inspected"
          value={inspected ? `${inspected}${age !== null && age >= 1 ? ` · ${age} year${age === 1 ? '' : 's'} ago` : ''}` : 'Upload a report to record it'}
          muted={!inspected}
          warn={age !== null && age >= 5}
        />
        <Fact label="Reports BENi read" value={String(reportCount)} />

        <View style={styles.summary}>
          {SUMMARY.map((tone) => (
            <View key={tone} style={styles.summaryItem}>
              <View style={[styles.dot, { backgroundColor: toneColor(tone, colors) }]} />
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                {counts[tone]} {TONE_LABEL[tone].toLowerCase()}
              </Text>
            </View>
          ))}
        </View>

        <Button
          title="Open this home's plan"
          variant="primary"
          size="sm"
          onPress={onOpenPlan}
          leftIcon={<MaterialIcons name="space-dashboard" size={15} color={colors.textInverse} />}
          style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
        />
      </View>
    </Card>
  );
}

function Fact({ label, value, muted, warn }: { label: string; value: string; muted?: boolean; warn?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.factValue,
          { color: warn ? colors.warning : muted ? colors.textDisabled : colors.textPrimary },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  cardNarrow: {
    flexDirection: 'column',
  },
  photo: {
    width: 240,
    minHeight: 180,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  photoNarrow: {
    width: '100%',
  },
  photoNote: {
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  fact: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  factLabel: {
    width: 120,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemibold,
  },
  factValue: {
    flex: 1,
    fontSize: fontSize.md,
  },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  summaryText: {
    fontSize: fontSize.sm,
  },
});
