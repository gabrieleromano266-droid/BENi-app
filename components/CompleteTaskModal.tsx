import Button from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import Dropdown from '@/components/Dropdown';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { RecurAnchor, RecurFrequency, TaskType } from '@/types';
import * as DocumentPicker from 'expo-document-picker';
import { FileUploadZone } from '@/components/upload/FileUploadZone';
import { SingleLineInput } from '@/components/Inputs';
import { PendingRecord } from '@/services/fileService';
import { ANCHOR_OPTIONS, FREQ_LABELS, FREQ_OPTIONS } from '@/constants/recurrence';
import { computeNextDueDate } from '@/utils/taskUtils';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type CompleteResult = {
  nextDueDate: Date | null;
  /**
   * Optional records captured at completion: receipts, invoices, before/after
   * photos. A plural, because one job routinely produces several — a quote, an
   * invoice, and a photo of the finished work — and a receipt is the ground
   * truth that turns a "Medium confidence" cost estimate into a real Calgary
   * price. Throwing away the second and third file throws away that evidence.
   */
  proofs?: PendingRecord[];
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
  const [proofs, setProofs] = useState<PendingRecord[]>([]);

  useEffect(() => {
    if (!visible) setProofs([]);
  }, [visible]);

  const pickProof = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    const picked = result.assets.map((f) => ({ uri: f.uri, name: f.name }));
    // Append rather than replace, so several trips to the picker accumulate
    // (phones often only let you choose from one album at a time).
    setProofs((prev) => {
      const seen = new Set(prev.map((p) => p.name));
      return [...prev, ...picked.filter((p) => !seen.has(p.name))];
    });
  };

  const removeProof = (name: string) =>
    setProofs((prev) => prev.filter((p) => p.name !== name));

  const titleProof = (name: string, title: string) =>
    setProofs((prev) => prev.map((p) => (p.name === name ? { ...p, title } : p)));

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
      await onComplete({ ...result, proofs });
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
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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
              <Text style={[styles.proofHeading, { color: colors.textPrimary }]}>
                Keep a record <Text style={{ color: colors.textMuted, fontWeight: '400' }}>(optional)</Text>
              </Text>
              <Text style={[styles.proofLabel, { color: colors.textMuted }]}>
                Receipts, invoices, before/after photos — add as many as you like.
              </Text>

              {proofs.map((p) => (
                <View key={p.name} style={[styles.proofCard, { borderColor: colors.borderLight }]}>
                  <View style={styles.proofRow}>
                    <MaterialIcons name="attach-file" size={16} color={colors.textMuted} />
                    <Text style={[styles.proofName, { color: colors.textMuted }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Pressable onPress={() => removeProof(p.name)} hitSlop={8}>
                      <MaterialIcons name="close" size={16} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  <SingleLineInput
                    placeholderText="What is this? e.g. Plumber’s invoice"
                    value={p.title ?? ''}
                    onChangeText={(t) => titleProof(p.name, t)}
                    maxLength={80}
                    style={{ marginBottom: 0 }}
                  />
                </View>
              ))}

              <FileUploadZone
                onPickFile={pickProof}
                onClearFile={() => setProofs([])}
                onDropFile={(f) =>
                  setProofs((prev) =>
                    prev.some((p) => p.name === f.name) ? prev : [...prev, { uri: f.uri, name: f.name }])
                }
                uploading={false}
                hint={proofs.length > 0 ? `${proofs.length} attached — add another` : 'PDF or image'}
                showNameField={false}
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
          </ScrollView>
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
    maxWidth: 380,
    maxHeight: '92%',
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
  proofCard: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs + 2,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  proofName: {
    flex: 1,
    fontSize: fontSize.xs,
  },
  proofHeading: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  proofLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
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
