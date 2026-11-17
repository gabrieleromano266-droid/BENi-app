import { nextDueFromCadence, parseRecurrence } from '@/constants/recurrence';
import { createTask } from '@/services/taskService';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import { LoadingModal } from '@/components/LoadingModal';
import TaskItem from '@/components/TaskItem';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { TaskType } from '@/types';

type Props = {
  visible: boolean;
  tasks: TaskType[];
  userId: string;
  propertyId?: string;
  fileId?: string;
  onClose: (saved: boolean) => void;
};

export default function TaskConfirmationPopup({
  visible,
  tasks: initialTasks,
  userId,
  propertyId,
  fileId,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const [tasks, setTasks] = useState<TaskType[]>(initialTasks);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setTasks(initialTasks);
  }, [initialTasks, visible]);

  const handleUpdate = (index: number, updatedTask: TaskType) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? updatedTask : t)));
  };

  const handleDelete = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Routine findings arrive from extraction as a phrase ("Every 3 months",
   * "annually") and no schedule. Give them one here, at the moment they
   * become real tasks — the same rule migration 0016 applied to the rows that
   * already existed (BENI-53). Without a cadence they never counted as
   * recurring; without a due date they could never remind anyone.
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
    width: 500,
    maxWidth: '90%',
    borderRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  list: {
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
});
