/**
 * The record of a finished job (BENI-78): when, what was done, who did it,
 * what it really cost next to BENi's estimate, the notes, and the receipts.
 */
import { ACTION_LABEL, Completion, fetchCompletion } from '@/services/completionService';
import { Colors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, spacing } from '@/theme/tokens';
import { TaskRow } from '@/types';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TaskRecords from './TaskRecords';

function longDate(iso: string): string {
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function estimateText(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `${money(min)} – ${money(max)}`;
  return money((min || max)!);
}

export default function CompletionSummary({ task }: { task: TaskRow }) {
  const { colors } = useTheme();
  const [c, setC] = useState<Completion | null | undefined>(undefined);

  useEffect(() => {
    fetchCompletion(task.id).then(setC).catch((err) => { console.error(err); setC(null); });
  }, [task.id]);

  const estimate = estimateText(task.cost_min, task.cost_max);
  const who = c?.done_by === 'pro'
    ? c.pro_name ? `A pro — ${c.pro_name}` : 'A pro'
    : c?.done_by === 'self' ? 'You did it yourself' : null;
  const paid = c?.cost_actual != null
    ? `${money(Number(c.cost_actual))}${estimate ? `  ·  BENi estimated ${estimate}` : ''}`
    : null;

  return (
    <>
      <Row label="Completed" value={longDate(c?.completed_on ?? task.completed_at!)} colors={colors} accent />
      {!!c?.action && <Row label="What was done" value={ACTION_LABEL[c.action]} colors={colors} />}
      {!!who && <Row label="Who did it" value={who} colors={colors} />}
      {paid
        ? <Row label="Paid" value={paid} colors={colors} bold />
        : estimate && <Row label="BENi estimate" value={estimate} colors={colors} />}
      {!!c?.notes && <Row label="Notes" value={c.notes} colors={colors} />}
      {c === null && (
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          Completed before BENi asked for details — add the receipt below to keep the record.
        </Text>
      )}
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Receipts & photos</Text>
        <TaskRecords taskId={task.id} propertyId={task.property_id} />
      </View>
    </>
  );
}

function Row({ label, value, colors, bold, accent }: { label: string; value: string; colors: Colors; bold?: boolean; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.value,
          { color: accent ? colors.success : colors.textSecondary, fontWeight: bold || accent ? '700' : '400' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  label: {
    width: 90,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 1,
  },
  value: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  muted: {
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
});
