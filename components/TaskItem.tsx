import Dropdown from '@/components/Dropdown';
import { ANCHOR_OPTIONS, cadenceLabel, fromPresetKey, presetKey, presetOptions } from '@/constants/recurrence';
import { taskTone, toneColor, TONE_LABEL } from '@/utils/severityStyle';
import { usePropertyFiles } from '@/hooks/usePropertyFiles';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { FileRecord, Property, RecurAnchor, RecurFrequency, TaskType } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Button from './Button';
import { DateInput } from './DateInput';
import IconButton from './IconButton';

type TaskItemProps = {
  task: TaskType;
  onUpdate: (updatedTask: TaskType) => void;
  onDelete: () => void;
  onTap?: () => void;
  readOnly?: boolean;
  propertyName?: string;
  selected?: boolean;
  selectionMode?: boolean;
  onLongPress?: () => void;
  /** Dashboard: pass all properties so user can change property in edit mode */
  properties?: Property[];
  /** Property detail: pass pre-loaded files for the current property */
  files?: FileRecord[];
};


export default function TaskItem({
  task,
  onUpdate,
  onDelete,
  onTap,
  readOnly,
  propertyName,
  selected,
  selectionMode,
  onLongPress,
  properties,
  files: propFiles,
}: TaskItemProps) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [dueDate, setDueDate] = useState<Date | null>(task.dueDate ? new Date(task.dueDate) : null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(task.propertyId ?? null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(task.fileId ?? null);
  const [recurFrequency, setRecurFrequency] = useState<RecurFrequency | null>(task.recurFrequency ?? null);
  const [recurInterval, setRecurInterval] = useState<number>(task.recurInterval ?? 1);
  const [recurAnchor, setRecurAnchor] = useState<RecurAnchor>(task.recurAnchor ?? 'completion');

  const availableFiles = usePropertyFiles(
    properties ? selectedPropertyId : null,
    propFiles,
    selectedFileId,
    () => setSelectedFileId(null),
  );

  const tone = taskTone(task);
  const cadence = cadenceLabel(task.recurFrequency, task.recurInterval);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(task.dueDate ? new Date(task.dueDate) : null);
    setSelectedPropertyId(task.propertyId ?? null);
    setSelectedFileId(task.fileId ?? null);
    setRecurFrequency(task.recurFrequency ?? null);
    setRecurInterval(task.recurInterval ?? 1);
    setRecurAnchor(task.recurAnchor ?? 'completion');
  }, [task]);

  useEffect(() => {
    if (selectionMode) setEditing(false);
  }, [selectionMode]);

  const handleSave = () => {
    onUpdate({
      ...task,
      title,
      description,
      dueDate,
      propertyId: selectedPropertyId,
      fileId: selectedFileId,
      recurFrequency,
      recurInterval: recurFrequency ? recurInterval : null,
      recurAnchor: recurFrequency ? recurAnchor : null,
      // A schedule makes it upkeep (one definition, BENI-53).
      taskKind: recurFrequency ? 'routine' : task.taskKind === 'routine' ? 'action' : task.taskKind,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDueDate(task.dueDate ? new Date(task.dueDate) : null);
    setSelectedPropertyId(task.propertyId ?? null);
    setSelectedFileId(task.fileId ?? null);
    setRecurFrequency(task.recurFrequency ?? null);
    setRecurInterval(task.recurInterval ?? 1);
    setRecurAnchor(task.recurAnchor ?? 'completion');
    setEditing(false);
  };

  return (
    <View
      style={[
        styles.card,
        {
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.info : colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      {editing ? (
        <View style={styles.editContainer}>
          <Text style={[styles.editHeader, { color: colors.textPrimary }]}>Edit Task</Text>

          {properties && (
            <Dropdown
              label="Property"
              options={properties.map((p) => ({ label: p.name, value: p.id }))}
              selected={selectedPropertyId}
              onSelect={setSelectedPropertyId}
              placeholder="None"
              size="sm"
            />
          )}

          {(availableFiles.length > 0 || selectedFileId) && (
            <Dropdown
              label="Link to file"
              options={availableFiles.map((f) => ({ label: f.file_name, value: f.id }))}
              selected={selectedFileId}
              onSelect={setSelectedFileId}
              placeholder="None"
              size="sm"
            />
          )}

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Title *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Task title"
              placeholderTextColor={colors.inputPlaceholder}
              style={[styles.input, {
                borderColor: colors.inputBorder,
                color: colors.textPrimary,
                backgroundColor: colors.inputBackground,
              }]}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              placeholderTextColor={colors.inputPlaceholder}
              style={[styles.input, {
                borderColor: colors.inputBorder,
                color: colors.textSecondary,
                backgroundColor: colors.inputBackground,
              }]}
            />
          </View>

          <DateInput value={dueDate} onChange={setDueDate} />

          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

          <View style={styles.recurrenceRow}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 0 }]}>Repeats</Text>
            {recurFrequency && (
              <TouchableOpacity onPress={() => setRecurFrequency(null)} hitSlop={8}>
                <MaterialIcons name="close" size={13} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <Dropdown
            options={presetOptions(recurFrequency, recurInterval)}
            selected={presetKey(recurFrequency, recurInterval)}
            onSelect={(v) => {
              const p = fromPresetKey(v as string | null);
              setRecurFrequency(p?.frequency ?? null);
              setRecurInterval(p?.interval ?? 1);
            }}
            placeholder="No recurrence"
            size="sm"
          />
          {recurFrequency && (
            <Dropdown
              label="Schedule from"
              options={ANCHOR_OPTIONS}
              selected={recurAnchor}
              onSelect={(v) => setRecurAnchor((v as RecurAnchor) ?? 'completion')}
              size="sm"
            />
          )}

          <View style={styles.btnRow}>
            <Button title="Save" size="sm" onPress={handleSave} variant="success" style={{ flex: 1 }} />
            <Button title="Cancel" size="sm" onPress={handleCancel} variant="secondary" style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={selectionMode ? onLongPress : onTap}
          onLongPress={!selectionMode ? onLongPress : undefined}
          delayLongPress={400}
          activeOpacity={selectionMode ? 0.7 : 0.85}
          style={styles.viewRow}
        >
          {selectionMode ? (
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: selected ? colors.info : colors.surface,
                  borderColor: selected ? colors.info : colors.inputBorder,
                },
              ]}
            >
              {selected && <MaterialIcons name="check" size={12} color={colors.textInverse} />}
            </View>
          ) : (
            <View style={[styles.urgencyDot, { backgroundColor: toneColor(tone, colors) }]} />
          )}

          <View style={styles.content}>
            <Text style={[styles.taskTitle, { color: colors.textPrimary }]}>{task.title}</Text>
            {/* Severity and the reason for it, in words — the accountability
                layer: nobody should approve "Critical" without seeing why. */}
            {tone !== 'none' && (
              <Text style={[styles.reason, { color: toneColor(tone, colors) }]} numberOfLines={2}>
                {TONE_LABEL[tone]}
                {tone === 'routine' && cadence ? ` · ${cadence}` : ''}
                {task.severityReason && tone !== 'routine' ? ` · ${task.severityReason}` : ''}
              </Text>
            )}
            {task.description ? (
              <Text style={[styles.taskDesc, { color: colors.textMuted }]} numberOfLines={2}>
                {task.sourceQuote && task.description === task.sourceQuote ? `“${task.description}”` : task.description}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              {!!dueDate && (
                <Text style={[styles.metaText, { color: colors.textDisabled }]}>
                  Due {dueDate.toISOString().split('T')[0]}
                </Text>
              )}
              {!!dueDate && !!propertyName && (
                <Text style={[styles.metaText, { color: colors.border }]}>·</Text>
              )}
              {!!propertyName && (
                <Text style={[styles.metaText, { color: colors.textDisabled }]}>{propertyName}</Text>
              )}
              {!!task.recurFrequency && (
                <>
                  {!!(dueDate || propertyName) && (
                    <Text style={[styles.metaText, { color: colors.border }]}>·</Text>
                  )}
                  <MaterialIcons name="refresh" size={10} color={colors.info} />
                </>
              )}
              {!!task.sourcePage && (
                <>
                  <Text style={[styles.metaText, { color: colors.border }]}>·</Text>
                  <Text style={[styles.metaText, { color: colors.textDisabled }]}>Page {task.sourcePage}</Text>
                </>
              )}
              {!!task.carriedOver && (
                <>
                  <Text style={[styles.metaText, { color: colors.border }]}>·</Text>
                  <Text style={[styles.metaText, { color: colors.warning }]}>From an older report — still needed?</Text>
                </>
              )}
            </View>
          </View>

          {!readOnly && !selectionMode && (
            <>
              <IconButton
                icon="edit"
                iconSize={15}
                size={27}
                onPress={() => setEditing(true)}
                iconColor={colors.textDisabled}
                style={{ backgroundColor: 'transparent' }}
              />
              <IconButton
                icon="delete-outline"
                iconSize={15}
                size={27}
                onPress={onDelete}
                iconColor={colors.border}
                style={{ backgroundColor: 'transparent' }}
              />
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    marginBottom: spacing.xs + 2,
    overflow: 'hidden',
  },
  editContainer: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  editHeader: {
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    fontWeight: '600',
    fontSize: fontSize.md,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  recurrenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: spacing.sm + 2,
    flexShrink: 0,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginRight: spacing.sm + 2,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    marginRight: spacing.sm,
  },
  taskTitle: {
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  taskDesc: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  reason: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.xs,
  },
});
