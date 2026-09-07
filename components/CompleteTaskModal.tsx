import Button from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import Dropdown from '@/components/Dropdown';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { RecurAnchor, RecurFrequency, TaskType } from '@/types';
import * as DocumentPicker from 'expo-document-picker';
import { FileUploadZone } from '@/components/upload/FileUploadZone';
import { ANCHOR_OPTIONS, FREQ_LABELS, FREQ_OPTIONS } from '@/constants/recurrence';
import { computeNextDueDate } from '@/utils/taskUtils';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type CompleteResult = {
  nextDueDate: Date | null;
  /** Optional receipt / invoice / before-after photo captured at completion. */
  proof?: { uri: string; name: string } | null;
  newFrequency?: RecurFrequency | null;
  newAnchor?: RecurAnchor | null;
};

type Props = {
  visible: boolean;
  task: TaskType | null;
  onClose: () => void;
  onComplete: (result: CompleteResult) => Promise<void>;
};

export default function CompleteTaskModal({ visible, task, onClose, onComplete }: Props) {
  // Proof of work: a receipt, invoice or before/after photo. Optional - never
  // block completing a task on having paperwork to hand.
  const [proof, setProof] = useState<{ uri: string; name: string } | null>(null);

  useEffect(() => {
    if (!visible) setProof(null);
  }, [visible]);

  const pickProof = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const f = result.assets[0];
    setProof({ uri: f.uri, name: f.name });
  };

  const { colors } = useTheme();
  const [clearRecur, setClearRecur] = useState(false);
  const isRecurring = !!task?.recurFrequency && !clearRecur;

  const [nextDate, setNextDate] = useState<Date | null>(null);
  const [newFreq, setNewFreq] = useState<RecurFrequency | null>(null);
  const [newAnchor, setNewAnchor] = useState<RecurAnchor>('completion');
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens for a new task
  useEffect(() => {
    if (!visible || !task) return;
    setClearRecur(false);
    if (task.recurFrequency) {
      setNextDate(computeNextDueDate(
        task.dueDate ?? null,
        task.recurFrequency,
        task.recurAnchor ?? 'completion',
      ));
    } else {
      setNextDate(null);
    }
    setNewFreq(null);
    setNewAnchor('completion');
    setLoading(false);
  }, [visible, task?.id]);

  // Recompute next date as user adjusts recurrence on a non-recurring task
  useEffect(() => {
    if (!visible || !task || isRecurring || !newFreq) return;
    setNextDate(computeNextDueDate(task.dueDate ?? null, newFreq, newAnchor));
  }, [newFreq, newAnchor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;

  const handleComplete = async (result: CompleteResult) => {
    setLoading(true);
    try {
      await onComplete({ ...result, proof });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={loading ? undefined : onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={loading ? undefined : onClose}
      >
        {/* Inner Pressable stops backdrop tap from dismissing when tapping inside */}
        <Pressable style={[styles.box, { backgroundColor: colors.surface }]}>

          {/* Header — icon and title in a row, aligned to center */}
          <View style={styles.header}>
            <MaterialIcons name="check-circle-outline" size={22} color={colors.success} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>Complete Task?</Text>
          </View>

          {/* Task name box */}
          <View style={[styles.taskBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.taskName, { color: colors.textPrimary }]} numberOfLines={2}>
              {task.title}
            </Text>
            {task.recurFrequency && (
              <View style={[styles.recurBadge, { backgroundColor: clearRecur ? colors.surfaceSecondary : colors.infoLight }]}>
                <MaterialIcons name="refresh" size={11} color={clearRecur ? colors.textDisabled : colors.info} />
                <Text style={[styles.recurBadgeText, { color: clearRecur ? colors.textDisabled : colors.info, flex: 1 }]}>
                  {clearRecur ? 'Recurrence removed' : `Repeats ${FREQ_LABELS[task.recurFrequency!]} · ${task.recurAnchor === 'due_date' ? 'from due date' : 'from completion'}`}
                </Text>
                <TouchableOpacity onPress={() => setClearRecur((v) => !v)} hitSlop={8}>
                  <MaterialIcons
                    name={clearRecur ? 'undo' : 'close'}
                    size={13}
                    color={clearRecur ? colors.textDisabled : colors.info}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.success} style={styles.loader} />
          ) : (
            <>
              {isRecurring ? (
                <>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Next occurrence</Text>
                  <DateInput value={nextDate} onChange={setNextDate} />
                </>
              ) : (
                <>
                  <View style={styles.dividerRow}>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.textDisabled }]}>make recurring?</Text>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  </View>

                  <Dropdown
                    label="Repeats"
                    options={FREQ_OPTIONS}
                    selected={newFreq}
                    onSelect={(v) => setNewFreq(v as RecurFrequency | null)}
                    placeholder="No recurrence"
                    size="sm"
                  />

                  {newFreq && (
                    <>
                      <View style={styles.gap} />
                      <Dropdown
                        label="Schedule from"
                        options={ANCHOR_OPTIONS}
                        selected={newAnchor}
                        onSelect={(v) => setNewAnchor((v as RecurAnchor) ?? 'completion')}
                        size="sm"
                      />
                      <View style={styles.gap} />
                      <Text style={[styles.label, { color: colors.textMuted }]}>Next due date</Text>
                      <DateInput value={nextDate} onChange={setNextDate} />
                    </>
                  )}
                </>
              )}

              {/* Optional proof of work. Kept last so it never gets in the way of
                  simply ticking something off. */}
              <Text style={[styles.proofLabel, { color: colors.textMuted }]}>
                Keep a record (optional) — receipt, invoice or a before/after photo
              </Text>
              <FileUploadZone
                onPickFile={pickProof}
                onClearFile={() => setProof(null)}
                uploading={false}
                fileName={proof?.name}
              />

              <View style={styles.btnGroup}>
                <Button
                  title={isRecurring ? 'Complete & Schedule Next' : newFreq ? 'Complete & Recur' : 'Mark as Complete'}
                  variant="success"
                  fullWidth
                  onPress={() => handleComplete(
                    isRecurring
                      ? { nextDueDate: nextDate }
                      : { nextDueDate: nextDate, newFrequency: newFreq, newAnchor },
                  )}
                />
                <Button title="Cancel" variant="secondary" fullWidth onPress={onClose} />
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  box: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.xl,
    padding: spacing.lg + 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '600',
  },
  taskBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs + 2,
  },
  taskName: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  recurBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  recurBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: spacing.xs + 2,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  proofLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  btnGroup: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: fontSize.xs,
  },
  gap: {
    height: spacing.sm,
  },
});
