/**
 * Expandable maintenance-plan task card for the dashboard — mirrors demo.html's
 * task rows: collapsed shows system + severity + recurrence, tapping expands
 * Where / What it is / How to fix / Est. cost / Do it by. Deliberately separate
 * from components/TaskItem.tsx (used by Maintenance/property pages) so that
 * screen's inline-edit behavior stays untouched.
 */
import { FREQ_LABELS } from '@/constants/recurrence';
import { SYSTEM_ICONS, SYSTEM_LABELS } from '@/constants/systems';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { Colors } from '@/theme/colors';
import { TaskRow, TaskSeverity } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import IconButton from '../IconButton';

type Props = {
  task: TaskRow;
  showProperty?: boolean;
  onComplete: () => void;
  onDelete: () => void;
};

const SEVERITY_BADGE: Record<TaskSeverity, { bg: keyof Colors; text: keyof Colors }> = {
  critical: { bg: 'severityCriticalBg', text: 'severityCriticalText' },
  moderate: { bg: 'severityModerateBg', text: 'severityModerateText' },
  minor: { bg: 'severityMinorBg', text: 'severityMinorText' },
};

function formatCost(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `$${min.toLocaleString()} – $${max.toLocaleString()}`;
  const only = (min ?? max)!;
  return `$${only.toLocaleString()}`;
}

function formatDoItBy(dueDate: string | null, timingNote: string | null): string | null {
  const parts: string[] = [];
  if (dueDate) {
    parts.push(new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
  }
  if (timingNote) parts.push(timingNote);
  return parts.length ? parts.join(' — ') : null;
}

export default function MaintenanceTaskCard({ task, showProperty, onComplete, onDelete }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const isCritical = task.severity === 'critical';
  const icon = task.system ? SYSTEM_ICONS[task.system] : 'build';
  const systemLabel = task.system ? SYSTEM_LABELS[task.system] : null;
  const cost = formatCost(task.cost_min, task.cost_max);
  const doItBy = formatDoItBy(task.due_date, task.timing_note);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: open ? colors.primaryLight : colors.border },
      ]}
    >
      <TouchableOpacity style={styles.row} onPress={() => setOpen((v) => !v)} activeOpacity={0.85}>
        <View
          style={[
            styles.iconTile,
            { backgroundColor: isCritical ? colors.severityCriticalBg : colors.surfaceSecondary },
          ]}
        >
          <MaterialIcons
            name={icon}
            size={19}
            color={isCritical ? colors.severityCriticalText : colors.textMuted}
          />
        </View>

        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.metaRow}>
            {!!systemLabel && (
              <Text style={[styles.metaText, { color: colors.textMuted }]}>{systemLabel}</Text>
            )}
            {showProperty && !!task.propertyName && (
              <>
                <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
                <Text style={[styles.metaText, { color: colors.textMuted }]}>{task.propertyName}</Text>
              </>
            )}
            {!!task.recur_frequency && (
              <View style={[styles.recurPill, { backgroundColor: colors.infoLight }]}>
                <MaterialIcons name="refresh" size={10} color={colors.info} />
                <Text style={[styles.recurText, { color: colors.info }]}>
                  {FREQ_LABELS[task.recur_frequency]}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!!task.severity && (
          <View style={[styles.badge, { backgroundColor: colors[SEVERITY_BADGE[task.severity].bg] }]}>
            <Text style={[styles.badgeText, { color: colors[SEVERITY_BADGE[task.severity].text] }]}>
              {task.severity}
            </Text>
          </View>
        )}

        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {open && (
        <View style={[styles.detail, { borderTopColor: colors.borderLight }]}>
          {!!task.location && <DetailRow label="Where" value={task.location} colors={colors} />}
          {!!task.issue && <DetailRow label="What it is" value={task.issue} colors={colors} />}
          {!!task.fix_recommendation && (
            <DetailRow label="How to fix it" value={task.fix_recommendation} colors={colors} />
          )}
          {!!cost && <DetailRow label="Est. cost" value={cost} colors={colors} bold />}
          {!!doItBy && <DetailRow label="Do it by" value={doItBy} colors={colors} accent />}

          <View style={styles.actions}>
            <IconButton
              icon="check-circle-outline"
              iconSize={16}
              size={30}
              onPress={onComplete}
              iconColor={colors.success}
              style={{ backgroundColor: 'transparent' }}
            />
            <IconButton
              icon="delete-outline"
              iconSize={16}
              size={30}
              onPress={onDelete}
              iconColor={colors.textDisabled}
              style={{ backgroundColor: 'transparent' }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function DetailRow({
  label, value, colors, bold, accent,
}: { label: string; value: string; colors: Colors; bold?: boolean; accent?: boolean }) {
  return (
    <View style={styles.detRow}>
      <Text style={[styles.detLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.detValue,
          { color: accent ? colors.success : colors.textSecondary, fontWeight: bold || accent ? '700' : '400' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm + 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.md,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '600',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  metaText: {
    fontSize: fontSize.xs,
  },
  metaDot: {
    fontSize: fontSize.xs,
  },
  recurPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  recurText: {
    fontSize: 10,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  detail: {
    borderTopWidth: 1,
    padding: spacing.md,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm + 2,
  },
  detRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  detLabel: {
    width: 90,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 1,
  },
  detValue: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
