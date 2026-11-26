/**
 * Confirm the extracted tasks — the accountability step.
 *
 * Founder, 2026-11-25: "the homeowner is going to just toss it in… and go,
 * yep, this looks good, boom. There has to be an accountability layer, at
 * least on our part." So before anything is saved this screen shows:
 *
 *   - WHEN the home was inspected (read off the report, editable) — every due
 *     date is measured from it, and an old report says so plainly;
 *   - a colour KEY, and every task coloured by how much it matters (not by
 *     how soon it's due, which the old dots meant with no key at all);
 *   - WHY each task got its severity, in words, and the PAGE it came from;
 *   - the inspector's own sentence as the description.
 *
 * Critical first: the order a homeowner should read them in.
 */
import { nextDueFromCadence, parseRecurrence } from '@/constants/recurrence';
import { notifyReportsChanged, saveInspectionDate } from '@/services/fileService';
import { createTask } from '@/services/taskService';
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import { LoadingModal } from '@/components/LoadingModal';
import TaskItem from '@/components/TaskItem';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { TaskType } from '@/types';
import { localDate, rescheduleFromInspection, yearsSince } from '@/utils/schedule';
import { taskTone, TONE_LABEL, TONE_ORDER, toneColor, TaskTone } from '@/utils/severityStyle';

type Props = {
  visible: boolean;
  tasks: TaskType[];
  userId: string;
  propertyId?: string;
  fileId?: string;
  /** YYYY-MM-DD read from the report, or null */
  inspectionDate?: string | null;
  inspectionDatePage?: number | null;
  onClose: (saved: boolean) => void;
};

const LEGEND: TaskTone[] = ['critical', 'moderate', 'minor', 'routine'];

function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function TaskConfirmationPopup({
  visible,
  tasks: initialTasks,
  userId,
  propertyId,
  fileId,
  inspectionDate: foundDate = null,
  inspectionDatePage = null,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const [tasks, setTasks] = useState<TaskType[]>(initialTasks);
  const [inspectionDate, setInspectionDate] = useState<string | null>(foundDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTasks([...initialTasks].sort((a, b) => TONE_ORDER[taskTone(a)] - TONE_ORDER[taskTone(b)]));
    setInspectionDate(foundDate);
  }, [initialTasks, visible, foundDate]);

  const counts = useMemo(() => {
    const c: Record<TaskTone, number> = { critical: 0, moderate: 0, minor: 0, routine: 0, none: 0 };
    for (const t of tasks) c[taskTone(t)]++;
    return c;
  }, [tasks]);

  const age = inspectionDate ? yearsSince(inspectionDate) : null;

  const handleUpdate = (index: number, updatedTask: TaskType) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? updatedTask : t)));
  };

  const handleDelete = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  /** The homeowner corrected the inspection date: every date moves with it. */
  const changeInspectionDate = (d: Date | null) => {
    const iso = d ? toIso(d) : null;
    setInspectionDate(iso);
    if (iso) setTasks((prev) => prev.map((t) => rescheduleFromInspection(t, iso)));
  };

  /**
   * Fallback for anything that still arrives without a schedule (older
   * function versions, hand-added rows): give routine work one, so it counts
   * as recurring and can remind someone (BENI-53).
   */
  const withSchedule = (task: TaskType): TaskType => {
    const isRoutine = task.taskKind === 'routine' || !!task.recurrence;
    if (!isRoutine || task.recurFrequency) return task;
    const cadence = parseRecurrence(task.recurrence) ?? { frequency: 'yearly' as const, interval: 1 };
    return {
      ...task,
      taskKind: 'routine',
      recurFrequency: cadence.frequency,
      recurInterval: cadence.interval,
      recurAnchor: task.recurAnchor ?? 'due_date',
      dueDate: task.dueDate ?? nextDueFromCadence(cadence.frequency, cadence.interval),
    };
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      for (const task of tasks) {
        await createTask(userId, { ...withSchedule(task), propertyId, fileId });
      }
      await saveInspectionDate(fileId, propertyId, inspectionDate);
      notifyReportsChanged();
      onClose(true);
    } catch (err) {
      console.error('Error saving tasks:', err);
      onClose(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.box, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Confirm Extracted Tasks
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {tasks.length} found in your report. Check the critical ones, delete anything that's already done.
          </Text>

          {/* When the home was inspected — the anchor for every date below. */}
          <View style={[styles.inspection, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.inspectionLabel, { color: colors.textSecondary }]}>Inspection date</Text>
            <DateInput
              value={inspectionDate ? localDate(inspectionDate) : null}
              onChange={changeInspectionDate}
              placeholder="When was the home inspected?"
            />
            <Text style={[styles.inspectionNote, { color: colors.textMuted }]}>
              {inspectionDate && foundDate === inspectionDate && inspectionDatePage
                ? `Found on page ${inspectionDatePage} of the report. Due dates are measured from this date.`
                : inspectionDate
                  ? 'Due dates are measured from this date.'
                  : 'The report doesn\'t state a date clearly — enter it so the due dates are right.'}
            </Text>
            {age !== null && age >= 1 && (
              <Text style={[styles.inspectionWarn, { color: colors.warning }]}>
                This report is {age} year{age === 1 ? '' : 's'} old. Some items may already be fixed —
                delete those. Anything still outstanding is due soon.
              </Text>
            )}
          </View>

          {/* The key, with counts — what the dots mean. */}
          <View style={styles.legend}>
            {LEGEND.map((tone) => (
              <View key={tone} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: toneColor(tone, colors) }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                  {TONE_LABEL[tone]} ({counts[tone]})
                </Text>
              </View>
            ))}
          </View>

          <ScrollView style={styles.list}>
            {tasks.map((task, index) => (
              <TaskItem
                key={index}
                task={task}
                onUpdate={(updated) => handleUpdate(index, updated)}
                onDelete={() => handleDelete(index)}
              />
            ))}
          </ScrollView>

          <Button
            title="Add Task"
            onPress={() => setTasks((prev) => [...prev, { title: '', description: '', dueDate: null }])}
            variant="info"
            fullWidth
            style={{ marginBottom: spacing.md }}
          />

          <View style={styles.btnRow}>
            <Button
              title="Confirm"
              onPress={handleConfirm}
              variant="success"
              disabled={saving}
              style={{ flex: 1 }}
            />
            <Button
              title="Try Again"
              onPress={() => onClose(false)}
              variant="secondary"
              disabled={saving}
              style={{ flex: 1 }}
            />
          </View>

          <LoadingModal visible={saving} message="Saving tasks…" onCancel={() => setSaving(false)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: 640,
    maxWidth: '94%',
    borderRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '90%',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  inspection: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  inspectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  inspectionNote: {
    fontSize: fontSize.xs,
  },
  inspectionWarn: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: fontSize.sm,
  },
  list: {
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
});
