import Button from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import Dropdown from '@/components/Dropdown';
import FilterChips from '@/components/FilterChips';
import { MultiLineInput, SingleLineInput } from '@/components/Inputs';
import { FileUploadZone } from '@/components/upload/FileUploadZone';
import { ANCHOR_OPTIONS, cadenceLabel, FREQ_OPTIONS } from '@/constants/recurrence';
import {
  ACTION_LABEL, CompletionAction, CompletionDetails, DONE_BY_LABEL, DoneBy, parseCost,
} from '@/services/completionService';
import { PendingRecord } from '@/services/fileService';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { RecurAnchor, RecurFrequency, TaskType } from '@/types';
import { computeNextDueDate } from '@/utils/taskUtils';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type CompleteResult = {
  nextDueDate: Date | null;
  /** Receipts, invoices, before/after photos, each with the owner's own title. */
  proofs?: PendingRecord[];
  newFrequency?: RecurFrequency | null;
  newAnchor?: RecurAnchor | null;
  /** What actually happened — when, what, who, and the real price (BENI-78). */
  details: CompletionDetails;
};

type Props = {
  visible: boolean;
  task: TaskType | null;
  onClose: () => void;
  onComplete: (result: CompleteResult) => Promise<void>;
};

const ACTION_OPTIONS = (Object.keys(ACTION_LABEL) as CompletionAction[]).map((v) => ({ label: ACTION_LABEL[v], value: v }));
const DONE_BY_OPTIONS = (Object.keys(DONE_BY_LABEL) as DoneBy[]).map((v) => ({ label: DONE_BY_LABEL[v], value: v }));

/** A sensible first guess from the task itself, so most people just confirm it. */
function guessAction(task: TaskType): CompletionAction | null {
  const t = task.title.toLowerCase();
  if (/^replace|install/.test(t)) return 'replaced';
  if (/^repair|^fix|^seal|^patch/.test(t)) return 'repaired';
  if (/^inspect|^check|^test|^monitor/.test(t)) return 'inspected';
  if (task.recurFrequency || /^clean|^service|^flush|^tune/.test(t)) return 'serviced';
  return null;
}

function money(n: number): string {
  return `$${n.toLocaleString()}`;
}

