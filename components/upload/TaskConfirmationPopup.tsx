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

  const handleConfirm = async () => {
    setSaving(true);
    try {
      for (const task of tasks) {
        await createTask(userId, { ...task, propertyId, fileId });
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
