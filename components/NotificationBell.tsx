/**
 * Notification bell — the "what needs me today?" surface.
 *
 * Deliberately driven by DUE DATES rather than a separate reminder system. Every
 * task now gets a date derived from the cost catalog's urgency window, so this
 * stays accurate without the homeowner ever scheduling anything themselves.
 *
 * Self-contained (fetches its own data) so it can live in PageHeader and appear
 * on every screen without prop-drilling through each one.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import { supabase } from '@/services/supabase';
import { AttentionTask, fetchAttentionTasks } from '@/services/taskService';
import { SYSTEM_LABELS } from '@/constants/systems';

function daysUntil(due: string | null): number | null {
  if (!due) return null;
  const target = new Date(due + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function whenLabel(task: AttentionTask): string {
  const n = daysUntil(task.due_date);
  if (n === null) return 'No date set';
  if (n < 0) return Math.abs(n) === 1 ? '1 day overdue' : Math.abs(n) + ' days overdue';
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return 'Due in ' + n + ' days';
}

export default function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AttentionTask[]>([]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      fetchAttentionTasks(data.user.id)
        .then((rows) => { if (alive) setItems(rows); })
        .catch((err) => console.error('Could not load notifications:', err));
    });
    return () => { alive = false; };
  }, []);

  const overdue = items.filter((i) => i.reason === 'overdue').length;
  const count = items.length;

  // Overdue is the only thing that earns an alarming red badge; everything else
  // is informational and stays calm.
  const badgeColor = overdue > 0 ? colors.danger : colors.info;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={'Notifications, ' + count + ' items need attention'}
        style={({ pressed }) => [styles.bellBtn, { opacity: pressed ? 0.6 : 1 }]}
      >
        <MaterialIcons name="notifications-none" size={26} color={colors.textPrimary} />
        {count > 0 && (
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
          </View>
        )}
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.overlay }]}
          onPress={() => setOpen(false)}
        >
          <Pressable style={[styles.panel, { backgroundColor: colors.surface }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Needs your attention</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {overdue > 0 && (
              <Text style={[styles.summary, { color: colors.danger }]}>{overdue} overdue</Text>
            )}

            {items.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                Nothing needs attention right now — nicely maintained.
              </Text>
            ) : (
              <ScrollView style={styles.list}>
                {items.slice(0, 20).map((task) => {
                  const isOverdue = task.reason === 'overdue';
                  const isCritical = task.reason === 'critical';
                  const iconName = isOverdue
                    ? 'error-outline'
                    : isCritical
                      ? 'priority-high'
                      : 'schedule';
                  const iconColor = isOverdue
                    ? colors.danger
                    : isCritical
                      ? colors.warning
                      : colors.textMuted;
                  return (
                    <Pressable
                      key={task.id}
                      style={[styles.row, { borderBottomColor: colors.borderLight }]}
                      onPress={() => {
                        setOpen(false);
                        router.push('/(tabs)/dashboard');
                      }}
                    >
                      <MaterialIcons name={iconName} size={18} color={iconColor} />
                      <View style={styles.rowText}>
                        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                          {task.title}
                        </Text>
                        <Text
                          style={[styles.rowMeta, { color: isOverdue ? colors.danger : colors.textMuted }]}
                        >
                          {whenLabel(task)}
                          {task.system ? '  ·  ' + SYSTEM_LABELS[task.system] : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    padding: spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  overlay: {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 70,
    paddingRight: 24,
  },
  panel: {
    width: 420,
    maxWidth: '92%',
    maxHeight: 460,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  summary: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  empty: {
    fontSize: fontSize.md,
    paddingVertical: spacing.lg,
  },
  list: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