export default function CompleteTaskModal({ visible, task, onClose, onComplete }: Props) {
  const { colors } = useTheme();

  const [completedOn, setCompletedOn] = useState<Date>(new Date());
  const [action, setAction] = useState<CompletionAction | null>(null);
  const [doneBy, setDoneBy] = useState<DoneBy | null>(null);
  const [proName, setProName] = useState('');
  const [costText, setCostText] = useState('');
  const [notes, setNotes] = useState('');
  const [proofs, setProofs] = useState<PendingRecord[]>([]);

  const [clearRecur, setClearRecur] = useState(false);
  const isRecurring = !!task?.recurFrequency && !clearRecur;
  const [nextDate, setNextDate] = useState<Date | null>(null);
  const [newFreq, setNewFreq] = useState<RecurFrequency | null>(null);
  const [newAnchor, setNewAnchor] = useState<RecurAnchor>('completion');
  const [loading, setLoading] = useState(false);

  // Fresh form for each task.
  useEffect(() => {
    if (!visible || !task) {
      setProofs([]);
      return;
    }
    const today = new Date();
    setCompletedOn(today);
    setAction(guessAction(task));
    setDoneBy(null);
    setProName('');
    setCostText('');
    setNotes('');
    setClearRecur(false);
    setNewFreq(null);
    setNewAnchor('completion');
    setLoading(false);
  }, [visible, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The next occurrence follows the cadence and, when it counts from
  // completion, the day the work was actually done.
  useEffect(() => {
    if (!visible || !task) return;
    if (isRecurring) {
      setNextDate(computeNextDueDate(
        task.dueDate ?? null, task.recurFrequency!, task.recurAnchor ?? 'completion',
        task.recurInterval ?? 1, completedOn,
      ));
    } else if (newFreq) {
      setNextDate(computeNextDueDate(task.dueDate ?? null, newFreq, newAnchor, 1, completedOn));
    } else {
      setNextDate(null);
    }
  }, [visible, task?.id, isRecurring, newFreq, newAnchor, completedOn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;

  const pickProof = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) return;
    const picked = result.assets.map((f) => ({ uri: f.uri, name: f.name }));
    setProofs((prev) => {
      const seen = new Set(prev.map((p) => p.name));
      return [...prev, ...picked.filter((p) => !seen.has(p.name))];
    });
  };
  const removeProof = (name: string) => setProofs((prev) => prev.filter((p) => p.name !== name));
  const titleProof = (name: string, title: string) =>
    setProofs((prev) => prev.map((p) => (p.name === name ? { ...p, title } : p)));

  const cost = parseCost(costText);
  const costInvalid = !!costText.trim() && cost === null;
  const future = completedOn.getTime() > Date.now() + 60_000;
  const estimate = task.costMin || task.costMax
    ? task.costMin && task.costMax && task.costMin !== task.costMax
      ? `${money(task.costMin)} – ${money(task.costMax)}`
      : money((task.costMin || task.costMax)!)
    : null;

  const handleComplete = async () => {
    setLoading(true);
    try {
      await onComplete({
        nextDueDate: nextDate,
        proofs,
        ...(isRecurring ? {} : { newFrequency: newFreq, newAnchor }),
        details: { completedOn, action, doneBy, proName, cost, notes },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={loading ? undefined : onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={loading ? undefined : onClose}>
        <Pressable style={[styles.box, { backgroundColor: colors.surface }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <MaterialIcons name="check-circle-outline" size={22} color={colors.success} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>Mark it done</Text>
            </View>

            <View style={[styles.taskBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.taskName, { color: colors.textPrimary }]} numberOfLines={2}>{task.title}</Text>
              {task.recurFrequency && (
                <View style={[styles.recurBadge, { backgroundColor: clearRecur ? colors.surfaceSecondary : colors.infoLight }]}>
                  <MaterialIcons name="refresh" size={11} color={clearRecur ? colors.textDisabled : colors.info} />
                  <Text style={[styles.recurBadgeText, { color: clearRecur ? colors.textDisabled : colors.info, flex: 1 }]}>
                    {clearRecur
                      ? 'Won’t repeat'
                      : `Repeats ${(cadenceLabel(task.recurFrequency, task.recurInterval) ?? '').toLowerCase()}`}
                  </Text>
                  <TouchableOpacity onPress={() => setClearRecur((v) => !v)} hitSlop={8}>
                    <MaterialIcons name={clearRecur ? 'undo' : 'close'} size={13} color={clearRecur ? colors.textDisabled : colors.info} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {loading ? (
              <ActivityIndicator color={colors.success} style={styles.loader} />
            ) : (
              <>
                <Text style={[styles.intro, { color: colors.textMuted }]}>
                  A few details build your home’s record — and every real price helps BENi’s estimates get better.
                  Only the date is needed.
                </Text>

                <Field label="When was it done?" colors={colors}>
                  <DateInput value={completedOn} onChange={(d) => setCompletedOn(d ?? new Date())} placeholder="Date completed" />
                  {future && <Text style={[styles.warn, { color: colors.warning }]}>That date is in the future.</Text>}
                </Field>

                <Field label="What did you do?" colors={colors}>
                  <FilterChips options={ACTION_OPTIONS} selected={action} onSelect={(v) => setAction(v as CompletionAction | null)} variant="success" />
                </Field>

                <Field label="Who did it?" colors={colors}>
                  <FilterChips options={DONE_BY_OPTIONS} selected={doneBy} onSelect={(v) => setDoneBy(v as DoneBy | null)} variant="success" />
                  {doneBy === 'pro' && (
                    <SingleLineInput
                      placeholderText="Company or tradesperson (optional)"
                      value={proName}
                      onChangeText={setProName}
                      maxLength={120}
                      style={{ marginTop: spacing.sm, marginBottom: 0 }}
                    />
                  )}
                </Field>

                <Field label="What did it cost?" colors={colors}>
                  <SingleLineInput
                    placeholderText={doneBy === 'self' ? '$ — parts and materials' : '$ — total you paid'}
                    value={costText}
                    onChangeText={setCostText}
                    keyboardType="decimal-pad"
                    maxLength={12}
                    style={{ marginBottom: 0 }}
                  />
                  <Text style={[styles.hint, { color: costInvalid ? colors.danger : colors.textMuted }]}>
                    {costInvalid
                      ? 'Just the number, e.g. 450'
                      : estimate
                        ? `BENi estimated ${estimate}. Your real price makes the next estimate better.`
                        : 'Your real price teaches BENi what this job costs in Calgary.'}
                  </Text>
                </Field>

                <Field label="Notes" colors={colors}>
                  <MultiLineInput
                    placeholderText="What was done, parts or model used, warranty — anything the next owner should know"
                    value={notes}
                    onChangeText={setNotes}
                    maxLength={2000}
                    style={{ minHeight: 72, marginBottom: 0 }}
                  />
                </Field>

                <Field label="Receipts & photos" colors={colors}>
                  {proofs.map((p) => (
                    <View key={p.name} style={[styles.proofCard, { borderColor: colors.borderLight }]}>
                      <View style={styles.proofRow}>
                        <MaterialIcons name="attach-file" size={16} color={colors.textMuted} />
                        <Text style={[styles.proofName, { color: colors.textMuted }]} numberOfLines={1}>{p.name}</Text>
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
                      setProofs((prev) => (prev.some((p) => p.name === f.name) ? prev : [...prev, { uri: f.uri, name: f.name }]))}
                    uploading={false}
                    hint={proofs.length > 0 ? `${proofs.length} attached — add another` : 'Receipt, invoice or photo (PDF or image)'}
                    showNameField={false}
                  />
                </Field>

                {isRecurring ? (
                  <Field label="Next time it’s due" colors={colors}>
                    <DateInput value={nextDate} onChange={setNextDate} />
                  </Field>
                ) : (
                  <>
                    <View style={styles.dividerRow}>
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      <Text style={[styles.dividerText, { color: colors.textDisabled }]}>needs doing again?</Text>
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    </View>
                    <Dropdown
                      label="Repeats"
                      options={FREQ_OPTIONS}
                      selected={newFreq}
                      onSelect={(v) => setNewFreq(v as RecurFrequency | null)}
                      placeholder="No — one-time job"
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

                <View style={styles.btnGroup}>
                  <Button
                    title={isRecurring ? 'Done — schedule the next one' : newFreq ? 'Done — and repeat it' : 'Mark as done'}
                    variant="success"
                    fullWidth
                    disabled={costInvalid}
                    onPress={handleComplete}
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

function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useTheme>['colors']; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{label}</Text>
      {children}
    </View>
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
    maxWidth: 460,
    maxHeight: '94%',
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
    marginBottom: spacing.md,
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
  intro: {
    fontSize: fontSize.sm,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs + 2,
  },
  hint: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  warn: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
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
  btnGroup: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
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
