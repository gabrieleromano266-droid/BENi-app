import ChipSelector from '@/components/ChipSelector';
import { DateInput } from '@/components/DateInput';
import Dropdown from '@/components/Dropdown';
import { ANCHOR_OPTIONS, FREQ_OPTIONS } from '@/constants/recurrence';
import { SEVERITY_OPTIONS } from '@/constants/severity';
import { SYSTEM_OPTIONS } from '@/constants/systems';
import { usePropertyFiles } from '@/hooks/usePropertyFiles';
import { TaskInput } from '@/services/taskService';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { FileRecord, HomeSystem, Property, RecurAnchor, RecurFrequency, TaskSeverity } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Button from './Button';
import { LoadingModal } from './LoadingModal';

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (input: TaskInput) => Promise<void>;
  /** Dashboard: shows property picker */
  properties?: Property[];
  /** Property detail: pre-loaded files for file picker */
  files?: FileRecord[];
};

export default function AddTaskModal({ visible, onClose, onAdd, properties, files: propFiles }: Props) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [recurFrequency, setRecurFrequency] = useState<RecurFrequency | null>(null);
  const [recurAnchor, setRecurAnchor] = useState<RecurAnchor>('completion');
  const [saving, setSaving] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [system, setSystem] = useState<HomeSystem | null>(null);
  const [severity, setSeverity] = useState<TaskSeverity | null>(null);
  const [location, setLocation] = useState('');
  const [issue, setIssue] = useState('');
  const [fixRecommendation, setFixRecommendation] = useState('');
  const [costMin, setCostMin] = useState('');
  const [costMax, setCostMax] = useState('');
  const [timingNote, setTimingNote] = useState('');

  const availableFiles = usePropertyFiles(
    selectedPropertyId,
    propFiles,
    selectedFileId,
    () => setSelectedFileId(null),
  );

  const handleAdd = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        title: title.trim(),
        description: description.trim(),
        dueDate,
        propertyId: selectedPropertyId,
        fileId: selectedFileId,
        recurFrequency,
        recurAnchor: recurFrequency ? recurAnchor : null,
        system,
        severity,
        location: location.trim() || null,
        issue: issue.trim() || null,
        fixRecommendation: fixRecommendation.trim() || null,
        costMin: costMin.trim() ? Number(costMin) : null,
        costMax: costMax.trim() ? Number(costMax) : null,
        timingNote: timingNote.trim() || null,
      });
      reset();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setTitle('');
    setDescription('');
    setDueDate(null);
    setSelectedPropertyId(null);
    setSelectedFileId(null);
    setRecurFrequency(null);
    setRecurAnchor('completion');
    setDetailsOpen(false);
    setSystem(null);
    setSeverity(null);
    setLocation('');
    setIssue('');
    setFixRecommendation('');
    setCostMin('');
    setCostMax('');
    setTimingNote('');
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  return (
    <>
      <LoadingModal visible={saving} message="Saving task…" />
      <Modal transparent visible={visible} animationType="fade" onRequestClose={handleCancel}>
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.box, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>New Task</Text>

            {properties && (
              <ChipSelector
                label="Property"
                options={[
                  { label: 'None', value: null },
                  ...properties.map((p) => ({ label: p.name, value: p.id })),
                ]}
                selected={selectedPropertyId}
                onSelect={setSelectedPropertyId}
              />
            )}

            {availableFiles.length > 0 && (
              <ChipSelector
                label="Link to file"
                options={[
                  { label: 'None', value: null },
                  ...availableFiles.map((f) => ({ label: f.file_name, value: f.id })),
                ]}
                selected={selectedFileId}
                onSelect={setSelectedFileId}
              />
            )}

            <Text style={[styles.label, { color: colors.textMuted }]}>Title *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Task title"
              placeholderTextColor={colors.inputPlaceholder}
              autoFocus
              style={[styles.input, {
                borderColor: colors.inputBorder,
                color: colors.textPrimary,
                backgroundColor: colors.inputBackground,
              }]}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
              style={[styles.input, styles.inputMulti, {
                borderColor: colors.inputBorder,
                color: colors.textPrimary,
                backgroundColor: colors.inputBackground,
              }]}
            />

            <DateInput value={dueDate} onChange={setDueDate} />

            <View style={styles.recurrenceSection}>
              <View style={styles.dropLabelRow}>
                <Text style={[styles.dropLabel, { color: colors.textMuted }]}>Repeats</Text>
                {recurFrequency && (
                  <TouchableOpacity onPress={() => setRecurFrequency(null)} hitSlop={8}>
                    <MaterialIcons name="close" size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <Dropdown
                options={FREQ_OPTIONS}
                selected={recurFrequency}
                onSelect={(v) => setRecurFrequency(v as RecurFrequency | null)}
                placeholder="No recurrence"
                size="sm"
              />
              {recurFrequency && (
                <>
                  <View style={styles.gap} />
                  <Dropdown
                    label="Schedule from"
                    options={ANCHOR_OPTIONS}
                    selected={recurAnchor}
                    onSelect={(v) => setRecurAnchor((v as RecurAnchor) ?? 'completion')}
                    size="sm"
                  />
                </>
              )}
            </View>

            <TouchableOpacity
              style={[styles.detailsToggle, { borderTopColor: colors.borderLight }]}
              onPress={() => setDetailsOpen((v) => !v)}
            >
              <MaterialIcons
                name={detailsOpen ? 'expand-less' : 'expand-more'}
                size={18}
                color={colors.info}
              />
              <Text style={[styles.detailsToggleText, { color: colors.info }]}>
                Home system &amp; details
              </Text>
            </TouchableOpacity>

            {detailsOpen && (
              <View style={styles.detailsSection}>
                <ChipSelector
                  label="Home system"
                  options={[{ label: 'None', value: null }, ...SYSTEM_OPTIONS]}
                  selected={system}
                  onSelect={(v) => setSystem(v as HomeSystem | null)}
                />
                <ChipSelector
                  label="Severity"
                  options={[{ label: 'None', value: null }, ...SEVERITY_OPTIONS]}
                  selected={severity}
                  onSelect={(v) => setSeverity(v as TaskSeverity | null)}
                />

                <Text style={[styles.label, { color: colors.textMuted }]}>Where</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="e.g. Basement, north wall"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={[styles.input, {
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                    backgroundColor: colors.inputBackground,
                  }]}
                />

                <Text style={[styles.label, { color: colors.textMuted }]}>What it is</Text>
                <TextInput
                  value={issue}
                  onChangeText={setIssue}
                  placeholder="Describe the finding"
                  placeholderTextColor={colors.inputPlaceholder}
                  multiline
                  style={[styles.input, styles.inputMulti, {
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                    backgroundColor: colors.inputBackground,
                  }]}
                />

                <Text style={[styles.label, { color: colors.textMuted }]}>How to fix it</Text>
                <TextInput
                  value={fixRecommendation}
                  onChangeText={setFixRecommendation}
                  placeholder="Recommended fix"
                  placeholderTextColor={colors.inputPlaceholder}
                  multiline
                  style={[styles.input, styles.inputMulti, {
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                    backgroundColor: colors.inputBackground,
                  }]}
                />

                <Text style={[styles.label, { color: colors.textMuted }]}>Estimated cost</Text>
                <View style={styles.costRow}>
                  <TextInput
                    value={costMin}
                    onChangeText={setCostMin}
                    placeholder="Min $"
                    keyboardType="numeric"
                    placeholderTextColor={colors.inputPlaceholder}
                    style={[styles.input, styles.costInput, {
                      borderColor: colors.inputBorder,
                      color: colors.textPrimary,
                      backgroundColor: colors.inputBackground,
                    }]}
                  />
                  <TextInput
                    value={costMax}
                    onChangeText={setCostMax}
                    placeholder="Max $"
                    keyboardType="numeric"
                    placeholderTextColor={colors.inputPlaceholder}
                    style={[styles.input, styles.costInput, {
                      borderColor: colors.inputBorder,
                      color: colors.textPrimary,
                      backgroundColor: colors.inputBackground,
                    }]}
                  />
                </View>

                <Text style={[styles.label, { color: colors.textMuted }]}>Do it by (note)</Text>
                <TextInput
                  value={timingNote}
                  onChangeText={setTimingNote}
                  placeholder="e.g. Best before fall rains"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={[styles.input, {
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                    backgroundColor: colors.inputBackground,
                  }]}
                />
              </View>
            )}

            <View style={styles.btnRow}>
              <Button
                title={saving ? 'Saving…' : 'Add'}
                onPress={handleAdd}
                variant="success"
                disabled={saving || !title.trim()}
                style={{ flex: 1 }}
              />
              <Button title="Cancel" onPress={handleCancel} variant="secondary" style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: 340,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: spacing.md + 2,
  },
  label: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    fontSize: fontSize.md,
    marginBottom: spacing.md,
  },
  inputMulti: {
    minHeight: 60,
  },
  costRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  costInput: {
    flex: 1,
  },
  recurrenceSection: {
    marginTop: spacing.md,
  },
  gap: {
    height: spacing.sm,
  },
  dropLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  dropLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  detailsToggleText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  detailsSection: {
    marginTop: spacing.md,
    gap: 0,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    marginTop: spacing.lg,
  },
});
